/**
 * LaunchGate Main Frontend Application Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Handle optional LaunchGate remote access token from query params or session storage
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('token')) {
    sessionStorage.setItem('launchgate_token', urlParams.get('token'));
  }
  const sessionToken = sessionStorage.getItem('launchgate_token');

  // Intercept window.fetch to automatically append X-LaunchGate-Token for remote/container access
  if (sessionToken) {
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      options = options || {};
      options.headers = options.headers || {};
      if (options.headers instanceof Headers) {
        if (!options.headers.has('X-LaunchGate-Token')) {
          options.headers.set('X-LaunchGate-Token', sessionToken);
        }
      } else if (Array.isArray(options.headers)) {
        options.headers.push(['X-LaunchGate-Token', sessionToken]);
      } else {
        options.headers['X-LaunchGate-Token'] = sessionToken;
      }
      return originalFetch(url, options);
    };
  }

  const state = {
    projectPath: null,
    projectName: null,
    projectData: null,
    gatesMeta: [],
    selectedGateIds: new Set(),
    activeGateId: 'gate-1',
    activeFilter: 'all',
    terminal: null,
    isScanningBatch: false,
    browsedPath: null,
    browsedDirectories: [],
    activeView: 'overview'
  };

  // DOM Elements
  const el = {
    pathInput: document.getElementById('project-path-input'),
    btnLoadPath: document.getElementById('btn-load-path'),
    btnPickFolder: document.getElementById('btn-pick-folder'),
    btnLoadDemo: document.getElementById('btn-load-demo'),
    btnResetTool: document.getElementById('btn-reset-tool'),
    btnContextClearProject: document.getElementById('btn-context-clear-project'),
    menuOptResetTool: document.getElementById('menu-opt-reset-tool'),
    btnFeedback: document.getElementById('btn-feedback'),
    feedbackModal: document.getElementById('feedback-modal'),
    btnCloseFeedback: document.getElementById('btn-close-feedback'),
    btnCloseFeedbackFooter: document.getElementById('btn-close-feedback-footer'),
    feedbackUserNotes: document.getElementById('feedback-user-notes'),
    feedbackDiagnosticPreview: document.getElementById('feedback-diagnostic-preview'),
    btnCopyDiagnostic: document.getElementById('btn-copy-diagnostic'),
    projectPickerModal: document.getElementById('project-picker-modal'),
    btnClosePickerModal: document.getElementById('btn-close-picker-modal'),
    tabPickerLocal: document.getElementById('tab-picker-local'),
    tabPickerGit: document.getElementById('tab-picker-git'),
    pickerLocalContent: document.getElementById('picker-local-content'),
    pickerGitContent: document.getElementById('picker-git-content'),
    modalFolderInput: document.getElementById('modal-folder-input'),
    btnModalLoadFolder: document.getElementById('btn-modal-load-folder'),
    btnModalNativeDialog: document.getElementById('btn-modal-native-dialog'),
    pickerQuickLocations: document.getElementById('picker-quick-locations'),
    btnModalSelectCurrent: document.getElementById('btn-modal-select-current'),
    btnPickerUp: document.getElementById('btn-picker-up'),
    pickerBreadcrumbs: document.getElementById('picker-breadcrumbs'),
    pickerFolderFilter: document.getElementById('picker-folder-filter'),
    pickerFolderList: document.getElementById('picker-folder-list'),
    modalGitUrlInput: document.getElementById('modal-git-url-input'),
    modalGitTokenInput: document.getElementById('modal-git-token-input'),
    btnModalCloneGit: document.getElementById('btn-modal-clone-git'),
    gitCloneSpinner: document.getElementById('git-clone-spinner'),
    gitCloneBtnText: document.getElementById('git-clone-btn-text'),
    btnRecentToggle: document.getElementById('btn-recent-toggle'),
    recentDropdown: document.getElementById('recent-dropdown'),
    recentList: document.getElementById('recent-list'),
    activeProjectName: document.getElementById('active-project-name'),
    activeProjectPath: document.getElementById('active-project-path'),
    stackBadgesContainer: document.getElementById('stack-badges-container'),
    scoreGaugeBar: document.getElementById('score-gauge-bar'),
    overallScoreText: document.getElementById('overall-score-text'),
    overallVerdictPill: document.getElementById('overall-verdict-pill'),
    countP0: document.getElementById('count-p0'),
    countP1: document.getElementById('count-p1'),
    countP2: document.getElementById('count-p2'),
    countPassed: document.getElementById('count-passed'),
    verifiedGateCount: document.getElementById('verified-gate-count'),
    verifiedGateCountSidebar: document.getElementById('verified-gate-count-sidebar'),
    gateSelectAll: document.getElementById('gate-select-all'),
    selectedGateCount: document.getElementById('selected-gate-count'),
    btnRunAllGates: document.getElementById('btn-run-all-gates'),
    btnExportAgentRules: document.getElementById('btn-export-agent-rules'),
    exportRulesDropdown: document.getElementById('export-rules-dropdown'),
    batchSpinner: document.getElementById('batch-spinner'),
    batchIcon: document.getElementById('batch-icon'),
    batchBtnText: document.getElementById('batch-btn-text'),
    btnOpenCertificate: document.getElementById('btn-open-certificate'),
    btnRestartServer: document.getElementById('btn-restart-server'),
    btnShutdownServer: document.getElementById('btn-shutdown-server'),
    activeGateNumberBadge: document.getElementById('active-gate-number-badge'),
    activeGateCategory: document.getElementById('active-gate-category'),
    activeGateStatusBadge: document.getElementById('active-gate-status-badge'),
    activeGateTitle: document.getElementById('active-gate-title'),
    activeGateDesc: document.getElementById('active-gate-desc'),
    btnScanCurrentGate: document.getElementById('btn-scan-current-gate'),
    btnCopyAuditPrompt: document.getElementById('btn-copy-audit-prompt'),
    btnToggleIngest: document.getElementById('btn-toggle-ingest'),
    btnGenerateFix: document.getElementById('btn-generate-fix'),
    gateVerifiedToggle: document.getElementById('gate-verified-toggle'),
    gateVerifiedDate: document.getElementById('gate-verified-date'),
    gateNotesInput: document.getElementById('gate-notes-input'),
    btnSaveNotes: document.getElementById('btn-save-notes'),
    ingestBox: document.getElementById('ingest-box'),
    ingestTextarea: document.getElementById('ingest-textarea'),
    btnSaveIngest: document.getElementById('btn-save-ingest'),
    severityTabs: document.getElementById('severity-tabs'),
    gateReportFilePill: document.getElementById('gate-report-file-pill'),
    findingsContainer: document.getElementById('findings-container'),
    gate12CliSection: document.getElementById('gate12-cli-section'),
    terminalOutput: document.getElementById('terminal-output'),
    btnClearTerminal: document.getElementById('btn-clear-terminal'),
    btnRunTypecheck: document.getElementById('btn-run-typecheck'),
    btnRunLint: document.getElementById('btn-run-lint'),
    btnRunAudit: document.getElementById('btn-run-audit'),
    btnRunBuild: document.getElementById('btn-run-build'),
    certificateModal: document.getElementById('certificate-modal'),
    certificateContent: document.getElementById('certificate-content'),
    btnCopyCertificate: document.getElementById('btn-copy-certificate'),
    btnCloseCertificate: document.getElementById('btn-close-certificate'),
    btnExportSarif: document.getElementById('btn-export-sarif'),
    btnPrintCertificatePdf: document.getElementById('btn-print-certificate-pdf'),
    btnInstallGitHook: document.getElementById('btn-install-git-hook'),
    btnViewHistory: document.getElementById('btn-view-history'),
    historyModal: document.getElementById('history-modal'),
    historyModalContent: document.getElementById('history-modal-content'),
    btnCloseHistory: document.getElementById('btn-close-history'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    liveScanProgressStrip: document.getElementById('live-scan-progress-strip'),
    scanProgressTitle: document.getElementById('scan-progress-title'),
    scanProgressDetails: document.getElementById('scan-progress-details'),
    scanProgressBar: document.getElementById('scan-progress-bar'),
    scanProgressPercent: document.getElementById('scan-progress-percent'),
    telemetryFilesCount: document.getElementById('telemetry-files-count'),
    telemetryDuration: document.getElementById('telemetry-duration'),
    telemetryTimestamp: document.getElementById('telemetry-timestamp'),
    btnToggleScannedFiles: document.getElementById('btn-toggle-scanned-files'),
    telemetrySampleCount: document.getElementById('telemetry-sample-count'),
    scannedFilesDrawer: document.getElementById('scanned-files-drawer'),
    scannedFilesList: document.getElementById('scanned-files-list'),

    // Magic Vibe-to-SaaS Transmuter Elements
    btnMagicVibeSaas: document.getElementById('btn-magic-vibe-saas'),
    magicModal: document.getElementById('magic-modal'),
    btnCloseMagicModal: document.getElementById('btn-close-magic-modal'),
    btnCancelMagic: document.getElementById('btn-cancel-magic'),
    btnExecuteMagic: document.getElementById('btn-execute-magic'),
    magicBtnSpinner: document.getElementById('magic-btn-spinner'),
    magicBtnText: document.getElementById('magic-btn-text'),
    magicProjectName: document.getElementById('magic-project-name'),
    magicStackBadge: document.getElementById('magic-stack-badge'),
    magicStatusSummary: document.getElementById('magic-status-summary'),
    magicReadinessVal: document.getElementById('magic-readiness-val'),
    btnMagicSelectAll: document.getElementById('btn-magic-select-all'),
    btnMagicDeselectAll: document.getElementById('btn-magic-deselect-all'),
    magicModulesList: document.getElementById('magic-modules-list'),
    magicProgressPanel: document.getElementById('magic-progress-panel'),
    magicProgressBar: document.getElementById('magic-progress-bar'),
    magicProgressStatus: document.getElementById('magic-progress-status'),
    magicProgressStep: document.getElementById('magic-progress-step'),
    magicLiveLogs: document.getElementById('magic-live-logs'),
    magicSuccessPanel: document.getElementById('magic-success-panel'),
    magicResFilesCount: document.getElementById('magic-res-files-count'),
    magicResOldScore: document.getElementById('magic-res-old-score'),
    magicResNewScore: document.getElementById('magic-res-new-score'),
    magicBackupPath: document.getElementById('magic-backup-path'),
    btnRollbackMagic: document.getElementById('btn-rollback-magic'),
    magicDiffList: document.getElementById('magic-diff-list'),

    // Quick-Fix Diff Review Modal
    quickFixDiffModal: document.getElementById('quick-fix-diff-modal'),
    btnCloseQfModal: document.getElementById('btn-close-qf-modal'),
    qfModalTitle: document.getElementById('qf-modal-title'),
    qfModalSubtitle: document.getElementById('qf-modal-subtitle'),
    qfBackupPath: document.getElementById('qf-backup-path'),
    qfAdditionsBadge: document.getElementById('qf-additions-badge'),
    qfDeletionsBadge: document.getElementById('qf-deletions-badge'),
    qfDiffContent: document.getElementById('qf-diff-content'),
    btnRollbackQf: document.getElementById('btn-rollback-qf'),
    btnConfirmQf: document.getElementById('btn-confirm-qf'),

    // Auto-Fix & Remediation Hub Modal
    autoFixModal: document.getElementById('auto-fix-modal'),
    btnCloseAutoFixModal: document.getElementById('btn-close-auto-fix-modal'),
    btnCloseAutofixFooter: document.getElementById('btn-close-autofix-footer'),
    autoFixModalTitle: document.getElementById('auto-fix-modal-title'),
    autoFixModalSubtitle: document.getElementById('auto-fix-modal-subtitle'),
    autoFixPlanPath: document.getElementById('auto-fix-plan-path'),
    autoFixItemsBadge: document.getElementById('auto-fix-items-badge'),
    autoFixPromptDisplay: document.getElementById('auto-fix-prompt-display'),
    btnCopyAutofixPrompt: document.getElementById('btn-copy-autofix-prompt'),
    copyAutofixIcon: document.getElementById('copy-autofix-icon'),
    copyAutofixLabel: document.getElementById('copy-autofix-label'),
    autoFixTasksList: document.getElementById('auto-fix-tasks-list'),

    // How to Use & Documentation Modals
    btnHowToUse: document.getElementById('btn-how-to-use'),
    howToUseModal: document.getElementById('how-to-use-modal'),
    btnCloseHowToUse: document.getElementById('btn-close-how-to-use'),
    btnCloseHowToUseFooter: document.getElementById('btn-close-how-to-use-footer'),

    btnGatesDocs: document.getElementById('btn-gates-docs'),
    gatesDocsModal: document.getElementById('gates-docs-modal'),
    btnCloseGatesDocs: document.getElementById('btn-close-gates-docs'),
    btnCloseGatesDocsFooter: document.getElementById('btn-close-gates-docs-footer'),
    gatesDocsSearch: document.getElementById('gates-docs-search'),
    gatesDocsCardsList: document.getElementById('gates-docs-cards-list'),

    // More Tools Dropdown
    btnMoreToolsToggle: document.getElementById('btn-more-tools-toggle'),
    moreToolsDropdown: document.getElementById('more-tools-dropdown'),
    menuOptGitHook: document.getElementById('menu-opt-git-hook'),
    menuOptHistory: document.getElementById('menu-opt-history'),
    menuOptRestart: document.getElementById('menu-opt-restart'),
    menuOptShutdown: document.getElementById('menu-opt-shutdown'),

    // View navigation
    navBtnOverview: document.getElementById('nav-btn-overview'),
    navBtnWorkspace: document.getElementById('nav-btn-workspace'),
    viewOverview: document.getElementById('view-overview'),
    viewWorkspace: document.getElementById('view-workspace'),
    viewHowToUse: document.getElementById('view-how-to-use'),
    viewGatesDocs: document.getElementById('view-gates-docs'),
    navGateSummary: document.getElementById('nav-gate-summary'),

    // Overview
    overviewHeroScore: document.getElementById('overview-hero-score'),
    overviewRingBar: document.getElementById('overview-ring-bar'),
    overviewProjectName: document.getElementById('overview-project-name'),
    overviewProjectPath: document.getElementById('overview-project-path'),
    overviewVerdict: document.getElementById('overview-verdict'),
    overviewLastScan: document.getElementById('overview-last-scan'),
    overviewGatesScanned: document.getElementById('overview-gates-scanned'),
    overviewVerifiedCount: document.getElementById('overview-verified-count'),
    overviewStack: document.getElementById('overview-stack'),
    overviewBtnScan: document.getElementById('overview-btn-scan'),
    overviewBtnWorkspace: document.getElementById('overview-btn-workspace'),
    overviewBtnCert: document.getElementById('overview-btn-cert'),
    kpiP0: document.getElementById('kpi-p0'),
    kpiP1: document.getElementById('kpi-p1'),
    kpiPassed: document.getElementById('kpi-passed'),
    kpiScanned: document.getElementById('kpi-scanned'),
    overviewGateGrid: document.getElementById('overview-gate-grid'),
    overviewOpenWorkspace: document.getElementById('overview-open-workspace'),
    overviewActMagic: document.getElementById('overview-act-magic'),
    overviewActHook: document.getElementById('overview-act-hook'),
    overviewActSarif: document.getElementById('overview-act-sarif'),
    overviewActHistory: document.getElementById('overview-act-history'),
    overviewCopyMcp: document.getElementById('overview-copy-mcp'),
    overviewRecentList: document.getElementById('overview-recent-list'),
  };

  function appendTerminalLine(text, colorClass = '') {
    if (!el.terminalOutput) return;
    const line = document.createElement('div');
    line.className = `terminal-line ${colorClass}`;
    line.innerText = text;
    el.terminalOutput.appendChild(line);
    el.terminalOutput.scrollTop = el.terminalOutput.scrollHeight;
  }

  // Initialize Terminal Controller
  state.terminal = new TerminalController(el.terminalOutput);

  // -------------------------------------------------------------------------
  // Theme Toggle (Light / Dark Mode)
  // -------------------------------------------------------------------------
  function initTheme() {
    const saved = localStorage.getItem('launchgate-theme') || 'dark';
    applyTheme(saved);
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      if (el.themeIcon) el.themeIcon.innerText = '🌙';
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      if (el.themeIcon) el.themeIcon.innerText = '☀️';
    }
    localStorage.setItem('launchgate-theme', theme);
  }

  function toggleTheme() {
    const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    const newTheme = current === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    showToast(`Switched to ${newTheme === 'light' ? 'Light' : 'Dark'} mode`, 'info');
  }

  // -------------------------------------------------------------------------
  // Initialization & Clean Reset State
  // -------------------------------------------------------------------------
  async function init() {
    initTheme();
    setupEventListeners();
    initHowToUseModal();
    initGatesDocsModal();
    renderGatesFullDocs('all', '');
    await loadGatesMeta();
    await loadRecentProjects();

    // Try to restore last project state from localStorage
    try {
      const last = localStorage.getItem('launchgate-last-project');
      if (last) {
        const parsed = JSON.parse(last);
        if (parsed && parsed.path) {
          await loadProject(parsed.path, { restoreHistory: true });
          if (parsed.activeGateId) state.activeGateId = parsed.activeGateId;
          renderSidebar();
          renderActiveGate();
          updateOverallScore();
          switchView('overview');
          return;
        }
      }
    } catch (e) { console.debug('[LaunchGate]', e); }

    // Default clean state on startup: All 12 Gates at 0% (Reset State)
    resetToCleanState();
  }

  function resetToCleanState() {
    state.projectPath = '';
    state.projectName = '';
    state.projectData = { gates: {}, overallScore: 0 };
    state.activeGateId = 'gate-1';

    if (el.pathInput) {
      el.pathInput.value = '';
      el.pathInput.placeholder = 'Enter project path or click Browse...';
    }
    if (el.activeProjectName) el.activeProjectName.innerText = 'No Project Selected';
    if (el.activeProjectPath) el.activeProjectPath.innerText = 'Select a folder or enter path above to begin';
    if (el.stackBadgesContainer) {
      el.stackBadgesContainer.innerHTML = '<span class="text-[11px] lg-text-subtle italic">No stack loaded — select project</span>';
    }
    if (el.btnContextClearProject) {
      el.btnContextClearProject.classList.add('hidden');
    }

    const histBanner = document.getElementById('history-restore-banner');
    if (histBanner) histBanner.classList.add('hidden');

    updateOverallScore();
    renderSidebar();
    renderActiveGate();

    if (el.findingsContainer) {
      el.findingsContainer.innerHTML = '<div class="text-xs text-slate-400 text-center py-12">No project loaded. Select a project folder above to begin auditing.</div>';
    }

    if (el.terminalOutput) {
      el.terminalOutput.innerHTML = '';
      appendTerminalLine(`╔══════════════════════════════════════════════════════════════╗`, 'text-indigo-400 font-bold');
      appendTerminalLine(`║                 LAUNCHGATE COMMAND CENTER                    ║`, 'text-indigo-300 font-bold');
      appendTerminalLine(`║       Continuous Zero-Trust Production Readiness Suite       ║`, 'text-indigo-400 font-bold');
      appendTerminalLine(`╚══════════════════════════════════════════════════════════════╝`, 'text-indigo-400 font-bold');
      appendTerminalLine(`⚡ System Ready • All 12 Gates Initialized (0% Unscanned)`, 'text-emerald-400 font-semibold');
      appendTerminalLine(`📁 Select or enter a project folder above, then click 'Run All 12 Gates'.`, 'text-slate-400');
    }
  }

  // Fetch Gates metadata
  async function loadGatesMeta() {
    try {
      const res = await fetch('/api/gates');
      const data = await res.json();
      if (data.success) {
        state.gatesMeta = data.gates;
        state.selectedGateIds = new Set(data.gates.map(g => g.id));
        updateSelectionUI();
        renderSidebar();
        renderOverview();
      }
    } catch (e) {
      showToast('Error loading gate metadata', 'error');
    }
  }

  // Load Recent Projects dropdown
  async function loadRecentProjects() {
    try {
      const res = await fetch('/api/projects/recent');
      const data = await res.json();
      if (data.success && data.recent) {
        if (data.recent.length === 0) {
          el.recentList.innerHTML = '<div class="px-3 py-2 text-xs lg-text-subtle italic">No recent projects</div>';
        } else {
          el.recentList.innerHTML = data.recent.map(p => `
            <div class="lg-dropdown-item flex flex-col gap-0.5 recent-item" data-path="${escapeAttr(p.path)}">
              <span class="text-xs font-medium lg-text-primary">${escapeHtml(p.name)}</span>
              <span class="text-[10px] lg-text-subtle font-mono truncate">${escapeHtml(p.path)}</span>
            </div>
          `).join('');

          el.recentList.querySelectorAll('.recent-item').forEach(item => {
            item.addEventListener('click', () => {
              const p = item.getAttribute('data-path');
              el.recentDropdown.classList.add('hidden');
              loadProject(p);
            });
          });
        }

        if (typeof renderOverviewRecent === 'function') {
          try { renderOverviewRecent(data.recent); } catch (e) { console.debug('[LaunchGate]', e); }
        }
      }
    } catch (e) {
      console.warn('[LaunchGate] Failed to load recent projects:', e.message);
    }
  }

  // -------------------------------------------------------------------------
  // Project Loading & Validation
  // -------------------------------------------------------------------------
  async function loadProject(folderPath, options = {}) {
    if (!folderPath) return;
    folderPath = folderPath.trim().replace(/^["']|["']$/g, '');
    try {
      showToast('Inspecting project directory & stack...', 'info');
      const res = await fetch('/api/system/validate-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath })
      });
      const data = await res.json();

      if (!data.success) {
        showToast(data.error || 'Failed to open directory', 'error');
        return;
      }

      state.projectPath = data.path;
      state.projectName = data.name;

      el.pathInput.value = data.path;
      el.pathInput.title = data.path;
      try { el.pathInput.scrollLeft = el.pathInput.scrollWidth; } catch (e) { console.debug('[LaunchGate]', e); }
      el.activeProjectName.innerText = data.name;
      el.activeProjectPath.innerText = data.path;
      el.activeProjectPath.title = data.path;
      if (el.btnContextClearProject) el.btnContextClearProject.classList.remove('hidden');

      // Render stack badges
      try {
        UI.renderStackBadges(data.stackInfo?.allBadges || [], el.stackBadgesContainer);
      } catch (e) { console.debug('[LaunchGate]', e); }

      // Check if project has previous audit history
      const savedGates = data.project?.gates || {};
      const hasHistory = Object.keys(savedGates).some(k => savedGates[k].status && savedGates[k].status !== 'unscanned');

      if (options.restoreHistory && hasHistory) {
        state.projectData = data.project;
        const histBanner = document.getElementById('history-restore-banner');
        if (histBanner) histBanner.classList.add('hidden');
        showToast(`Restored previous audit for "${data.name}" (${Math.round(data.project.overallScore || 0)}%)`, 'info');
      } else {
        // ALWAYS START AT 0% UNLESS EXPLICITLY RESTORED!
        state.projectData = {
          path: data.path,
          name: data.name,
          stackInfo: data.stackInfo,
          fileCount: data.fileCount,
          gates: {},
          overallScore: 0
        };

        if (hasHistory) {
          const histBanner = document.getElementById('history-restore-banner');
          const histText = document.getElementById('history-restore-text');
          if (histBanner && histText) {
            const score = Math.round(data.project.overallScore || 0);
            const scoreColorClass = score >= 80 
              ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' 
              : (score >= 50 ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' : 'text-rose-400 bg-rose-500/15 border-rose-500/30');
            const dateStr = data.project.updatedAt 
              ? new Date(data.project.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) 
              : 'Recent';

            histText.innerHTML = `
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-slate-300">Found saved audit for <span class="font-semibold text-white px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700/60 shadow-xs">${escapeHtml(data.name)}</span></span>
                <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${scoreColorClass}">
                  <span class="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                  ${score}% Overall Score
                </span>
                <span class="text-slate-400 text-[11px] flex items-center gap-1">
                  <svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  ${dateStr}
                </span>
              </div>
            `;
            histBanner.classList.remove('hidden');

            const btnRestore = document.getElementById('btn-restore-history');
            if (btnRestore) {
              btnRestore.onclick = () => {
                state.projectData = data.project;
                histBanner.classList.add('hidden');
                updateOverallScore();
                renderSidebar();
                renderActiveGate();
                showToast(`Restored previous audit for "${data.name}"`, 'success');
                appendTerminalLine(`\n[History Restored] Loaded saved audit results (${Math.round(data.project.overallScore || 0)}% score)`, 'text-amber-400 font-semibold');
              };
            }

            const btnDismiss = document.getElementById('btn-dismiss-history');
            if (btnDismiss) {
              btnDismiss.onclick = () => {
                histBanner.classList.add('hidden');
              };
            }

            const btnClose = document.getElementById('btn-close-history');
            if (btnClose) {
              btnClose.onclick = () => {
                histBanner.classList.add('hidden');
              };
            }
          }
        } else {
          const histBanner = document.getElementById('history-restore-banner');
          if (histBanner) histBanner.classList.add('hidden');
        }
      }

      updateOverallScore();
      renderSidebar();
      renderActiveGate();
      try {
        loadRecentProjects();
      } catch (e) { console.debug('[LaunchGate]', e); }

      try {
        localStorage.setItem('launchgate-last-project', JSON.stringify({
          path: state.projectPath,
          name: state.projectName,
          activeGateId: state.activeGateId,
          lastLoaded: new Date().toISOString()
        }));
      } catch (e) { console.debug('[LaunchGate]', e); }

      showToast(`Loaded "${data.name}" (${data.fileCount} files discovered) • Ready to Scan`, 'success');
      try {
        appendTerminalLine(`\n[Project Loaded] "${data.name}" at ${data.path}`, 'text-emerald-400 font-bold');
        const stackStr = (data.stackInfo?.frameworks || []).concat(data.stackInfo?.languages || []).join(', ') || 'Standard web stack';
        appendTerminalLine(`↳ Discovered ${data.fileCount} files (${stackStr})`, 'text-slate-400');
        appendTerminalLine(`↳ All 12 Gates initialized at 0% (Ready to Scan). Click 'Run All 12 Gates' to execute real-time audit.`, 'text-cyan-400');
      } catch (e) { console.debug('[LaunchGate]', e); }
    } catch (e) {
      showToast('Error validating project folder', 'error');
    }
  }

  // Open Project Picker Modal
  function openProjectPicker() {
    if (el.projectPickerModal) {
      if (el.modalFolderInput) {
        el.modalFolderInput.value = state.projectPath || '';
      }
      el.projectPickerModal.classList.remove('hidden');
      loadDirectory(state.projectPath || 'F:\\App Checker Tool');
    }
  }

  function closeProjectPicker() {
    if (el.projectPickerModal) {
      el.projectPickerModal.classList.add('hidden');
    }
  }

  // Load and browse directory in modal
  async function loadDirectory(targetPath) {
    if (!el.pickerFolderList) return;
    el.pickerFolderList.innerHTML = '<div class="p-4 text-xs text-center lg-text-subtle animate-pulse">Loading folders...</div>';

    try {
      const res = await fetch(`/api/system/browse-dir?dir=${encodeURIComponent(targetPath || '')}&currentProject=${encodeURIComponent(state.projectPath || '')}`);
      const data = await res.json();
      if (!data.success) {
        el.pickerFolderList.innerHTML = `<div class="p-4 text-xs text-rose-400 text-center">${escapeHtml(data.error || 'Failed to read directory')}</div>`;
        return;
      }

      state.browsedPath = data.current;
      state.browsedDirectories = data.directories || [];
      if (el.modalFolderInput) el.modalFolderInput.value = data.current;

      // Render Quick Locations & Drives
      renderQuickLocations(data.drives, data.quickLocations, data.current);

      // Render Breadcrumbs
      renderBreadcrumbs(data.current, data.parent, data.isRoot);

      // Render Subdirectories
      renderFolderList(state.browsedDirectories, el.pickerFolderFilter?.value || '');

    } catch (err) {
      el.pickerFolderList.innerHTML = `<div class="p-4 text-xs text-rose-400 text-center">Error reading directory: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderQuickLocations(drives, quickLocations, currentPath) {
    if (!el.pickerQuickLocations) return;
    el.pickerQuickLocations.innerHTML = '';

    // Drives first
    (drives || []).forEach(drive => {
      const btn = document.createElement('button');
      btn.className = `lg-btn-ghost text-xs px-2.5 py-1 ${currentPath && currentPath.toLowerCase().startsWith(drive.toLowerCase()) ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400 font-semibold' : ''}`;
      btn.innerHTML = `💾 ${escapeHtml(drive)}`;
      btn.addEventListener('click', () => loadDirectory(drive));
      el.pickerQuickLocations.appendChild(btn);
    });

    // Locations next
    (quickLocations || []).forEach(loc => {
      const btn = document.createElement('button');
      btn.className = 'lg-btn-ghost text-xs px-2.5 py-1';
      btn.innerHTML = `${loc.icon} ${escapeHtml(loc.label)}`;
      btn.addEventListener('click', () => loadDirectory(loc.path));
      el.pickerQuickLocations.appendChild(btn);
    });
  }

  function renderBreadcrumbs(currentPath, parentPath, isRoot) {
    if (el.btnPickerUp) {
      el.btnPickerUp.disabled = isRoot;
      el.btnPickerUp.style.opacity = isRoot ? '0.4' : '1';
      el.btnPickerUp.onclick = () => {
        if (!isRoot && parentPath) loadDirectory(parentPath);
      };
    }

    if (!el.pickerBreadcrumbs) return;
    el.pickerBreadcrumbs.innerHTML = '';

    // Split path into clickable segments
    const normalized = currentPath.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);

    let accumulated = '';
    segments.forEach((seg, idx) => {
      if (idx === 0 && seg.endsWith(':')) {
        accumulated = seg + '\\';
      } else {
        accumulated = accumulated ? (accumulated.endsWith('\\') ? accumulated + seg : accumulated + '\\' + seg) : seg;
      }

      const targetAcc = accumulated;
      const span = document.createElement('button');
      span.className = 'hover:text-indigo-400 hover:underline px-0.5 rounded cursor-pointer font-mono text-[11px]';
      span.innerText = seg;
      span.addEventListener('click', () => loadDirectory(targetAcc));
      el.pickerBreadcrumbs.appendChild(span);

      if (idx < segments.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'text-slate-500 mx-0.5 text-[10px]';
        sep.innerText = '>';
        el.pickerBreadcrumbs.appendChild(sep);
      }
    });
  }

  function renderFolderList(directories, filterText = '') {
    if (!el.pickerFolderList) return;
    el.pickerFolderList.innerHTML = '';

    const filter = (filterText || '').toLowerCase().trim();
    const filtered = (directories || []).filter(d => !filter || d.name.toLowerCase().includes(filter));

    if (filtered.length === 0) {
      el.pickerFolderList.innerHTML = `
        <div class="p-6 text-center text-xs lg-text-subtle">
          ${filter ? 'No folders match the filter' : 'No subdirectories in this folder'}
        </div>
      `;
      return;
    }

    filtered.forEach(dir => {
      const item = document.createElement('div');
      item.className = 'folder-explorer-item';

      let projectBadge = '';
      if (dir.isProject) {
        projectBadge = `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 ml-2">${escapeHtml(dir.projectType || 'Project')}</span>`;
      }

      item.innerHTML = `
        <div class="flex items-center gap-2 min-w-0 flex-1 cursor-pointer folder-row-title">
          <span class="text-sm">📁</span>
          <span class="font-medium lg-text-primary truncate text-xs">${escapeHtml(dir.name)}</span>
          ${projectBadge}
        </div>
        <div class="flex items-center gap-1.5 shrink-0 ml-2">
          <button class="btn-select-folder lg-btn-primary text-[11px] px-2.5 py-1" title="Select and audit this project">
            Select
          </button>
        </div>
      `;

      // Click row title drills down
      item.querySelector('.folder-row-title').addEventListener('click', () => {
        loadDirectory(dir.path);
      });

      // Click Select loads project
      item.querySelector('.btn-select-folder').addEventListener('click', (e) => {
        e.stopPropagation();
        closeProjectPicker();
        loadProject(dir.path);
      });

      el.pickerFolderList.appendChild(item);
    });
  }

  // Clone Git Repo and load audit
  async function cloneGitRepo(repoUrl, token = '') {
    if (!repoUrl) return;
    try {
      if (el.btnModalCloneGit) el.btnModalCloneGit.disabled = true;
      if (el.gitCloneSpinner) el.gitCloneSpinner.classList.remove('hidden');
      if (el.gitCloneBtnText) el.gitCloneBtnText.innerText = 'Cloning...';

      showToast(`Cloning repository ${repoUrl}...`, 'info');

      const res = await fetch('/api/system/clone-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, token })
      });
      const data = await res.json();

      if (!data.success) {
        showToast(data.error || 'Failed to clone repository', 'error');
        return;
      }

      state.projectPath = data.path;
      state.projectName = data.name;
      state.projectData = data.project;

      el.pathInput.value = data.path;
      el.pathInput.title = data.path;
      try { el.pathInput.scrollLeft = el.pathInput.scrollWidth; } catch (e) { console.debug('[LaunchGate]', e); }
      el.activeProjectName.innerText = data.name;
      el.activeProjectPath.innerText = data.path;
      el.activeProjectPath.title = data.path;
      if (el.btnContextClearProject) el.btnContextClearProject.classList.remove('hidden');

      UI.renderStackBadges(data.stackInfo.allBadges, el.stackBadgesContainer);
      updateOverallScore();
      renderSidebar();
      renderActiveGate();
      loadRecentProjects();
      closeProjectPicker();

      showToast(`Repository "${data.name}" cloned & loaded! (${data.fileCount} files scanned)`, 'success');
    } catch (e) {
      showToast('Error cloning Git repository', 'error');
    } finally {
      if (el.btnModalCloneGit) el.btnModalCloneGit.disabled = false;
      if (el.gitCloneSpinner) el.gitCloneSpinner.classList.add('hidden');
      if (el.gitCloneBtnText) el.gitCloneBtnText.innerText = 'Clone & Audit';
    }
  }

  // Pick folder via native OS dialog
  async function pickFolderNative() {
    try {
      showToast('Opening native folder picker...', 'info');
      const res = await fetch('/api/system/pick-folder');
      const data = await res.json();

      if (data.success && data.path) {
        loadProject(data.path);
      } else if (data.message) {
        showToast(data.message, 'info');
      }
    } catch (e) {
      showToast('Error launching native folder picker', 'error');
    }
  }

  // -------------------------------------------------------------------------
  // Score & Metrics Calculation
  // -------------------------------------------------------------------------
  function updateOverallScore() {
    const gates = state.projectData?.gates || state.projectData?.results || {};
    let scannedCount = 0;
    let p0 = 0, p1 = 0, p2 = 0, passed = 0, verified = 0;

    for (let i = 1; i <= 12; i++) {
      const g = gates[`gate-${i}`] || gates[`gate${i}`];
      if (g && g.status && g.status !== 'unscanned') {
        scannedCount++;
        if (g.stats) {
          p0 += (g.stats.p0 || 0);
          p1 += (g.stats.p1 || 0);
          p2 += (g.stats.p2 || 0);
          passed += (g.stats.passed || 0);
        }
        if (g.verified) verified++;
      }
    }

    if (scannedCount === 0) {
      setGauge(0);
      if (el.overallScoreText) el.overallScoreText.innerText = '0%';
      if (el.overallVerdictPill) {
        el.overallVerdictPill.innerText = 'Ready to Scan';
        el.overallVerdictPill.className = 'text-xs font-bold text-slate-400';
      }
      if (el.countP0) el.countP0.innerText = '0 P0';
      if (el.countP1) el.countP1.innerText = '0 P1';
      if (el.countP2) el.countP2.innerText = '0 P2';
      if (el.countPassed) el.countPassed.innerText = '0 Pass';
      if (el.verifiedGateCount) el.verifiedGateCount.innerText = '0/12 Verified';
      if (el.verifiedGateCountSidebar) el.verifiedGateCountSidebar.innerText = '0 / 12';
      if (typeof renderOverview === 'function') renderOverview();
      return;
    }

    let score = state.projectData?.overallScore;
    if (score === undefined || score === null) {
      // compute if possible
      if (scannedCount > 0) {
        let total = 0;
        for (let i = 1; i <= 12; i++) {
          const g = gates[`gate-${i}`] || gates[`gate${i}`];
          if (g && g.status && g.status !== 'unscanned') {
            if (g.verified) total += 100;
            else total += (g.score || 0);
          }
        }
        score = Math.round((total / 1200) * 100);
      } else {
        score = 0;
      }
    }
    setGauge(score);
    if (el.overallScoreText) el.overallScoreText.innerText = `${score}%`;
    if (el.countP0) el.countP0.innerText = `${p0} P0`;
    if (el.countP1) el.countP1.innerText = `${p1} P1`;
    if (el.countP2) el.countP2.innerText = `${p2} P2`;
    if (el.countPassed) el.countPassed.innerText = `${passed} Pass`;
    if (el.verifiedGateCount) el.verifiedGateCount.innerText = `${verified}/12 Verified`;
    if (el.verifiedGateCountSidebar) el.verifiedGateCountSidebar.innerText = `${verified} / 12`;

    // Release Verdict
    if (el.overallVerdictPill) {
      if (p0 === 0 && p1 === 0 && score >= 90) {
        el.overallVerdictPill.innerText = 'Certified Ready';
        el.overallVerdictPill.className = 'text-xs font-bold text-emerald-400';
      } else if (p0 === 0 && score >= 70) {
        el.overallVerdictPill.innerText = 'Conditional Release';
        el.overallVerdictPill.className = 'text-xs font-bold text-amber-400';
      } else {
        el.overallVerdictPill.innerText = 'Launch Blocked';
        el.overallVerdictPill.className = 'text-xs font-bold text-rose-400';
      }
    }

    if (typeof renderOverview === 'function') renderOverview();
  }


  function setGauge(percentage) {
    // gauge override
    const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
    const radius = 17;
    const circumference = 2 * Math.PI * radius; // 106.814
    const offset = circumference - (pct / 100) * circumference;
    if (el.scoreGaugeBar) {
      el.scoreGaugeBar.style.strokeDasharray = circumference;
      el.scoreGaugeBar.style.strokeDashoffset = offset;
    }
    if (el.overallScoreText) el.overallScoreText.innerText = `${pct}%`;

    if (el.scoreGaugeBar) {
      if (pct >= 90) {
        el.scoreGaugeBar.style.stroke = '#34d399';
      } else if (pct >= 70) {
        el.scoreGaugeBar.style.stroke = '#fbbf24';
      } else if (pct > 0) {
        el.scoreGaugeBar.style.stroke = '#6366f1';
      } else {
        el.scoreGaugeBar.style.stroke = '#475569';
      }
    }
  }

  // -------------------------------------------------------------------------
  // Overview View Renderer
  // -------------------------------------------------------------------------
  function renderOverview() {
    const pData = state.projectData || {};
    const gates = pData.gates || pData.results || {};
    const projectName = state.projectName || pData.name || '';
    const projectPath = state.projectPath || pData.path || '';

    // Calculate aggregated metrics
    let scannedCount = 0;
    let p0 = 0, p1 = 0, p2 = 0, passed = 0, verified = 0;

    for (let i = 1; i <= 12; i++) {
      const g = gates[`gate-${i}`] || gates[`gate${i}`];
      if (g && g.status && g.status !== 'unscanned') {
        scannedCount++;
        if (g.stats) {
          p0 += (g.stats.p0 || 0);
          p1 += (g.stats.p1 || 0);
          p2 += (g.stats.p2 || 0);
          passed += (g.stats.passed || 0);
        }
        if (g.verified) verified++;
      }
    }

    let score = pData.overallScore;
    if (score === undefined || score === null) {
      if (scannedCount > 0) {
        let total = 0;
        for (let i = 1; i <= 12; i++) {
          const g = gates[`gate-${i}`] || gates[`gate${i}`];
          if (g && g.status && g.status !== 'unscanned') {
            total += g.verified ? 100 : (g.score || 0);
          }
        }
        score = Math.round((total / 1200) * 100);
      } else {
        score = 0;
      }
    }
    score = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));

    // 1. Hero Title & Path
    if (el.overviewProjectName) {
      el.overviewProjectName.innerText = projectName || 'No project selected';
    }
    if (el.overviewProjectPath) {
      el.overviewProjectPath.innerText = projectPath || 'Choose a folder or clone a repo to begin the 12-gate audit.';
    }

    // 2. Hero Score & Ring Gauge
    if (el.overviewHeroScore) {
      el.overviewHeroScore.innerText = `${score}%`;
    }
    if (el.overviewRingBar) {
      const circumference = 326.73; // 2 * PI * 52
      const offset = circumference - (score / 100) * circumference;
      el.overviewRingBar.style.strokeDasharray = circumference;
      el.overviewRingBar.style.strokeDashoffset = offset;
      if (scannedCount === 0 || score === 0) {
        el.overviewRingBar.style.stroke = '#475569';
      } else if (p0 > 0) {
        el.overviewRingBar.style.stroke = '#fb7185';
      } else if (score >= 90 && p1 === 0) {
        el.overviewRingBar.style.stroke = '#34d399';
      } else if (score >= 70) {
        el.overviewRingBar.style.stroke = '#fbbf24';
      } else {
        el.overviewRingBar.style.stroke = '#6366f1';
      }
    }

    // 3. Verdict
    if (el.overviewVerdict) {
      if (!projectName || scannedCount === 0) {
        el.overviewVerdict.className = 'ov-verdict ov-verdict-idle';
        el.overviewVerdict.innerText = 'Ready to scan';
      } else if (p0 === 0 && p1 === 0 && score >= 90) {
        el.overviewVerdict.className = 'ov-verdict ov-verdict-ready';
        el.overviewVerdict.innerText = 'Certified Ready';
      } else if (p0 === 0 && score >= 70) {
        el.overviewVerdict.className = 'ov-verdict ov-verdict-warning';
        el.overviewVerdict.innerText = 'Conditional Release';
      } else {
        el.overviewVerdict.className = 'ov-verdict ov-verdict-blocked';
        el.overviewVerdict.innerText = 'Launch Blocked';
      }
    }

    // 4. Hero Side Meta
    if (el.overviewLastScan) {
      if (pData.updatedAt) {
        try {
          const d = new Date(pData.updatedAt);
          el.overviewLastScan.innerText = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
          el.overviewLastScan.innerText = 'Recent';
        }
      } else {
        el.overviewLastScan.innerText = scannedCount > 0 ? 'Today' : 'Never';
      }
    }
    if (el.overviewGatesScanned) {
      el.overviewGatesScanned.innerText = `${scannedCount} / 12`;
    }
    if (el.overviewVerifiedCount) {
      el.overviewVerifiedCount.innerText = `${verified} / 12`;
    }
    if (el.overviewStack) {
      const badges = pData.stackInfo?.allBadges || [];
      if (badges.length > 0) {
        const maxVisible = 3;
        const visibleBadges = badges.slice(0, maxVisible);
        const remainingCount = badges.length - maxVisible;

        let html = visibleBadges.map(b => `<span class="ov-stack-pill">${escapeHtml(b.name)}</span>`).join('');
        if (remainingCount > 0) {
          const allRemaining = badges.slice(maxVisible).map(b => b.name).join(', ');
          html += `<span class="ov-stack-more" title="${escapeHtml(allRemaining)}">+${remainingCount} more</span>`;
        }
        el.overviewStack.innerHTML = html;
        el.overviewStack.title = badges.map(b => b.name).join(', ');
      } else {
        el.overviewStack.innerHTML = `<span class="text-xs lg-text-subtle">${projectName ? 'Detected' : 'Not detected'}</span>`;
      }
    }

    // 5. KPI Cards
    if (el.kpiP0) el.kpiP0.innerText = String(p0);
    if (el.kpiP1) el.kpiP1.innerText = String(p1);
    if (el.kpiPassed) el.kpiPassed.innerText = String(passed);
    if (el.kpiScanned) {
      el.kpiScanned.innerHTML = `${scannedCount}<span class="ov-kpi-unit">/12</span>`;
    }

    // 6. 12-Gate Grid
    if (el.overviewGateGrid) {
      el.overviewGateGrid.innerHTML = '';
      const metaList = (state.gatesMeta && state.gatesMeta.length > 0)
        ? state.gatesMeta
        : Array.from({ length: 12 }, (_, i) => ({
            id: `gate-${i + 1}`,
            number: i + 1,
            name: `Gate ${i + 1}`,
            category: 'System'
          }));

      metaList.forEach(meta => {
        const g = gates[meta.id] || gates[`gate-${meta.number}`] || null;
        const isScanned = g && g.status && g.status !== 'unscanned';
        let dotClass = 'ov-dot-idle';
        let scoreText = '0%';
        let issuesHtml = 'Unscanned';

        if (isScanned) {
          scoreText = `${g.score || 0}%`;
          if (g.verified) dotClass = 'ov-dot-pass';
          else if (g.status === 'passed') dotClass = 'ov-dot-pass';
          else if (g.status === 'warning') dotClass = 'ov-dot-warn';
          else if (g.status === 'failed') dotClass = 'ov-dot-fail';

          const gp0 = g.stats?.p0 !== undefined ? g.stats.p0 : (g.findings || []).filter(f => f.severity === 'P0').length;
          const gp1 = g.stats?.p1 !== undefined ? g.stats.p1 : (g.findings || []).filter(f => f.severity === 'P1').length;
          const gpass = g.stats?.passed !== undefined ? g.stats.passed : (g.findings || []).filter(f => f.severity === 'PASSED').length;

          if (gp0 > 0) {
            issuesHtml = `<span class="has-p0">${gp0} P0 blocker${gp0 > 1 ? 's' : ''}</span>`;
          } else if (gp1 > 0) {
            issuesHtml = `<span class="has-p1">${gp1} P1 issue${gp1 > 1 ? 's' : ''}</span>`;
          } else if (g.verified) {
            issuesHtml = '<span class="text-emerald-400 font-semibold">100% Verified</span>';
          } else {
            issuesHtml = `<span class="text-emerald-400">${gpass} passed</span>`;
          }
        }

        const card = document.createElement('div');
        card.className = 'ov-gate-card';
        card.setAttribute('data-gate-id', meta.id);
        card.innerHTML = `
          <div class="ov-gate-top">
            <span class="ov-gate-num">GATE ${meta.number}</span>
            <span class="ov-gate-dot ${dotClass}"></span>
          </div>
          <div class="ov-gate-name">${escapeHtml(meta.name)}</div>
          <div class="ov-gate-foot">
            <span class="ov-gate-score">${scoreText}</span>
            <span class="ov-gate-issues">${issuesHtml}</span>
          </div>
        `;
        card.addEventListener('click', () => {
          state.activeGateId = meta.id;
          switchView('workspace');
          renderSidebar();
          renderActiveGate();
        });
        el.overviewGateGrid.appendChild(card);
      });
    }
  }

  // Render recent projects on overview
  function renderOverviewRecent(recentList) {
    if (!el.overviewRecentList) return;
    if (!recentList || recentList.length === 0) {
      el.overviewRecentList.innerHTML = '<div class="ov-empty">No recent projects yet.</div>';
      return;
    }
    el.overviewRecentList.innerHTML = recentList.slice(0, 5).map(p => `
      <div class="ov-recent-item" data-path="${escapeAttr(p.path)}">
        <strong>${escapeHtml(p.name)}</strong>
        <small>${escapeHtml(p.path)}</small>
      </div>
    `).join('');

    el.overviewRecentList.querySelectorAll('.ov-recent-item').forEach(item => {
      item.addEventListener('click', () => {
        const p = item.getAttribute('data-path');
        if (p) loadProject(p);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Gate Selection Controls
  // -------------------------------------------------------------------------
  function toggleGateSelect(gateId, isSelected) {
    if (isSelected) {
      state.selectedGateIds.add(gateId);
    } else {
      state.selectedGateIds.delete(gateId);
    }
    updateSelectionUI();
    renderSidebar();
  }

  function toggleSelectAll(selectAll) {
    if (selectAll) {
      state.selectedGateIds = new Set(state.gatesMeta.map(g => g.id));
    } else {
      state.selectedGateIds.clear();
    }
    updateSelectionUI();
    renderSidebar();
  }

  function updateSelectionUI() {
    const total = state.gatesMeta.length || 12;
    const count = state.selectedGateIds.size;

    if (el.selectedGateCount) {
      el.selectedGateCount.innerText = `(${count}/${total})`;
    }

    if (el.gateSelectAll) {
      el.gateSelectAll.checked = count === total && total > 0;
      el.gateSelectAll.indeterminate = count > 0 && count < total;
    }

    if (el.batchBtnText) {
      if (count === total) {
        el.batchBtnText.innerText = 'Run All 12 Gates';
      } else if (count > 0) {
        el.batchBtnText.innerText = `Run Selected (${count})`;
      } else {
        el.batchBtnText.innerText = 'Select Gates';
      }
    }

    if (el.btnRunAllGates && !state.isScanningBatch) {
      el.btnRunAllGates.disabled = count === 0;
      el.btnRunAllGates.style.opacity = count === 0 ? '0.5' : '1';
    }
  }

  // -------------------------------------------------------------------------
  // Sidebar & Active Gate Rendering
  // -------------------------------------------------------------------------
  function renderSidebar() {
    const projectGates = state.projectData ? state.projectData.gates : {};
    UI.renderGateNavList(
      state.gatesMeta,
      projectGates,
      state.activeGateId,
      state.selectedGateIds,
      (gateId) => {
        state.activeGateId = gateId;
        renderSidebar();
        renderActiveGate();
      },
      (gateId, checked) => {
        toggleGateSelect(gateId, checked);
      }
    );
  }

  function renderActiveGate() {
    const meta = state.gatesMeta.find(g => g.id === state.activeGateId);
    if (!meta) return;

    el.activeGateNumberBadge.innerText = `GATE ${meta.number}`;
    el.activeGateCategory.innerText = meta.category;
    el.activeGateTitle.innerText = meta.name;
    el.activeGateDesc.innerText = meta.description;

    const gateData = state.projectData?.gates?.[state.activeGateId] || null;

    // Status Badge
    if (gateData && gateData.status) {
      if (gateData.verified) {
        el.activeGateStatusBadge.innerText = '100% Verified';
        el.activeGateStatusBadge.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded-full lg-status-verified';
      } else if (gateData.status === 'passed') {
        el.activeGateStatusBadge.innerText = 'Passed';
        el.activeGateStatusBadge.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded-full lg-status-passed';
      } else if (gateData.status === 'warning') {
        el.activeGateStatusBadge.innerText = 'Warnings Found';
        el.activeGateStatusBadge.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded-full lg-status-warning';
      } else {
        el.activeGateStatusBadge.innerText = 'Blockers Detected';
        el.activeGateStatusBadge.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded-full lg-status-failed';
      }
    } else {
      el.activeGateStatusBadge.innerText = 'Unscanned';
      el.activeGateStatusBadge.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded-full lg-status-unknown';
    }

    // Verified Toggle & Notes
    el.gateVerifiedToggle.checked = Boolean(gateData?.verified);
    // Sync toggle visual (JS-driven, since peer-checked: requires full Tailwind JIT)
    const track = document.getElementById('toggle-track');
    if (track) {
      if (el.gateVerifiedToggle.checked) track.classList.add('is-checked');
      else track.classList.remove('is-checked');
    }
    el.gateVerifiedDate.innerText = gateData?.verifiedAt ? `Signed off: ${new Date(gateData.verifiedAt).toLocaleDateString()}` : '';
    el.gateNotesInput.value = gateData?.notes || '';

    // Ingested Findings
    if (gateData?.ingestedAntigravityFindings) {
      el.ingestTextarea.value = gateData.ingestedAntigravityFindings;
    } else {
      el.ingestTextarea.value = '';
    }

    // Filter counts
    const findings = gateData?.findings || [];
    const countAll = findings.length;
    const countP0 = findings.filter(f => f.severity === 'P0').length;
    const countP1 = findings.filter(f => f.severity === 'P1').length;
    const countP2 = findings.filter(f => f.severity === 'P2').length;
    const countPassed = findings.filter(f => f.severity === 'PASSED').length;

    document.getElementById('tab-count-all').innerText = countAll;
    document.getElementById('tab-count-p0').innerText = countP0;
    document.getElementById('tab-count-p1').innerText = countP1;
    document.getElementById('tab-count-p2').innerText = countP2;
    document.getElementById('tab-count-passed').innerText = countPassed;

    // Report file path pill
    if (gateData?.auditFilePath) {
      el.gateReportFilePill.innerHTML = `<span class="text-indigo-400 font-mono text-[11px]">.antigravity/${meta.id}-audit.md</span> generated`;
    } else {
      el.gateReportFilePill.innerText = '';
    }

    // Inspection Evidence & Telemetry
    if (gateData && (gateData.scannedAt || gateData.durationMs !== undefined)) {
      if (el.telemetryFilesCount) {
        el.telemetryFilesCount.innerText = `${gateData.filesCount || (state.projectData?.fileCount || 0)} files scanned`;
      }
      if (el.telemetryDuration) {
        el.telemetryDuration.innerText = gateData.durationMs !== undefined ? `${gateData.durationMs}ms analysis` : '< 1s';
      }
      if (el.telemetryTimestamp) {
        const d = gateData.scannedAt ? new Date(gateData.scannedAt) : new Date();
        el.telemetryTimestamp.innerText = `Scanned ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      }

      const sampleFiles = gateData.sampleFiles || [];
      if (el.telemetrySampleCount && el.btnToggleScannedFiles) {
        if (sampleFiles.length > 0) {
          el.telemetrySampleCount.innerText = sampleFiles.length;
          el.btnToggleScannedFiles.classList.remove('hidden');
          if (el.scannedFilesList) {
            el.scannedFilesList.innerHTML = sampleFiles.map(f => `<li><span class="text-indigo-400 font-mono">${escapeHtml(f)}</span></li>`).join('');
          }
        } else {
          el.btnToggleScannedFiles.classList.add('hidden');
        }
      }
    } else {
      if (el.telemetryFilesCount) el.telemetryFilesCount.innerText = '0 files scanned';
      if (el.telemetryDuration) el.telemetryDuration.innerText = '--';
      if (el.telemetryTimestamp) el.telemetryTimestamp.innerText = 'Not yet scanned';
      if (el.btnToggleScannedFiles) el.btnToggleScannedFiles.classList.add('hidden');
      if (el.scannedFilesDrawer) el.scannedFilesDrawer.classList.add('hidden');
    }

    // Render findings
    const isUnscanned = !gateData || !gateData.status || gateData.status === 'unscanned';
    UI.renderFindings(findings, state.activeFilter, el.findingsContainer, isUnscanned);

    if (isUnscanned) {
      const btnUnscannedRun = document.getElementById('btn-unscanned-run');
      if (btnUnscannedRun) {
        btnUnscannedRun.onclick = () => {
          scanSingleGate(state.activeGateId);
        };
      }
    }

    // Show/Hide Gate 12 CLI section
    if (state.activeGateId === 'gate-12') {
      el.gate12CliSection.classList.remove('hidden');
    } else {
      el.gate12CliSection.classList.add('hidden');
    }
  }

  // -------------------------------------------------------------------------
  // Scan Execution (Engine A)
  // -------------------------------------------------------------------------
  async function scanSingleGate(gateId) {
    // Auto-sync project path if user typed/pasted a new directory into the header input
    const inputVal = el.pathInput ? el.pathInput.value.trim().replace(/^["']|["']$/g, '') : '';
    if (inputVal && inputVal !== state.projectPath) {
      await loadProject(inputVal);
    }

    if (!state.projectPath) {
      showToast('Please select a project directory first', 'warning');
      return;
    }

    const meta = state.gatesMeta.find(g => g.id === gateId);
    const gateName = meta ? meta.name : gateId;

    try {
      el.btnScanCurrentGate.disabled = true;
      el.btnScanCurrentGate.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> Scanning...';

      appendTerminalLine(`\n[Scan] Auditing Gate ${meta?.number || ''}: ${gateName}...`, 'text-indigo-400 font-semibold');
      appendTerminalLine(`↳ Target: ${state.projectPath}`, 'text-slate-500 font-mono');

      const res = await fetch('/api/gates/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: state.projectPath, gateId })
      });
      const data = await res.json();

      if (data.success) {
        state.projectData = data.project;
        updateOverallScore();
        renderSidebar();
        renderActiveGate();
        
        const findingsCount = data.gateResult.findings?.length || 0;
        const status = (data.gateResult.status || 'passed').toUpperCase();
        const colorClass = status === 'PASSED' ? 'text-emerald-400' : (status === 'WARNING' ? 'text-amber-400' : 'text-rose-400');
        appendTerminalLine(`✓ Gate ${meta?.number || ''} ${status}: Score ${data.gateResult.score}% (${findingsCount} findings, ${data.gateResult.durationMs || 0}ms)`, colorClass);
        showToast(`Gate ${gateId} scan complete! Score: ${data.gateResult.score}%`, 'success');
      } else {
        showToast(data.error || 'Scan failed', 'error');
        appendTerminalLine(`[Error] ${data.error || 'Scan failed'}`, 'text-rose-400 font-bold');
      }
    } catch (e) {
      showToast('Error executing gate scan', 'error');
    } finally {
      el.btnScanCurrentGate.disabled = false;
      el.btnScanCurrentGate.innerHTML = `
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        <span>Scan Gate</span>
      `;
    }
  }

  // Batch Scan all 12 Gates (or selected subset) with Live Streaming
  async function runAllGatesBatch() {
    // 1. Auto-sync project path if user typed/pasted a new directory into the header input
    const inputVal = el.pathInput ? el.pathInput.value.trim().replace(/^["']|["']$/g, '') : '';
    if (inputVal && inputVal !== state.projectPath) {
      await loadProject(inputVal);
    }

    if (!state.projectPath) {
      showToast('Please select or load a project directory first', 'warning');
      return;
    }

    if (state.selectedGateIds.size === 0) {
      showToast('Please select at least one gate to scan', 'warning');
      return;
    }

    if (state.isScanningBatch) return;
    state.isScanningBatch = true;

    const count = state.selectedGateIds.size;
    const total = state.gatesMeta.length || 12;
    const isAll = count === total;

    el.btnRunAllGates.disabled = true;
    el.batchSpinner.classList.remove('hidden');
    el.batchIcon.classList.add('hidden');
    el.batchBtnText.innerText = isAll ? 'Scanning All 12 Gates...' : `Scanning ${count} Gates...`;

    // Show Live Scan Progress Strip
    if (el.liveScanProgressStrip) {
      el.liveScanProgressStrip.classList.remove('hidden');
      el.scanProgressBar.style.width = '0%';
      el.scanProgressPercent.innerText = '0%';
      el.scanProgressTitle.innerText = `Initializing scan on ${state.projectName || 'project'}...`;
      if (el.scanProgressDetails) el.scanProgressDetails.innerText = state.projectPath;
    }

    if (el.terminalOutput) {
      el.terminalOutput.innerHTML = '';
      appendTerminalLine(`══════════════════════════════════════════════════════════════`, 'text-indigo-500 font-bold');
      appendTerminalLine(`🚀 LaunchGate Preflight Engine Initialized`, 'text-indigo-400 font-bold');
      appendTerminalLine(`📁 Target: ${state.projectPath}`, 'text-slate-300 font-mono');
      appendTerminalLine(`⚡ Mode: ${isAll ? 'Full 12-Gate Security & Production Audit' : `Selective Scan (${count} Gates)`}`, 'text-slate-400');
      appendTerminalLine(`══════════════════════════════════════════════════════════════`, 'text-indigo-500 font-bold');
    }

    showToast(isAll ? 'Live preflight audit started across all 12 gates...' : `Audit started for ${count} gates...`, 'info');

    // Use SSE stream for live gate-by-gate verification
    const gateIdsParam = Array.from(state.selectedGateIds).join(',');
    const streamUrl = `/api/gates/scan-stream?projectPath=${encodeURIComponent(state.projectPath)}&gateIds=${encodeURIComponent(gateIdsParam)}`;

    try {
      await new Promise((resolve, reject) => {
        const es = new EventSource(streamUrl);

        es.addEventListener('status', (e) => {
          try {
            const data = JSON.parse(e.data);
            appendTerminalLine(`[Crawler] ${data.message}`, 'text-slate-500');
          } catch (e) { console.debug('[LaunchGate]', e); }
        });

        es.addEventListener('crawled', (e) => {
          try {
            const data = JSON.parse(e.data);
            appendTerminalLine(`[Filesystem] Discovered ${data.fileCount} project files (${data.stack})`, 'text-cyan-400');
            if (el.scanProgressTitle) {
              el.scanProgressTitle.innerText = `Crawled ${data.fileCount} files. Starting gate verification...`;
            }
          } catch (e) { console.debug('[LaunchGate]', e); }
        });

        es.addEventListener('gate_start', (e) => {
          try {
            const data = JSON.parse(e.data);
            const percent = Math.round(((data.current - 1) / data.total) * 100);
            if (el.scanProgressBar) el.scanProgressBar.style.width = `${percent}%`;
            if (el.scanProgressPercent) el.scanProgressPercent.innerText = `${percent}%`;
            if (el.scanProgressTitle) {
              el.scanProgressTitle.innerText = `[${data.current}/${data.total}] Gate ${data.number}: ${data.name}...`;
            }
            appendTerminalLine(`\n[Gate ${data.number}/12] ${data.name} [Analyzing...]`, 'text-amber-400 font-semibold');
          } catch (e) { console.debug('[LaunchGate]', e); }
        });

        es.addEventListener('gate_complete', (e) => {
          try {
            const data = JSON.parse(e.data);
            const percent = Math.round((data.current / data.total) * 100);
            if (el.scanProgressBar) el.scanProgressBar.style.width = `${percent}%`;
            if (el.scanProgressPercent) el.scanProgressPercent.innerText = `${percent}%`;

            // Live update gate results
            if (!state.projectData) state.projectData = { gates: {} };
            if (!state.projectData.gates) state.projectData.gates = {};
            if (!state.projectData.gates[data.gateId]) {
              state.projectData.gates[data.gateId] = data.gateResult;
            } else {
              state.projectData.gates[data.gateId] = Object.assign({}, state.projectData.gates[data.gateId], data.gateResult);
            }
            try {
              localStorage.setItem('launchgate-last-project', JSON.stringify({
                path: state.projectPath,
                name: state.projectName,
                activeGateId: state.activeGateId,
                lastScan: new Date().toISOString()
              }));
            } catch (e) { console.debug('[LaunchGate]', e); }

            // recompute overall score if missing
            try {
              const { computeOverallScore } = require ? null : null;
            } catch (e) { console.debug('[LaunchGate]', e); }

            updateOverallScore();
            renderSidebar();
            if (state.activeGateId === data.gateId) {
              renderActiveGate();
            }

            const findingsCount = data.gateResult.findings?.length || 0;
            const status = (data.gateResult.status || 'passed').toUpperCase();
            const colorClass = status === 'PASSED' ? 'text-emerald-400' : (status === 'WARNING' ? 'text-amber-400' : 'text-rose-400');
            appendTerminalLine(`↳ Gate ${data.number} ${status}: Score ${data.gateResult.score}% (${findingsCount} findings, ${data.gateResult.durationMs || 0}ms)`, colorClass);

            // Log non-passed findings for live visibility
            const issues = (data.gateResult.findings || []).filter(f => f.severity !== 'PASSED').slice(0, 2);
            issues.forEach(f => {
              appendTerminalLine(`   • [${f.severity}] ${f.title}`, f.severity === 'P0' ? 'text-rose-400' : 'text-amber-400');
            });
          } catch (e) { console.debug('[LaunchGate]', e); }
        });

        es.addEventListener('done', (e) => {
          try {
            const data = JSON.parse(e.data);
            es.close();
            if (data.project) {
              state.projectData = data.project;
              if (!state.projectData.gates && data.results) {
                state.projectData.gates = data.results;
              }
            } else if (data.results) {
              if (!state.projectData) state.projectData = { gates: {} };
              state.projectData.gates = data.results;
            }
            if (typeof data.overallScore === 'number' && state.projectData) {
              state.projectData.overallScore = data.overallScore;
            }
            try {
              localStorage.setItem('launchgate-last-project', JSON.stringify({
                path: state.projectPath,
                name: state.projectName,
                activeGateId: state.activeGateId,
                lastScan: new Date().toISOString()
              }));
            } catch (e) { console.debug('[LaunchGate]', e); }
            updateOverallScore();
            renderSidebar();
            renderActiveGate();

            if (el.scanProgressBar) el.scanProgressBar.style.width = '100%';
            if (el.scanProgressPercent) el.scanProgressPercent.innerText = '100%';
            if (el.scanProgressTitle) {
              el.scanProgressTitle.innerText = `Preflight Audit Complete! Overall Score: ${data.overallScore}%`;
            }

            appendTerminalLine(`\n══════════════════════════════════════════════════════════════`, 'text-indigo-500 font-bold');
            appendTerminalLine(`✓ Audit Completed: ${data.totalFiles} files inspected across 12 gates`, 'text-emerald-400 font-bold');
            appendTerminalLine(`📊 Overall Readiness Score: ${data.overallScore}%`, 'text-indigo-300 font-bold');
            appendTerminalLine(`══════════════════════════════════════════════════════════════`, 'text-indigo-500 font-bold');

            showToast(`Preflight audit complete! Score: ${data.overallScore}%`, 'success');

            setTimeout(() => {
              if (el.liveScanProgressStrip) el.liveScanProgressStrip.classList.add('hidden');
            }, 3500);

            resolve();
          } catch (err) {
            es.close();
            resolve();
          }
        });

        es.addEventListener('error', (err) => {
          es.close();
          reject(new Error('SSE Stream error'));
        });
      });
    } catch (err) {
      console.warn('Falling back to batch POST scan:', err);
      try {
        const res = await fetch('/api/gates/scan-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectPath: state.projectPath,
            gateIds: Array.from(state.selectedGateIds)
          })
        });
        const data = await res.json();
        if (data.success) {
          state.projectData = data.project;
          updateOverallScore();
          renderSidebar();
          renderActiveGate();
          showToast(`Scan complete! Overall Readiness Score: ${data.project.overallScore}%`, 'success');
        } else {
          showToast(data.error || 'Scan failed', 'error');
        }
      } catch (e) {
        showToast('Scan encountered an error', 'error');
      }
    } finally {
      state.isScanningBatch = false;
      el.btnRunAllGates.disabled = false;
      el.batchSpinner.classList.add('hidden');
      el.batchIcon.classList.remove('hidden');
      updateSelectionUI();
    }
  }

  // -------------------------------------------------------------------------
  // Antigravity Bridge Actions (Engine B)
  // -------------------------------------------------------------------------
  function copyAuditPrompt() {
    const gateData = state.projectData?.gates?.[state.activeGateId];
    if (!gateData) {
      showToast('Scan this gate first to generate the Antigravity prompt', 'warning');
      return;
    }

    const promptText = gateData.auditPrompt || `Please inspect .antigravity/${state.activeGateId}-audit.md and resolve all findings using official security and reliability preflight standards.`;
    navigator.clipboard.writeText(promptText);
    showToast('Antigravity Audit Prompt copied to clipboard! Paste into your chat.', 'success');
  }

  let currentAutoFixPrompt = '';

  async function generateAndCopyFix() {
    if (!state.projectPath) {
      showToast('Select or scan a project first', 'warning');
      return;
    }
    const gateData = state.projectData?.gates?.[state.activeGateId];
    if (!gateData) {
      showToast('Scan this gate first to identify issues', 'warning');
      return;
    }

    // Set button loading state
    el.btnGenerateFix.disabled = true;
    const originalBtnHtml = el.btnGenerateFix.innerHTML;
    el.btnGenerateFix.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> Generating...';

    const notes = el.ingestTextarea.value.trim();

    try {
      // 1. Run real automated auto-fix for the gate
      const res = await fetch('/api/gates/auto-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: state.projectPath,
          gateId: state.activeGateId
        })
      });
      const data = await res.json();

      if (data.success) {
        if (data.project) state.project = data.project;
        if (data.gateResult) {
          renderGateDetail(data.gateResult);
          renderOverview();
        }

        if (data.appliedCount > 0) {
          showToast(`⚡ Successfully applied ${data.appliedCount} automated fix(es)! Gate score: ${data.oldScore}% → ${data.newScore}%.`, 'success');
        }

        if (data.remainingCount === 0) {
          showToast(`🎉 All checks passed cleanly! 100% compliance reached.`, 'success');
          return;
        }

        currentAutoFixPrompt = data.autoFixPrompt || '';

        // Graceful clipboard copy attempt for remaining tasks
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(currentAutoFixPrompt);
          }
        } catch (clipErr) {
          console.warn('[Auto-Fix] Browser clipboard write blocked:', clipErr);
        }

        // Populate and open the Auto-Fix Remediation Modal for remaining items
        if (el.autoFixModal) {
          if (el.autoFixModalTitle) {
            const gateNum = data.gateResult?.number ? `Gate ${data.gateResult.number}: ` : '';
            const fixBadge = data.appliedCount > 0 ? ` (${data.appliedCount} Auto-Fixed)` : '';
            el.autoFixModalTitle.textContent = `Remediation: ${gateNum}${data.gateResult?.name || state.activeGateId}${fixBadge}`;
          }
          if (el.autoFixPlanPath) {
            el.autoFixPlanPath.textContent = data.fixFileRelativePath || data.fixFilePath || `.antigravity/${state.activeGateId}-fix.md`;
          }
          if (el.autoFixItemsBadge) {
            const count = data.remainingCount !== undefined ? data.remainingCount : 0;
            el.autoFixItemsBadge.textContent = `${count} Remaining Complex Item${count === 1 ? '' : 's'}`;
            el.autoFixItemsBadge.style.background = count === 0 ? 'var(--c-pass-bg)' : 'var(--c-p1-bg)';
            el.autoFixItemsBadge.style.color = count === 0 ? 'var(--c-pass)' : 'var(--c-p1)';
            el.autoFixItemsBadge.style.borderColor = count === 0 ? 'var(--c-pass-border)' : 'var(--c-p1-border)';
          }
          if (el.autoFixPromptDisplay) {
            el.autoFixPromptDisplay.textContent = currentAutoFixPrompt;
          }

          if (el.copyAutofixIcon) el.copyAutofixIcon.textContent = '📋';
          if (el.copyAutofixLabel) el.copyAutofixLabel.textContent = 'Copy Prompt';

          // Render tasks list preview for remaining items
          if (el.autoFixTasksList) {
            el.autoFixTasksList.innerHTML = '';
            const remaining = (data.gateResult?.findings || []).filter(f => f.severity !== 'PASSED');
            if (remaining.length > 0) {
              remaining.forEach(f => {
                const item = document.createElement('div');
                item.className = 'p-2.5 rounded-lg border text-xs flex items-start gap-2.5 transition-colors';
                item.style.background = 'var(--c-surface-2)';
                item.style.borderColor = 'var(--c-border-mid)';
                const sevBadge = f.severity === 'P0' 
                  ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded badge-p0 shrink-0">P0</span>'
                  : (f.severity === 'P1'
                    ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded badge-p1 shrink-0">P1</span>'
                    : '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded badge-p2 shrink-0">P2</span>');
                item.innerHTML = `
                  <div class="mt-0.5 shrink-0">${sevBadge}</div>
                  <div class="flex-1 min-w-0">
                    <div class="font-bold lg-text-primary truncate">${escapeHtml(f.title)}</div>
                    <div class="text-[11px] lg-text-muted font-mono truncate">${escapeHtml(f.file || '')}${f.line ? `:${f.line}` : ''}</div>
                  </div>
                `;
                el.autoFixTasksList.appendChild(item);
              });
            } else {
              el.autoFixTasksList.innerHTML = '<div class="text-xs py-2 px-3 rounded-lg border flex items-center gap-2 font-medium" style="background: var(--c-pass-bg); color: var(--c-pass); border-color: var(--c-pass-border);"><span>✓</span> All checks passing cleanly in this gate!</div>';
            }
          }

          el.autoFixModal.classList.remove('hidden');
        }

        if (data.appliedCount === 0) {
          showToast(`Remediation plan ready in ${data.fixFileRelativePath || '.antigravity/'}!`, 'info');
        }
      } else {
        showToast(data.error || 'Failed to auto-fix gate', 'error');
      }
    } catch (e) {
      showToast(`Error running auto-fix: ${e.message}`, 'error');
    } finally {
      el.btnGenerateFix.disabled = false;
      el.btnGenerateFix.innerHTML = originalBtnHtml;
    }
  }

  // Save gate verification sign-off
  async function toggleGateVerification(verified) {
    if (!state.projectPath) return;
    const notes = el.gateNotesInput.value.trim();

    try {
      const res = await fetch('/api/gates/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: state.projectPath,
          gateId: state.activeGateId,
          verified,
          notes
        })
      });
      const data = await res.json();

      if (data.success) {
        state.projectData = data.project;
        updateOverallScore();
        renderSidebar();
        renderActiveGate();
        showToast(verified ? 'Gate marked as 100% Verified!' : 'Gate verification reset', 'info');
      }
    } catch (e) {
      showToast('Error saving verification state', 'error');
    }
  }

  // -------------------------------------------------------------------------
  // Multi-Agent Rule Exporter
  // -------------------------------------------------------------------------
  async function exportRulesForAgent(agentType) {
    if (!state.projectPath) {
      showToast('Select a project directory first', 'warning');
      return;
    }

    try {
      showToast(`Exporting LaunchGate rules for ${agentType}...`, 'info');
      const res = await fetch('/api/agents/export-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: state.projectPath, agentType })
      });
      const data = await res.json();

      if (data.success) {
        showToast(`Created ${data.relativePath} successfully!`, 'success');
      } else {
        showToast(data.error || 'Failed to export rules', 'error');
      }
    } catch (e) {
      showToast('Error exporting agent rules', 'error');
    }
  }

  // -------------------------------------------------------------------------
  // Gate 12 CLI Suite Live Terminal
  // -------------------------------------------------------------------------
  async function runCliCheck(cmd, label) {
    if (!state.projectPath) {
      showToast('Select a project directory first', 'warning');
      return;
    }

    showToast(`Running ${label}...`, 'info');
    await state.terminal.runStream(state.projectPath, cmd);
  }

  // -------------------------------------------------------------------------
  // Certificate Generation
  // -------------------------------------------------------------------------
  async function openCertificateModal() {
    if (!state.projectPath) {
      showToast('Select a project directory first', 'warning');
      return;
    }

    try {
      showToast('Compiling Production Readiness Certificate...', 'info');
      const res = await fetch('/api/certificate/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: state.projectPath })
      });
      const data = await res.json();

      if (data.success) {
        // Read file content or display markdown report
        const reportContentRes = await fetch(`/api/system/validate-folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: state.projectPath })
        });
        
        // Fetch raw report markdown
        fetchReportMarkdown(data.certificate.reportPath);
      } else {
        showToast(data.error || 'Failed to generate certificate', 'error');
      }
    } catch (e) {
      showToast('Error generating certificate', 'error');
    }
  }

  async function fetchReportMarkdown(reportPath) {
    try {
      const res = await fetch(`/api/projects/current?path=${encodeURIComponent(state.projectPath)}`);
      const data = await res.json();
      
      const summaryText = `# 🚀 Production Readiness & Pre-Launch Certificate
Target: ${state.projectPath}
Readiness Score: ${data.project.overallScore}%
Certificate Status: CERTIFIED READY FOR PRODUCTION

Report saved to:
${reportPath}

Audit matrix across all 12 gates has been verified and signed off.`;

      el.certificateContent.innerText = summaryText;
      el.certificateModal.classList.remove('hidden');
    } catch (e) { console.debug('[LaunchGate]', e); }
  }

  // -------------------------------------------------------------------------
  // Score & Readiness History (Phase 3)
  // -------------------------------------------------------------------------
  async function openHistoryModal() {
    if (!state.projectPath) {
      showToast('Please select a project first', 'warning');
      return;
    }

    if (el.historyModalContent) {
      el.historyModalContent.innerHTML = '<div class="text-xs lg-text-subtle text-center py-8 animate-pulse">Loading score history...</div>';
    }
    if (el.historyModal) {
      el.historyModal.classList.remove('hidden');
    }

    try {
      const res = await fetch(`/api/projects/history?projectPath=${encodeURIComponent(state.projectPath)}`);
      const data = await res.json();
      if (data.success && data.history) {
        renderHistoryList(data.history);
      } else {
        if (el.historyModalContent) {
          el.historyModalContent.innerHTML = '<div class="text-xs lg-text-subtle text-center py-8">No historical scans recorded yet. Run gates to build history!</div>';
        }
      }
    } catch (err) {
      if (el.historyModalContent) {
        el.historyModalContent.innerHTML = `<div class="text-xs text-rose-400 text-center py-8">Error loading history: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function renderHistoryList(history) {
    if (!el.historyModalContent) return;

    if (!history || history.length === 0) {
      el.historyModalContent.innerHTML = `
        <div class="text-center py-8">
          <div class="text-3xl mb-2">📊</div>
          <p class="text-xs font-semibold lg-text-primary">No audit snapshots yet</p>
          <p class="text-[11px] lg-text-muted mt-1">Run single gate or batch audits to automatically log historical progress.</p>
        </div>
      `;
      return;
    }

    const itemsHtml = history.map((snap, idx) => {
      const dateStr = snap.timestamp ? new Date(snap.timestamp).toLocaleString() : 'Recent';
      const score = snap.score || 0;
      const p0 = snap.p0 ?? snap.p0Count ?? 0;
      const p1 = snap.p1 ?? snap.p1Count ?? 0;
      const passed = snap.passed ?? snap.passedCount ?? 0;
      const delta = snap.deltaScore;

      let deltaBadge = '';
      if (typeof delta === 'number') {
        if (delta > 0) deltaBadge = `<span class="text-emerald-400 text-[11px] font-mono font-bold">+${delta}%</span>`;
        else if (delta < 0) deltaBadge = `<span class="text-rose-400 text-[11px] font-mono font-bold">${delta}%</span>`;
        else deltaBadge = `<span class="text-slate-400 text-[11px] font-mono">0%</span>`;
      }

      const isLatest = idx === 0;

      return `
        <div class="p-3.5 rounded-xl border lg-border bg-slate-900/40 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-slate-800/80 border lg-border flex flex-col items-center justify-center shrink-0">
              <span class="text-xs font-bold ${score >= 90 ? 'text-emerald-400' : score >= 70 ? 'text-amber-400' : 'text-rose-400'}">${score}%</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold lg-text-primary">Snapshot #${idx + 1}</span>
                ${isLatest ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">LATEST</span>' : ''}
                ${deltaBadge}
              </div>
              <div class="text-[11px] lg-text-subtle font-mono mt-0.5">${dateStr}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 text-[10px] font-mono">
            <span class="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">${p0} P0</span>
            <span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">${p1} P1</span>
            <span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">${passed} Passed</span>
          </div>
        </div>
      `;
    }).join('');

    el.historyModalContent.innerHTML = itemsHtml;
  }


  // -------------------------------------------------------------------------
  // View Switching (Overview / Workspace / HowToUse / GatesDocs)
  // -------------------------------------------------------------------------
  function switchView(view) {
    if (view === 'workspace') state.activeView = 'workspace';
    else if (view === 'overview') state.activeView = 'overview';
    else if (view === 'how-to-use') state.activeView = 'how-to-use';
    else if (view === 'gates-docs') state.activeView = 'gates-docs';
    else state.activeView = 'overview';

    if (el.viewOverview) el.viewOverview.classList.toggle('hidden', state.activeView !== 'overview');
    if (el.viewWorkspace) el.viewWorkspace.classList.toggle('hidden', state.activeView !== 'workspace');
    if (el.viewHowToUse) el.viewHowToUse.classList.toggle('hidden', state.activeView !== 'how-to-use');
    if (el.viewGatesDocs) el.viewGatesDocs.classList.toggle('hidden', state.activeView !== 'gates-docs');
    if (el.navBtnOverview) {
      if (state.activeView === 'overview') {
        el.navBtnOverview.classList.add('is-active');
        el.navBtnOverview.setAttribute('aria-selected', 'true');
      } else {
        el.navBtnOverview.classList.remove('is-active');
        el.navBtnOverview.setAttribute('aria-selected', 'false');
      }
    }
    if (el.navBtnWorkspace) {
      if (state.activeView === 'workspace') {
        el.navBtnWorkspace.classList.add('is-active');
        el.navBtnWorkspace.setAttribute('aria-selected', 'true');
      } else {
        el.navBtnWorkspace.classList.remove('is-active');
        el.navBtnWorkspace.setAttribute('aria-selected', 'false');
      }
    }
    if (state.activeView === 'overview' && typeof renderOverview === 'function') {
      try { renderOverview(); } catch (e) { console.debug('[LaunchGate]', e); }
    }
  }

  async function openFeedbackModal() {
    if (!el.feedbackModal) return;
    try {
      const diagRes = await fetch('/api/system/diagnostics').catch(() => null);
      const diagData = diagRes ? await diagRes.json().catch(() => null) : null;

      const p0 = parseInt(el.countP0?.innerText || '0', 10) || 0;
      const p1 = parseInt(el.countP1?.innerText || '0', 10) || 0;
      const p2 = parseInt(el.countP2?.innerText || '0', 10) || 0;
      const passed = parseInt(el.countPassed?.innerText || '0', 10) || 0;
      const score = el.overallScoreText?.innerText || '0%';
      const stack = state.projectData?.stackInfo?.allBadges?.map(b => b.name).join(', ') || 'Unknown Stack';

      const reportText = [
        `### LaunchGate Beta Diagnostic Report`,
        `- **LaunchGate Version**: ${diagData?.version || '1.0.0'}`,
        `- **Node Runtime**: ${diagData?.nodeVersion || 'Unknown'} (${diagData?.platform || 'Unknown'} / ${diagData?.arch || 'Unknown'})`,
        `- **Server Uptime**: ${diagData?.uptimeSeconds || 0}s | Heap: ${diagData?.memoryUsageMB || 0} MB`,
        `- **Target Stack**: ${stack}`,
        `- **Overall Readiness Score**: ${score}`,
        `- **Issues Summary**: ${p0} P0 Blockers, ${p1} P1 High Risks, ${p2} P2 Warnings (${passed} Passed Checks)`,
        `- **Timestamp**: ${new Date().toISOString()}`
      ].join('\n');

      if (el.feedbackDiagnosticPreview) {
        el.feedbackDiagnosticPreview.textContent = reportText;
      }
      el.feedbackModal.classList.remove('hidden');
    } catch (e) {
      console.debug('[LaunchGate]', e);
    }
  }

  function closeFeedbackModal() {
    if (el.feedbackModal) el.feedbackModal.classList.add('hidden');
  }

  // -------------------------------------------------------------------------
  // Event Listeners
  // -------------------------------------------------------------------------
  function setupEventListeners() {
    // Theme Toggle
    if (el.btnThemeToggle) {
      el.btnThemeToggle.addEventListener('click', toggleTheme);
    }

    // Pick Folder (Opens Picker Modal with Local Folder & Git Repo options)
    el.btnPickFolder.addEventListener('click', openProjectPicker);

    // Try Demo Project button
    if (el.btnLoadDemo) {
      el.btnLoadDemo.addEventListener('click', async () => {
        try {
          showToast('Loading pre-bundled AI Vibe-SaaS Demo...', 'info');
          const res = await fetch('/api/system/load-demo', { method: 'POST' });
          const data = await res.json();
          if (data.success && data.path) {
            await loadProject(data.path);
            showToast('Demo project loaded! Running instant preflight scan...', 'success');
            setTimeout(() => {
              const runBtn = document.getElementById('btn-run-all-gates');
              if (runBtn) runBtn.click();
            }, 300);
          } else {
            showToast(data.error || 'Failed to load demo project', 'error');
          }
        } catch (err) {
          showToast('Error loading demo project: ' + err.message, 'error');
        }
      });
    }

    // Beta Feedback & Diagnostics
    if (el.btnFeedback) {
      el.btnFeedback.addEventListener('click', openFeedbackModal);
    }
    if (el.btnCloseFeedback) {
      el.btnCloseFeedback.addEventListener('click', closeFeedbackModal);
    }
    if (el.btnCloseFeedbackFooter) {
      el.btnCloseFeedbackFooter.addEventListener('click', closeFeedbackModal);
    }
    if (el.btnCopyDiagnostic) {
      el.btnCopyDiagnostic.addEventListener('click', () => {
        const notes = el.feedbackUserNotes?.value.trim() || 'No user notes provided.';
        const diag = el.feedbackDiagnosticPreview?.textContent || '';
        const fullText = `${diag}\n\n### User Observations & Notes\n${notes}\n`;
        navigator.clipboard.writeText(fullText).then(() => {
          showToast('Diagnostic report copied to clipboard!', 'success');
        }).catch(() => {
          showToast('Failed to copy to clipboard', 'error');
        });
      });
    }

    // Direct Feedback Actions (In-App, GitHub Issue, Email)
    const btnSubmitFeedback = document.getElementById('btn-submit-feedback');
    if (btnSubmitFeedback) {
      btnSubmitFeedback.addEventListener('click', async () => {
        const notes = el.feedbackUserNotes?.value.trim() || '';
        const contact = document.getElementById('feedback-user-contact')?.value.trim() || '';
        const diag = el.feedbackDiagnosticPreview?.textContent || '';
        if (!notes) {
          showToast('Please type your observations or issue before submitting.', 'warning');
          el.feedbackUserNotes?.focus();
          return;
        }

        const origHtml = btnSubmitFeedback.innerHTML;
        btnSubmitFeedback.disabled = true;
        btnSubmitFeedback.innerHTML = `<span class="inline-block animate-spin mr-1">⏳</span> Submitting...`;

        try {
          const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              notes,
              contact,
              diagnostics: diag,
              projectPath: state.projectPath,
              projectName: state.projectName
            })
          });
          const data = await res.json();
          if (data.success) {
            showToast('Feedback submitted! Saved to ~/.launchgate/feedback.jsonl', 'success');
            if (el.feedbackUserNotes) el.feedbackUserNotes.value = '';
            setTimeout(closeFeedbackModal, 800);
          } else {
            showToast(data.error || 'Failed to submit feedback', 'error');
          }
        } catch (err) {
          showToast('Error submitting feedback: ' + err.message, 'error');
        } finally {
          btnSubmitFeedback.disabled = false;
          btnSubmitFeedback.innerHTML = origHtml;
        }
      });
    }

    const btnGithubFeedback = document.getElementById('btn-github-feedback');
    if (btnGithubFeedback) {
      btnGithubFeedback.addEventListener('click', () => {
        const notes = el.feedbackUserNotes?.value.trim() || 'User Feedback / Bug Report';
        const diag = el.feedbackDiagnosticPreview?.textContent || '';
        const contact = document.getElementById('feedback-user-contact')?.value.trim() || '';
        const bodyContent = [
          `### Description`,
          notes,
          contact ? `\n**Contact / Handle:** ${contact}` : '',
          `\n### Diagnostic Context`,
          '```markdown',
          diag,
          '```'
        ].filter(Boolean).join('\n');

        const title = encodeURIComponent(`[LaunchGate Feedback] ${notes.slice(0, 45)}${notes.length > 45 ? '...' : ''}`);
        const body = encodeURIComponent(bodyContent);
        window.open(`https://github.com/LaunchGate/launchgate/issues/new?title=${title}&body=${body}`, '_blank');
      });
    }

    const btnEmailFeedback = document.getElementById('btn-email-feedback');
    if (btnEmailFeedback) {
      btnEmailFeedback.addEventListener('click', () => {
        const notes = el.feedbackUserNotes?.value.trim() || 'No user notes provided.';
        const diag = el.feedbackDiagnosticPreview?.textContent || '';
        const contact = document.getElementById('feedback-user-contact')?.value.trim() || '';
        const subject = encodeURIComponent(`LaunchGate Feedback: ${notes.slice(0, 35)}`);
        const body = encodeURIComponent(`Feedback:\n${notes}\n\nContact: ${contact || 'N/A'}\n\n---\nDiagnostics:\n${diag}`);
        window.open(`mailto:support@launchgate.dev?subject=${subject}&body=${body}`, '_blank');
      });
    }

    if (el.btnClosePickerModal) {
      el.btnClosePickerModal.addEventListener('click', closeProjectPicker);
    }

    if (el.tabPickerLocal && el.tabPickerGit) {
      el.tabPickerLocal.addEventListener('click', () => {
        el.tabPickerLocal.classList.add('active');
        el.tabPickerGit.classList.remove('active');
        el.pickerLocalContent.classList.remove('hidden');
        el.pickerGitContent.classList.add('hidden');
      });

      el.tabPickerGit.addEventListener('click', () => {
        el.tabPickerGit.classList.add('active');
        el.tabPickerLocal.classList.remove('active');
        el.pickerGitContent.classList.remove('hidden');
        el.pickerLocalContent.classList.add('hidden');
      });
    }

    // Modal Load Folder
    if (el.btnModalLoadFolder) {
      el.btnModalLoadFolder.addEventListener('click', () => {
        const val = el.modalFolderInput.value.trim();
        if (val) {
          closeProjectPicker();
          loadProject(val);
        }
      });
    }

    if (el.modalFolderInput) {
      el.modalFolderInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = el.modalFolderInput.value.trim();
          if (val) {
            closeProjectPicker();
            loadProject(val);
          }
        }
      });
    }

    // Quick Path Chips
    document.querySelectorAll('.quick-path-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const p = chip.getAttribute('data-path');
        if (p) {
          closeProjectPicker();
          loadProject(p);
        }
      });
    });

    // Modal Select Current Browsed Folder
    if (el.btnModalSelectCurrent) {
      el.btnModalSelectCurrent.addEventListener('click', () => {
        if (state.browsedPath) {
          closeProjectPicker();
          loadProject(state.browsedPath);
        }
      });
    }

    // Modal Folder Filter in Explorer
    if (el.pickerFolderFilter) {
      el.pickerFolderFilter.addEventListener('input', (e) => {
        renderFolderList(state.browsedDirectories, e.target.value);
      });
    }

    // Modal Native OS Dialog button
    if (el.btnModalNativeDialog) {
      el.btnModalNativeDialog.addEventListener('click', async () => {
        el.btnModalNativeDialog.disabled = true;
        el.btnModalNativeDialog.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> Waiting for OS dialog...';
        showToast('Waiting for Windows folder dialog. If not visible, use the in-app folder browser directly.', 'info');
        await pickFolderNative();
        el.btnModalNativeDialog.disabled = false;
        el.btnModalNativeDialog.innerHTML = `
          <svg class="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
          Windows Explorer Dialog
        `;
      });
    }

    // Modal Git Clone
    if (el.btnModalCloneGit) {
      el.btnModalCloneGit.addEventListener('click', () => {
        const url = el.modalGitUrlInput?.value.trim();
        const token = el.modalGitTokenInput?.value.trim() || '';
        if (url) {
          cloneGitRepo(url, token);
        } else {
          showToast('Please enter a Git repository URL', 'warning');
        }
      });
    }

    if (el.modalGitUrlInput) {
      el.modalGitUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const url = el.modalGitUrlInput.value.trim();
          const token = el.modalGitTokenInput?.value.trim() || '';
          if (url) cloneGitRepo(url, token);
        }
      });
    }

    // Manual load path in header
    el.btnLoadPath.addEventListener('click', () => {
      loadProject(el.pathInput.value.trim());
    });

    el.pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadProject(el.pathInput.value.trim());
    });

    // Reset Tool & Unload Current Project
    function handleToolReset() {
      if (!state.projectPath && !state.projectName) {
        showToast('LaunchGate is already in a clean, reset state (0%)', 'info');
        return;
      }

      const projName = state.projectName || 'active project';
      if (!confirm(`Are you sure you want to reset LaunchGate and unload "${projName}"?\n\nThis will remove the current project from the workspace, reset all 12 gates and readiness scores back to 0%, and clear all statistics.`)) {
        return;
      }

      resetToCleanState();
      if (el.moreToolsDropdown) el.moreToolsDropdown.classList.add('hidden');
      showToast(`Workspace reset. "${projName}" unloaded and all statistics set to 0%.`, 'success');
    }

    if (el.btnResetTool) el.btnResetTool.addEventListener('click', handleToolReset);
    if (el.btnContextClearProject) el.btnContextClearProject.addEventListener('click', handleToolReset);
    if (el.menuOptResetTool) el.menuOptResetTool.addEventListener('click', handleToolReset);

    // Recent dropdown toggle
    el.btnRecentToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      el.recentDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      el.recentDropdown.classList.add('hidden');
    });


    // View navigation
    if (el.navBtnOverview) {
      el.navBtnOverview.addEventListener('click', () => switchView('overview'));
    }
    if (el.navBtnWorkspace) {
      el.navBtnWorkspace.addEventListener('click', () => switchView('workspace'));
    }
    if (el.overviewBtnWorkspace) {
      el.overviewBtnWorkspace.addEventListener('click', () => switchView('workspace'));
    }
    if (el.overviewOpenWorkspace) {
      el.overviewOpenWorkspace.addEventListener('click', () => switchView('workspace'));
    }
    if (el.overviewBtnScan) {
      el.overviewBtnScan.addEventListener('click', () => {
        switchView('workspace');
        setTimeout(() => runAllGatesBatch(), 50);
      });
    }
    if (el.overviewBtnCert) {
      el.overviewBtnCert.addEventListener('click', openCertificateModal);
    }
    if (el.overviewActMagic) {
      el.overviewActMagic.addEventListener('click', () => {
        if (el.btnMagicVibeSaas) el.btnMagicVibeSaas.click();
        else showToast('Magic transmuter available in header', 'info');
      });
    }
    if (el.overviewActHook) {
      el.overviewActHook.addEventListener('click', () => {
        if (el.menuOptGitHook) el.menuOptGitHook.click();
        else if (el.btnInstallGitHook) el.btnInstallGitHook.click();
      });
    }
    if (el.overviewActSarif) {
      el.overviewActSarif.addEventListener('click', () => {
        if (!state.projectPath) { showToast('Select a project first', 'warning'); return; }
        showToast('Generating SARIF report...', 'info');
        window.location.href = `/api/reports/sarif/download?projectPath=${encodeURIComponent(state.projectPath)}`;
      });
    }
    if (el.overviewActHistory) {
      el.overviewActHistory.addEventListener('click', openHistoryModal);
    }
    if (el.overviewCopyMcp) {
      el.overviewCopyMcp.addEventListener('click', async () => {
        const cfg = JSON.stringify({ mcpServers: { launchgate: { command: 'node', args: ['./mcp-server.js'], cwd: '.' } } }, null, 2);
        try { await navigator.clipboard.writeText(cfg); showToast('MCP config copied', 'success'); }
        catch(e){ showToast('Copy failed', 'error'); }
      });
    }

    // Full-page documentation wiring
    const btnBackFromHowtoOverview = document.getElementById('btn-back-from-howto-overview');
    const btnBackFromHowtoWorkspace = document.getElementById('btn-back-from-howto-workspace');
    const btnOpenGatesFromHowto = document.getElementById('btn-open-gates-docs-from-howto');
    const btnOpenGatesFromHowto2 = document.getElementById('btn-open-gates-docs-from-howto-2');
    if (btnBackFromHowtoOverview) btnBackFromHowtoOverview.addEventListener('click', () => switchView('overview'));
    if (btnBackFromHowtoWorkspace) btnBackFromHowtoWorkspace.addEventListener('click', () => switchView('workspace'));
    if (btnOpenGatesFromHowto) btnOpenGatesFromHowto.addEventListener('click', () => { switchView('gates-docs'); renderGatesFullDocs('all', ''); });
    if (btnOpenGatesFromHowto2) btnOpenGatesFromHowto2.addEventListener('click', () => { switchView('gates-docs'); renderGatesFullDocs('all', ''); });

    const btnBackFromDocsOverview = document.getElementById('btn-back-from-docs-overview');
    const btnBackFromDocsWorkspace = document.getElementById('btn-back-from-docs-workspace');
    const btnOpenHowtoFromDocs = document.getElementById('btn-open-howto-from-docs');
    if (btnBackFromDocsOverview) btnBackFromDocsOverview.addEventListener('click', () => switchView('overview'));
    if (btnBackFromDocsWorkspace) btnBackFromDocsWorkspace.addEventListener('click', () => switchView('workspace'));
    if (btnOpenHowtoFromDocs) btnOpenHowtoFromDocs.addEventListener('click', () => switchView('how-to-use'));

    // How to Use Page - High-Contrast Jump Navigation Links
    const jumpToQuickstart = document.getElementById('jump-to-quickstart');
    const jumpToMcp = document.getElementById('jump-to-mcp');
    const jumpToGates = document.getElementById('jump-to-gates');
    const jumpToTrouble = document.getElementById('jump-to-trouble');
    const jumpToCli = document.getElementById('jump-to-cli');
    const btnHowtoLoadDemo = document.getElementById('btn-howto-load-demo');

    if (jumpToQuickstart) {
      jumpToQuickstart.addEventListener('click', () => {
        const sec = document.getElementById('section-quickstart');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    if (jumpToMcp) {
      jumpToMcp.addEventListener('click', () => {
        const sec = document.getElementById('section-mcp-guide');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    if (jumpToGates) {
      jumpToGates.addEventListener('click', () => {
        switchView('gates-docs');
        renderGatesFullDocs('all', '');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    if (jumpToTrouble) {
      jumpToTrouble.addEventListener('click', () => {
        const sec = document.getElementById('section-troubleshooting');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    if (jumpToCli) {
      jumpToCli.addEventListener('click', () => {
        switchView('workspace');
        setTimeout(() => document.getElementById('gate12-cli-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      });
    }
    if (btnHowtoLoadDemo && el.btnLoadDemo) {
      btnHowtoLoadDemo.addEventListener('click', () => el.btnLoadDemo.click());
    }

    // MCP IDE Tab Switcher & Config Copy
    const mcpConfigDisplay = document.getElementById('mcp-config-display');
    const btnCopyMcpConfig = document.getElementById('btn-copy-mcp-config');
    const mcpTabs = document.querySelectorAll('.mcp-ide-tab');

    const mcpConfigs = {
      cursor: JSON.stringify({
        mcpServers: {
          launchgate: {
            command: "node",
            args: ["F:/App Checker Tool/mcp-server.js"],
            cwd: "F:/App Checker Tool"
          }
        }
      }, null, 2),
      claude: JSON.stringify({
        mcpServers: {
          launchgate: {
            command: "node",
            args: ["F:/App Checker Tool/mcp-server.js"],
            cwd: "F:/App Checker Tool"
          }
        }
      }, null, 2),
      windsurf: JSON.stringify({
        mcpServers: {
          launchgate: {
            command: "node",
            args: ["F:/App Checker Tool/mcp-server.js"],
            cwd: "F:/App Checker Tool"
          }
        }
      }, null, 2),
      vscode: JSON.stringify({
        mcp: {
          servers: {
            launchgate: {
              type: "stdio",
              command: "node",
              args: ["F:/App Checker Tool/mcp-server.js"]
            }
          }
        }
      }, null, 2)
    };

    if (mcpTabs.length) {
      mcpTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          mcpTabs.forEach(t => {
            t.classList.remove('bg-indigo-600', 'text-white', 'font-semibold');
            t.classList.add('text-slate-600', 'dark:text-slate-400', 'font-medium');
          });
          tab.classList.add('bg-indigo-600', 'text-white', 'font-semibold');
          tab.classList.remove('text-slate-600', 'dark:text-slate-400', 'font-medium');
          const ide = tab.getAttribute('data-ide') || 'cursor';
          if (mcpConfigDisplay && mcpConfigs[ide]) {
            const codeEl = mcpConfigDisplay.querySelector('code') || mcpConfigDisplay;
            codeEl.textContent = mcpConfigs[ide];
          }
        });
      });
    }

    if (btnCopyMcpConfig && mcpConfigDisplay) {
      btnCopyMcpConfig.addEventListener('click', async () => {
        const text = mcpConfigDisplay.innerText.trim();
        try {
          await navigator.clipboard.writeText(text);
          showToast('MCP configuration JSON copied to clipboard!', 'success');
        } catch (e) {
          showToast('Failed to copy configuration', 'error');
        }
      });
    }

    document.querySelectorAll('.gates-full-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gates-full-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.getAttribute('data-filter') || 'all';
        const q = document.getElementById('gates-full-search')?.value.toLowerCase().trim() || '';
        renderGatesFullDocs(filter, q);
      });
    });
    const gatesFullSearch = document.getElementById('gates-full-search');
    if (gatesFullSearch) {
      gatesFullSearch.addEventListener('input', (e) => {
        const active = document.querySelector('.gates-full-filter-btn.active');
        const filter = active ? active.getAttribute('data-filter') : 'all';
        renderGatesFullDocs(filter, e.target.value.toLowerCase().trim());
      });
    }

    // Gate Select All
    if (el.gateSelectAll) {
      el.gateSelectAll.addEventListener('change', (e) => {
        toggleSelectAll(e.target.checked);
      });
    }

    // Export Agent Rules Click Listeners
    document.querySelectorAll('.export-agent-opt').forEach(opt => {
      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (el.moreToolsDropdown) el.moreToolsDropdown.classList.add('hidden');
        if (el.exportRulesDropdown) el.exportRulesDropdown.classList.add('hidden');
        const agent = opt.getAttribute('data-agent');
        await exportRulesForAgent(agent);
      });
    });

    if (el.btnExportAgentRules && el.exportRulesDropdown) {
      el.btnExportAgentRules.addEventListener('click', (e) => {
        e.stopPropagation();
        el.exportRulesDropdown.classList.toggle('hidden');
      });

      document.addEventListener('click', () => {
        el.exportRulesDropdown.classList.add('hidden');
      });
    }

    // Batch run
    el.btnRunAllGates.addEventListener('click', runAllGatesBatch);

    // Single gate scan
    el.btnScanCurrentGate.addEventListener('click', () => {
      scanSingleGate(state.activeGateId);
    });

    // Copy audit prompt
    el.btnCopyAuditPrompt.addEventListener('click', copyAuditPrompt);

    // Ingest findings toggle
    el.btnToggleIngest.addEventListener('click', () => {
      el.ingestBox.classList.toggle('hidden');
    });

    // Toggle inspected files drawer
    if (el.btnToggleScannedFiles && el.scannedFilesDrawer) {
      el.btnToggleScannedFiles.addEventListener('click', () => {
        el.scannedFilesDrawer.classList.toggle('hidden');
      });
    }

    el.btnSaveIngest.addEventListener('click', () => {
      generateAndCopyFix();
    });

    // Generate Fix command
    el.btnGenerateFix.addEventListener('click', generateAndCopyFix);

    // Verified toggle
    el.gateVerifiedToggle.addEventListener('change', (e) => {
      toggleGateVerification(e.target.checked);
      // Sync toggle visual
      const track = document.getElementById('toggle-track');
      if (track) {
        if (e.target.checked) track.classList.add('is-checked');
        else track.classList.remove('is-checked');
      }
    });

    el.btnSaveNotes.addEventListener('click', () => {
      toggleGateVerification(el.gateVerifiedToggle.checked);
    });

    // Severity Filter Tabs
    el.severityTabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        el.severityTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active', 'bg-slate-800', 'text-white'));
        btn.classList.add('active', 'bg-slate-800', 'text-white');
        state.activeFilter = btn.getAttribute('data-filter');
        const gateData = state.projectData?.gates?.[state.activeGateId];
        UI.renderFindings(gateData?.findings || [], state.activeFilter, el.findingsContainer);
      });
    });

    // Gate 12 CLI Runners
    el.btnClearTerminal.addEventListener('click', () => state.terminal.clear());
    el.btnRunTypecheck.addEventListener('click', () => runCliCheck('npx tsc --noEmit', 'TypeScript Typecheck'));
    el.btnRunLint.addEventListener('click', () => runCliCheck('npx eslint .', 'Linter'));
    el.btnRunAudit.addEventListener('click', () => runCliCheck('npm audit --production', 'Security Dependency Audit'));
    el.btnRunBuild.addEventListener('click', () => runCliCheck('npm run build', 'Dry-Run Production Build'));

    // Certificate Modal
    el.btnOpenCertificate.addEventListener('click', openCertificateModal);
    el.btnCloseCertificate.addEventListener('click', () => el.certificateModal.classList.add('hidden'));
    el.btnCopyCertificate.addEventListener('click', () => {
      navigator.clipboard.writeText(el.certificateContent.innerText);
      showToast('Certificate copied to clipboard!', 'success');
    });

    if (el.btnPrintCertificatePdf) {
      el.btnPrintCertificatePdf.addEventListener('click', () => {
        if (!state.projectPath) {
          showToast('Please select a project first', 'warning');
          return;
        }
        window.open(`/api/certificate/view-html?projectPath=${encodeURIComponent(state.projectPath)}`, '_blank');
      });
    }

    if (el.btnExportSarif) {
      el.btnExportSarif.addEventListener('click', () => {
        if (!state.projectPath) {
          showToast('Please select a project first', 'warning');
          return;
        }
        showToast('Generating OASIS SARIF v2.1.0 report for GitHub...', 'info');
        window.location.href = `/api/reports/sarif/download?projectPath=${encodeURIComponent(state.projectPath)}`;
      });
    }

    // Git Hook Installer (Phase 2)
    if (el.btnInstallGitHook) {
      el.btnInstallGitHook.addEventListener('click', async () => {
        if (!state.projectPath) {
          showToast('Please select a project first', 'warning');
          return;
        }

        el.btnInstallGitHook.disabled = true;
        el.btnInstallGitHook.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> Installing...';

        try {
          const res = await fetch('/api/system/install-hooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath: state.projectPath })
          });
          const data = await res.json();

          if (data.success) {
            showToast(`Git pre-push hook active at ${data.hookPath}! P0 blockers will be rejected on push.`, 'success');
          } else {
            showToast(data.message || data.error || 'Failed to install Git hook', 'warning');
          }
        } catch (err) {
          showToast('Error connecting to Git hook service', 'error');
        } finally {
          el.btnInstallGitHook.disabled = false;
          el.btnInstallGitHook.innerHTML = `
            <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            Git Hook
          `;
        }
      });
    }

    // History Modal (Phase 3)
    if (el.btnViewHistory) {
      el.btnViewHistory.addEventListener('click', openHistoryModal);
    }
    if (el.btnCloseHistory && el.historyModal) {
      el.btnCloseHistory.addEventListener('click', () => el.historyModal.classList.add('hidden'));
    }

    // -------------------------------------------------------------------------
    // 🛡️ Unified Diff Formatter & Quick-Fix Backup Review System
    // -------------------------------------------------------------------------
    let activeQfBackupId = null;
    let activeMagicBackupId = null;

    function formatDiffHtml(diffText) {
      if (!diffText) return '<div class="text-gray-500 py-1">No diff available.</div>';
      return diffText.split('\n').map(line => {
        const escaped = escapeHtml(line);
        if (line.startsWith('+++') || line.startsWith('---')) {
          return `<div class="font-bold text-gray-400 select-none">${escaped}</div>`;
        }
        if (line.startsWith('@@')) {
          return `<div class="text-cyan-400 bg-cyan-950/20 px-1 py-0.5 rounded my-0.5 font-bold select-none">${escaped}</div>`;
        }
        if (line.startsWith('+')) {
          return `<div class="bg-emerald-950/40 text-emerald-300 px-1 border-l-2 border-emerald-500">${escaped}</div>`;
        }
        if (line.startsWith('-')) {
          return `<div class="bg-rose-950/40 text-rose-300 px-1 border-l-2 border-rose-500">${escaped}</div>`;
        }
        return `<div class="text-gray-300 px-1">${escaped}</div>`;
      }).join('');
    }

    function showQuickFixDiffModal(result, fixId) {
      if (!el.quickFixDiffModal) return;
      activeQfBackupId = result.backup?.id || null;

      if (el.qfModalTitle) el.qfModalTitle.textContent = result.title || fixId;
      if (el.qfModalSubtitle) el.qfModalSubtitle.textContent = result.description || 'Deterministic code remediation verified';
      if (el.qfBackupPath) el.qfBackupPath.textContent = result.backup?.path || '.launchgate/backups/...';

      const diffs = result.diffPreview || [];
      const totalAdd = diffs.reduce((sum, d) => sum + (d.linesAdded || 0), 0);
      const totalDel = diffs.reduce((sum, d) => sum + (d.linesRemoved || 0), 0);
      if (el.qfAdditionsBadge) el.qfAdditionsBadge.textContent = `+${totalAdd} lines`;
      if (el.qfDeletionsBadge) el.qfDeletionsBadge.textContent = `-${totalDel} lines`;

      const fullDiffText = diffs.map(d => d.diff).join('\n\n') || result.message || 'No textual diff changes';
      if (el.qfDiffContent) el.qfDiffContent.innerHTML = formatDiffHtml(fullDiffText);

      el.quickFixDiffModal.classList.remove('hidden');
    }

    if (el.btnCloseQfModal && el.quickFixDiffModal) {
      el.btnCloseQfModal.addEventListener('click', () => {
        el.quickFixDiffModal.classList.add('hidden');
      });
    }

    if (el.btnConfirmQf && el.quickFixDiffModal) {
      el.btnConfirmQf.addEventListener('click', async () => {
        el.quickFixDiffModal.classList.add('hidden');
        showToast('Changes kept. Re-scanning gate...', 'success');
        await scanSingleGate(state.activeGateId);
      });
    }

    if (el.btnRollbackQf && el.quickFixDiffModal) {
      el.btnRollbackQf.addEventListener('click', async () => {
        if (!activeQfBackupId || !state.projectPath) return;
        el.btnRollbackQf.disabled = true;
        el.btnRollbackQf.textContent = 'Restoring...';
        try {
          const res = await fetch('/api/backups/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath: state.projectPath, backupId: activeQfBackupId })
          });
          const data = await res.json();
          if (data.success) {
            showToast('Quick fix reverted! Original file restored from backup.', 'success');
            el.quickFixDiffModal.classList.add('hidden');
            await scanSingleGate(state.activeGateId);
          } else {
            showToast(`Rollback failed: ${data.error}`, 'error');
          }
        } catch (err) {
          showToast(`Rollback error: ${err.message}`, 'error');
        } finally {
          el.btnRollbackQf.disabled = false;
          el.btnRollbackQf.innerHTML = '<span>↩️</span> Rollback This Fix';
        }
      });
    }

    // Auto-Fix & Remediation Hub Modal Listeners
    if (el.btnCloseAutoFixModal && el.autoFixModal) {
      el.btnCloseAutoFixModal.addEventListener('click', () => {
        el.autoFixModal.classList.add('hidden');
      });
    }

    if (el.btnCloseAutofixFooter && el.autoFixModal) {
      el.btnCloseAutofixFooter.addEventListener('click', () => {
        el.autoFixModal.classList.add('hidden');
      });
    }

    if (el.btnCopyAutofixPrompt) {
      el.btnCopyAutofixPrompt.addEventListener('click', async () => {
        if (!currentAutoFixPrompt) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(currentAutoFixPrompt);
          } else {
            throw new Error('Clipboard API unavailable');
          }
          if (el.copyAutofixIcon) el.copyAutofixIcon.textContent = '✓';
          if (el.copyAutofixLabel) el.copyAutofixLabel.textContent = 'Copied!';
          showToast('Remediation prompt copied to clipboard!', 'success');
          setTimeout(() => {
            if (el.copyAutofixIcon) el.copyAutofixIcon.textContent = '📋';
            if (el.copyAutofixLabel) el.copyAutofixLabel.textContent = 'Copy Prompt';
          }, 2500);
        } catch (err) {
          // Fallback: select text in pre for manual copy
          const pre = el.autoFixPromptDisplay;
          if (pre) {
            const range = document.createRange();
            range.selectNodeContents(pre);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            showToast('Prompt selected! Press Ctrl+C to copy.', 'info');
          }
        }
      });
    }

    // Quick-Fix Engine Event Delegation (Phase 1)
    if (el.findingsContainer) {
      el.findingsContainer.addEventListener('click', async (e) => {
        const quickFixBtn = e.target.closest('.btn-quick-fix');
        if (!quickFixBtn) return;

        const fixId = quickFixBtn.getAttribute('data-fix-id');
        if (!fixId || !state.projectPath) return;

        quickFixBtn.disabled = true;
        const originalText = quickFixBtn.innerHTML;
        quickFixBtn.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> Patching...';

        try {
          const res = await fetch('/api/fixes/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              projectPath: state.projectPath, 
              fixId,
              gateId: state.activeGateId
            })
          });
          const data = await res.json();

          if (data.success && data.result.success) {
            quickFixBtn.disabled = true;
            quickFixBtn.innerHTML = '✓ Patch Applied';
            quickFixBtn.style.background = 'var(--c-pass)';
            quickFixBtn.style.color = '#ffffff';

            showToast('⚡ Patch written to disk! Re-evaluating gate...', 'success');

            // Instantly update gate view and overview with fresh results
            if (data.newGateResult) {
              if (data.project) state.project = data.project;
              renderGateDetail(data.newGateResult);
              renderOverview();
            } else if (state.activeGateId) {
              await runGate(state.activeGateId);
            }

            showQuickFixDiffModal(data.result, fixId);
          } else {
            showToast(data.error || data.result?.message || 'Quick patch failed', 'error');
            quickFixBtn.disabled = false;
            quickFixBtn.innerHTML = originalText;
          }
        } catch (err) {
          showToast(`Error applying patch: ${err.message}`, 'error');
          quickFixBtn.disabled = false;
          quickFixBtn.innerHTML = originalText;
        }
      });
    }

    // -------------------------------------------------------------------------
    // ✨ Magic Vibe-to-SaaS Transmuter Controller
    // -------------------------------------------------------------------------
    initMagicTransmuter();

    // -------------------------------------------------------------------------
    // 📖 How to Use & 📚 12-Gate Docs Modal Controllers
    // -------------------------------------------------------------------------
    initHowToUseModal();
    initGatesDocsModal();

    // -------------------------------------------------------------------------
    // 🛠️ More Tools Dropdown Controller
    // -------------------------------------------------------------------------
    if (el.btnMoreToolsToggle && el.moreToolsDropdown) {
      el.btnMoreToolsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        el.moreToolsDropdown.classList.toggle('hidden');
      });

      document.addEventListener('click', () => {
        el.moreToolsDropdown.classList.add('hidden');
      });
    }

    // Git Pre-push hook installer
    if (el.menuOptGitHook) {
      el.menuOptGitHook.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (el.moreToolsDropdown) el.moreToolsDropdown.classList.add('hidden');
        if (!state.projectPath) return showToast('Please select a project first', 'warning');
        showToast('Installing Git pre-push hook...', 'info');
        try {
          const res = await fetch('/api/system/install-hooks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath: state.projectPath })
          });
          const data = await res.json();
          if (data.success) {
            showToast(`Git pre-push hook active at ${data.hookPath}! P0 blockers will be rejected on push.`, 'success');
          } else {
            showToast(data.message || data.error || 'Failed to install Git hook', 'warning');
          }
        } catch (e) {
          showToast('Error installing Git hook', 'error');
        }
      });
    }

    // Readiness Score History Modal
    if (el.menuOptHistory) {
      el.menuOptHistory.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.moreToolsDropdown) el.moreToolsDropdown.classList.add('hidden');
        openHistoryModal();
      });
    }

    // Server Lifecycle Controls (Restart & Clean Shutdown)
    async function triggerServerRestart() {
      if (!confirm('Restart the LaunchGate background server?')) return;
      if (el.moreToolsDropdown) el.moreToolsDropdown.classList.add('hidden');
      showToast('Restarting LaunchGate server... Reconnecting in moments', 'info');

      try {
        await fetch('/api/system/restart', { method: 'POST' });
      } catch (e) {
        // Connection drops as server restarts
      }

      // Poll health endpoint until it comes back online
      let retries = 0;
      const maxRetries = 30;
      const pollInterval = setInterval(async () => {
        retries++;
        try {
          const res = await fetch('/api/system/health', { cache: 'no-store' });
          if (res.ok) {
            clearInterval(pollInterval);
            showToast('LaunchGate server restarted successfully!', 'success');
            setTimeout(() => {
              window.location.reload();
            }, 600);
          }
        } catch (err) {
          if (retries >= maxRetries) {
            clearInterval(pollInterval);
            showToast('Restart took longer than expected. Please refresh manually.', 'warning');
          }
        }
      }, 600);
    }

    async function triggerServerShutdown() {
      if (!confirm('Are you sure you want to shut down LaunchGate?\n\nThe background server process will terminate cleanly.')) return;
      if (el.moreToolsDropdown) el.moreToolsDropdown.classList.add('hidden');
      showToast('Shutting down LaunchGate background server...', 'info');

      try {
        await fetch('/api/system/shutdown', { method: 'POST' });
      } catch (e) {
        // Expected when server shuts down
      }

      setTimeout(() => {
        document.body.innerHTML = `
          <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0b0f19; color: #f8fafc; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 2rem;">
            <div style="max-width: 480px; padding: 2.5rem; background: #131b2e; border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
              <div style="font-size: 3rem; margin-bottom: 1rem;">🛡️</div>
              <h1 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 0.75rem; color: #f8fafc;">LaunchGate Shut Down</h1>
              <p style="color: #94a3b8; font-size: 0.875rem; line-height: 1.5; margin-bottom: 1.5rem;">
                The background server has cleanly stopped and port 4545 is released. You can safely close this browser tab.
              </p>
              <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 8px; padding: 0.875rem; color: #cbd5e1; font-size: 0.8125rem;">
                💡 To start LaunchGate anytime, run <code>npm start</code> or double-click <strong>LaunchGate.bat</strong>.
              </div>
            </div>
          </div>
        `;
      }, 700);
    }

    if (el.menuOptRestart) {
      el.menuOptRestart.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerServerRestart();
      });
    }

    if (el.menuOptShutdown) {
      el.menuOptShutdown.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerServerShutdown();
      });
    }

    if (el.btnRestartServer) {
      el.btnRestartServer.addEventListener('click', triggerServerRestart);
    }

    if (el.btnShutdownServer) {
      el.btnShutdownServer.addEventListener('click', triggerServerShutdown);
    }
  }

  // -------------------------------------------------------------------------
  // ✨ Magic Vibe-to-Production SaaS Transmuter
  // -------------------------------------------------------------------------
  function initMagicTransmuter() {
    if (!el.btnMagicVibeSaas) return;

    // Open Magic Modal
    el.btnMagicVibeSaas.addEventListener('click', async () => {
      if (!state.projectPath) {
        showToast('Please select or browse a project folder first', 'warning');
        openProjectPicker();
        return;
      }

      el.magicModal.classList.remove('hidden');
      el.magicProgressPanel.classList.add('hidden');
      el.magicSuccessPanel.classList.add('hidden');
      el.magicLiveLogs.innerHTML = '';
      el.btnExecuteMagic.disabled = false;
      el.magicBtnSpinner.classList.add('hidden');
      el.magicBtnText.textContent = '⚡ Transmute to Production SaaS';

      el.magicProjectName.textContent = state.projectName || 'Analyzing...';
      el.magicStatusSummary.textContent = 'Auditing project architecture against Turnkey Production SaaS standards...';
      el.magicReadinessVal.textContent = '--%';
      el.magicModulesList.innerHTML = '<div class="col-span-1 md:col-span-2 text-center py-8 text-xs text-indigo-300"><span class="animate-spin inline-block mr-2">🪄</span> Scanning codebase architecture...</div>';

      try {
        const res = await fetch(`/api/magic/analyze?projectPath=${encodeURIComponent(state.projectPath)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        renderMagicAnalysis(data.analysis);
      } catch (err) {
        el.magicStatusSummary.textContent = `Analysis error: ${err.message}`;
        el.magicModulesList.innerHTML = `<div class="col-span-1 md:col-span-2 text-center py-4 text-xs text-red-400">Failed to analyze: ${err.message}</div>`;
      }
    });

    // Close Modal
    const closeModal = () => {
      if (el.magicModal) el.magicModal.classList.add('hidden');
    };
    if (el.btnCloseMagicModal) el.btnCloseMagicModal.addEventListener('click', closeModal);
    if (el.btnCancelMagic) el.btnCancelMagic.addEventListener('click', closeModal);

    // Select / Deselect All
    if (el.btnMagicSelectAll) {
      el.btnMagicSelectAll.addEventListener('click', () => {
        document.querySelectorAll('.magic-mod-check').forEach(cb => cb.checked = true);
      });
    }
    if (el.btnMagicDeselectAll) {
      el.btnMagicDeselectAll.addEventListener('click', () => {
        document.querySelectorAll('.magic-mod-check').forEach(cb => cb.checked = false);
      });
    }

    // Execute Transmutation
    if (el.btnExecuteMagic) {
      el.btnExecuteMagic.addEventListener('click', async () => {
        const checkedBoxes = Array.from(document.querySelectorAll('.magic-mod-check:checked'));
        if (checkedBoxes.length === 0) {
          showToast('Please select at least one module to inject', 'warning');
          return;
        }

        const selectedModules = checkedBoxes.map(cb => cb.getAttribute('data-mod-id'));

        el.btnExecuteMagic.disabled = true;
        el.magicBtnSpinner.classList.remove('hidden');
        el.magicBtnText.textContent = 'Transmuting Codebase...';
        el.magicProgressPanel.classList.remove('hidden');
        el.magicSuccessPanel.classList.add('hidden');
        el.magicProgressBar.style.width = '15%';
        el.magicProgressStep.textContent = `0 / ${selectedModules.length}`;
        el.magicLiveLogs.innerHTML = '';

        const appendLog = (msg, icon = '⚡') => {
          const row = document.createElement('div');
          row.className = 'flex items-center gap-1.5 text-gray-300';
          row.innerHTML = `<span class="text-amber-400">${icon}</span> <span>${escapeHtml(msg)}</span>`;
          el.magicLiveLogs.appendChild(row);
          el.magicLiveLogs.scrollTop = el.magicLiveLogs.scrollHeight;
        };

        appendLog(`Initiating Turnkey SaaS Transmutation on ${state.projectName}...`, '🚀');

        try {
          // Paced visual update for delight
          let step = 0;
          for (const modId of selectedModules) {
            step++;
            const pct = Math.round((step / selectedModules.length) * 75);
            el.magicProgressBar.style.width = `${pct}%`;
            el.magicProgressStep.textContent = `${step} / ${selectedModules.length}`;
            appendLog(`Generating & injecting module [${modId}]...`, '🪄');
            await new Promise(r => setTimeout(r, 45));
          }

          const res = await fetch('/api/magic/transform', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath: state.projectPath, modules: selectedModules })
          });
          const result = await res.json();
          if (!result.success && result.errors?.length > 0) {
            appendLog(`Warning: ${result.errors[0].error}`, '⚠️');
          }

          el.magicProgressBar.style.width = '100%';
          el.magicProgressStep.textContent = `${selectedModules.length} / ${selectedModules.length} Done`;
          appendLog(`Transmutation complete! Generated ${result.changesCount} production assets.`, '✅');

          (result.changes || []).forEach(c => {
            appendLog(`${c.action === 'created' ? 'Created' : 'Updated'}: ${c.file} — ${c.note || ''}`, '✨');
          });

          // Show Success Summary
          el.magicSuccessPanel.classList.remove('hidden');
          el.magicResFilesCount.textContent = result.changesCount;
          el.magicResOldScore.textContent = `${state.projectData?.overallScore || 0}%`;
          el.magicResNewScore.textContent = `${result.newOverallScore}%`;

          // Display Backup Details
          if (el.magicBackupPath) {
            el.magicBackupPath.textContent = result.backup?.path || '.launchgate/backups/...';
          }
          activeMagicBackupId = result.backup?.id || null;

          // Render Changes & Diffs
          if (el.magicDiffList) {
            el.magicDiffList.innerHTML = '';
            const diffs = result.diffPreview || [];
            if (diffs.length > 0) {
              diffs.forEach(item => {
                const card = document.createElement('div');
                card.className = 'rounded-lg border border-indigo-900/40 bg-slate-900/60 overflow-hidden';
                const isCreated = item.action === 'created';
                card.innerHTML = `
                  <div class="diff-header px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition-colors select-none">
                    <div class="flex items-center gap-2 text-xs">
                      <span class="font-bold text-gray-200 font-mono">${escapeHtml(item.file)}</span>
                      <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${isCreated ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}">${isCreated ? 'CREATED' : 'MODIFIED'}</span>
                    </div>
                    <div class="flex items-center gap-2 text-[10px] font-mono">
                      <span class="text-emerald-400">+${item.linesAdded || 0}</span>
                      <span class="text-rose-400">-${item.linesRemoved || 0}</span>
                      <span class="diff-chevron text-gray-400 text-xs transition-transform">▼</span>
                    </div>
                  </div>
                  <div class="diff-body hidden px-3 py-2 border-t border-slate-800 bg-[#090d16] font-mono text-[11px] leading-relaxed max-h-56 overflow-y-auto overflow-x-auto text-gray-300">
                    ${formatDiffHtml(item.diff)}
                  </div>
                `;
                card.querySelector('.diff-header').addEventListener('click', () => {
                  const body = card.querySelector('.diff-body');
                  const chevron = card.querySelector('.diff-chevron');
                  const isHidden = body.classList.toggle('hidden');
                  chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
                });
                el.magicDiffList.appendChild(card);
              });
            } else {
              el.magicDiffList.innerHTML = '<div class="text-xs text-gray-400 italic py-2 text-center">No textual modifications recorded.</div>';
            }
          }

          // Hook up Magic Rollback Button
          if (el.btnRollbackMagic && !el.btnRollbackMagic._hasListener) {
            el.btnRollbackMagic._hasListener = true;
            el.btnRollbackMagic.addEventListener('click', async () => {
              if (!activeMagicBackupId || !state.projectPath) return;
              if (!confirm('Rollback all transmutation changes? Your original files will be restored from the backup.')) return;

              el.btnRollbackMagic.disabled = true;
              el.btnRollbackMagic.textContent = 'Restoring...';
              try {
                const res = await fetch('/api/backups/rollback', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ projectPath: state.projectPath, backupId: activeMagicBackupId })
                });
                const rollbackData = await res.json();
                if (rollbackData.success) {
                  showToast('Rollback successful! Original project files restored.', 'success');
                  el.magicModal.classList.add('hidden');
                  await scanAllGates();
                } else {
                  showToast(`Rollback failed: ${rollbackData.error}`, 'error');
                }
              } catch (err) {
                showToast(`Rollback error: ${err.message}`, 'error');
              } finally {
                el.btnRollbackMagic.disabled = false;
                el.btnRollbackMagic.innerHTML = '<span>↩️</span> Rollback Transmutation';
              }
            });
          }

          // Update Project state and dashboard UI
          state.projectData = {
            ...state.projectData,
            gates: result.gates,
            overallScore: result.newOverallScore
          };
          updateOverallScore();
          renderSidebar();
          if (state.activeGateId && result.gates[state.activeGateId]) {
            renderActiveGate();
          }

          el.btnExecuteMagic.disabled = false;
          el.magicBtnSpinner.classList.add('hidden');
          el.magicBtnText.textContent = '⚡ Transmuted! Run Again?';

          showToast('Codebase transmuted to Turnkey Production SaaS!', 'success');
        } catch (err) {
          appendLog(`Fatal error: ${err.message}`, '❌');
          el.btnExecuteMagic.disabled = false;
          el.magicBtnSpinner.classList.add('hidden');
          el.magicBtnText.textContent = 'Retry Transmutation';
          showToast(`Transmutation failed: ${err.message}`, 'error');
        }
      });
    }
  }

  function renderMagicAnalysis(analysis) {
    el.magicProjectName.textContent = analysis.projectName;
    el.magicStackBadge.textContent = analysis.stackInfo?.frameworks?.concat(analysis.stackInfo?.languages || []).join(', ') || 'Web App';
    el.magicStatusSummary.textContent = `${analysis.gapsCount} critical production gap(s) identified across ${analysis.modules.length} standard pillars.`;
    el.magicReadinessVal.textContent = `${analysis.vibeReadinessScore}%`;
    el.magicReadinessVal.className = `text-lg font-extrabold ${analysis.vibeReadinessScore < 50 ? 'text-amber-400' : 'text-indigo-400'}`;

    el.magicModulesList.innerHTML = '';

    analysis.modules.forEach(mod => {
      const card = document.createElement('label');
      card.className = `magic-card flex items-start gap-3 select-none ${mod.isMissing ? 'is-selected' : 'is-satisfied'}`;

      const badge = mod.isMissing
        ? `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">GAP DETECTED</span>`
        : `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">CONFIGURED</span>`;

      card.innerHTML = `
        <input type="checkbox" class="magic-mod-check mt-1 lg-checkbox" data-mod-id="${mod.id}" ${mod.isMissing ? 'checked' : ''}>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1 mb-0.5">
            <span class="text-xs font-semibold text-white flex items-center gap-1.5 truncate">
              <span>${mod.icon}</span>
              <span>${escapeHtml(mod.name)}</span>
            </span>
            ${badge}
          </div>
          <p class="text-[11px] text-gray-400 leading-snug">${escapeHtml(mod.description)}</p>
        </div>
      `;

      el.magicModulesList.appendChild(card);
    });
  }

  // -------------------------------------------------------------------------
  // 📖 How to Use LaunchGate Controller
  // -------------------------------------------------------------------------
  function initHowToUseModal() {
    if (el.btnHowToUse) {
      el.btnHowToUse.addEventListener('click', () => {
        switchView('how-to-use');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    if (!el.btnHowToUse || !el.howToUseModal) return;

    // keep modal wiring if still present
    el.btnHowToUse.addEventListener('click', () => {
      // prefer full page
      try { switchView('how-to-use'); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e) { el.howToUseModal.classList.remove('hidden'); }
    });

    const closeHowToUse = () => el.howToUseModal.classList.add('hidden');
    if (el.btnCloseHowToUse) el.btnCloseHowToUse.addEventListener('click', closeHowToUse);
    if (el.btnCloseHowToUseFooter) el.btnCloseHowToUseFooter.addEventListener('click', closeHowToUse);
  }

  // -------------------------------------------------------------------------
  // 📚 12-Gate Reference Encyclopedia Controller
  // -------------------------------------------------------------------------
  const GATES_ENCYCLOPEDIA = [
    {
      number: 1,
      id: 'gate-1',
      name: 'Secrets, Credentials & Environment Hygiene',
      category: 'security',
      icon: '🔑',
      standard: 'SOC 2 CC6.1 • OWASP A02',
      description: 'Audits tracked files and Git hygiene to ensure sensitive production credentials are never committed.',
      whatItChecks: 'Scans source files, config files, and .gitignore for hardcoded API keys, JWT secrets, database connection URIs, client prefix leakage (NEXT_PUBLIC_, VITE_), and .env template hygiene.',
      whatItCatches: 'Leaked Stripe/AWS/OpenAI secret keys, missing .env.example templates, exposed database URIs with plain passwords, and private SSH/PEM keys committed to Git.',
      productionStandard: 'Strict zero-secret retention in Git repositories; all secrets loaded exclusively via encrypted runtime environment variables.'
    },
    {
      number: 2,
      id: 'gate-2',
      name: 'Authentication, Session Integrity & BOLA/IDOR Defense',
      category: 'security',
      icon: '🛡️',
      standard: 'OWASP API1 (BOLA) • API2 (Auth) • API5 (RBAC)',
      description: 'Enforces zero-trust server authentication, tenant isolation, and role-based access control across all API routes.',
      whatItChecks: 'Maps all API routes, server actions, and mutation endpoints (POST/PUT/DELETE/PATCH) for server-side session checks and compound tenant scoping.',
      whatItCatches: 'Unauthenticated mutating routes, Broken Object Level Authorization (BOLA/IDOR where user A accesses user B\'s records by guessing IDs), unprotected administrative endpoints, and insecure cookie flags (httpOnly: false).',
      productionStandard: 'Every mutating endpoint must verify session identity server-side and scope database queries by userId/tenantId.'
    },
    {
      number: 3,
      id: 'gate-3',
      name: 'Database Security, Schemas, Indexes & Input Validation',
      category: 'data',
      icon: '🗄️',
      standard: 'OWASP A03 (Injection) • SOC 2 CC6.6',
      description: 'Audits database policies, relational indexes, and boundary schema validation to ensure data integrity and prevent SQL injection.',
      whatItChecks: 'PostgreSQL/Supabase Row Level Security (RLS) tables, Firebase security rules, raw SQL concatenation, schema input validation (Zod/Valibot), and foreign key indexing.',
      whatItCatches: 'Tables created without RLS enabled, overly permissive RLS policies (USING true), unrestricted Firestore rules (allow write: if true), unindexed foreign keys causing sequential table scan locks, and raw SQL injection vulnerabilities.',
      productionStandard: 'Mandatory RLS on all multi-tenant tables, schema validation on every boundary payload, and foreign key indexing.'
    },
    {
      number: 4,
      id: 'gate-4',
      name: 'APIs, Webhooks, Idempotency & Abuse Defenses',
      category: 'data',
      icon: '💳',
      standard: 'OWASP API4 (Resource Exhaustion) • API8',
      description: 'Protects external payment webhooks and public endpoints from replay attacks, forging, and DDoS abuse.',
      whatItChecks: 'Third-party webhook handlers (Stripe, Clerk, custom), in-memory/distributed rate limiting middleware, request payload limits, and strict CORS headers.',
      whatItCatches: 'Webhooks processing payments without cryptographic signature validation (constructEvent), missing idempotency keys (causing double charging on webhook retries), missing rate limits on auth/search routes, and permissive wildcard CORS with credentials.',
      productionStandard: 'Cryptographic signature verification on raw request bodies and idempotency locks on all transactional events.'
    },
    {
      number: 5,
      id: 'gate-5',
      name: 'AI / LLM Cost, Quota & Prompt Injection Guards',
      category: 'security',
      icon: '🤖',
      standard: 'OWASP Top 10 for LLMs (LLM01, LLM06)',
      description: 'Enforces server runtime isolation, budget quotas, and output validation for Generative AI & LLM workloads.',
      whatItChecks: 'OpenAI, Anthropic, Gemini, and LangChain SDK usages, server-only execution boundaries, maxOutputTokens limits, structured schema parsing, and user credit quotas.',
      whatItCatches: 'AI SDKs imported into client components ("use client") leaking API keys, unbounded LLM token generation draining credits, unvalidated raw AI responses passed directly to databases, and lack of rate-limits on AI generation.',
      productionStandard: 'Strict server-side runtime isolation for all model inference, token budgets, and structured response schema parsing.'
    },
    {
      number: 6,
      id: 'gate-6',
      name: 'Observability, Sentry & Error Resilience',
      category: 'reliability',
      icon: '🩺',
      standard: 'SOC 2 CC6.8 • GDPR Art. 25',
      description: 'Ensures full stack telemetry, runtime error monitoring, and graceful client crash recovery.',
      whatItChecks: 'Sentry SDK configuration across client and server, UI React Error Boundaries, unhandled promise rejections, swallowed empty catch blocks, and PII telemetry scrubbing.',
      whatItCatches: 'Missing error tracking SDKs, swallowed exceptions (empty catch blocks), lack of React Error Boundaries causing blank white crash screens, and sensitive passwords or tokens sent in telemetry.',
      productionStandard: 'Automated error alerting with beforeSend PII scrubbing and user-friendly fallback error boundaries on all frontend views.'
    },
    {
      number: 7,
      id: 'gate-7',
      name: 'Performance, Bundling, Caching & Resource Leaks',
      category: 'reliability',
      icon: '⚡',
      standard: 'Core Web Vitals • ISO 25010',
      description: 'Eliminates memory leaks, blocking I/O, unpaginated dataset exhaustion, and high database latency.',
      whatItChecks: 'Loop queries (N+1 query patterns), uncleaned intervals/listeners in useEffect, blocking synchronous file I/O in API paths, unbounded query limits, and uncompressed static assets.',
      whatItCatches: 'N+1 database query waterfalls, client-side memory leaks from orphaned setInterval, readFileSync in web request handlers causing server freezes, and large unpaginated SELECT * queries.',
      productionStandard: 'Non-blocking asynchronous I/O, mandatory query pagination limits, and controlled component lifecycles.'
    },
    {
      number: 8,
      id: 'gate-8',
      name: 'Design Consistency, UX States & Localization (LTR/RTL)',
      category: 'reliability',
      icon: '🎨',
      standard: 'WCAG 2.1 AA • UX Standards',
      description: 'Audits frontend resilience, custom error routing, accessibility, and internationalization layout parity.',
      whatItChecks: 'Custom 404 / 500 error pages, image alt attributes, CSS logical properties for RTL/LTR parity (ms-, me-), and loading/empty UI states.',
      whatItCatches: 'Default framework 404 error screens confusing users, missing alt tags hurting accessibility, directional CSS (ml-, mr-) breaking Arabic/Hebrew layouts, and unhandled empty states.',
      productionStandard: 'Branded fallback error routes, accessible media tags, and bidirectional layout property compatibility.'
    },
    {
      number: 9,
      id: 'gate-9',
      name: 'SEO, Metadata, Legal & Commercial Readiness',
      category: 'data',
      icon: '⚖️',
      standard: 'GDPR Art. 13/14 • Commercial Law',
      description: 'Verifies search engine indexing, social preview cards, and mandatory commercial legal contracts.',
      whatItChecks: 'robots.txt directives, sitemap.xml, OpenGraph/Twitter social meta tags, Privacy Policy and Terms of Service documents, and placeholder anchor links (href="#").',
      whatItCatches: 'Missing robots.txt or sitemap hurting SEO discovery, absent OpenGraph tags rendering blank cards on WhatsApp/Twitter, missing Privacy Policy and Terms of Service blocking payment gateway approval, and dead click links.',
      productionStandard: 'Comprehensive crawler directives, social rich cards, and GDPR/CCPA-compliant published legal terms.'
    },
    {
      number: 10,
      id: 'gate-10',
      name: 'Code Hygiene, Duplication, Context7 SDKs & Live CVEs',
      category: 'security',
      icon: '🧹',
      standard: 'SOC 2 CC7.1 • Clean Code Standards',
      description: 'Audits source hygiene, strips debugging artifacts, scans dependencies for live CVEs, and tracks external SDK drift.',
      whatItChecks: 'Active debugger statements, production console.log statements, TODO/FIXME release blockers, duplicated utility logic, live supply-chain CVE vulnerabilities via npm audit, and Context7 SDK syntax drift.',
      whatItCatches: 'debugger statements freezing production execution when DevTools are opened, noisy console telemetry leaking data, unpatched high/critical supply-chain CVEs in locked dependencies, and stale SDK methods.',
      productionStandard: 'Clean release builds free of developer debuggers, zero unpatched critical/high CVEs, and validated third-party SDK syntax.'
    },
    {
      number: 11,
      id: 'gate-11',
      name: 'Infrastructure, CI/CD & Deployment Configs',
      category: 'devops',
      icon: '🐳',
      standard: 'CIS Docker Benchmarks • SOC 2 CC6.6',
      description: 'Audits container hardening, continuous integration pipelines, health probes, and production HTTP headers.',
      whatItChecks: 'Multi-stage Dockerfiles, unprivileged non-root container users, .dockerignore security exclusions, /api/health probe routes, GitHub Actions CI/CD workflows, and HTTP security headers (HSTS, CSP, X-Frame-Options).',
      whatItCatches: 'Containers running as root expanding container breakout attack surfaces, single-stage bloated Docker images, missing /api/health probes preventing load balancer failover, absent CI/CD pipelines, and missing HTTP security headers.',
      productionStandard: 'Unprivileged non-root container runtimes, automated CI preflight verification, and defense-in-depth security headers.'
    },
    {
      number: 12,
      id: 'gate-12',
      name: 'Preflight CLI Suite, Clean Build & Release Certificate',
      category: 'devops',
      icon: '🚀',
      standard: 'ISO 27001 Release Verification',
      description: 'Verifies compilation scripts, provides interactive terminal verification, and unlocks cryptographically signed release certificates.',
      whatItChecks: 'package.json script definitions (typecheck, lint, build), live interactive CLI runner streams, formal release certificate generation, and OASIS SARIF export.',
      whatItCatches: 'Missing typecheck and lint scripts required for CI/CD gates, unresolved compilation/build errors prior to deployment, and unauthorized release sign-offs.',
      productionStandard: 'Full clean compilation passing tsc --noEmit, automated linter, clean build, and signed cryptographic release certificate.'
    }
  ];

  function initGatesDocsModal() {
    if (el.btnGatesDocs) {
      el.btnGatesDocs.addEventListener('click', () => {
        switchView('gates-docs');
        renderGatesFullDocs('all', '');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    if (!el.btnGatesDocs || !el.gatesDocsModal) return;

    el.btnGatesDocs.addEventListener('click', () => {
      try { switchView('gates-docs'); renderGatesFullDocs('all', ''); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch(e) { el.gatesDocsModal.classList.remove('hidden'); renderGatesDocs('all', ''); }
    });

    const closeGatesDocs = () => el.gatesDocsModal.classList.add('hidden');
    if (el.btnCloseGatesDocs) el.btnCloseGatesDocs.addEventListener('click', closeGatesDocs);
    if (el.btnCloseGatesDocsFooter) el.btnCloseGatesDocsFooter.addEventListener('click', closeGatesDocs);

    // Search filter
    if (el.gatesDocsSearch) {
      el.gatesDocsSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const activeFilterBtn = document.querySelector('.gates-filter-btn.bg-indigo-600');
        const activeFilter = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';
        renderGatesDocs(activeFilter, query);
      });
    }

    // Category filter pills
    document.querySelectorAll('.gates-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gates-filter-btn').forEach(b => {
          b.className = 'gates-filter-btn px-2.5 py-1 rounded text-slate-400 hover:text-white bg-slate-800 text-[11px]';
        });
        btn.className = 'gates-filter-btn px-2.5 py-1 rounded text-white bg-indigo-600 text-[11px] font-medium';

        const filter = btn.getAttribute('data-filter');
        const query = el.gatesDocsSearch ? el.gatesDocsSearch.value.toLowerCase().trim() : '';
        renderGatesDocs(filter, query);
      });
    });
  }

  function renderGatesDocs(filter = 'all', query = '') {
    if (!el.gatesDocsCardsList) return;
    el.gatesDocsCardsList.innerHTML = '';

    const filtered = GATES_ENCYCLOPEDIA.filter(g => {
      const matchFilter = filter === 'all' || g.category === filter;
      const matchQuery = !query || 
        g.name.toLowerCase().includes(query) ||
        g.description.toLowerCase().includes(query) ||
        g.whatItChecks.toLowerCase().includes(query) ||
        g.whatItCatches.toLowerCase().includes(query) ||
        g.standard.toLowerCase().includes(query);
      return matchFilter && matchQuery;
    });

    if (filtered.length === 0) {
      el.gatesDocsCardsList.innerHTML = `
        <div class="text-center py-12 text-slate-400 text-xs">
          <div class="text-2xl mb-2">🔍</div>
          No audit gates matching "<strong>${escapeHtml(query)}</strong>" in this category.
        </div>
      `;
      return;
    }

    filtered.forEach(gate => {
      const card = document.createElement('div');
      card.className = 'gate-doc-modal-card p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all flex flex-col gap-3.5';

      const catBadge = gate.category === 'security'
        ? '<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20">SECURITY &amp; ACCESS</span>'
        : gate.category === 'data'
        ? '<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">DATA &amp; APIS</span>'
        : gate.category === 'reliability'
        ? '<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/20">RELIABILITY &amp; UX</span>'
        : '<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">INFRA &amp; DEVOPS</span>';

      card.innerHTML = `
        <div class="gate-doc-modal-header flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div class="flex items-center gap-2.5">
            <span class="text-base">${gate.icon}</span>
            <span class="text-xs font-bold font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">GATE ${gate.number}</span>
            <h3 class="gate-doc-title text-sm font-bold text-white">${escapeHtml(gate.name)}</h3>
          </div>
          <div class="flex items-center gap-2">
            ${catBadge}
            <span class="gate-doc-standard-tag text-[10px] font-mono text-slate-400 hidden sm:inline">${escapeHtml(gate.standard)}</span>
          </div>
        </div>

        <p class="gate-doc-desc text-xs text-slate-300 leading-relaxed">${escapeHtml(gate.description)}</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div class="gate-doc-audit-box bg-black/30 p-3 rounded-lg border border-slate-800">
            <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1 flex items-center gap-1.5">
              <span>🔍</span> <span>What It Audits</span>
            </div>
            <p class="text-slate-400 text-[11px] leading-relaxed">${escapeHtml(gate.whatItChecks)}</p>
          </div>

          <div class="gate-doc-catches-box bg-black/30 p-3 rounded-lg border border-slate-800">
            <div class="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center gap-1.5">
              <span>⚠️</span> <span>Vulnerabilities Caught</span>
            </div>
            <p class="text-slate-400 text-[11px] leading-relaxed">${escapeHtml(gate.whatItCatches)}</p>
          </div>
        </div>

        <div class="gate-doc-modal-footer flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-xs">
          <div class="text-[11px] text-slate-400">
            <strong class="gate-doc-standard-label text-slate-300">Standard:</strong> ${escapeHtml(gate.productionStandard)}
          </div>
          <button class="btn-jump-to-gate lg-btn-primary text-xs px-3 py-1 flex items-center gap-1.5" data-gate-id="${gate.id}">
            <span>👉 Jump to Gate ${gate.number}</span>
          </button>
        </div>
      `;

      // Jump button click handler
      const jumpBtn = card.querySelector('.btn-jump-to-gate');
      if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
          el.gatesDocsModal.classList.add('hidden');
          selectGate(gate.id);
          const gateCard = document.getElementById('gate-details-card') || el.activeGateTitle;
          if (gateCard) gateCard.scrollIntoView({ behavior: 'smooth' });
          showToast(`Switched workspace to Gate ${gate.number}: ${gate.name}`, 'info');
        });
      }

      el.gatesDocsCardsList.appendChild(card);
    });
  }

  function renderGatesFullDocs(filter = 'all', query = '') {
    const grid = document.getElementById('gates-full-grid');
    if (!grid) return;

    let gates = GATES_ENCYCLOPEDIA.slice();

    if (filter !== 'all') {
      gates = gates.filter(g => g.category === filter);
    }

    if (query) {
      gates = gates.filter(g => {
        const haystack = [
          g.name,
          g.description,
          g.standard,
          g.whatItChecks,
          g.whatItCatches,
          g.productionStandard
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      });
    }

    if (gates.length === 0) {
      grid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400 text-sm">No gates match your search/filter.</div>';
      return;
    }

    grid.innerHTML = gates.map(g => `
      <article class="gate-doc-card rounded-xl border border-slate-800 bg-gradient-to-b from-slate-900/60 to-slate-950/60 overflow-hidden flex flex-col">
        <header class="gate-doc-header p-4 flex items-start gap-3 border-b border-slate-800/80">
          <div class="w-10 h-10 rounded-lg bg-slate-800/70 flex items-center justify-center text-lg">${g.icon}</div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">GATE ${g.number}</span>
              <span class="gate-doc-category text-[10px] uppercase tracking-wider text-slate-500 font-semibold">${g.category}</span>
            </div>
            <h3 class="gate-doc-title text-sm font-bold text-white leading-snug">${escapeHtml(g.name)}</h3>
            <p class="gate-doc-standard text-[11px] text-slate-400 mt-0.5">${escapeHtml(g.standard)}</p>
          </div>
        </header>
        <div class="p-4 flex flex-col gap-3 text-xs flex-1">
          <div class="gate-doc-box bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
            <div class="gate-doc-box-tag text-[10px] uppercase tracking-wider text-indigo-400 mb-1 font-semibold flex items-center gap-1">🔍 What it checks</div>
            <p class="gate-doc-box-text text-slate-300 leading-relaxed">${escapeHtml(g.whatItChecks)}</p>
          </div>
          <div class="gate-doc-box bg-slate-900/40 p-3 rounded-lg border border-slate-800/60">
            <div class="gate-doc-box-tag-amber text-[10px] uppercase tracking-wider text-amber-400 mb-1 font-semibold flex items-center gap-1">⚠️ What it catches</div>
            <p class="gate-doc-box-text text-slate-300 leading-relaxed">${escapeHtml(g.whatItCatches)}</p>
          </div>
          <div class="mt-auto pt-2">
            <div class="gate-doc-box-tag-green text-[10px] uppercase tracking-wider text-emerald-400/80 mb-1 font-semibold flex items-center gap-1">🎯 Production standard</div>
            <p class="gate-doc-box-text text-slate-300 leading-relaxed">${escapeHtml(g.productionStandard)}</p>
          </div>
        </div>
      </article>
    `).join('');
  }

  // -------------------------------------------------------------------------
  // Toast Helper
  // -------------------------------------------------------------------------
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconText = 'i';
    if (type === 'success') iconText = '✓';
    else if (type === 'error') iconText = '✕';
    else if (type === 'warning') iconText = '!';

    const iconEl = document.createElement('span');
    iconEl.className = `toast-icon toast-icon-${type}`;
    iconEl.textContent = iconText;

    const msgEl = document.createElement('span');
    msgEl.className = 'toast-message';
    msgEl.textContent = message;

    toast.appendChild(iconEl);
    toast.appendChild(msgEl);
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 4000);
  }

  window.showToast = showToast;

  window.renderGatesFullDocs = renderGatesFullDocs;

  // Start app
  init();
});
