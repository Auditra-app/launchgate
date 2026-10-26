const fs = require('fs');
const path = require('path');
const os = require('os');

function getAvailableDrives() {
  if (os.platform() !== 'win32') {
    return ['/'];
  }
  const drives = [];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < letters.length; i++) {
    const driveRoot = `${letters[i]}:\\`;
    try {
      fs.accessSync(driveRoot, fs.constants.R_OK);
      drives.push(driveRoot);
    } catch (e) {
      // Drive not accessible or doesn't exist
    }
  }
  return drives.length > 0 ? drives : ['C:\\'];
}

function getQuickLocations(currentProjectDir) {
  const home = os.homedir();
  const locs = [];
  if (currentProjectDir && fs.existsSync(currentProjectDir)) {
    locs.push({ label: 'Current Project', path: path.resolve(currentProjectDir), icon: '📁' });
  }
  locs.push({ label: 'User Home', path: home, icon: '🏠' });

  const desktop = path.join(home, 'Desktop');
  if (fs.existsSync(desktop)) locs.push({ label: 'Desktop', path: desktop, icon: '🖥️' });

  const documents = path.join(home, 'Documents');
  if (fs.existsSync(documents)) locs.push({ label: 'Documents', path: documents, icon: '📄' });

  const downloads = path.join(home, 'Downloads');
  if (fs.existsSync(downloads)) locs.push({ label: 'Downloads', path: downloads, icon: '⬇️' });

  return locs;
}

function detectFolderProjectType(folderPath) {
  try {
    const files = fs.readdirSync(folderPath);
    const fileSet = new Set(files.map(f => f.toLowerCase()));
    if (fileSet.has('package.json')) return 'Node.js';
    if (fileSet.has('requirements.txt') || fileSet.has('pyproject.toml')) return 'Python';
    if (fileSet.has('cargo.toml')) return 'Rust';
    if (fileSet.has('go.mod')) return 'Go';
    if (fileSet.has('.git')) return 'Git Repo';
    return null;
  } catch (e) {
    return null;
  }
}

function browseDirectory(targetPath, currentProjectDir) {
  let resolvedPath = targetPath ? path.resolve(targetPath) : (currentProjectDir || process.cwd());

  // Resolve ~ to user home
  if (targetPath && targetPath.startsWith('~')) {
    resolvedPath = path.join(os.homedir(), targetPath.slice(1));
  }

  if (!fs.existsSync(resolvedPath)) {
    resolvedPath = os.homedir();
  }

  let stat;
  try {
    stat = fs.statSync(resolvedPath);
  } catch (e) {
    resolvedPath = os.homedir();
    stat = fs.statSync(resolvedPath);
  }

  if (!stat.isDirectory()) {
    resolvedPath = path.dirname(resolvedPath);
  }

  const drives = getAvailableDrives();
  const quickLocations = getQuickLocations(currentProjectDir);
  const parent = path.dirname(resolvedPath);
  const isRoot = parent === resolvedPath;

  const currentProjectType = detectFolderProjectType(resolvedPath);

  let directories = [];
  try {
    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const name = entry.name;
        // Skip hidden Windows system volumes / recycle bins
        if (name === '$RECYCLE.BIN' || name === 'System Volume Information') {
          continue;
        }
        const fullPath = path.join(resolvedPath, name);
        const projectType = detectFolderProjectType(fullPath);
        directories.push({
          name,
          path: fullPath,
          isProject: Boolean(projectType),
          projectType
        });
      }
    }
  } catch (err) {
    // Permission denied or unreadable directory
  }

  // Sort: projects first, then alphabetically
  directories.sort((a, b) => {
    if (a.isProject && !b.isProject) return -1;
    if (!a.isProject && b.isProject) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return {
    success: true,
    current: resolvedPath,
    parent: isRoot ? null : parent,
    isRoot,
    drives,
    quickLocations,
    currentProjectType,
    directories
  };
}

module.exports = {
  getAvailableDrives,
  getQuickLocations,
  browseDirectory
};
