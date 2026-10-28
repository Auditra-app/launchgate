const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'out',
  '.output',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.turbo',
  '.cache',
  'tmp',
  'temp',
  'data',
  'demo',
  'fixtures',
  '.launchgate',
  '.antigravity',
  '.idea',
  '.vscode',
  '.tools',
  '.agents',
  '.vercel',
  '.expo',
  '.serverless',
  '.husky',
  'test-results',
  'playwright-report',
  '.nyc_output',
  '.parcel-cache',
  '.svelte-kit'
]);

const IGNORED_EXTS = new Set([
  '.log',
  '.lock',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.pdf',
  '.docx',
  '.xlsx',
  '.xls',
  '.csv',
  '.zip',
  '.tar',
  '.gz',
  '.mp4',
  '.mov',
  '.mp3',
  '.wav',
  '.ttf',
  '.woff',
  '.woff2',
  '.eot',
  '.map'
]);

const MAX_FILE_SIZE = 1024 * 1024 * 3; // 3MB limit for text scanning

// Prioritized application roots
const PRIORITY_NAMES = new Set([
  'src', 'app', 'pages', 'api', 'routes', 'lib', 'components', 
  'server', 'models', 'controllers', 'services', 'middleware', 'config', '.github'
]);

/**
 * Recursively crawl project directory and return list of relative file paths
 */
function crawlProject(projectPath, maxFiles = 10000) {
  const fileList = [];

  function shouldIgnoreDir(name) {
    if (IGNORED_DIRS.has(name)) return true;
    if (name.startsWith('dist-')) return true;
    // Ignore hidden dot directories other than .github
    if (name.startsWith('.') && name !== '.github') return true;
    return false;
  }

  function walk(currentDir) {
    if (fileList.length >= maxFiles) return;

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    // Sort entries so priority application directories and root config files are visited first
    entries.sort((a, b) => {
      const aPriority = PRIORITY_NAMES.has(a.name) ? 0 : 1;
      const bPriority = PRIORITY_NAMES.has(b.name) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      // Put files before directories so root configs (package.json, next.config, etc.) are indexed early
      if (a.isFile() && b.isDirectory()) return -1;
      if (a.isDirectory() && b.isFile()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (fileList.length >= maxFiles) break;

      const fullPath = path.join(currentDir, entry.name);
      const relative = path.relative(projectPath, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (!shouldIgnoreDir(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IGNORED_EXTS.has(ext)) continue;

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size <= MAX_FILE_SIZE) {
            fileList.push(relative);
          }
        } catch (e) {}
      }
    }
  }

  if (fs.existsSync(projectPath)) {
    walk(projectPath);
  }

  return fileList;
}

/**
 * Safely read file text
 */
function readFile(projectPath, relativePath) {
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(projectPath, relativePath);
  try {
    if (!fs.existsSync(fullPath)) return null;
    const stat = fs.statSync(fullPath);
    if (stat.size > MAX_FILE_SIZE) return null;
    return fs.readFileSync(fullPath, 'utf-8');
  } catch (e) {
    return null;
  }
}

/**
 * Filter files matching regex or extension
 */
function matchFiles(files, regexOrExt) {
  if (typeof regexOrExt === 'string') {
    return files.filter(f => f.endsWith(regexOrExt));
  }
  return files.filter(f => regexOrExt.test(f));
}

/**
 * Extract snippet around specific line index (0-based or 1-based)
 */
function getSnippet(content, lineNum, context = 2) {
  if (!content) return '';
  const lines = content.split(/\r?\n/);
  const targetIdx = lineNum - 1; // lineNum is 1-based
  const start = Math.max(0, targetIdx - context);
  const end = Math.min(lines.length - 1, targetIdx + context);

  const snippetLines = [];
  for (let i = start; i <= end; i++) {
    const prefix = i === targetIdx ? '>' : ' ';
    const lineFormatted = String(i + 1).padStart(4, ' ');
    snippetLines.push(`${prefix} ${lineFormatted} | ${lines[i]}`);
  }

  return snippetLines.join('\n');
}

module.exports = {
  crawlProject,
  readFile,
  matchFiles,
  getSnippet,
  IGNORED_DIRS
};
