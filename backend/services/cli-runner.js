const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ansiToHtml } = require('../utils/ansi-to-html');

/**
 * Only allow known-safe project verification commands.
 * The dashboard must never expose a generic shell endpoint: audited projects
 * are untrusted input (a malicious package.json script would otherwise give
 * remote code execution to any webpage that can reach localhost).
 */
const ALLOWED_COMMANDS = new Map([
  ['typecheck', { label: 'TypeScript Typecheck', command: 'npx', args: ['tsc', '--noEmit'] }],
  ['lint', { label: 'ESLint', command: 'npx', args: ['eslint', '.'] }],
  ['audit', { label: 'Dependency Audit', command: 'npm', args: ['audit', '--production'] }],
  ['build', { label: 'Production Build', command: 'npm', args: ['run', 'build'] }],
  ['test', { label: 'Test Suite', command: 'npm', args: ['test', '--', '--run'] }]
]);

// Accept both canonical aliases and the historical command strings emitted by
// older dashboard builds.
const COMMAND_ALIASES = new Map([
  ['npx tsc --noEmit', 'typecheck'],
  ['npx eslint .', 'lint'],
  ['npm audit --production', 'audit'],
  ['npm run build', 'build'],
  ['npm test -- --run', 'test']
]);

function resolveAllowedCommand(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const key = COMMAND_ALIASES.get(trimmed) || trimmed.toLowerCase();
  const resolved = ALLOWED_COMMANDS.get(key);
  if (!resolved) return null;

  // Derive the actual binary/args on the current platform.
  if (resolved.command === 'npx') {
    return {
      label: resolved.label,
      command: os.platform() === 'win32' ? 'npx.cmd' : 'npx',
      args: resolved.args
    };
  }
  if (resolved.command === 'npm') {
    return {
      label: resolved.label,
      command: os.platform() === 'win32' ? 'npm.cmd' : 'npm',
      args: resolved.args
    };
  }
  return resolved;
}

function listAllowedCommands() {
  return Array.from(ALLOWED_COMMANDS.entries()).map(([id, value]) => ({
    id,
    label: value.label
  }));
}

/**
 * Validate and resolve a project directory. Returns an absolute path or throws.
 */
function validateProjectPath(projectPath) {
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('A project path is required.');
  }

  let candidate = projectPath.trim().replace(/^["']|["']$/g, '');
  if (candidate.startsWith('~')) {
    candidate = path.join(os.homedir(), candidate.slice(1));
  }

  const resolved = path.resolve(candidate);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch (e) {
    throw new Error(`Project directory not found: ${resolved}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Project path is not a directory: ${resolved}`);
  }
  return resolved;
}

function buildSpawnOptions(cwd, extraEnv = {}) {
  return {
    cwd,
    windowsHide: true,
    env: { ...process.env, ...extraEnv },
    shell: false
  };
}

/**
 * Execute an allowed CLI command in target directory and stream output via SSE.
 */
function runCommandStream(projectPath, commandStr, res) {
  const startTime = Date.now();
  const allowed = resolveAllowedCommand(commandStr);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (res.flushHeaders) res.flushHeaders();

  function sendEvent(type, payload) {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  }

  if (!allowed) {
    sendEvent('error', {
      message: `Command not allowed. Allowed checks: ${Array.from(ALLOWED_COMMANDS.keys()).join(', ')}`
    });
    res.end();
    return;
  }

  let cwd;
  try {
    cwd = validateProjectPath(projectPath);
  } catch (err) {
    sendEvent('error', { message: err.message });
    res.end();
    return;
  }

  const display = `${allowed.command} ${allowed.args.join(' ')}`;
  sendEvent('start', {
    command: display,
    label: allowed.label,
    cwd,
    timestamp: new Date().toISOString()
  });

  const proc = spawn(allowed.command, allowed.args, buildSpawnOptions(cwd, { FORCE_COLOR: '1' }));

  proc.stdout.on('data', (chunk) => {
    const raw = chunk.toString();
    sendEvent('stdout', { raw, html: ansiToHtml(raw) });
  });

  proc.stderr.on('data', (chunk) => {
    const raw = chunk.toString();
    sendEvent('stderr', { raw, html: ansiToHtml(raw) });
  });

  proc.on('close', (code) => {
    sendEvent('exit', {
      code,
      duration: Date.now() - startTime,
      success: code === 0
    });
    res.end();
  });

  proc.on('error', (err) => {
    sendEvent('error', { message: err.message });
    res.end();
  });
}

/**
 * Run an allowed CLI command and return a promise with captured output.
 */
function runCommandSync(projectPath, commandStr, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const allowed = resolveAllowedCommand(commandStr);

    if (!allowed) {
      return resolve({
        code: 1,
        stdout: '',
        stderr: `Command not allowed. Allowed checks: ${Array.from(ALLOWED_COMMANDS.keys()).join(', ')}`,
        duration: 0
      });
    }

    let cwd;
    try {
      cwd = validateProjectPath(projectPath);
    } catch (err) {
      return resolve({ code: 1, stdout: '', stderr: err.message, duration: 0 });
    }

    const proc = spawn(allowed.command, allowed.args, buildSpawnOptions(cwd, { FORCE_COLOR: '0', CI: '1', NO_COLOR: '1' }));
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch (e) {}
      resolve({
        code: -1,
        stdout: stdout.trim(),
        stderr: (stderr.trim() + '\n[TIMEOUT] Command timed out after ' + timeoutMs + 'ms').trim(),
        duration: Date.now() - startTime
      });
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration: Date.now() - startTime
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout: '', stderr: err.message, duration: Date.now() - startTime });
    });
  });
}

/**
 * Execute an arbitrary binary + argv array (no shell). Used internally for git
 * operations where every argument is validated by the caller.
 */
function runProcessSync(cwd, command, args = [], timeoutMs = 120000, extraEnv = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn(command, args, {
      ...buildSpawnOptions(cwd, { ...extraEnv, GIT_TERMINAL_PROMPT: '0' }),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      resolve({
        code: -1,
        stdout: stdout.trim(),
        stderr: stderr.trim() + '\n[TIMEOUT] Process timed out.',
        duration: Date.now() - startTime
      });
    }, timeoutMs);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        duration: Date.now() - startTime
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout: '', stderr: err.message, duration: Date.now() - startTime });
    });
  });
}

module.exports = {
  runCommandStream,
  runCommandSync,
  runProcessSync,
  validateProjectPath,
  resolveAllowedCommand,
  listAllowedCommands,
  ALLOWED_COMMANDS
};
