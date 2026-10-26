#!/usr/bin/env node
/**
 * LaunchGate Native Model Context Protocol (MCP) Server
 * Compatible with Cursor, Claude Code, Windsurf, Antigravity, VS Code Copilot,
 * and any MCP-compliant AI agent.
 *
 * Transport: JSON-RPC 2.0 over stdio.
 * Protocol: MCP 2024-11-05 (negotiates newer revisions when the client supports them).
 *
 * Design principles:
 *  - Tool results are compact by default so agents do not burn context.
 *  - Every write operation is explicit and reports exactly which files changed.
 *  - Tool failures return isError:true (never crash the stdio transport).
 *  - Only allowlisted verification commands can be executed.
 */

const readline = require('readline');
const path = require('path');
const fs = require('fs');

const { runAllGates, getAllGates } = require('./backend/analyzers');
const { crawlProject, readFile } = require('./backend/services/file-crawler');
const { detectStack } = require('./backend/services/stack-detector');
const {
  getProject,
  getRecentProjects,
  getProjectHistory,
  setGateVerification
} = require('./backend/services/audit-store');
const { generateCertificate } = require('./backend/services/certificate-generator');
const { generateSarifReport } = require('./backend/services/sarif-generator');
const { buildComplianceMatrix } = require('./backend/services/compliance-mapper');
const { exportAgentRule, getAvailableAgentTypes } = require('./backend/services/agent-rules-exporter');
const { applyQuickFix, getApplicableFix, revertQuickFix, QUICK_FIXES } = require('./backend/services/quick-fix-engine');
const { analyzeVibeSaaS, executeTurnkeyTransmutation, TURNKEY_MODULES } = require('./backend/services/magic-turnkey-engine');
const { installGitHook } = require('./backend/services/git-hooks-installer');
const { runCommandSync, listAllowedCommands } = require('./backend/services/cli-runner');

const SERVER_NAME = 'launchgate-mcp';
const SERVER_VERSION = '1.1.0';
const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18'];
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_PROJECT = process.env.LAUNCHGATE_PROJECT || process.cwd();

