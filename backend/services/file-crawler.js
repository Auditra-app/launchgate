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
  '.vscode'
]);

const MAX_FILE_SIZE = 1024 * 1024 * 3; // 3MB limit for text scanning

/**
 * Recursively crawl project directory and return list of relative file paths
 */
function crawlProject(projectPath, maxFiles = 3000) {
  const fileList = [];

  function walk(currentDir) {
    if (fileList.length >= maxFiles) return;

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      if (fileList.length >= maxFiles) break;

      const fullPath = path.join(currentDir, entry.name);
      const relative = path.relative(projectPath, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
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
