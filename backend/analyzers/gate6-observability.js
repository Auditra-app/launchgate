const path = require('path');
const { readFile, getSnippet } = require('../services/file-crawler');

module.exports = {
  id: 'gate-6',
  number: 6,
  name: 'Observability, Sentry & Error Resilience',
  category: 'Observability & Monitoring',
  description: 'Audits Sentry SDK setup across runtimes, UI Error Boundaries, unhandled rejection handlers, swallowed error blocks, and PII telemetry scrubbing.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    // 1. Sentry / Observability Check
    const hasSentryDep = stackInfo.hasSentry || files.some(f => f.includes('sentry.'));
    const sentryConfigFiles = files.filter(f => f.includes('sentry.client') || f.includes('sentry.server') || f.includes('sentry.edge') || f.includes('sentry.config'));

    // Check for process-level exception handlers (resilience)
    const hasProcessResilience = files.some(f => {
      if (!/\.(js|ts)$/.test(f)) return false;
      const c = readFile(projectPath, f);
      return c && (c.includes('uncaughtException') || c.includes('unhandledRejection'));
    });

    if (!hasSentryDep) {
      if (stackInfo.isCli && hasProcessResilience) {
        findings.push({
          id: 'OBS-CLI-RESILIENCE-OK',
          severity: 'PASSED',
          title: 'CLI / Local Service: Process exception resilience handlers active',
          description: 'Process-level uncaughtException and unhandledRejection handlers detected for local resilience and error tracing.',
          file: 'server.js'
        });
        passedCount++;
      } else {
        const severity = stackInfo.isCli ? 'P2' : 'P1';
        findings.push({
          id: 'OBS-SENTRY-MISSING',
          severity,
          title: 'Missing Sentry Error Monitoring SDK',
          description: 'No Sentry SDK (@sentry/nextjs, @sentry/react, @sentry/node) detected in dependencies. Production exceptions will occur without automated alerts or stack traces.',
          file: 'package.json',
          remediation: 'Install and initialize @sentry/nextjs (or relevant Sentry SDK) with DSN and sourcemap uploads.',
          rule: 'Preflight Observability Rule 6.1 (Sentry SDK Integration)'
        });
        if (severity === 'P1') p1Count++;
        else p2Count++;
      }
    } else {
      findings.push({
        id: 'OBS-SENTRY-OK',
        severity: 'PASSED',
        title: 'Sentry error monitoring detected',
        description: `Sentry configuration confirmed (${sentryConfigFiles.length ? sentryConfigFiles.join(', ') : 'package configured'}).`,
        file: 'sentry-config'
      });
      passedCount++;

      // Check Sentry PII Scrubbing (beforeSend)
      let hasBeforeSend = false;
      for (const scf of sentryConfigFiles) {
        const scContent = readFile(projectPath, scf);
        if (scContent && scContent.includes('beforeSend')) {
          hasBeforeSend = true;
          break;
        }
      }

      if (!hasBeforeSend && sentryConfigFiles.length > 0) {
        findings.push({
          id: 'OBS-SENTRY-NO-BEFORESEND',
          severity: 'P2',
          title: 'Sentry configuration lacks `beforeSend` PII scrubber',
          description: 'Sentry config does not define a `beforeSend` hook to strip sensitive user data (passwords, auth tokens, credit cards) before sending events to the Sentry cloud.',
          file: sentryConfigFiles[0],
          remediation: 'Add a `beforeSend(event)` handler to sanitize sensitive headers and request bodies.',
          rule: 'Preflight Observability Rule 6.2 (PII Scrubbing)'
        });
        p2Count++;
      }
    }

    // 2. UI Error Boundaries
    const hasUIComponents = files.some(f => f.endsWith('.jsx') || f.endsWith('.tsx'));
    const hasErrorBoundary = files.some(f => 
      f.includes('error.tsx') ||
      f.includes('error.jsx') ||
      f.includes('global-error.tsx') ||
      f.includes('ErrorBoundary')
    );

    if (!hasUIComponents) {
      findings.push({
        id: 'OBS-ERROR-BOUNDARY-NA',
        severity: 'PASSED',
        title: 'Backend / Headless Service: UI Error Boundaries not required',
        description: 'Service does not contain JSX/TSX front-end components.',
        file: 'backend'
      });
      passedCount++;
    } else if (hasErrorBoundary) {
      findings.push({
        id: 'OBS-ERROR-BOUNDARY-OK',
        severity: 'PASSED',
        title: 'UI Error Boundary present',
        description: 'Detected component error boundaries or framework error page fallbacks.',
        file: files.find(f => f.includes('ErrorBoundary') || f.includes('error.t')) || 'ErrorBoundary'
      });
      passedCount++;
    } else {
      findings.push({
        id: 'OBS-NO-ERROR-BOUNDARY',
        severity: 'P1',
        title: 'Missing UI Error Boundary (ErrorBoundary / error.tsx)',
        description: 'No React Error Boundary or error.tsx fallback found. An unhandled frontend exception will crash the user interface into a blank screen.',
        file: stackInfo.isNext ? 'app/error.tsx' : 'src/components/ErrorBoundary.tsx',
        remediation: 'Create an Error Boundary component with a user-friendly fallback view and recovery retry button.',
        rule: 'Preflight Observability Rule 6.3 (UI Error Boundaries)'
      });
      p1Count++;
    }

    // 3. Swallowed Catch Blocks: catch (err) {} or catch (e) { console.log(e); }
    const codeFiles = files.filter(f => 
      !f.startsWith('backend/analyzers/') &&
      !f.startsWith('backend/services/') &&
      /\.(js|jsx|ts|tsx)$/.test(f)
    );
    let swallowedCount = 0;

    for (const f of codeFiles) {
      if (swallowedCount >= 5) break;
      const content = readFile(projectPath, f);
      if (!content) continue;

      const emptyCatchRegex = /catch\s*\([a-zA-Z0-9_]*\)\s*\{\s*\}/g;
      let match;
      while ((match = emptyCatchRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        findings.push({
          id: `OBS-SILENT-CATCH-${f.replace(/[^a-zA-Z0-9]/g, '_')}-${lineNum}`,
          severity: 'P1',
          title: `Silent / Swallowed Exception in ${f}`,
          description: `Empty catch block swallows unexpected errors silently without logging or notifying monitoring systems, making production debugging impossible.`,
          file: f,
          line: lineNum,
          snippet: getSnippet(content, lineNum, 2),
          remediation: 'Log the error to Sentry/logger or gracefully handle and rethrow: `Sentry.captureException(err);`',
          rule: 'Preflight Observability Rule 6.4 (No Swallowed Exceptions)'
        });
        p1Count++;
        swallowedCount++;
      }
    }

    // Score calculation
    let score = 100;
    score -= (p0Count * 35);
    score -= (p1Count * 15);
    score -= (p2Count * 5);
    score = Math.max(0, Math.min(100, score));

    let status = 'passed';
    if (p0Count > 0) status = 'failed';
    else if (p1Count > 0) status = 'warning';

    return {
      id: this.id,
      number: this.number,
      name: this.name,
      category: this.category,
      status,
      score,
      findings,
      stats: { p0: p0Count, p1: p1Count, p2: p2Count, passed: passedCount }
    };
  }
};
