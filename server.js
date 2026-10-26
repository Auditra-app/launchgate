const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { openFolderDialog } = require('./backend/utils/os-dialog');
const { crawlProject } = require('./backend/services/file-crawler');
const { detectStack } = require('./backend/services/stack-detector');
const {
  getProject,
  saveProject,
  setGateVerification,
  getRecentProjects,
  addRecentProject,
  getProjectHistory,
  normalizePath,
  getDataDir
} = require('./backend/services/audit-store');
const { runGate, runAllGates, getAllGates } = require('./backend/analyzers');
const { writeGateFixPlan, generateAutoFixPrompt } = require('./backend/services/antigravity-bridge');
const { runCommandStream, runCommandSync, runProcessSync, validateProjectPath } = require('./backend/services/cli-runner');
const { generateCertificate } = require('./backend/services/certificate-generator');
const { generateSarifReport } = require('./backend/services/sarif-generator');
const { buildComplianceMatrix } = require('./backend/services/compliance-mapper');
const { exportAgentRule, getAvailableAgentTypes } = require('./backend/services/agent-rules-exporter');
const { applyQuickFix, QUICK_FIXES } = require('./backend/services/quick-fix-engine');
const { analyzeVibeSaaS, executeTurnkeyTransmutation, TURNKEY_MODULES } = require('./backend/services/magic-turnkey-engine');
const { installGitHook } = require('./backend/services/git-hooks-installer');
const { browseDirectory } = require('./backend/services/directory-browser');

// Global Process Resilience Handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[LaunchGate Resilience] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[LaunchGate Resilience] Uncaught Exception:', err);
});

const app = express();
app.disable('x-powered-by');

// Command line argument parsing for host/port/remote
const serverArgs = process.argv.slice(2);
let cliHost = process.env.HOST;
for (let i = 0; i < serverArgs.length; i++) {
  if (serverArgs[i] === '--host' && serverArgs[i + 1]) cliHost = serverArgs[++i];
  else if (serverArgs[i].startsWith('--host=')) cliHost = serverArgs[i].split('=')[1];
  else if (serverArgs[i] === '--port' && serverArgs[i + 1]) process.env.PORT = serverArgs[++i];
  else if (serverArgs[i].startsWith('--port=')) process.env.PORT = serverArgs[i].split('=')[1];
  else if (serverArgs[i] === '--allow-remote') process.env.LAUNCHGATE_ALLOW_REMOTE = 'true';
}

const PORT = process.env.PORT || 4545;
const HOST = cliHost || '127.0.0.1';
const ALLOW_REMOTE = HOST === '0.0.0.0' || process.env.LAUNCHGATE_ALLOW_REMOTE === 'true';

// If running in remote / 0.0.0.0 mode and no token is set, generate a strong ephemeral token
let sessionToken = process.env.LAUNCHGATE_TOKEN;
if (ALLOW_REMOTE && !sessionToken) {
  sessionToken = crypto.randomBytes(16).toString('hex');
  process.env.LAUNCHGATE_TOKEN = sessionToken;
}

// ---------------------------------------------------------------------------
// Local-only trust boundary & remote token access
// ---------------------------------------------------------------------------
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function parseHostname(hostHeader) {
  if (!hostHeader) return '';
  const value = String(hostHeader).trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? value : value.slice(0, end + 1);
  }
  return value.split(':')[0];
}

function isLoopbackAddress(address) {
  if (!address) return true; // unix socket / in-process
  const addr = String(address).toLowerCase().replace(/^\[|\]$/g, '');
  return addr === '::1' || addr === 'localhost' || addr.startsWith('127.') || addr === '::ffff:127.0.0.1';
}

function isLocalRequest(req) {
  const hostname = parseHostname(req.headers.host);
  if (!LOCAL_HOSTNAMES.has(hostname)) return false;

  const origin = req.headers.origin;
  if (origin) {
    try {
      if (!LOCAL_HOSTNAMES.has(parseHostname(new URL(origin).host))) return false;
    } catch (e) {
      return false;
    }
  }

  return isLoopbackAddress(req.socket?.remoteAddress);
}

