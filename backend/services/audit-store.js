const fs = require('fs');
const path = require('path');
const os = require('os');

function getDataDir() {
  if (process.env.LAUNCHGATE_DATA_DIR) {
    return path.resolve(process.env.LAUNCHGATE_DATA_DIR);
  }
  const localDataDir = path.resolve(__dirname, '../../data');
  if (fs.existsSync(localDataDir)) {
    return localDataDir;
  }
  return path.join(os.homedir(), '.launchgate');
}

const STORE_PATH = path.join(getDataDir(), 'audit-store.json');

// Ensure data folder and file exists
function initStore() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initialData = {
      projects: {},
      recentProjects: []
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

function readStore() {
  initStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading audit store:', err);
    return { projects: {}, recentProjects: [] };
  }
}

function writeStore(data) {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${STORE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, STORE_PATH);
    return true;
  } catch (err) {
    console.error('Error writing audit store:', err);
    return false;
  }
}

function normalizePath(p) {
  return path.resolve(p).replace(/\\/g, '/');
}

function getProject(projectPath) {
  const store = readStore();
  const key = normalizePath(projectPath);
  return store.projects[key] || null;
}

function saveProject(projectPath, updateData) {
  const store = readStore();
  const key = normalizePath(projectPath);
  const existing = store.projects[key] || {
    path: projectPath,
    normalizedPath: key,
    name: path.basename(projectPath),
    createdAt: new Date().toISOString(),
    gates: {},
    overallScore: 0,
    recentHistory: []
  };

  store.projects[key] = {
    ...existing,
    ...updateData,
    updatedAt: new Date().toISOString()
  };

  addRecentProject(projectPath, existing.name || path.basename(projectPath));
  writeStore(store);
  return store.projects[key];
}

function updateGateResult(projectPath, gateId, gateData) {
  const store = readStore();
  const key = normalizePath(projectPath);
  if (!store.projects[key]) {
    store.projects[key] = {
      path: projectPath,
      normalizedPath: key,
      name: path.basename(projectPath),
      createdAt: new Date().toISOString(),
      gates: {},
      overallScore: 0
    };
  }

  const project = store.projects[key];
  const existingGate = project.gates[gateId] || {};

  project.gates[gateId] = {
    ...existingGate,
    ...gateData,
    lastScanned: new Date().toISOString()
  };

  // Recalculate overall score
  project.overallScore = calculateOverallScore(project.gates);
  recordScanSnapshot(project);
  writeStore(store);
  return project;
}

function recordScanSnapshot(project) {
  if (!project.recentHistory) project.recentHistory = [];

  let p0 = 0, p1 = 0, p2 = 0, passed = 0, verifiedCount = 0;
  for (const [id, g] of Object.entries(project.gates || {})) {
    if (g.stats) {
      p0 += g.stats.p0 || 0;
      p1 += g.stats.p1 || 0;
      p2 += g.stats.p2 || 0;
      passed += g.stats.passed || 0;
    }
    if (g.verified) verifiedCount++;
  }

  const snapshot = {
    timestamp: new Date().toISOString(),
    score: project.overallScore || 0,
    p0,
    p1,
    p2,
    passed,
    verifiedCount,
    deltaScore: 0
  };

  // Only record if score or counts changed or first entry
  const last = project.recentHistory[0];
  if (last) {
    snapshot.deltaScore = snapshot.score - (last.score || 0);
  }
  if (!last || last.score !== snapshot.score || last.p0 !== snapshot.p0 || last.p1 !== snapshot.p1 || last.verifiedCount !== snapshot.verifiedCount) {
    project.recentHistory.unshift(snapshot);
    if (project.recentHistory.length > 25) {
      project.recentHistory = project.recentHistory.slice(0, 25);
    }
  }
}

function setGateVerification(projectPath, gateId, verified, notes = '') {
  const store = readStore();
  const key = normalizePath(projectPath);
  if (!store.projects[key] || !store.projects[key].gates[gateId]) {
    return null;
  }

  const gate = store.projects[key].gates[gateId];
  gate.verified = Boolean(verified);
  gate.verifiedAt = verified ? new Date().toISOString() : null;
  if (notes !== undefined) {
    gate.notes = notes;
  }

  store.projects[key].overallScore = calculateOverallScore(store.projects[key].gates);
  recordScanSnapshot(store.projects[key]);
  writeStore(store);
  return store.projects[key];
}

function calculateOverallScore(gates) {
  const gateIds = [
    'gate-1', 'gate-2', 'gate-3', 'gate-4',
    'gate-5', 'gate-6', 'gate-7', 'gate-8',
    'gate-9', 'gate-10', 'gate-11', 'gate-12'
  ];

  let totalScore = 0;
  let scannedCount = 0;

  for (const id of gateIds) {
    const gate = gates[id];
    if (gate && gate.status && gate.status !== 'unscanned') {
      scannedCount++;
      if (gate.verified) {
        totalScore += 100;
      } else {
        totalScore += (gate.score || 0);
      }
    }
  }

  if (scannedCount === 0) return 0;
  // Weighted out of all 12 gates
  return Math.round((totalScore / (gateIds.length * 100)) * 100);
}

function getRecentProjects() {
  const store = readStore();
  return store.recentProjects || [];
}

function addRecentProject(projectPath, name) {
  const store = readStore();
  const normalized = normalizePath(projectPath);
  const list = store.recentProjects || [];

  const filtered = list.filter(p => normalizePath(p.path) !== normalized);
  filtered.unshift({
    path: projectPath,
    name: name || path.basename(projectPath),
    lastOpened: new Date().toISOString()
  });

  store.recentProjects = filtered.slice(0, 10);
  writeStore(store);
}

function getProjectHistory(projectPath) {
  const store = readStore();
  const key = normalizePath(projectPath);
  const project = store.projects[key];
  return (project && project.recentHistory) || [];
}

module.exports = {
  getProject,
  saveProject,
  updateGateResult,
  setGateVerification,
  calculateOverallScore,
  getRecentProjects,
  addRecentProject,
  getProjectHistory,
  recordScanSnapshot,
  normalizePath,
  getDataDir
};
