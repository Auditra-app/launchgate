/**
 * Live Terminal Console Controller
 * Streams real CLI execution logs via Server-Sent Events (SSE)
 */

class TerminalController {
  constructor(terminalEl) {
    this.terminalEl = terminalEl;
    this.activeEventSource = null;
  }

  clear() {
    if (this.activeEventSource) {
      this.activeEventSource.close();
      this.activeEventSource = null;
    }
    this.terminalEl.innerHTML = '';
  }

  append(htmlText) {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = htmlText;
    this.terminalEl.appendChild(line);
    this.terminalEl.scrollTop = this.terminalEl.scrollHeight;
  }

  appendRaw(text, colorClass = '') {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const line = document.createElement('div');
    line.className = `terminal-line ${colorClass}`;
    line.innerHTML = escaped;
    this.terminalEl.appendChild(line);
    this.terminalEl.scrollTop = this.terminalEl.scrollHeight;
  }

  runStream(projectPath, command) {
    this.clear();
    this.appendRaw(`$ ${command}`, 'text-indigo-400 font-semibold mb-2');
    this.appendRaw(`[LaunchGate CLI] Executing in ${projectPath}...\n`, 'text-slate-500');

    const url = `/api/cli/run-stream?projectPath=${encodeURIComponent(projectPath)}&command=${encodeURIComponent(command)}`;
    
    return new Promise((resolve) => {
      this.activeEventSource = new EventSource(url);

      this.activeEventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'stdout' || data.type === 'stderr') {
            if (data.html) {
              this.append(data.html);
            } else if (data.raw) {
              this.appendRaw(data.raw);
            }
          } else if (data.type === 'exit') {
            const statusColor = data.success ? 'text-emerald-400' : 'text-rose-400';
            const icon = data.success ? '✓' : '✗';
            this.appendRaw(`\n[Process completed with exit code ${data.code} in ${(data.duration / 1000).toFixed(2)}s] ${icon}`, `${statusColor} font-bold mt-2`);
            this.activeEventSource.close();
            this.activeEventSource = null;
            resolve(data);
          } else if (data.type === 'error') {
            this.appendRaw(`\n[Error] ${data.message}`, 'text-rose-400 font-bold');
            this.activeEventSource.close();
            this.activeEventSource = null;
            resolve({ code: -1, success: false });
          }
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };

      this.activeEventSource.onerror = (err) => {
        this.appendRaw('\n[Connection closed]', 'text-slate-500');
        if (this.activeEventSource) {
          this.activeEventSource.close();
          this.activeEventSource = null;
        }
        resolve({ code: 0, success: true });
      };
    });
  }
}

window.TerminalController = TerminalController;
