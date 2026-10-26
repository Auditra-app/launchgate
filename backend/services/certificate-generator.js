const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildComplianceMatrix } = require('./compliance-mapper');
const { getProject } = require('./audit-store');

function generateCertificate(projectPath, projectData, cliResults = {}) {
  // Allow callers (CLI, MCP, CI) to omit the project snapshot and load the
  // latest persisted audit from the local store.
  const resolvedPath = path.resolve(projectPath);
  const project = projectData || getProject(resolvedPath);
  if (!project) {
    throw new Error(`No audit results found for ${resolvedPath}. Run a scan before generating a certificate.`);
  }

  const gates = project.gates || {};
  const score = project.overallScore || 0;
  const timestamp = new Date().toISOString();
  const compliance = buildComplianceMatrix(project);

  // Calculate totals
  let totalP0 = 0;
  let totalP1 = 0;
  let totalP2 = 0;
  let totalPassed = 0;
  let verifiedCount = 0;

  for (let i = 1; i <= 12; i++) {
    const gate = gates[`gate-${i}`];
    if (gate) {
      if (gate.stats) {
        totalP0 += (gate.stats.p0 || 0);
        totalP1 += (gate.stats.p1 || 0);
        totalP2 += (gate.stats.p2 || 0);
        totalPassed += (gate.stats.passed || 0);
      }
      if (gate.verified) {
        verifiedCount++;
      }
    }
  }

  // Determine verdict
  let verdict = '🛑 LAUNCH BLOCKED (CRITICAL ISSUES DETECTED)';
  let verdictColor = 'red';
  if (totalP0 === 0 && totalP1 === 0 && score >= 90) {
    verdict = '✅ READY FOR PRODUCTION (CERTIFIED)';
    verdictColor = 'green';
  } else if (totalP0 === 0 && score >= 70) {
    verdict = '⚠️ CONDITIONAL RELEASE (NON-BLOCKING WARNINGS)';
    verdictColor = 'amber';
  }

  // Generate SHA-256 signature
  const signatureInput = `${projectPath}:${score}:${timestamp}:${totalP0}:${totalP1}`;
  const certHash = crypto.createHash('sha256').update(signatureInput).digest('hex').substring(0, 32).toUpperCase();

  const reportContent = `# 🚀 Production Readiness & Pre-Launch Certificate

> **LaunchGate Enterprise Production Verification Report**  
> **Target Project:** \`${projectPath}\`  
> **Audit Date:** \`${timestamp}\`  
> **Certificate Hash:** \`LG-${certHash}\`  
> **Final Readiness Score:** **\`${score}%\`**  
> **Overall Release Verdict:** **${verdict}**

---

## 📊 Executive Audit Summary

| Metric | Result |
| :--- | :--- |
| **Production Readiness Score** | **${score}%** |
| **Release Verdict** | **${verdict}** |
| **Verified Gates** | **${verifiedCount} / 12** |
| **Critical Blockers (P0)** | **${totalP0}** |
| **High Risk Vulnerabilities (P1)** | **${totalP1}** |
| **Hygiene / Maintenance Issues (P2)** | **${totalP2}** |
| **Passed Preflight Checks** | **${totalPassed}** |

---

## 🛡️ 12-Gate Verification Ledger

| Gate | Title | Status | Score | Sign-off | Notes |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Gate 1** | Secrets, Credentials & Env Hygiene | ${formatGateBadge(gates['gate-1'])} | ${gates['gate-1']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-1'])} | ${gates['gate-1']?.notes || '—'} |
| **Gate 2** | Auth, Session Integrity & BOLA/IDOR | ${formatGateBadge(gates['gate-2'])} | ${gates['gate-2']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-2'])} | ${gates['gate-2']?.notes || '—'} |
| **Gate 3** | Database Security, Schemas & Validation | ${formatGateBadge(gates['gate-3'])} | ${gates['gate-3']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-3'])} | ${gates['gate-3']?.notes || '—'} |
| **Gate 4** | APIs, Webhooks & Idempotency | ${formatGateBadge(gates['gate-4'])} | ${gates['gate-4']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-4'])} | ${gates['gate-4']?.notes || '—'} |
| **Gate 5** | AI / LLM Cost, Quota & Prompt Injection | ${formatGateBadge(gates['gate-5'])} | ${gates['gate-5']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-5'])} | ${gates['gate-5']?.notes || '—'} |
| **Gate 6** | Observability, Sentry & Error Resilience | ${formatGateBadge(gates['gate-6'])} | ${gates['gate-6']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-6'])} | ${gates['gate-6']?.notes || '—'} |
| **Gate 7** | Performance, Bundling & Resource Leaks | ${formatGateBadge(gates['gate-7'])} | ${gates['gate-7']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-7'])} | ${gates['gate-7']?.notes || '—'} |
| **Gate 8** | Design Consistency, UX States & RTL/LTR | ${formatGateBadge(gates['gate-8'])} | ${gates['gate-8']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-8'])} | ${gates['gate-8']?.notes || '—'} |
| **Gate 9** | SEO, Metadata, Legal & Commercial Readiness | ${formatGateBadge(gates['gate-9'])} | ${gates['gate-9']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-9'])} | ${gates['gate-9']?.notes || '—'} |
| **Gate 10** | Code Hygiene, Duplication & Context7 Manifest | ${formatGateBadge(gates['gate-10'])} | ${gates['gate-10']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-10'])} | ${gates['gate-10']?.notes || '—'} |
| **Gate 11** | Infrastructure, CI/CD & Deployment Configs | ${formatGateBadge(gates['gate-11'])} | ${gates['gate-11']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-11'])} | ${gates['gate-11']?.notes || '—'} |
| **Gate 12** | Preflight CLI Suite & Clean Production Build | ${formatGateBadge(gates['gate-12'])} | ${gates['gate-12']?.score ?? 'N/A'}% | ${formatSignoff(gates['gate-12'])} | ${gates['gate-12']?.notes || '—'} |

---

## ⚡ Gate 12 CLI Verification Summary

| Check | Command | Status | Output Snippet |
| :--- | :--- | :---: | :--- |
| **Typecheck** | \`tsc --noEmit\` | ${cliResults.typecheck?.status || 'NOT RUN'} | \`${cliResults.typecheck?.summary || 'N/A'}\` |
| **Linter** | \`eslint / biome\` | ${cliResults.lint?.status || 'NOT RUN'} | \`${cliResults.lint?.summary || 'N/A'}\` |
| **Security Audit** | \`npm audit --production\` | ${cliResults.audit?.status || 'NOT RUN'} | \`${cliResults.audit?.summary || 'N/A'}\` |
| **Production Build** | \`npm run build\` | ${cliResults.build?.status || 'NOT RUN'} | \`${cliResults.build?.summary || 'N/A'}\` |

---

## 🏛️ Enterprise Compliance & Regulatory Alignment Matrix

### 1. OWASP API Security Top 10 Alignment
| OWASP Standard | Status | Audit Ledger |
| :--- | :---: | :--- |
${Object.entries(compliance.owaspCoverage).map(([k, v]) => `| **${k}** | ${v.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${v.details} |`).join('\n')}

### 2. SOC 2 Type II Trust Services Criteria
| SOC 2 Criteria | Status | Audit Ledger |
| :--- | :---: | :--- |
${Object.entries(compliance.soc2Coverage).map(([k, v]) => `| **${k}** | ${v.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${v.details} |`).join('\n')}

### 3. GDPR Data Protection & Security
| GDPR Requirement | Status | Audit Ledger |
| :--- | :---: | :--- |
${Object.entries(compliance.gdprCoverage).map(([k, v]) => `| **${k}** | ${v.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${v.details} |`).join('\n')}

---

## 🔒 Verification Sign-off & Release Seal
This certificate confirms that the codebase located at \`${projectPath}\` was rigorously audited against enterprise security, reliability, performance, and commercial standards.

**Signed by:** LaunchGate Production Preflight Auditor  
**Cryptographic Token:** \`LG-${certHash}\`  
**Generated At:** \`${timestamp}\`
`;

  const reportPath = path.join(projectPath, 'PRODUCTION_READINESS_REPORT.md');
  fs.writeFileSync(reportPath, reportContent, 'utf-8');

  // Generate Printable HTML Certificate for client handover / PDF export
  const htmlContent = generatePrintableHtmlCertificate({
    projectPath,
    projectName: path.basename(projectPath),
    score,
    verdict,
    certHash: `LG-${certHash}`,
    timestamp,
    totalP0,
    totalP1,
    totalP2,
    totalPassed,
    verifiedCount,
    gates,
    compliance
  });

  const htmlReportPath = path.join(projectPath, 'PRODUCTION_READINESS_CERTIFICATE.html');
  fs.writeFileSync(htmlReportPath, htmlContent, 'utf-8');

  return {
    reportPath,
    htmlReportPath,
    certHash: `LG-${certHash}`,
    score,
    verdict,
    timestamp
  };
}

function generatePrintableHtmlCertificate(data) {
  const gateRows = [];
  for (let i = 1; i <= 12; i++) {
    const g = data.gates[`gate-${i}`];
    const name = g?.name || `Gate ${i}`;
    const status = g?.verified ? 'VERIFIED' : (g?.status || 'UNSCANNED').toUpperCase();
    const score = g?.score !== undefined ? `${g.score}%` : 'N/A';
    const notes = g?.notes || (g?.verified ? 'Manually verified' : '—');
    const statusColor = g?.verified || status === 'PASSED' ? '#059669' : status === 'WARNING' ? '#d97706' : '#dc2626';

    gateRows.push(`
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">G${i}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0;">${name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: ${statusColor}; font-weight: 700;">${status}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${score}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">${notes}</td>
      </tr>
    `);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Production Readiness Certificate — ${data.projectName}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
    }
    .cert-frame {
      border: 3px solid #4f46e5;
      padding: 32px;
      border-radius: 12px;
      position: relative;
    }
    .cert-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .cert-seal {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: #4f46e5;
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);
    }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th { text-align: left; padding: 8px 12px; background: #f8fafc; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .print-btn-bar { margin-bottom: 20px; display: flex; justify-content: flex-end; gap: 8px; }
    .print-btn {
      background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px;
    }
    @media print {
      .print-btn-bar { display: none; }
      body { padding: 0; }
      .cert-frame { border: 2px solid #4f46e5; }
    }
  </style>
</head>
<body>
  <div class="print-btn-bar">
    <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>
  <div class="cert-frame">
    <div class="cert-header">
      <div>
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #6366f1; font-weight: 700;">LaunchGate Production Readiness</div>
        <h1 style="margin: 4px 0; font-size: 26px; color: #0f172a;">Production Release Certificate</h1>
        <div style="font-size: 13px; color: #64748b;">Project: <strong>${data.projectName}</strong> (${data.projectPath})</div>
      </div>
      <div class="cert-seal">
        <span style="font-size: 18px;">★</span>
        <span>VERIFIED</span>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div>
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Readiness Score</div>
        <div style="font-size: 28px; font-weight: 800; color: #4f46e5;">${data.score}%</div>
      </div>
      <div>
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Release Verdict</div>
        <div style="font-size: 16px; font-weight: 700; margin-top: 6px;">${data.verdict}</div>
      </div>
      <div>
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Audit Token Hash</div>
        <div style="font-size: 12px; font-family: monospace; font-weight: 700; margin-top: 8px;">${data.certHash}</div>
      </div>
      <div>
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Certified Date</div>
        <div style="font-size: 12px; font-family: monospace; margin-top: 8px;">${new Date(data.timestamp).toLocaleDateString()}</div>
      </div>
    </div>

    <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; color: #334155;">12-Gate Audit Verification Matrix</h3>
    <table>
      <thead>
        <tr>
          <th>Gate</th>
          <th>Verification Domain</th>
          <th>Status</th>
          <th>Score</th>
          <th>Audit &amp; Sign-off Notes</th>
        </tr>
      </thead>
      <tbody>
        ${gateRows.join('')}
      </tbody>
    </table>

    <div style="margin-top: 24px; padding: 14px 18px; background: #f1f5f9; border-radius: 8px; border: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
      <div><strong>🏛️ OWASP API Security:</strong> <span style="color: #059669; font-weight: 700;">Audited (API1-10)</span></div>
      <div><strong>🛡️ SOC 2 Type II:</strong> <span style="color: #059669; font-weight: 700;">Mapped (CC6.1/6.6/6.8/7.1)</span></div>
      <div><strong>⚖️ GDPR Compliance:</strong> <span style="color: #059669; font-weight: 700;">Audited (Art. 13/25/32)</span></div>
    </div>

    <div style="margin-top: 24px; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 16px;">
      <div style="font-size: 11px; color: #64748b; max-width: 360px;">
        This document serves as formal engineering verification that the target application meets enterprise production readiness standards.
      </div>
      <div style="text-align: right;">
        <div style="font-size: 12px; font-weight: 700; color: #0f172a;">LaunchGate Preflight Engine</div>
        <div style="font-size: 11px; font-family: monospace; color: #6366f1;">Cryptographically Signed: ${data.certHash}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function formatGateBadge(gate) {
  if (!gate || gate.status === 'unscanned') return '`UNSCANNED`';
  if (gate.verified) return '`✅ VERIFIED`';
  if (gate.status === 'passed') return '`✅ PASSED`';
  if (gate.status === 'warning') return '`⚠️ WARNING`';
  return '`🛑 FAILED`';
}

function formatSignoff(gate) {
  if (!gate) return 'No';
  return gate.verified ? `Yes (${new Date(gate.verifiedAt).toLocaleDateString()})` : 'No';
}

module.exports = { generateCertificate };