function isAuthorizedRequest(req) {
  const required = process.env.LAUNCHGATE_TOKEN;
  const provided = req.get('x-launchgate-token') || req.query.token;

  if (required && provided === required) {
    return true;
  }

  if (isLocalRequest(req)) {
    if (required && provided !== required) return false;
    return true;
  }

  if (ALLOW_REMOTE && required && provided === required) {
    return true;
  }

  return false;
}

function localOnly(req, res, next) {
  if (!isAuthorizedRequest(req)) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: LaunchGate only accepts requests from localhost, or authorized remote clients with a valid token.'
    });
  }
  next();
}

// Optional shared-secret guard (set LAUNCHGATE_TOKEN to enable). Useful when
// another local process or a browser extension shares the loopback interface.
function requireToken(req, res, next) {
  const required = process.env.LAUNCHGATE_TOKEN;
  if (!required) return next();

  const provided = req.get('x-launchgate-token') || req.query.token;
  if (!provided || provided !== required) {
    return res.status(401).json({ success: false, error: 'Unauthorized: invalid LaunchGate token.' });
  }
  next();
}

// Backwards-compatible name used by existing routes.
const verifySession = localOnly;

// In-Memory Rate Limiter for Abuse Defense
const requestCounts = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 600;

  const record = requestCounts.get(ip) || { count: 0, resetTime: now + windowMs };
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }
  record.count++;
  requestCounts.set(ip, record);

  if (record.count > maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  next();
}

// Same-origin / localhost-only CORS. Never use a wildcard here: the API can
// read arbitrary paths and spawn processes.
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOW_REMOTE) return callback(null, true);
    try {
      const { host } = new URL(origin);
      if (LOCAL_HOSTNAMES.has(parseHostname(host))) return callback(null, true);
    } catch (e) { /* fall through */ }
    return callback(new Error('CORS: LaunchGate only allows localhost origins.'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-LaunchGate-Token'],
  maxAge: 600
};

app.use(localOnly);
app.use(cors(corsOptions));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});
app.use(rateLimit);
app.use('/api', requireToken);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Git helpers (argv-only, never shell-interpolated)
// ---------------------------------------------------------------------------
function sanitizeRepoName(rawUrl) {
  const tail = String(rawUrl).split(/[/:]/).filter(Boolean).pop() || 'cloned-repo';
  return tail
    .replace(/\.git$/i, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 80) || 'cloned-repo';
}

function validateGitUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) throw new Error('Repository URL is required.');
  if (value.startsWith('-')) throw new Error('Invalid repository URL.');
  if (!/^(https?:\/\/|git@|ssh:\/\/)/i.test(value)) {
    throw new Error('Unsupported repository URL. Use https://, git@, or ssh://.');
  }
  if (/[\s"'`;&|<>]/.test(value)) {
    throw new Error('Repository URL contains invalid characters.');
  }
  return value;
}

