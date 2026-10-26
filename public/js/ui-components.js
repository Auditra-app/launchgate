/**
 * UI Component Renderers for LaunchGate
 * Uses the lg-* / finding-card design system (styles.css tokens)
 */

const UI = {

  // ── Stack Badges ────────────────────────────────────────────────────────────
  renderStackBadges(badges, containerEl) {
    if (!badges || badges.length === 0) {
      containerEl.innerHTML = '<span class="text-xs lg-text-subtle italic">No stack detected</span>';
      return;
    }
    const colorMap = {
      'typescript': '#3178c6',
      'javascript': '#f7df1e',
      'next.js': '#6366f1',
      'react': '#61dafb',
      'python': '#3776ab',
      'firebase': '#ffca28',
      'firebase auth': '#ff9100',
      'tailwind css': '#38bdf8',
      'express': '#22c55e',
      'docker': '#2496ed',
      'github actions': '#818cf8',
      'electron': '#61dafb',
      'vite': '#bd34fe',
      'cli runner': '#a855f7'
    };
    containerEl.innerHTML = badges.map(b => {
      const name = b.name;
      const lower = name.toLowerCase();
      const dotColor = colorMap[lower] || '#6366f1';
      return `<span class="tech-badge" title="${name} detected"><span class="tech-badge-dot" style="background-color: ${dotColor};"></span><span>${name}</span></span>`;
    }).join('');
  },

  // ── Sidebar Gate Nav List ───────────────────────────────────────────────────
  renderGateNavList(gatesMetadata, projectGates, activeGateId, selectedGateIds, onSelectGate, onToggleGateSelect) {
    const container = document.getElementById('gates-nav-list');
    container.innerHTML = '';

    gatesMetadata.forEach(meta => {
      const gateData = (projectGates && projectGates[meta.id]) || null;
      const isActive = meta.id === activeGateId;
      const isSelected = selectedGateIds ? selectedGateIds.has(meta.id) : true;

      // Dot status
      let dotClass = 'dot-unscanned';
      let scoreText = '<span class="text-xs font-mono lg-text-subtle tabular-nums">0%</span>';

      if (gateData && gateData.status && gateData.status !== 'unscanned') {
        if (gateData.verified)          dotClass = 'dot-verified';
        else if (gateData.status === 'passed')  dotClass = 'dot-passed';
        else if (gateData.status === 'warning') dotClass = 'dot-warning';
        else if (gateData.status === 'failed')  dotClass = 'dot-failed';

        if (gateData.score !== undefined) {
          scoreText = `<span class="text-xs font-mono lg-text-subtle tabular-nums">${gateData.score}%</span>`;
        }
      }

      const item = document.createElement('div');
      item.className = `gate-nav-item${isActive ? ' active' : ''}`;
      item.innerHTML = `
        <div class="flex items-start gap-2.5 min-w-0 flex-1">
          <input type="checkbox" class="gate-checkbox mt-1" data-gate-id="${meta.id}" ${isSelected ? 'checked' : ''}>
          <span class="gate-number mt-0.5">${meta.number}</span>
          <div class="min-w-0 flex-1 pr-1">
            <div class="text-sm font-medium lg-text-primary leading-snug">${escapeHtml(meta.name)}</div>
            <div class="text-xs lg-text-subtle mt-0.5 leading-tight">${escapeHtml(meta.category)}</div>
          </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
          ${scoreText}
          <span class="${dotClass}"></span>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.matches('.gate-checkbox')) {
          e.stopPropagation();
          if (onToggleGateSelect) onToggleGateSelect(meta.id, e.target.checked);
          return;
        }
        onSelectGate(meta.id);
      });

      container.appendChild(item);
    });
  },

  // ── Finding Cards ───────────────────────────────────────────────────────────
  renderFindings(findings, filter = 'all', containerEl, isUnscanned = false) {
    containerEl.innerHTML = '';

    if (isUnscanned) {
      containerEl.innerHTML = `
        <div class="lg-card p-10 text-center flex flex-col items-center justify-center gap-3">
          <div style="width:48px;height:48px;border-radius:50%;background:rgba(99,102,241,0.12);color:#818cf8;display:flex;align-items:center;justify-content:center;font-size:22px;">🔍</div>
          <div class="text-sm font-semibold lg-text-primary">Gate Not Yet Scanned</div>
          <p class="text-xs lg-text-muted" style="max-width:440px">
            This gate is currently unscanned (0%). Click <strong class="text-indigo-400">Run All 12 Gates</strong> above or click <strong class="text-indigo-400">Scan Gate</strong> to run deep static analysis and file inspections on your codebase.
          </p>
          <div class="text-[11px] font-mono lg-text-subtle bg-slate-800/40 border border-slate-700/50 px-3 py-1.5 rounded mt-1">
            Status: Ready • Waiting for scan trigger
          </div>
        </div>
      `;
      return;
    }

    const filtered = (filter === 'all')
      ? findings
      : findings.filter(f => f.severity === filter);

    if (filtered.length === 0) {
      containerEl.innerHTML = `
        <div class="lg-card p-8 text-center flex flex-col items-center justify-center gap-2">
          <div style="width:40px;height:40px;border-radius:50%;background:rgba(16,185,129,0.15);color:#34d399;display:flex;align-items:center;justify-content:center;font-size:18px;">✓</div>
          <div class="text-sm font-semibold lg-text-primary" style="margin-top:4px">100% Passed — All Production Rules Verified</div>
          <p class="text-xs lg-text-muted" style="max-width:440px">
            LaunchGate crawled and analyzed project source files against all standards for this gate. Zero vulnerabilities, unauthenticated handlers, or anti-patterns were detected.
          </p>
          <div class="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-1 rounded mt-1">
            ✓ Real-time Static Analysis Complete • 0 Violations Found
          </div>
        </div>
      `;
      return;
    }

    filtered.forEach(finding => {
      const sevLower = (finding.severity || 'PASSED').toLowerCase()
        .replace('passed', 'pass');
      const card = document.createElement('div');
      card.className = `finding-card finding-${sevLower === 'pass' ? 'pass' : sevLower}`;

      // Severity badge
      let severityBadge = '';
      if (finding.severity === 'P0') {
        severityBadge = '<span class="badge-p0">P0 CRITICAL</span>';
      } else if (finding.severity === 'P1') {
        severityBadge = '<span class="badge-p1">P1 HIGH RISK</span>';
      } else if (finding.severity === 'P2') {
        severityBadge = '<span class="badge-p2">P2 HYGIENE</span>';
      } else {
        severityBadge = '<span class="badge-passed">PASSED</span>';
      }

      // File location
      let locationHtml = '';
      if (finding.file) {
        locationHtml = `
          <div style="display:flex;align-items:center;gap:6px;font-size:13px;font-family:monospace;color:var(--c-accent);">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="opacity:0.6">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
            ${escapeHtml(finding.file)}${finding.line ? `<span style="color:var(--c-text-sub)">:${finding.line}</span>` : ''}
          </div>
        `;
      }

      // Code snippet
      let snippetHtml = '';
      if (finding.snippet) {
        snippetHtml = `<pre class="code-block">${escapeHtml(finding.snippet)}</pre>`;
      }

      // Remediation block
      let remediationHtml = '';
      if (finding.remediation) {
        // Detect deterministic quick-fix
        const rule = (finding.rule || '').toLowerCase();
        const idLower = (finding.id || '').toLowerCase();
        let fixId = null;
        if (rule.includes('env-example') || rule.includes('.env.example') || rule.includes('secrets rule 1.1')) fixId = 'fix-env-example';
        else if (rule.includes('gitignore') || rule.includes('git-ignore') || rule.includes('secrets rule 1.3')) fixId = 'fix-gitignore-env';
        else if (rule.includes('health') || rule.includes('healthcheck') || rule.includes('rule 11.4')) fixId = 'fix-api-health';
        else if (rule.includes('security-headers') || rule.includes('header') || rule.includes('rule 11.6')) fixId = 'fix-security-headers';
        else if (rule.includes('error boundar') || idLower.includes('error-boundary') || rule.includes('rule 6.3')) fixId = 'fix-error-boundary';
        else if (rule.includes('multi-stage') || rule.includes('non-root') || rule.includes('dockerignore') || idLower.includes('docker') || rule.includes('rule 11.1') || rule.includes('rule 11.2')) fixId = 'fix-docker-prod';
        else if (rule.includes('ci/cd') || rule.includes('pipeline') || idLower.includes('cicd') || rule.includes('rule 11.5')) fixId = 'fix-github-ci';
        else if (rule.includes('privacy') || idLower.includes('privacy') || rule.includes('rule 9.4')) fixId = 'fix-privacy-policy';
        else if (rule.includes('terms') || idLower.includes('terms') || rule.includes('license') || rule.includes('rule 9.5')) fixId = 'fix-terms-service';
        else if (rule.includes('robots.txt') || idLower.includes('robots') || rule.includes('rule 9.1')) fixId = 'fix-seo-robots';
        else if (rule.includes('sitemap') || idLower.includes('sitemap') || rule.includes('rule 9.2')) fixId = 'fix-seo-sitemap';
        else if (rule.includes('rate limit') || idLower.includes('ratelimit') || rule.includes('rule 4.3')) fixId = 'fix-rate-limiter';
        else if (rule.includes('signature') || rule.includes('idempotency') || idLower.includes('webhook') || rule.includes('rule 4.1') || rule.includes('rule 4.2')) fixId = 'fix-webhook-guard';
        else if (rule.includes('404') || idLower.includes('404') || rule.includes('rule 8.1')) fixId = 'fix-custom-404';
        else if (rule.includes('debugger') || idLower.includes('debugger') || rule.includes('rule 10.1')) fixId = 'fix-clean-debugger';
        else if (rule.includes('typecheck') || rule.includes('lint') || idLower.includes('typecheck') || rule.includes('rule 12.1') || rule.includes('rule 12.2')) fixId = 'fix-pkg-scripts';

        const quickFixBtn = (fixId && finding.severity !== 'PASSED')
          ? `<button class="btn-quick-fix lg-btn-primary" style="font-size:12px;padding:3px 9px;" data-fix-id="${fixId}">⚡ Apply Quick Patch</button>`
          : '';

        remediationHtml = `
          <div class="remediation-block">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--c-accent);">Remediation</span>
              <div style="display:flex;align-items:center;gap:6px;">
                ${quickFixBtn}
                <button class="btn-copy-remediation lg-btn-ghost" style="font-size:12px;padding:3px 9px;" data-remediation="${escapeAttr(finding.remediation)}">Copy Fix</button>
              </div>
            </div>
            <p style="font-size:13px;font-family:monospace;white-space:pre-wrap;color:var(--c-text-sec);line-height:1.6;">${escapeHtml(finding.remediation)}</p>
          </div>
        `;
      }

      card.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            ${severityBadge}
            <span style="font-size:15px;font-weight:600;color:var(--c-text-pri);">${escapeHtml(finding.title)}</span>
          </div>
          ${finding.rule ? `<span style="font-size:12px;font-family:monospace;color:var(--c-text-sub);">${escapeHtml(finding.rule)}</span>` : ''}
        </div>
        <p style="font-size:13.5px;color:var(--c-text-sec);line-height:1.65;">${escapeHtml(finding.description)}</p>
        ${locationHtml}
        ${snippetHtml}
        ${remediationHtml}
      `;

      // Copy handler
      const copyBtn = card.querySelector('.btn-copy-remediation');
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rem = copyBtn.getAttribute('data-remediation');
          navigator.clipboard.writeText(rem);
          copyBtn.innerText = 'Copied!';
          setTimeout(() => { copyBtn.innerText = 'Copy Fix'; }, 2000);
        });
      }

      containerEl.appendChild(card);
    });
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '&quot;');
}

window.UI = UI;
window.escapeHtml = escapeHtml;
window.escapeAttr = escapeAttr;