function log(...args) {
  // stdout is reserved exclusively for JSON-RPC frames.
  process.stderr.write(`[launchgate-mcp] ${args.join(' ')}\n`);
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------
function resolveProjectPath(input) {
  const raw = input && String(input).trim() ? String(input).trim() : DEFAULT_PROJECT;
  const resolved = path.resolve(raw.replace(/^["']|["']$/g, ''));
  if (!fs.existsSync(resolved)) throw new Error(`Project path does not exist: ${resolved}`);
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`Project path is not a directory: ${resolved}`);
  return resolved;
}

function assertInsideProject(projectPath, relativeFile) {
  const projectRoot = path.resolve(projectPath);
  const full = path.resolve(projectRoot, relativeFile);
  if (full !== projectRoot && !full.startsWith(projectRoot + path.sep)) {
    throw new Error('File path must stay inside the audited project.');
  }
  return full;
}

function normalizeGateIds(args) {
  const raw = args.gateIds || (args.gateId ? [args.gateId] : null);
  if (!raw) return null;
  return raw
    .filter(Boolean)
    .map(value => {
      const v = String(value).trim().toLowerCase();
      return v.startsWith('gate-') ? v : `gate-${v}`;
    });
}

function verdictFor(project) {
  let p0 = 0;
  let p1 = 0;
  for (const gate of Object.values(project?.gates || {})) {
    p0 += gate?.stats?.p0 || 0;
    p1 += gate?.stats?.p1 || 0;
  }
  const score = project?.overallScore || 0;
  if (p0 === 0 && p1 === 0 && score >= 90) return 'CERTIFIED_READY';
  if (p0 === 0 && score >= 70) return 'CONDITIONAL_RELEASE';
  return 'LAUNCH_BLOCKED';
}

function summarizeProject(project) {
  if (!project) return null;
  const gates = {};
  let p0 = 0;
  let p1 = 0;
  let p2 = 0;
  let passed = 0;
  let verified = 0;

  for (const [id, gate] of Object.entries(project.gates || {})) {
    p0 += gate?.stats?.p0 || 0;
    p1 += gate?.stats?.p1 || 0;
    p2 += gate?.stats?.p2 || 0;
    passed += gate?.stats?.passed || 0;
    if (gate?.verified) verified += 1;
    gates[id] = {
      name: gate?.name,
      status: gate?.status || 'unscanned',
      score: gate?.score || 0,
      verified: Boolean(gate?.verified),
      p0: gate?.stats?.p0 || 0,
      p1: gate?.stats?.p1 || 0
    };
  }

  return {
    projectPath: project.path,
    name: project.name,
    overallScore: project.overallScore || 0,
    verdict: verdictFor(project),
    summary: { p0, p1, p2, passed, verified },
    scannedGates: Object.values(gates).filter(g => g.status !== 'unscanned').length,
    updatedAt: project.updatedAt,
    gates
  };
}

function findFinding(project, findingId) {
  for (const [gateId, gate] of Object.entries(project?.gates || {})) {
    for (const finding of gate?.findings || []) {
      if (finding.id === findingId) return { gateId, finding };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// MCP Tool definitions
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: 'launchgate_scan',
    description:
      'Runs LaunchGate production-readiness gates against a local project. Returns readiness score, verdict, P0/P1/P2 counts, and per-gate status. Use gateIds to scan specific gates.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string', description: 'Absolute path to the project. Defaults to LAUNCHGATE_PROJECT or cwd.' },
        gateId: { type: 'string', description: 'Single gate to scan, e.g. "gate-1" or "1".' },
        gateIds: { type: 'array', items: { type: 'string' }, description: 'Batch gate IDs, e.g. ["gate-1","gate-2"].' }
      }
    }
  },
  {
    name: 'launchgate_list_gates',
    description: 'Lists all 12 production-readiness gates with category and audit scope.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'launchgate_get_findings',
    description:
      'Returns actionable findings with severity, file, line, code snippet, and remediation. Supports severity/gate filters and pagination for large codebases.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        gateId: { type: 'string' },
        severity: { type: 'string', enum: ['all', 'P0', 'P1', 'P2', 'PASSED'] },
        limit: { type: 'number', description: 'Maximum findings to return (default 50, max 200).' },
        offset: { type: 'number', description: 'Pagination offset (default 0).' }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'launchgate_get_project_summary',
    description: 'Returns the latest persisted readiness summary for a project without re-scanning.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: { type: 'string' } },
      required: ['projectPath']
    }
  },
  {
    name: 'launchgate_list_projects',
    description: 'Lists recently audited projects and whether each has stored gate results.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'launchgate_verify_gate',
    description:
      'Marks a gate as verified after the agent has fixed and re-scanned it. Provide evidence in notes. This affects the readiness score.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        gateId: { type: 'string' },
        notes: { type: 'string', description: 'Evidence of the fix and verification command output.' }
      },
      required: ['projectPath', 'gateId']
    }
  },
  {
    name: 'launchgate_generate_certificate',
    description:
      'Generates the timestamped PRODUCTION_READINESS_REPORT.md and printable HTML certificate in the project root.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: { type: 'string' } },
      required: ['projectPath']
    }
  },
  {
    name: 'launchgate_generate_sarif',
    description: 'Generates an OASIS SARIF v2.1.0 report for GitHub Code Scanning / VS Code Problems.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        includeLog: { type: 'boolean', description: 'Include the full SARIF log in the response. Defaults to false.' }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'launchgate_get_compliance',
    description: 'Maps findings to OWASP API Top 10, SOC 2 Type II, and GDPR controls.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: { type: 'string' } },
      required: ['projectPath']
    }
  },
  {
    name: 'launchgate_get_history',
    description: 'Returns readiness-score snapshots over time, including deltas.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: { type: 'string' } },
      required: ['projectPath']
    }
  },
  {
    name: 'launchgate_apply_quick_fix',
    description:
      'Applies a deterministic, non-destructive fix (env template, gitignore, security headers, healthcheck, error boundary, Docker, CI, legal pages, SEO, rate limiter, webhook guard). Returns a unified diff for every changed file and a rollback token. Set verify:true to run baseline checks, re-run them after the fix, and automatically revert if a previously passing check regresses. Use launchgate_suggest_fix first if unsure.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        fixId: { type: 'string', description: 'Quick-fix ID, e.g. fix-security-headers.' },
        rule: { type: 'string', description: 'Alternatively, pass a finding rule string and LaunchGate will select the matching fix.' },
        verify: { type: 'boolean', description: 'Run baseline + post-fix checks and auto-revert on regression. Defaults to false.' },
        checks: {
          type: 'array',
          items: { type: 'string', enum: ['typecheck', 'lint', 'audit', 'build', 'test'] },
          description: 'Checks used when verify is true. Defaults to ["typecheck","lint"].'
        }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'launchgate_suggest_fix',
    description: 'Suggests a deterministic quick fix for a rule string, or lists all available quick fixes.',
    inputSchema: {
      type: 'object',
      properties: {
        rule: { type: 'string', description: 'Finding rule to match.' },
        listAll: { type: 'boolean', description: 'Return every available fix.' }
      }
    }
  },
  {
    name: 'launchgate_get_file_context',
    description:
      'Reads a numbered code window around a finding so the agent can propose an exact patch. Path must be inside the project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        file: { type: 'string', description: 'Project-relative file path.' },
        line: { type: 'number', description: '1-based line number.' },
        contextLines: { type: 'number', description: 'Lines before/after (default 12, max 60).' }
      },
      required: ['projectPath', 'file']
    }
  },
  {
    name: 'launchgate_run_check',
    description:
      'Runs an allowlisted verification command in the project: typecheck, lint, audit, build, or test. Returns exit code and trimmed output.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        check: { type: 'string', enum: ['typecheck', 'lint', 'audit', 'build', 'test'] }
      },
      required: ['projectPath', 'check']
    }
  },
  {
    name: 'launchgate_export_agent_rules',
    description:
      'Writes LaunchGate rules into the project for Cursor, Claude Code, Windsurf, Copilot, or Antigravity.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        agentType: { type: 'string', enum: ['cursor', 'claude', 'windsurf', 'copilot', 'antigravity'] }
      },
      required: ['projectPath', 'agentType']
    }
  },
  {
    name: 'launchgate_install_git_hook',
    description: 'Installs a pre-push hook that blocks pushes containing P0 release blockers.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: { type: 'string' } },
      required: ['projectPath']
    }
  },
  {
    name: 'launchgate_magic_turnkey_harden',
    description:
      'Injects production infrastructure into a vibe-coded app: security headers, rate limiting, healthcheck, React error boundary, webhook guard, legal pages, robots/sitemap, Docker, CI/CD, and code hygiene.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        modules: { type: 'array', items: { type: 'string' }, description: 'Optional module IDs. Omit to apply all.' },
        dryRun: { type: 'boolean', description: 'Analyze only; do not write files. Defaults to false.' }
      }
    }
  },
  {
    name: 'launchgate_get_audit_report',
    description: 'Returns the generated markdown audit report for a gate (Engine B), if present.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        gateId: { type: 'string' }
      },
      required: ['projectPath', 'gateId']
    }
  },
  {
    name: 'launchgate_get_magic_modules',
    description: 'Lists all turnkey hardening modules and whether the project already satisfies each one.',
    inputSchema: {
      type: 'object',
      properties: { projectPath: { type: 'string' } },
      required: ['projectPath']
    }
  },
  {
    name: 'launchgate_fix_until_green',
    description:
      'Autonomously fixes P0 issues until none remain or no more safe fixes are available. Applies quick fixes, verifies with allowlisted checks, re-scans, reverts iterations that regress, and reports diffs and progress. Stops when P0==0, no safe fix remains, or max iterations is reached.',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: { type: 'string' },
        maxIterations: { type: 'number', description: 'Maximum fix+rescan cycles (default 5).' },
        runChecks: { type: 'boolean', description: 'Verify fixes with typecheck/lint and revert regressions (default true).' },
        checks: {
          type: 'array',
          items: { type: 'string', enum: ['typecheck', 'lint', 'audit', 'build', 'test'] },
          description: 'Checks used for verification. Defaults to ["typecheck","lint"].'
        }
      },
      required: ['projectPath']
    }
  }
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------
const DEFAULT_CHECKS = ['typecheck', 'lint'];