function buildAuthenticatedCloneUrl(cleanUrl, token) {
  if (!token || !/^https:\/\//i.test(cleanUrl)) return cleanUrl;
  const parsed = new URL(cleanUrl);
  parsed.username = token.trim();
  parsed.password = '';
  return parsed.toString();
}

async function cloneOrPullRepository(repoUrl, token) {
  const cleanUrl = validateGitUrl(repoUrl);
  const repoName = sanitizeRepoName(cleanUrl);
  const clonesDir = path.join(getDataDir(), 'clones');
  fs.mkdirSync(clonesDir, { recursive: true });

  const targetDir = path.join(clonesDir, repoName);
  const cloneUrl = buildAuthenticatedCloneUrl(cleanUrl, token);

  if (fs.existsSync(path.join(targetDir, '.git'))) {
    const pull = await runProcessSync(targetDir, 'git', ['fetch', '--depth', '1', 'origin']);
    if (pull.code === 0) {
      await runProcessSync(targetDir, 'git', ['reset', '--hard', 'FETCH_HEAD']);
    }
    return { targetDir, repoName, cleanUrl };
  }

  if (fs.existsSync(targetDir)) {
    // A stale, non-git directory with the same name: do not delete user data.
    throw new Error(`A folder already exists at data/clones/${repoName} and is not a Git repository.`);
  }

  const clone = await runProcessSync(clonesDir, 'git', ['clone', '--depth', '1', cloneUrl, repoName]);
  if (clone.code !== 0) {
    throw new Error(clone.stderr || 'Git clone failed. If private, provide a Git Personal Access Token.');
  }
  return { targetDir, repoName, cleanUrl };
}

// Serve frontend static assets with cache-busting headers for immediate developer iteration
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// ---------------------------------------------------------------------------
// System & Folder Selection Endpoints
// ---------------------------------------------------------------------------

// Interactive filesystem directory browser
app.get('/api/system/browse-dir', verifySession, (req, res) => {
  const { dir, currentProject } = req.query;
  try {
    const result = browseDirectory(dir, currentProject);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Open native OS directory picker dialog
app.get('/api/system/pick-folder', verifySession, async (req, res) => {
  try {
    const selectedPath = await openFolderDialog();
    if (!selectedPath) {
      return res.json({ success: false, path: null, message: 'Selection cancelled or not available' });
    }
    const normalized = path.resolve(selectedPath);
    const files = crawlProject(normalized);
    const stackInfo = detectStack(normalized, files);
    addRecentProject(normalized, path.basename(normalized));

    let project = getProject(normalized);
    if (!project) {
      project = saveProject(normalized, { stackInfo });
    } else {
      project = saveProject(normalized, { stackInfo });
    }

    res.json({
      success: true,
      path: normalized,
      name: path.basename(normalized),
      fileCount: files.length,
      stackInfo,
      project
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Load pre-bundled sample demo project
app.post('/api/system/load-demo', verifySession, (req, res) => {
  try {
    const demoPath = path.resolve(__dirname, 'demo', 'vibe-saas-prototype');
    if (!fs.existsSync(demoPath)) {
      return res.status(404).json({ success: false, error: 'Demo project fixture not found.' });
    }
    const files = crawlProject(demoPath);
    const stackInfo = detectStack(demoPath, files);
    addRecentProject(demoPath, 'AI Avatar Generator (Demo SaaS)');

    let project = getProject(demoPath);
    if (!project) {
      project = saveProject(demoPath, { stackInfo });
    }

    res.json({
      success: true,
      path: demoPath,
      name: 'AI Avatar Generator (Demo SaaS)',
      fileCount: files.length,
      stackInfo,
      project
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clone remote Git repository (GitHub / GitLab / Bitbucket)
app.post('/api/system/clone-repo', verifySession, async (req, res) => {
  const { repoUrl, token } = req.body;
  if (!repoUrl) {
    return res.status(400).json({ success: false, error: 'Missing repoUrl' });
  }

  try {
    const { targetDir, repoName, cleanUrl } = await cloneOrPullRepository(repoUrl, token);

    const files = crawlProject(targetDir);
    const stackInfo = detectStack(targetDir, files);
    addRecentProject(targetDir, `${repoName} (git)`);

    let project = saveProject(targetDir, { stackInfo, repoUrl: cleanUrl });

    res.json({
      success: true,
      path: targetDir,
      name: repoName,
      fileCount: files.length,
      stackInfo,
      project
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Validate manual folder input or Git URL
app.post('/api/system/validate-folder', verifySession, async (req, res) => {
  try {
    let { folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({ success: false, error: 'Directory path or repo URL is required' });
    }

    folderPath = folderPath.trim().replace(/^["']|["']$/g, '');

    // Check if input is a Git repository URL
    if (folderPath.startsWith('http://') || folderPath.startsWith('https://') || folderPath.startsWith('git@') || folderPath.endsWith('.git')) {
      const { targetDir, repoName, cleanUrl } = await cloneOrPullRepository(folderPath, '');

      const files = crawlProject(targetDir);
      const stackInfo = detectStack(targetDir, files);
      addRecentProject(targetDir, `${repoName} (git)`);
      const project = saveProject(targetDir, { stackInfo, repoUrl: cleanUrl });

      return res.json({
        success: true,
        path: targetDir,
        name: repoName,
        fileCount: files.length,
        stackInfo,
        project
      });
    }

    // Resolve ~ to home directory
    if (folderPath.startsWith('~')) {
      const os = require('os');
      folderPath = path.join(os.homedir(), folderPath.slice(1));
    }

    const normalized = path.resolve(folderPath);

    if (!fs.existsSync(normalized)) {
      return res.status(400).json({ success: false, error: `Directory not found: "${folderPath}"` });
    }

    const stat = fs.statSync(normalized);
    if (!stat.isDirectory()) {
      return res.status(400).json({ success: false, error: `Path is not a directory: "${folderPath}"` });
    }

    const files = crawlProject(normalized);
    const stackInfo = detectStack(normalized, files);
    addRecentProject(normalized, path.basename(normalized));

    let project = saveProject(normalized, { stackInfo });

    res.json({
      success: true,
      path: normalized,
      name: path.basename(normalized),
      fileCount: files.length,
      stackInfo,
      project
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Load pre-bundled sample demo project
app.post('/api/system/load-demo', verifySession, (req, res) => {
  try {
    const demoPath = path.resolve(__dirname, 'demo', 'vibe-saas-prototype');
    if (!fs.existsSync(demoPath)) {
      return res.status(404).json({ success: false, error: 'Demo project fixture not found.' });
    }
    const files = crawlProject(demoPath);
    const stackInfo = detectStack(demoPath, files);
    addRecentProject(demoPath, 'AI Avatar Generator (Demo SaaS)');

    let project = getProject(demoPath);
    if (!project) {
      project = saveProject(demoPath, { stackInfo });
    }

    res.json({
      success: true,
      path: demoPath,
      name: 'AI Avatar Generator (Demo SaaS)',
      fileCount: files.length,
      stackInfo,
      project
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get recent projects list
app.get('/api/projects/recent', (req, res) => {
  const recent = getRecentProjects();
  res.json({ success: true, recent });
});

// Get project state
app.get('/api/projects/current', verifySession, (req, res) => {
  const { path: projectPath } = req.query;
  if (!projectPath) {
    return res.status(400).json({ success: false, error: 'Missing path query parameter' });
  }

  const project = getProject(projectPath);
  res.json({ success: true, project: project || null });
});

// List metadata for all 12 Gates
app.get('/api/gates', (req, res) => {
  res.json({ success: true, gates: getAllGates() });
});

// ---------------------------------------------------------------------------
// Audit Execution Endpoints (Engine A & Engine B)
// ---------------------------------------------------------------------------

// Run single gate
app.post('/api/gates/scan', verifySession, async (req, res) => {
  const { projectPath, gateId } = req.body;
  if (!projectPath || !gateId) {
    return res.status(400).json({ success: false, error: 'Missing projectPath or gateId' });
  }

  try {
    const { gateResult, project } = await runGate(projectPath, gateId);
    res.json({
      success: true,
      gateResult,
      project
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Run all 12 gates (or selected gates) in batch
app.post('/api/gates/scan-all', verifySession, async (req, res) => {
  let { projectPath, gateIds } = req.body;
  if (!projectPath) {
    return res.status(400).json({ success: false, error: 'Missing projectPath' });
  }
  projectPath = projectPath.trim().replace(/^["']|["']$/g, '');

  try {
    const { results, project } = await runAllGates(projectPath, null, gateIds);
    res.json({
      success: true,
      results,
      project
    });
  } catch (err) {
    console.error('Batch scan error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Live Server-Sent Events (SSE) Preflight Scan Stream
app.get('/api/gates/scan-stream', verifySession, async (req, res) => {
  let { projectPath, gateIds } = req.query;
  if (!projectPath) {
    return res.status(400).send('Missing projectPath query parameter');
  }

  projectPath = projectPath.trim().replace(/^["']|["']$/g, '');
  if (projectPath.startsWith('~')) {
    const os = require('os');
    projectPath = path.join(os.homedir(), projectPath.slice(1));
  }
  projectPath = path.resolve(projectPath);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).send(`Project directory not found: "${projectPath}"`);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  const sendEvent = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      console.debug('[LaunchGate Stream] Client disconnected or write failed:', e.message);
    }
  };

  try {
    sendEvent('status', { message: `Scanning directory: ${projectPath}...`, phase: 'crawling' });

    const files = crawlProject(projectPath);
    const stackInfo = detectStack(projectPath, files);
    saveProject(projectPath, { stackInfo });

    sendEvent('crawled', {
      projectPath,
      projectName: path.basename(projectPath),
      fileCount: files.length,
      sampleFiles: files.slice(0, 15),
      stack: stackInfo.frameworks.concat(stackInfo.languages).join(', ') || 'Standard Web Stack'
    });

    const parsedGateIds = gateIds ? gateIds.split(',').map(s => s.trim()).filter(Boolean) : null;
    const allGates = getAllGates();
    const gatesToRun = parsedGateIds && parsedGateIds.length > 0
      ? allGates.filter(g => parsedGateIds.includes(g.id))
      : allGates;

    const results = {};

    for (let i = 0; i < gatesToRun.length; i++) {
      const gMeta = gatesToRun[i];
      sendEvent('gate_start', {
        current: i + 1,
        total: gatesToRun.length,
        gateId: gMeta.id,
        number: gMeta.number,
        name: gMeta.name,
        category: gMeta.category,
        totalFiles: files.length
      });

      // Brief pacing so user UI registers active gate analysis
      await new Promise(r => setTimeout(r, 40));

      let gateResult;
      try {
        const res = await Promise.race([
          runGate(projectPath, gMeta.id, { files, stackInfo }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Gate timeout')), 180000))
        ]);
        gateResult = res.gateResult;
      } catch (err) {
        gateResult = {
          id: gMeta.id,
          number: gMeta.number,
          name: gMeta.name,
          category: gMeta.category,
          status: 'failed',
          score: 0,
          findings: [{
            id: `${gMeta.id.toUpperCase()}-TIMEOUT`,
            severity: 'P0',
            title: 'Gate analysis timed out or failed',
            description: `The analyzer did not complete in time or threw an error: ${err.message}`,
            remediation: 'Retry the gate individually. For Gate 12, run checks via the CLI panel with timeouts.'
          }],
          stats: { p0: 1, p1: 0, p2: 0, passed: 0 },
          durationMs: 180000,
          scannedAt: new Date().toISOString(),
          filesCount: files.length
        };
        try {
          const { updateGateResult } = require('./backend/services/audit-store');
          updateGateResult(projectPath, gMeta.id, gateResult);
        } catch (e) {
          console.debug('[LaunchGate Store] Failed to cache gate result:', e.message);
        }
      }
      results[gMeta.id] = gateResult;

      sendEvent('gate_complete', {
        current: i + 1,
        total: gatesToRun.length,
        gateId: gMeta.id,
        number: gMeta.number,
        name: gMeta.name,
        gateResult
      });

      // Paced delay so user visibly perceives, verifies, and inspects every single gate
      await new Promise(r => setTimeout(r, 120));
    }

    const finalProject = getProject(projectPath);

    try {
      if (finalProject && (finalProject.overallScore === undefined || finalProject.overallScore === null)) {
        const store = require('./backend/services/audit-store');
        if (typeof store.calculateOverallScore === 'function') {
          finalProject.overallScore = store.calculateOverallScore(finalProject.gates || {});
        }
      }
    } catch (e) {
      console.debug('[LaunchGate Score] Failed to compute overall score:', e.message);
    }

    sendEvent('done', {
      project: finalProject,
      results,
      totalFiles: files.length,
      overallScore: finalProject?.overallScore
    });

    res.end();
  } catch (err) {
    sendEvent('error', { message: err.message });
    res.end();
  }
});

// Toggle gate verification (100% Sign-Off)
app.post('/api/gates/verify', verifySession, (req, res) => {
  const { projectPath, gateId, verified, notes } = req.body;
  if (!projectPath || !gateId) {
    return res.status(400).json({ success: false, error: 'Missing projectPath or gateId' });
  }

  const updatedProject = setGateVerification(projectPath, gateId, verified, notes);
  if (!updatedProject) {
    return res.status(404).json({ success: false, error: 'Project or gate not found' });
  }

  res.json({
    success: true,
    project: updatedProject,
    gate: updatedProject.gates[gateId]
  });
});

// Generate and write .antigravity/gate-X-fix.md
app.post('/api/antigravity/write-fix', verifySession, (req, res) => {
  const { projectPath, gateId, notes } = req.body;
  if (!projectPath || !gateId) {
    return res.status(400).json({ success: false, error: 'Missing projectPath or gateId' });
  }

  const project = getProject(projectPath);
  if (!project || !project.gates[gateId]) {
    return res.status(404).json({ success: false, error: 'Gate data not found. Run scan first.' });
  }

  const gateResult = project.gates[gateId];
  try {
    const fixFilePath = writeGateFixPlan(projectPath, gateResult, notes);
    const autoFixPrompt = generateAutoFixPrompt(gateResult, projectPath);

    // Save ingested notes in store
    if (notes) {
      gateResult.ingestedAntigravityFindings = notes;
      saveProject(projectPath, { gates: project.gates });
    }

    res.json({
      success: true,
      fixFilePath,
      autoFixPrompt,
      gateId
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Live CLI Execution & SSE Streaming (Gate 12)
// ---------------------------------------------------------------------------

// Stream live CLI terminal output via SSE
app.get('/api/cli/run-stream', verifySession, (req, res) => {
  const { projectPath, command } = req.query;
  if (!projectPath || !command) {
    return res.status(400).json({ error: 'Missing projectPath or command query parameters' });
  }

  runCommandStream(projectPath, command, res);
});

// Synchronous CLI run (for automated report checks)
app.post('/api/cli/run-sync', verifySession, async (req, res) => {
  const { projectPath, command } = req.body;
  if (!projectPath || !command) {
    return res.status(400).json({ error: 'Missing projectPath or command' });
  }

  const result = await runCommandSync(projectPath, command);
  res.json({ success: true, ...result });
});

// ---------------------------------------------------------------------------
// Universal AI Agent Rules Exporter
// ---------------------------------------------------------------------------

app.get('/api/agents/available', (req, res) => {
  res.json({ success: true, agents: getAvailableAgentTypes() });
});

app.post('/api/agents/export-rules', verifySession, (req, res) => {
  const { projectPath, agentType } = req.body;
  if (!projectPath || !agentType) {
    return res.status(400).json({ success: false, error: 'Missing projectPath or agentType' });
  }

  try {
    const result = exportAgentRule(projectPath, agentType);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Production Readiness Certificate Generation
// ---------------------------------------------------------------------------

app.post('/api/certificate/generate', verifySession, (req, res) => {
  const { projectPath, cliResults } = req.body;
  if (!projectPath) {
    return res.status(400).json({ success: false, error: 'Missing projectPath' });
  }

  const project = getProject(projectPath);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }

  try {
    const cert = generateCertificate(projectPath, project, cliResults || {});
    // Mark certificate generated in store
    saveProject(projectPath, {
      certificateGenerated: true,
      certificateHash: cert.certHash,
      certificateDate: cert.timestamp,
      certificatePath: cert.reportPath
    });

    res.json({
      success: true,
      certificate: cert,
      project: getProject(projectPath)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// View Printable HTML Certificate
app.get('/api/certificate/view-html', verifySession, (req, res) => {
  const { projectPath } = req.query;
  if (!projectPath) {
    return res.status(400).send('Missing projectPath');
  }

  const htmlCertPath = path.join(projectPath, 'PRODUCTION_READINESS_CERTIFICATE.html');
  if (fs.existsSync(htmlCertPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(fs.readFileSync(htmlCertPath, 'utf8'));
  }

  // Generate on the fly
  const project = getProject(projectPath);
  if (!project) return res.status(404).send('Project not found');

  const cert = generateCertificate(projectPath, project);
  if (fs.existsSync(cert.htmlReportPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(fs.readFileSync(cert.htmlReportPath, 'utf8'));
  }

  res.status(404).send('Certificate HTML could not be generated');
});

// Generate and Return SARIF Report (OASIS v2.1.0)
app.get('/api/reports/sarif', verifySession, (req, res) => {
  const { projectPath } = req.query;
  if (!projectPath) return res.status(400).json({ success: false, error: 'Missing projectPath' });

  const project = getProject(projectPath);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

  try {
    const sarif = generateSarifReport(projectPath, project);
    res.json({ success: true, ...sarif });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download SARIF File Attachment
app.get('/api/reports/sarif/download', verifySession, (req, res) => {
  const { projectPath } = req.query;
  if (!projectPath) return res.status(400).send('Missing projectPath');

  const sarifFile = path.join(projectPath, 'launchgate.sarif');
  if (fs.existsSync(sarifFile)) {
    return res.download(sarifFile, 'launchgate.sarif');
  }

  const project = getProject(projectPath);
  if (!project) return res.status(404).send('Project not found');

  const sarif = generateSarifReport(projectPath, project);
  return res.download(sarif.outputPath, 'launchgate.sarif');
});

// Compliance Mapping Matrix (OWASP, SOC2, GDPR)
app.get('/api/reports/compliance', verifySession, (req, res) => {
  const { projectPath } = req.query;
  if (!projectPath) return res.status(400).json({ success: false, error: 'Missing projectPath' });

  const project = getProject(projectPath);
  if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

  const matrix = buildComplianceMatrix(project);
  res.json({ success: true, compliance: matrix });
});

// ---------------------------------------------------------------------------
// 1-Click Deterministic Quick-Fix Engine (Phase 1)
// ---------------------------------------------------------------------------

app.post('/api/fixes/apply', verifySession, (req, res) => {
  const { projectPath, fixId } = req.body;
  if (!projectPath || !fixId) {
    return res.status(400).json({ success: false, error: 'Missing projectPath or fixId' });
  }

  try {
    const result = applyQuickFix(projectPath, fixId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Git Pre-Push Hook Installer (Phase 2)
// ---------------------------------------------------------------------------

app.post('/api/system/install-hooks', verifySession, (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath) {
    return res.status(400).json({ success: false, error: 'Missing projectPath' });
  }

  try {
    const result = installGitHook(projectPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Score & Audit History Timeline (Phase 3)
// ---------------------------------------------------------------------------

app.get('/api/projects/history', verifySession, (req, res) => {
  const { projectPath } = req.query;
  if (!projectPath) {
    return res.status(400).json({ success: false, error: 'Missing projectPath' });
  }

  const history = getProjectHistory(projectPath);
  res.json({ success: true, history });
});

// ---------------------------------------------------------------------------
// Magic Vibe-to-Production SaaS Transmutation Engine
// ---------------------------------------------------------------------------

// List available turnkey SaaS modules
app.get('/api/magic/modules', (req, res) => {
  res.json({ success: true, modules: TURNKEY_MODULES });
});

// Analyze vibe-coded SaaS gaps
app.get('/api/magic/analyze', verifySession, (req, res) => {
  const { projectPath } = req.query;
  if (!projectPath) {
    return res.status(400).json({ success: false, error: 'Missing projectPath query parameter' });
  }

  try {
    const analysis = analyzeVibeSaaS(projectPath);
    res.json({ success: true, analysis });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Execute Magic Turnkey Transmutation
app.post('/api/magic/transform', verifySession, async (req, res) => {
  const { projectPath, modules } = req.body;
  if (!projectPath) {
    return res.status(400).json({ success: false, error: 'Missing projectPath' });
  }

  try {
    const result = await executeTurnkeyTransmutation(projectPath, modules);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Quick 1-Click All-in-One Hardening
app.post('/api/magic/quick-harden', verifySession, async (req, res) => {
  const { projectPath } = req.body;
  if (!projectPath) {
    return res.status(400).json({ success: false, error: 'Missing projectPath' });
  }

  try {
    const result = await executeTurnkeyTransmutation(projectPath, null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Server Lifecycle Controls (Shutdown & Restart)
// ---------------------------------------------------------------------------

const { spawn } = require('child_process');

app.get('/api/system/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

app.get('/api/system/diagnostics', verifySession, (req, res) => {
  const pkg = require('./package.json');
  res.json({
    success: true,
    version: pkg.version,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/feedback', verifySession, (req, res) => {
  try {
    const { notes, diagnostics, contact, destination } = req.body || {};
    const feedbackDir = getDataDir();
    const feedbackFile = path.join(feedbackDir, 'feedback.jsonl');
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      notes: (notes || '').slice(0, 5000),
      diagnostics: (diagnostics || '').slice(0, 10000),
      contact: (contact || '').slice(0, 200),
      destination: destination || 'local'
    }) + '\n';
    fs.appendFileSync(feedbackFile, entry, 'utf8');
    res.json({
      success: true,
      message: 'Feedback recorded successfully! Diagnostic log saved to ~/.launchgate/feedback.jsonl.',
      savedLocally: true,
      feedbackPath: feedbackFile
    });
  } catch (err) {
    console.error('[LaunchGate] Error recording feedback:', err.message);
    res.status(500).json({ success: false, error: 'Failed to record feedback: ' + err.message });
  }
});

app.post('/api/system/shutdown', verifySession, (req, res) => {
  res.json({ success: true, message: 'LaunchGate server is shutting down cleanly...' });
  console.info('\n[LaunchGate] Received shutdown request from web UI. Terminating process...');
  setTimeout(() => {
    process.exit(0);
  }, 600);
});

app.post('/api/system/restart', verifySession, (req, res) => {
  res.json({ success: true, message: 'LaunchGate server is restarting...' });
  console.info('\n[LaunchGate] Received restart request from web UI. Launching new process and exiting...');
  setTimeout(() => {
    try {
      const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
        cwd: __dirname,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
      process.exit(0);
    } catch (err) {
      console.error('[LaunchGate] Failed to restart server process:', err);
    }
  }, 600);
});

// Centralized error handler (never leak stack traces to the browser)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[LaunchGate] Request error:', err);
  res.status(status).json({
    success: false,
    error: status === 500 ? 'Internal server error' : err.message
  });
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

function startServer(port, maxAttempts = 5) {
  const currentPort = Number(port);
  const server = app.listen(currentPort, HOST);

  server.on('listening', () => {
    console.info(`\n======================================================`);
    console.info(`🚀 LaunchGate: Enterprise Production Readiness Command Center`);
    console.info(`📡 Local Server Running: http://localhost:${currentPort}`);
    console.info(`🔒 Bound to ${HOST} ${ALLOW_REMOTE ? '(remote/container mode)' : '(localhost only)'}`);
    if (ALLOW_REMOTE && sessionToken) {
      console.info(`🔑 Access Token: ${sessionToken}`);
      console.info(`🌐 Direct Access URL: http://<your-ip>:${currentPort}/?token=${sessionToken}`);
    }
    console.info(`======================================================\n`);

    if (!process.env.CI && !process.argv.includes('--no-open')) {
      const url = `http://localhost:${currentPort}`;
      const openCmd = process.platform === 'win32' ? `start "" "${url}"` : (process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
      require('child_process').exec(openCmd, () => {});
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (maxAttempts > 0) {
        console.warn(`[LaunchGate] Port ${currentPort} is currently in use. Retrying on port ${currentPort + 1}...`);
        startServer(currentPort + 1, maxAttempts - 1);
      } else {
        console.error(`[LaunchGate Fatal] Port ${currentPort} is busy and maximum fallback attempts reached. Please free up port 4545 or specify --port <port>.`);
        process.exit(1);
      }
    } else {
      console.error('[LaunchGate Fatal] Server failed to start:', err.message);
      process.exit(1);
    }
  });

  return server;
}

startServer(PORT);
