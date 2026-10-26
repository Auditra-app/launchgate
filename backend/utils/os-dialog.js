const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

/**
 * Open native OS directory picker dialog
 * Returns a Promise that resolves to selected path or null if cancelled / timed out
 */
function openFolderDialog(timeoutMs = 60000) {
  return new Promise((resolve) => {
    const platform = os.platform();
    let resolved = false;

    const finish = (result) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      finish(null);
    }, timeoutMs);

    if (platform === 'win32') {
      const psScriptPath = path.join(__dirname, 'picker.ps1');
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-STA',
        '-File', psScriptPath
      ]);
      let stdout = '';
      let stderr = '';

      ps.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ps.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ps.on('close', (code) => {
        const trimmed = stdout.trim();
        if (code === 0 && trimmed && trimmed !== 'CANCELLED') {
          finish(trimmed);
        } else {
          finish(null);
        }
      });

      ps.on('error', (err) => {
        console.error('OS dialog error:', err);
        finish(null);
      });
    } else if (platform === 'darwin') {
      // macOS: AppleScript
      const script = 'tell application "Finder" to set folderPath to POSIX path of (choose folder with prompt "Select Project Root Folder")\nreturn folderPath';
      const osa = spawn('osascript', ['-e', script]);
      let stdout = '';

      osa.stdout.on('data', (data) => { stdout += data.toString(); });
      osa.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          finish(stdout.trim());
        } else {
          finish(null);
        }
      });
      osa.on('error', () => finish(null));
    } else {
      // Linux: Try zenity if available
      const zenity = spawn('zenity', ['--file-selection', '--directory', '--title=Select Project Root Folder']);
      let stdout = '';
      zenity.stdout.on('data', (data) => { stdout += data.toString(); });
      zenity.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          finish(stdout.trim());
        } else {
          finish(null);
        }
      });
      zenity.on('error', () => finish(null));
    }
  });
}

module.exports = { openFolderDialog };