function normalizeChecks(input) {
  const allowed = listAllowedCommands().map(c => c.id);
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : DEFAULT_CHECKS;
  return raw
    .map(value => String(value).trim().toLowerCase())
    .filter(value => allowed.includes(value));
}

async function runChecks(targetPath, checks) {
  const results = [];
  for (const check of checks) {
    const result = await runCommandSync(targetPath, check);
    results.push({
      check,
      success: result.code === 0,
      exitCode: result.code,
      durationMs: result.duration,
      stdout: (result.stdout || '').slice(-4000),
      stderr: (result.stderr || '').slice(-4000)
    });
  }
  return results;
}

function indexChecks(results) {
  return Object.fromEntries(results.map(result => [result.check, result]));
}

function compactCheck(result) {
  return {
    check: result.check,
    success: result.success,
    exitCode: result.exitCode,
    durationMs: result.durationMs
  };
}

async function executeTool(name, args = {}) {
  switch (name) {
    case 'launchgate_list_gates': {
      const gates = getAllGates();
      return {
        totalGates: gates.length,
        gates: gates.map(g => ({
          id: g.id,
          number: g.number,
          name: g.name,
          category: g.category,
          description: g.description
        }))
      };
    }

    case 'launchgate_scan': {
      const targetPath = resolveProjectPath(args.projectPath);
      const selected = normalizeGateIds(args);
      const { results } = await runAllGates(targetPath, null, selected);

      let p0 = 0;
      let p1 = 0;
      let p2 = 0;
      let passed = 0;
      for (const gate of Object.values(results)) {
        p0 += gate?.stats?.p0 || 0;
        p1 += gate?.stats?.p1 || 0;
        p2 += gate?.stats?.p2 || 0;
        passed += gate?.stats?.passed || 0;
      }

      const project = getProject(targetPath);
      return {
        projectPath: targetPath,
        projectName: project?.name || path.basename(targetPath),
        overallScore: project?.overallScore || 0,
        verdict: verdictFor(project),
        summary: { p0, p1, p2, passed },
        gates: Object.fromEntries(
          Object.entries(results).map(([id, gate]) => [
            id,
            {
              name: gate.name,
              status: gate.status,
              score: gate.score,
              p0Count: gate.stats?.p0 || 0,
              p1Count: gate.stats?.p1 || 0,
              p2Count: gate.stats?.p2 || 0,
              verified: Boolean(gate.verified)
            }
          ])
        ),
        nextStep: p0 > 0
          ? 'Call launchgate_get_findings with severity "P0", fix the issues, then re-scan.'
          : 'Review P1 findings or generate a certificate.'
      };
    }

    case 'launchgate_get_findings': {
      const targetPath = resolveProjectPath(args.projectPath);
      const project = getProject(targetPath);
      if (!project) return { error: 'No scan results found. Run launchgate_scan first.' };

      const severityFilter = args.severity || 'all';
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
      const offset = Math.max(Number(args.offset) || 0, 0);
      const collected = [];

      for (const [gateId, gate] of Object.entries(project.gates || {})) {
        if (args.gateId && gateId !== args.gateId) continue;
        for (const finding of gate.findings || []) {
          if (severityFilter !== 'all' && finding.severity !== severityFilter) continue;
          collected.push({
            id: finding.id,
            gateId,
            gateName: gate.name,
            severity: finding.severity,
            title: finding.title,
            rule: finding.rule,
            description: finding.description,
            file: finding.file,
            line: finding.line,
            snippet: finding.snippet,
            remediation: finding.remediation
          });
        }
      }

      collected.sort((a, b) => {
        const order = { P0: 0, P1: 1, P2: 2, PASSED: 3 };
        return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
      });

      return {
        projectPath: targetPath,
        filter: { gateId: args.gateId || 'all', severity: severityFilter },
        total: collected.length,
        offset,
        limit,
        hasMore: offset + limit < collected.length,
        findings: collected.slice(offset, offset + limit)
      };
    }

    case 'launchgate_get_project_summary': {
      const targetPath = resolveProjectPath(args.projectPath);
      return summarizeProject(getProject(targetPath)) || {
        projectPath: targetPath,
        message: 'No stored audit. Run launchgate_scan first.'
      };
    }

    case 'launchgate_list_projects': {
      const recent = getRecentProjects();
      return {
        count: recent.length,
        projects: recent.map(entry => {
          const project = getProject(entry.path);
          return {
            ...entry,
            hasAudit: Boolean(project),
            overallScore: project?.overallScore || 0,
            verdict: project ? verdictFor(project) : 'UNSCANNED'
          };
        })
      };
    }

    case 'launchgate_verify_gate': {
      const targetPath = resolveProjectPath(args.projectPath);
      const gateId = normalizeGateIds({ gateId: args.gateId })?.[0];
      const updated = setGateVerification(targetPath, gateId, true, args.notes || 'Verified by AI agent');
      if (!updated) return { error: `Gate ${gateId} or project not found. Run a scan first.` };
      return {
        success: true,
        gateId,
        verified: true,
        newOverallScore: updated.overallScore,
        notes: args.notes || 'Verified by AI agent'
      };
    }

    case 'launchgate_generate_certificate': {
      const targetPath = resolveProjectPath(args.projectPath);
      const cert = generateCertificate(targetPath);
      return {
        success: true,
        reportPath: cert.reportPath,
        htmlReportPath: cert.htmlReportPath,
        certificateHash: cert.certHash,
        score: cert.score,
        verdict: cert.verdict
      };
    }

    case 'launchgate_generate_sarif': {
      const targetPath = resolveProjectPath(args.projectPath);
      const project = getProject(targetPath);
      if (!project) return { error: 'No scan results found. Run launchgate_scan first.' };
      const sarif = generateSarifReport(targetPath, project);
      return {
        success: true,
        outputPath: sarif.outputPath,
        totalRules: sarif.totalRules,
        totalResults: sarif.totalResults,
        ...(args.includeLog ? { sarifLog: sarif.sarifLog } : {})
      };
    }

    case 'launchgate_get_compliance': {
      const targetPath = resolveProjectPath(args.projectPath);
      const project = getProject(targetPath);
      if (!project) return { error: 'No scan results found. Run launchgate_scan first.' };
      return { projectPath: targetPath, compliance: buildComplianceMatrix(project) };
    }

    case 'launchgate_get_history': {
      const targetPath = resolveProjectPath(args.projectPath);
      return { projectPath: targetPath, history: getProjectHistory(targetPath) };
    }

    case 'launchgate_suggest_fix': {
      if (args.listAll) {
        return {
          fixes: Object.entries(QUICK_FIXES).map(([id, fix]) => ({
            id,
            title: fix.title,
            description: fix.description,
            applicableRules: fix.applicableRules
          }))
        };
      }
      if (!args.rule) return { error: 'Provide a rule string or set listAll:true.' };
      const fix = getApplicableFix(args.rule);
      return fix ? { fixId: fix.fixId, title: fix.title, description: fix.description } : { match: false };
    }

    case 'launchgate_apply_quick_fix': {
      const targetPath = resolveProjectPath(args.projectPath);
      let fixId = args.fixId;
      if (!fixId && args.rule) {
        const match = getApplicableFix(args.rule);
        fixId = match?.fixId;
      }
      if (!fixId) return { error: 'Provide fixId or a rule that maps to a known fix.' };

      const verify = args.verify === true;
      const checks = normalizeChecks(args.checks);

      if (verify && checks.length === 0) {
        return { error: 'verify:true requires at least one allowlisted check (typecheck, lint, audit, build, test).' };
      }

      let baseline = null;
      if (verify) {
        const baselineResults = await runChecks(targetPath, checks);
        baseline = indexChecks(baselineResults);
      }

      const result = applyQuickFix(targetPath, fixId);

      if (!verify) {
        return { success: true, fixId, diffPreview: result.diffPreview, changedFiles: result.changedFiles, rollbackToken: result.rollbackToken, result };
      }

      const postResults = await runChecks(targetPath, checks);
      const regressions = [];
      for (const res of postResults) {
        const base = baseline[res.check];
        const basePassed = base ? base.success : false;
        if (basePassed && !res.success) {
          regressions.push({ check: res.check, from: compactCheck(base), to: compactCheck(res) });
        }
      }

      if (regressions.length > 0 && result.rollbackToken) {
        const reverted = revertQuickFix(result.rollbackToken);
        return {
          success: false,
          fixId,
          reverted: true,
          reason: 'Post-fix verification regressed a previously passing check.',
          regressions,
          baseline: Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, compactCheck(v)])),
          postFixChecks: postResults.map(compactCheck),
          revertResult: reverted,
          diffPreview: result.diffPreview,
          changedFiles: result.changedFiles
        };
      }

      return {
        success: regressions.length === 0,
        fixId,
        verified: true,
        regressions,
        baseline: Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, compactCheck(v)])),
        postFixChecks: postResults.map(compactCheck),
        diffPreview: result.diffPreview,
        changedFiles: result.changedFiles,
        rollbackToken: regressions.length === 0 ? result.rollbackToken : null,
        result
      };
    }

    case 'launchgate_get_file_context': {
      const targetPath = resolveProjectPath(args.projectPath);
      const fullPath = assertInsideProject(targetPath, args.file);
      const content = readFile(targetPath, path.relative(targetPath, fullPath).replace(/\\/g, '/'));
      if (content === null) return { error: `Unable to read file: ${args.file}` };

      const lines = content.split(/\r?\n/);
      const center = Math.max(Number(args.line) || 1, 1) - 1;
      const radius = Math.min(Math.max(Number(args.contextLines) || 12, 1), 60);
      const start = Math.max(0, center - radius);
      const end = Math.min(lines.length, center + radius + 1);

      return {
        file: args.file,
        startLine: start + 1,
        endLine: end,
        totalLines: lines.length,
        text: lines
          .slice(start, end)
          .map((line, idx) => `${String(start + idx + 1).padStart(4, ' ')} | ${line}`)
          .join('\n')
      };
    }

    case 'launchgate_run_check': {
      const targetPath = resolveProjectPath(args.projectPath);
      const allowed = listAllowedCommands().map(c => c.id);
      if (!allowed.includes(args.check)) {
        return { error: `Unknown check "${args.check}". Allowed: ${allowed.join(', ')}` };
      }
      const result = await runCommandSync(targetPath, args.check);
      const clip = value => (value || '').slice(-20000);
      return {
        check: args.check,
        exitCode: result.code,
        success: result.code === 0,
        durationMs: result.duration,
        stdout: clip(result.stdout),
        stderr: clip(result.stderr)
      };
    }

    case 'launchgate_export_agent_rules': {
      const targetPath = resolveProjectPath(args.projectPath);
      const available = getAvailableAgentTypes().map(a => a.id);
      if (!available.includes(args.agentType)) {
        return { error: `Unsupported agentType. Choose: ${available.join(', ')}` };
      }
      return exportAgentRule(targetPath, args.agentType);
    }

    case 'launchgate_install_git_hook': {
      const targetPath = resolveProjectPath(args.projectPath);
      return installGitHook(targetPath);
    }

    case 'launchgate_get_audit_report': {
      const targetPath = resolveProjectPath(args.projectPath);
      const gateId = normalizeGateIds({ gateId: args.gateId })?.[0];
      const reportPath = path.join(targetPath, '.antigravity', `${gateId}-audit.md`);
      if (!fs.existsSync(reportPath)) {
        return { error: `No audit report found at .antigravity/${gateId}-audit.md. Run launchgate_scan for this gate.` };
      }
      return { gateId, reportPath, markdown: fs.readFileSync(reportPath, 'utf8') };
    }

    case 'launchgate_get_magic_modules': {
      const targetPath = resolveProjectPath(args.projectPath);
      return { projectPath: targetPath, analysis: analyzeVibeSaaS(targetPath) };
    }

    case 'launchgate_magic_turnkey_harden': {
      const targetPath = resolveProjectPath(args.projectPath);
      if (args.dryRun) {
        return {
          dryRun: true,
          projectPath: targetPath,
          analysis: analyzeVibeSaaS(targetPath),
          modules: TURNKEY_MODULES
        };
      }
      const before = analyzeVibeSaaS(targetPath);
      const result = await executeTurnkeyTransmutation(targetPath, args.modules || null);
      return {
        success: result.success,
        projectPath: targetPath,
        initialReadinessScore: before.vibeReadinessScore,
        hardenedScore: result.newOverallScore,
        assetsGeneratedCount: result.changesCount,
        changes: result.changes,
        message: 'Project hardened. Re-scan to verify the new readiness score.'
      };
    }

    case 'launchgate_fix_until_green': {
      const targetPath = resolveProjectPath(args.projectPath);
      const maxIterations = Math.max(1, Math.min(Number(args.maxIterations) || 5, 10));
      const runChecks = args.runChecks !== false;
      const checks = normalizeChecks(args.checks);
      const history = [];

      for (let iter = 1; iter <= maxIterations; iter++) {
        const scan = await executeTool('launchgate_scan', { projectPath: targetPath });
        const p0 = scan.summary?.p0 || 0;
        const iterationRecord = { iteration: iter, p0, score: scan.overallScore, fixesApplied: 0 };
        history.push(iterationRecord);

        if (p0 === 0) {
          return {
            success: true,
            projectPath: targetPath,
            message: 'No P0 findings remain.',
            iterations: history
          };
        }

        const findings = await executeTool('launchgate_get_findings', { projectPath: targetPath, severity: 'P0', limit: 50 });
        const fixesApplied = [];
        const triedFixes = new Set();

        for (const finding of (findings.findings || [])) {
          if (p0 === 0) break;
          const suggested = getApplicableFix(finding.rule);
          if (!suggested?.fixId || triedFixes.has(suggested.fixId)) continue;
          triedFixes.add(suggested.fixId);

          let baseline = null;
          if (runChecks && checks.length > 0) {
            const baselineResults = await runChecks(targetPath, checks);
            baseline = indexChecks(baselineResults);
          }

          try {
            const res = applyQuickFix(targetPath, suggested.fixId);
            let verification = null;

            if (runChecks && checks.length > 0 && baseline) {
              const postResults = await runChecks(targetPath, checks);
              const regressions = [];
              for (const checkRes of postResults) {
                const base = baseline[checkRes.check];
                const basePassed = base ? base.success : false;
                if (basePassed && !checkRes.success) {
                  regressions.push({ check: checkRes.check, from: compactCheck(base), to: compactCheck(checkRes) });
                }
              }
              if (regressions.length > 0 && res.rollbackToken) {
                revertQuickFix(res.rollbackToken);
                verification = {
                  reverted: true,
                  reason: 'Post-fix verification regressed a previously passing check.',
                  regressions,
                  postFixChecks: postResults.map(compactCheck)
                };
              } else {
                verification = {
                  reverted: false,
                  regressions,
                  postFixChecks: postResults.map(compactCheck)
                };
              }
            }

            fixesApplied.push({
              findingId: finding.id,
              rule: finding.rule,
              fixId: suggested.fixId,
              changedFiles: res.changedFiles || [],
              diffPreview: (res.diffPreview || []).slice(0, 4),
              verification
            });
          } catch (e) {
            fixesApplied.push({ findingId: finding.id, rule: finding.rule, fixId: suggested.fixId, error: e.message });
          }
        }

        iterationRecord.fixesApplied = fixesApplied.length;
        iterationRecord.fixes = fixesApplied;

        if (fixesApplied.length === 0) {
          return {
            success: false,
            projectPath: targetPath,
            message: 'No safe automated fixes available for remaining P0s. Manual intervention required.',
            iterations: history,
            remainingP0: p0
          };
        }
      }

      const finalScan = await executeTool('launchgate_scan', { projectPath: targetPath });
      return {
        success: (finalScan.summary?.p0 || 0) === 0,
        projectPath: targetPath,
        message: `Completed ${maxIterations} iterations. P0 remaining: ${finalScan.summary?.p0 || 0}.`,
        iterations: history,
        finalScore: finalScan.overallScore
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// MCP Resources
// ---------------------------------------------------------------------------
const PROJECT_URI_PREFIX = 'launchgate://project/';

function projectSummaryUri(projectPath) {
  return `${PROJECT_URI_PREFIX}${encodeURIComponent(path.resolve(projectPath))}/summary`;
}

function projectReportUri(projectPath) {
  return `${PROJECT_URI_PREFIX}${encodeURIComponent(path.resolve(projectPath))}/report`;
}

function projectSarifUri(projectPath) {
  return `${PROJECT_URI_PREFIX}${encodeURIComponent(path.resolve(projectPath))}/sarif`;
}

function decodeProjectUri(uri) {
  const match = String(uri || '').match(/^launchgate:\/\/project\/(.+)\/(summary|report|sarif)$/);
  if (!match) return null;
  return { projectPath: decodeURIComponent(match[1]), kind: match[2] };
}

function listResources() {
  const resources = [
    {
      uri: 'launchgate://gates/reference',
      name: 'LaunchGate 12-Gate Reference',
      description: 'Machine-readable reference for all 12 production-readiness gates.',
      mimeType: 'application/json'
    }
  ];

  for (const recent of getRecentProjects()) {
    const project = getProject(recent.path);
    if (!project) continue;
    resources.push({
      uri: projectSummaryUri(recent.path),
      name: `${recent.name} — readiness summary`,
      description: `Score ${project.overallScore || 0}% • ${verdictFor(project)}`,
      mimeType: 'application/json'
    });
    if (fs.existsSync(path.join(recent.path, 'PRODUCTION_READINESS_REPORT.md'))) {
      resources.push({
        uri: projectReportUri(recent.path),
        name: `${recent.name} — production readiness report`,
        description: 'Generated PRODUCTION_READINESS_REPORT.md',
        mimeType: 'text/markdown'
      });
    }
  }

  return resources;
}

function readResource(uri) {
  if (uri === 'launchgate://gates/reference') {
    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(getAllGates(), null, 2)
    };
  }

  const decoded = decodeProjectUri(uri);
  if (!decoded) throw new Error(`Unknown resource URI: ${uri}`);

  if (decoded.kind === 'summary') {
    const summary = summarizeProject(getProject(decoded.projectPath));
    if (!summary) throw new Error('No stored audit for this project.');
    return { uri, mimeType: 'application/json', text: JSON.stringify(summary, null, 2) };
  }

  if (decoded.kind === 'report') {
    const reportPath = path.join(decoded.projectPath, 'PRODUCTION_READINESS_REPORT.md');
    if (!fs.existsSync(reportPath)) throw new Error('Report not generated yet. Call launchgate_generate_certificate.');
    return { uri, mimeType: 'text/markdown', text: fs.readFileSync(reportPath, 'utf8') };
  }

  if (decoded.kind === 'sarif') {
    const project = getProject(decoded.projectPath);
    if (!project) throw new Error('No stored audit for this project.');
    const sarif = generateSarifReport(decoded.projectPath, project);
    return { uri, mimeType: 'application/sarif+json', text: JSON.stringify(sarif.sarifLog, null, 2) };
  }

  throw new Error(`Unsupported resource kind: ${decoded.kind}`);
}

// ---------------------------------------------------------------------------
// MCP Prompts
// ---------------------------------------------------------------------------
const PROMPTS = [
  {
    name: 'launchgate_fix_gate',
    description: 'Audit, fix, and verify a single LaunchGate gate end-to-end.',
    arguments: [
      { name: 'projectPath', description: 'Absolute project path.', required: true },
      { name: 'gateId', description: 'Gate to remediate, e.g. gate-2.', required: true }
    ]
  },
  {
    name: 'launchgate_release_audit',
    description: 'Run the full release audit and produce a go/no-go verdict with certificate.',
    arguments: [
      { name: 'projectPath', description: 'Absolute project path.', required: true }
    ]
  }
];

function getPrompt(name, args = {}) {
  if (name === 'launchgate_fix_gate') {
    const projectPath = args.projectPath || DEFAULT_PROJECT;
    const gateId = args.gateId || 'gate-1';
    return {
      description: `Remediate ${gateId}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `You are a senior full-stack security engineer. Remediate LaunchGate ${gateId} in ${projectPath}.`,
              '',
              `1. Call launchgate_scan with projectPath "${projectPath}" and gateId "${gateId}".`,
              `2. Call launchgate_get_findings for ${gateId}, severity all.`,
              `3. For each P0/P1 finding, call launchgate_get_file_context to read the exact code.`,
              '4. Apply minimal, production-quality patches. Do not rewrite unrelated code.',
              '5. Run launchgate_run_check for typecheck/lint/build when applicable.',
              `6. Re-scan ${gateId}. Only when P0 is zero and the gate passes, call launchgate_verify_gate with evidence in notes.`,
              '',
              'Never mark a gate verified without a clean re-scan.'
            ].join('\n')
          }
        }
      ]
    };
  }

  if (name === 'launchgate_release_audit') {
    const projectPath = args.projectPath || DEFAULT_PROJECT;
    return {
      description: 'Full release audit',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              `Perform a complete production-readiness audit of ${projectPath}.`,
              '',
              '1. launchgate_scan (all gates).',
              '2. Triage P0 findings first, then P1. Use launchgate_get_file_context and fix in place.',
              '3. Run launchgate_run_check typecheck, lint, audit, build.',
              '4. Re-scan until P0 = 0.',
              '5. launchgate_generate_sarif, launchgate_get_compliance, and launchgate_generate_certificate.',
              '6. Report a go/no-go verdict with the readiness score, remaining risks, and exact commands run.'
            ].join('\n')
          }
        }
      ]
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
}

// ---------------------------------------------------------------------------
// JSON-RPC / MCP transport
// ---------------------------------------------------------------------------
function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message, data) {
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
}

function toolResult(payload, isError = false) {
  return {
    content: [
      {
        type: 'text',
        text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
      }
    ],
    isError
  };
}

async function handleMessage(message) {
  if (Array.isArray(message)) {
    for (const item of message) await handleMessage(item);
    return;
  }
  if (!message || typeof message !== 'object') return;

  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case 'initialize': {
        const requested = params?.protocolVersion;
        sendResult(id, {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
            ? requested
            : DEFAULT_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false },
            logging: {}
          },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions:
            'LaunchGate audits local projects for production readiness. Start with launchgate_scan, then launchgate_get_findings, fix code, re-scan, and only then launchgate_verify_gate. Use launchgate_get_file_context before editing. Certificates are generated only from persisted audit state.'
        });
        return;
      }

      case 'notifications/initialized':
      case 'initialized':
      case 'notifications/cancelled':
      case 'notifications/roots/list_changed':
        return;

      case 'ping':
        if (!isNotification) sendResult(id, {});
        return;

      case 'shutdown':
        if (!isNotification) sendResult(id, {});
        return;

      case 'tools/list':
        sendResult(id, { tools: TOOLS });
        return;

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        if (!toolName) {
          sendResult(id, toolResult('Missing tool name.', true));
          return;
        }
        try {
          const output = await executeTool(toolName, toolArgs);
          sendResult(id, toolResult(output, false));
        } catch (err) {
          log(`Tool ${toolName} failed: ${err.message}`);
          sendResult(id, toolResult({ error: err.message }, true));
        }
        return;
      }

      case 'resources/list':
        sendResult(id, { resources: listResources() });
        return;

      case 'resources/templates/list':
        sendResult(id, {
          resourceTemplates: [
            {
              uriTemplate: 'launchgate://project/{projectPath}/summary',
              name: 'Project readiness summary',
              description: 'Latest persisted audit summary (JSON).',
              mimeType: 'application/json'
            },
            {
              uriTemplate: 'launchgate://project/{projectPath}/report',
              name: 'Production readiness report',
              description: 'Generated PRODUCTION_READINESS_REPORT.md.',
              mimeType: 'text/markdown'
            },
            {
              uriTemplate: 'launchgate://project/{projectPath}/sarif',
              name: 'SARIF report',
              description: 'OASIS SARIF v2.1.0 findings.',
              mimeType: 'application/sarif+json'
            }
          ]
        });
        return;

      case 'resources/read': {
        try {
          const contents = readResource(params?.uri);
          sendResult(id, { contents: [contents] });
        } catch (err) {
          sendError(id, -32002, err.message);
        }
        return;
      }

      case 'prompts/list':
        sendResult(id, { prompts: PROMPTS });
        return;

      case 'prompts/get': {
        try {
          sendResult(id, getPrompt(params?.name, params?.arguments || {}));
        } catch (err) {
          sendError(id, -32602, err.message);
        }
        return;
      }

      case 'logging/setLevel':
        if (!isNotification) sendResult(id, {});
        return;

      default:
        if (!isNotification) {
          sendError(id, -32601, `Method not found: ${method}`);
        }
    }
  } catch (err) {
    log(`Unhandled error for ${method}: ${err?.stack || err}`);
    if (!isNotification) sendError(id, -32603, err.message || 'Internal error');
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch (e) {
    sendError(null, -32700, 'Parse error');
    return;
  }

  handleMessage(message).catch(err => {
    log(`Fatal message handler error: ${err?.stack || err}`);
  });
});

rl.on('close', () => {
  log('stdin closed; exiting.');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  log(`Uncaught exception: ${err?.stack || err}`);
});
process.on('unhandledRejection', (reason) => {
  log(`Unhandled rejection: ${reason?.stack || reason}`);
});

log(`server started (protocol ${DEFAULT_PROTOCOL_VERSION}, default project ${DEFAULT_PROJECT})`);
