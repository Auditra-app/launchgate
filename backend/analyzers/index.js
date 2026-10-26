const gate1 = require('./gate1-secrets');
const gate2 = require('./gate2-auth');
const gate3 = require('./gate3-database');
const gate4 = require('./gate4-webhooks');
const gate5 = require('./gate5-ai-quota');
const gate6 = require('./gate6-observability');
const gate7 = require('./gate7-performance');
const gate8 = require('./gate8-design-ux');
const gate9 = require('./gate9-seo-legal');
const gate10 = require('./gate10-hygiene-context7');
const gate11 = require('./gate11-infra-cicd');
const gate12 = require('./gate12-preflight-cli');

const { crawlProject } = require('../services/file-crawler');
const { detectStack } = require('../services/stack-detector');
const { writeGateAuditReport, generateAuditPrompt, generateAutoFixPrompt } = require('../services/antigravity-bridge');
const { updateGateResult, getProject, saveProject } = require('../services/audit-store');

const ALL_GATES = [
  gate1, gate2, gate3, gate4,
  gate5, gate6, gate7, gate8,
  gate9, gate10, gate11, gate12
];

function getGate(gateId) {
  return ALL_GATES.find(g => g.id === gateId || g.number === Number(gateId)) || null;
}

function getAllGates() {
  return ALL_GATES.map(g => ({
    id: g.id,
    number: g.number,
    name: g.name,
    category: g.category,
    description: g.description
  }));
}

/**
 * Execute a single gate analysis on a target project
 */
async function runGate(projectPath, gateId, precomputed = null, options = {}) {
  const gate = getGate(gateId);
  if (!gate) throw new Error(`Gate ${gateId} not found`);

  const startTime = Date.now();
  const files = precomputed?.files || crawlProject(projectPath);
  const stackInfo = precomputed?.stackInfo || detectStack(projectPath, files);

  // Update project stack info in store
  try {
    saveProject(projectPath, { stackInfo });
  } catch (e) {}

  const result = await gate.analyze(projectPath, files, stackInfo);
  const durationMs = Date.now() - startTime;

  // Engine B: write .antigravity/gate-X-audit.md inside target project (skipped in readOnly mode)
  let auditFilePath = null;
  let auditPrompt = '';
  let autoFixPrompt = '';
  if (!options?.readOnly) {
    try {
      auditFilePath = writeGateAuditReport(projectPath, { ...result, stackInfo });
      auditPrompt = generateAuditPrompt(result, projectPath);
      autoFixPrompt = generateAutoFixPrompt(result, projectPath);
    } catch (e) {
      console.error('Failed to write .antigravity audit file:', e);
    }
  }

  const enrichedResult = {
    ...result,
    filesCount: files.length,
    sampleFiles: files.slice(0, 40),
    durationMs,
    scannedAt: new Date().toISOString(),
    auditFilePath,
    auditPrompt,
    autoFixPrompt,
    stackInfo
  };

  // Persist gate result into local JSON database
  let updatedProject = null;
  try {
    updatedProject = updateGateResult(projectPath, gate.id, enrichedResult);
  } catch (e) {}

  return {
    gateResult: enrichedResult,
    project: updatedProject
  };
}

/**
 * Execute batch scan across all 12 gates (or selected gate IDs)
 */
async function runAllGates(projectPath, onProgress = null, gateIds = null, options = {}) {
  const files = crawlProject(projectPath);
  const stackInfo = detectStack(projectPath, files);
  try {
    saveProject(projectPath, { stackInfo });
  } catch (e) {}

  const gatesToRun = Array.isArray(gateIds) && gateIds.length > 0
    ? ALL_GATES.filter(g => gateIds.includes(g.id))
    : ALL_GATES;

  const results = {};
  for (let i = 0; i < gatesToRun.length; i++) {
    const gate = gatesToRun[i];
    if (onProgress) {
      try {
        onProgress({
          current: i + 1,
          total: gatesToRun.length,
          gateId: gate.id,
          name: gate.name
        });
      } catch (e) {}
    }

    const gateStart = Date.now();
    let res;
    try {
      res = await gate.analyze(projectPath, files, stackInfo);
    } catch (err) {
      res = {
        id: gate.id,
        number: gate.number,
        name: gate.name,
        category: gate.category,
        status: 'failed',
        score: 0,
        findings: [{
          id: `${gate.id.toUpperCase()}-ERROR`,
          severity: 'P0',
          title: 'Gate analysis error',
          description: `Analyzer threw an exception: ${err.message}`,
          remediation: 'Check logs and retry scan.'
        }],
        stats: { p0: 1, p1: 0, p2: 0, passed: 0 }
      };
    }
    const durationMs = Date.now() - gateStart;

    let auditFilePath = null;
    let auditPrompt = '';
    let autoFixPrompt = '';
    if (!options?.readOnly) {
      try {
        auditFilePath = writeGateAuditReport(projectPath, { ...res, stackInfo });
        auditPrompt = generateAuditPrompt(res, projectPath);
        autoFixPrompt = generateAutoFixPrompt(res, projectPath);
      } catch (e) {}
    }

    const enriched = {
      ...res,
      filesCount: files.length,
      sampleFiles: files.slice(0, 40),
      durationMs,
      scannedAt: new Date().toISOString(),
      auditFilePath,
      auditPrompt,
      autoFixPrompt,
      stackInfo
    };

    try {
      updateGateResult(projectPath, gate.id, enriched);
    } catch (e) {}
    results[gate.id] = enriched;
  }

  let finalProject = null;
  try {
    finalProject = getProject(projectPath);
  } catch (e) {}
  return {
    results,
    project: finalProject
  };
}

module.exports = {
  getGate,
  getAllGates,
  runGate,
  runAllGates
};
