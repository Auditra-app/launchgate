const path = require('path');
const { readFile, getSnippet } = require('../services/file-crawler');
const { scanDependencyCVEs } = require('../services/cve-scanner');

module.exports = {
  id: 'gate-10',
  number: 10,
  name: 'Code Hygiene, Duplication & Context7 SDK Audit',
  category: 'Hygiene & Context7 SDKs',
  description: 'Detects leftover console logs, debugger keywords, TODO/FIXME blockers, dead code blocks, duplicated utility functions, scans dependencies for live CVE vulnerabilities, and generates a Context7 SDK audit manifest.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    const codeFiles = files.filter(f => 
      !f.includes('.min.') && 
      !f.includes('.test.') && 
      !f.includes('.spec.') && 
      !f.startsWith('data/') &&
      !f.startsWith('backend/analyzers/') &&
      /\.(js|jsx|ts|tsx|py)$/.test(f)
    );

    // 1. Leftover Debugger & Console Statements
    let consoleCount = 0;
    let debuggerCount = 0;

    for (const f of codeFiles) {
      if (consoleCount >= 5 && debuggerCount >= 2) break;
      const content = readFile(projectPath, f);
      if (!content) continue;

      // Debugger check (P1) - must be an actual statement, not in a string or comment
      const lines = content.split('\n');
      let debuggerLineNum = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
        if (/(?:^|[;{}]\s*)debugger\s*(?:;|\s*$)/.test(line)) {
          const beforeDebugger = line.split(/\bdebugger\b/)[0];
          const singleQuotes = (beforeDebugger.match(/'/g) || []).length;
          const doubleQuotes = (beforeDebugger.match(/"/g) || []).length;
          const backticks = (beforeDebugger.match(/`/g) || []).length;
          if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0 && backticks % 2 === 0) {
            debuggerLineNum = i + 1;
            break;
          }
        }
      }

      if (debuggerLineNum !== -1) {
        findings.push({
          id: `HYGIENE-DEBUGGER-${f.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'P1',
          title: `Active debugger statement left in ${f}`,
          description: `The \`debugger\` keyword freezes execution when developer tools are opened in production.`,
          file: f,
          line: debuggerLineNum,
          snippet: getSnippet(content, debuggerLineNum, 1),
          remediation: 'Remove all `debugger;` statements prior to release.',
          rule: 'Preflight Hygiene Rule 10.1 (No Debugger Statements)'
        });
        p1Count++;
        debuggerCount++;
      }

      // Console log check (P2)
      if (content.includes('console.log(') && !f.includes('scripts/') && !f.includes('cli')) {
        const lineNum = content.split('\n').findIndex(l => l.includes('console.log(')) + 1;
        if (consoleCount < 4) {
          findings.push({
            id: `HYGIENE-CONSOLE-LOG-${f.replace(/[^a-zA-Z0-9]/g, '_')}-${lineNum}`,
            severity: 'P2',
            title: `Leftover console.log statement in ${f}`,
            description: `Noisy console.log statements pollute production browser/server logs and can accidentally log sensitive customer state.`,
            file: f,
            line: lineNum,
            snippet: getSnippet(content, lineNum, 1),
            remediation: 'Remove console.log or replace with structured logging (e.g. Sentry / Pino / Winston).',
            rule: 'Preflight Hygiene Rule 10.2 (Clean Logging)'
          });
          p2Count++;
          consoleCount++;
        }
      }
    }

    // 2. Unresolved TODO / FIXME / HACK Blockers
    let todoCount = 0;
    for (const f of codeFiles) {
      if (todoCount >= 4) break;
      const content = readFile(projectPath, f);
      if (!content) continue;

      // Match TODO/FIXME specifically inside code comments (//, /*, or #)
      const todoRegex = /(?:\/\/|\/\*+|#)\s*(TODO|FIXME|HACK|XXX):?\s*(.+)/gi;
      let match;
      if ((match = todoRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        findings.push({
          id: `HYGIENE-TODO-${f.replace(/[^a-zA-Z0-9]/g, '_')}-${lineNum}`,
          severity: 'P2',
          title: `Unresolved [${match[1]}] blocker comment in ${f}`,
          description: `Blocker comment found: "${match[2].trim().substring(0, 80)}". Confirm this does not mask an incomplete production feature.`,
          file: f,
          line: lineNum,
          snippet: getSnippet(content, lineNum, 1),
          remediation: 'Resolve the outstanding task or file a tracked ticket before launch.',
          rule: 'Preflight Hygiene Rule 10.3 (Blocker Comments)'
        });
        p2Count++;
        todoCount++;
      }
    }

    // 3. Duplicated Utility Functions
    const utilityMap = new Map();
    const commonUtils = ['formatDate', 'cn', 'classNames', 'formatCurrency', 'slugify', 'truncate', 'debounce', 'throttle'];

    for (const f of codeFiles) {
      const content = readFile(projectPath, f);
      if (!content) continue;

      for (const util of commonUtils) {
        const regex = new RegExp(`(?:function\\s+${util}|const\\s+${util}\\s*=)`, 'g');
        if (regex.test(content)) {
          if (!utilityMap.has(util)) utilityMap.set(util, []);
          utilityMap.get(util).push(f);
        }
      }
    }

    for (const [util, occurrences] of utilityMap.entries()) {
      if (occurrences.length > 1) {
        findings.push({
          id: `HYGIENE-DUPLICATE-UTIL-${util}`,
          severity: 'P2',
          title: `Duplicated utility function \`${util}\` declared across ${occurrences.length} files`,
          description: `The utility function \`${util}\` is declared redundantly in: ${occurrences.join(', ')}. Divergent updates will cause inconsistent application behavior.`,
          file: occurrences[0],
          remediation: `Consolidate into a single shared utility module (e.g. \`lib/utils.ts\`).`,
          rule: 'Preflight Hygiene Rule 10.4 (Code Deduplication)'
        });
        p2Count++;
      }
    }

    // 4. Generate Context7 SDK Manifest
    const pkgJsonStr = readFile(projectPath, 'package.json');
    const sdkManifest = [];

    if (pkgJsonStr) {
      try {
        const pkg = JSON.parse(pkgJsonStr);
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

        const targetSdks = [
          'next', 'react', '@google/genai', '@google/generative-ai',
          'openai', '@anthropic-ai/sdk', '@sentry/nextjs', '@sentry/react',
          '@supabase/supabase-js', 'firebase', 'firebase-admin',
          '@prisma/client', 'drizzle-orm', 'tailwindcss', 'stripe'
        ];

        for (const [dep, version] of Object.entries(deps)) {
          if (targetSdks.includes(dep)) {
            sdkManifest.push({
              name: dep,
              version,
              directive: `Query Context7 for \`${dep}\` to verify up-to-date syntax.`,
              context7Command: `resolve-library-id: "${dep}" -> query-docs: "${dep} migration guide"`
            });
          }
        }
      } catch (e) {}
    }

    findings.push({
      id: 'HYGIENE-CONTEXT7-MANIFEST',
      severity: 'PASSED',
      title: `Context7 SDK Manifest Generated (${sdkManifest.length} Key SDKs Tracked)`,
      description: sdkManifest.length > 0 
        ? `Identified dependencies: ${sdkManifest.map(s => `${s.name}@${s.version}`).join(', ')}.`
        : 'Scanned dependencies; no major high-churn framework SDKs detected.',
      file: 'package.json',
      remediation: 'Use Context7 MCP tools to query exact version docs for any API upgrades.'
    });
    passedCount++;

    // 5. Live Supply-Chain Dependency CVE Vulnerability Scan
    try {
      const cveResult = await scanDependencyCVEs(projectPath);
      if (cveResult.findings && cveResult.findings.length > 0) {
        for (const cveFinding of cveResult.findings) {
          findings.push(cveFinding);
          if (cveFinding.severity === 'P0') p0Count++;
          else if (cveFinding.severity === 'P1') p1Count++;
          else if (cveFinding.severity === 'P2') p2Count++;
        }
      } else if (cveResult.hasPackageJson) {
        findings.push({
          id: 'SUPPLY-CHAIN-CVE-CLEAN',
          severity: 'PASSED',
          title: 'Supply-Chain Security: Zero Known Critical/High CVEs',
          description: 'Dependency audit verified no critical or high severity security vulnerabilities in locked dependencies.',
          file: cveResult.hasLockfile ? 'package-lock.json' : 'package.json'
        });
        passedCount++;
      }
    } catch (cveErr) {
      // Non-blocking fallback if npm audit cannot run in offline sandbox
    }

    // Score calculation
    let score = 100;
    score -= (p0Count * 35);
    score -= (p1Count * 15);
    score -= (p2Count * 5);
    score = Math.max(0, Math.min(100, score));

    let status = 'passed';
    if (p0Count > 0) status = 'failed';
    else if (p1Count > 0 || p2Count > 2) status = 'warning';

    return {
      id: this.id,
      number: this.number,
      name: this.name,
      category: this.category,
      status,
      score,
      findings,
      sdkManifest,
      stats: { p0: p0Count, p1: p1Count, p2: p2Count, passed: passedCount }
    };
  }
};
