/**
 * LaunchGate Automated Backup & Changes Tracking Service
 * Safely creates physical on-disk backups before mutating any project files,
 * records unified diffs of all modifications, and enables instant rollback.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rollbackStore = new Map();
const MAX_ROLLBACK_POINTS = 50;

function safeReadText(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch (e) {
    return null;
  }
}

/**
 * Compact unified diff using common prefix/suffix trimming.
 */
function buildUnifiedDiff(file, backup, afterText) {
  const after = (afterText === null ? '' : afterText).split(/\r?\n/);
  const before = backup.existed && backup.before !== null ? backup.before.split(/\r?\n/) : [];

  if (!backup.existed) {
    const added = after.slice(0, 300).map(line => `+${line}`);
    if (after.length > 300) added.push(`+... (${after.length - 300} more lines)`);
    return [`--- /dev/null`, `+++ b/${file}`, `@@ -0,0 +1,${after.length} @@`, ...added].join('\n');
  }

  if (backup.before === null) {
    return `--- a/${file}\n+++ b/${file}\n[content changed; original could not be read for diff]`;
  }

  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endA = before.length - 1;
  let endB = after.length - 1;
  while (endA >= start && endB >= start && before[endA] === after[endB]) {
    endA--;
    endB--;
  }

  const removed = before.slice(start, endA + 1);
  const added = after.slice(start, endB + 1);
  if (removed.length === 0 && added.length === 0) {
    return `--- a/${file}\n+++ b/${file}\n[no textual change]`;
  }

  const lines = [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${start + 1},${removed.length} +${start + 1},${added.length} @@`
  ];
  for (const line of removed.slice(0, 200)) lines.push(`-${line}`);
  for (const line of added.slice(0, 200)) lines.push(`+${line}`);
  if (removed.length > 200) lines.push(`-... (${removed.length - 200} more lines)`);
  if (added.length > 200) lines.push(`+... (${added.length - 200} more lines)`);
  return lines.join('\n');
}

/**
 * Intercepts file writes during an operation, creates physical on-disk backups
 * under <projectPath>/.launchgate/backups/<backupId>/, records diffs, and writes manifest.json.
 */
function captureAndBackupWrites(projectPath, operationName, fn) {
  const normalizedProject = path.resolve(projectPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupId = `backup-${timestamp}-${crypto.randomBytes(3).toString('hex')}`;
  const backupDir = path.join(normalizedProject, '.launchgate', 'backups', backupId);
  const backupFilesDir = path.join(backupDir, 'files');

  const backups = new Map();
  const originalWrite = fs.writeFileSync;
  const originalAppend = fs.appendFileSync;

  const recordAndBackup = (file) => {
    if (typeof file !== 'string') return;
    const abs = path.resolve(file);
    // Don't intercept writes into .launchgate backups directory itself
    if (abs.startsWith(path.join(normalizedProject, '.launchgate', 'backups'))) return;
    if (backups.has(abs)) return;

    const existed = fs.existsSync(abs);
    const beforeContent = existed ? safeReadText(abs) : null;

    let backupRelativePath = null;
    if (existed && beforeContent !== null) {
      try {
        const relativeToProj = path.relative(normalizedProject, abs);
        const physicalBackupDest = path.join(backupFilesDir, relativeToProj);
        fs.mkdirSync(path.dirname(physicalBackupDest), { recursive: true });
        fs.copyFileSync(abs, physicalBackupDest);
        backupRelativePath = path.relative(backupDir, physicalBackupDest).replace(/\\/g, '/');
      } catch (err) {
        console.error(`[LaunchGate Backup] Failed to copy pre-modified file ${abs}:`, err.message);
      }
    }

    backups.set(abs, {
      existed,
      before: beforeContent,
      backupRelativePath
    });
  };

  fs.writeFileSync = function capturedWrite(file, ...args) {
    recordAndBackup(file);
    return originalWrite.call(fs, file, ...args);
  };
  fs.appendFileSync = function capturedAppend(file, ...args) {
    recordAndBackup(file);
    return originalAppend.call(fs, file, ...args);
  };

  let executionResult;
  try {
    executionResult = fn();
  } finally {
    fs.writeFileSync = originalWrite;
    fs.appendFileSync = originalAppend;
  }

  // Include any extra changes reported by the runner
  if (executionResult && Array.isArray(executionResult.changes)) {
    for (const change of executionResult.changes) {
      if (!change || !change.file) continue;
      const abs = path.resolve(normalizedProject, change.file);
      if (!backups.has(abs)) {
        recordAndBackup(abs);
      }
    }
  }

  const diffPreview = [];
  const manifestFiles = [];

  for (const [abs, backup] of backups) {
    const relative = path.relative(normalizedProject, abs).replace(/\\/g, '/');
    const after = safeReadText(abs);
    const diff = buildUnifiedDiff(relative, backup, after);
    const action = !backup.existed ? 'created' : 'modified';

    const diffLines = diff.split('\n');
    const linesAdded = diffLines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
    const linesRemoved = diffLines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;

    diffPreview.push({
      file: relative,
      action,
      diff,
      linesAdded,
      linesRemoved
    });

    manifestFiles.push({
      file: relative,
      action,
      existed: backup.existed,
      backupPath: backup.backupRelativePath,
      linesAdded,
      linesRemoved
    });
  }

  // Write manifest.json if any files were touched
  let backupInfo = null;
  let rollbackToken = null;

  if (manifestFiles.length > 0) {
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      const manifest = {
        backupId,
        timestamp: new Date().toISOString(),
        operation: operationName,
        projectPath: normalizedProject,
        filesCount: manifestFiles.length,
        files: manifestFiles
      };
      fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

      rollbackToken = crypto.randomUUID();
      rollbackStore.set(rollbackToken, {
        backupId,
        projectPath: normalizedProject,
        backupDir,
        files: [...backups.entries()].map(([abs, b]) => ({ abs, ...b })),
        createdAt: Date.now()
      });

      while (rollbackStore.size > MAX_ROLLBACK_POINTS) {
        rollbackStore.delete(rollbackStore.keys().next().value);
      }

      backupInfo = {
        id: backupId,
        timestamp: manifest.timestamp,
        operation: operationName,
        path: path.relative(normalizedProject, backupDir).replace(/\\/g, '/'),
        absolutePath: backupDir,
        filesCount: manifestFiles.length,
        files: manifestFiles.map(f => ({ file: f.file, action: f.action }))
      };
    } catch (err) {
      console.error(`[LaunchGate Backup] Failed to write backup manifest:`, err.message);
    }
  }

  return {
    result: executionResult,
    backup: backupInfo,
    diffPreview,
    changedFiles: diffPreview.map(item => item.file),
    rollbackToken
  };
}

/**
 * Lists all historical backups in <projectPath>/.launchgate/backups/
 */
function listBackups(projectPath) {
  const backupsDir = path.join(path.resolve(projectPath), '.launchgate', 'backups');
  if (!fs.existsSync(backupsDir)) return [];

  const results = [];
  try {
    const entries = fs.readdirSync(backupsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const manifestPath = path.join(backupsDir, ent.name, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          results.push(manifest);
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error(`[LaunchGate Backup] Error listing backups:`, err.message);
  }

  // Sort descending by timestamp
  return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Restores a specific backup onto the project
 */
function restoreBackup(projectPath, backupId) {
  const normalizedProject = path.resolve(projectPath);
  const backupDir = path.join(normalizedProject, '.launchgate', 'backups', backupId);
  const manifestPath = path.join(backupDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return { success: false, message: `Backup manifest not found for ID: ${backupId}` };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { success: false, message: `Failed to parse manifest: ${err.message}` };
  }

  const restored = [];
  const removed = [];
  const failed = [];

  for (const item of manifest.files || []) {
    const targetFile = path.join(normalizedProject, item.file);
    try {
      if (!item.existed) {
        // File was created by the operation -> delete it on rollback
        if (fs.existsSync(targetFile)) {
          fs.unlinkSync(targetFile);
          removed.push(item.file);
        }
      } else if (item.backupPath) {
        // File existed before -> restore from backup copy
        const sourceBackup = path.join(backupDir, item.backupPath);
        if (fs.existsSync(sourceBackup)) {
          fs.mkdirSync(path.dirname(targetFile), { recursive: true });
          fs.copyFileSync(sourceBackup, targetFile);
          restored.push(item.file);
        } else {
          failed.push({ file: item.file, error: 'Backup copy missing from backup folder' });
        }
      }
    } catch (err) {
      failed.push({ file: item.file, error: err.message });
    }
  }

  return {
    success: failed.length === 0,
    backupId,
    restoredFiles: restored,
    removedFiles: removed,
    failedFiles: failed
  };
}

module.exports = {
  captureAndBackupWrites,
  buildUnifiedDiff,
  listBackups,
  restoreBackup,
  rollbackStore
};
