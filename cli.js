#!/usr/bin/env node
/**
 * LaunchGate Headless CLI & CI/CD Preflight Runner
 * Usage:
 *   npx launchgate scan [path] [--fail-on-p0] [--fail-on-p1] [--json] [--report] [--gates 1,2,3]
 *   npx launchgate ui [port]
 */

const path = require('path');
const fs = require('fs');
const { runAllGates, getAllGates, getGate } = require('./backend/analyzers');
const { crawlProject } = require('./backend/services/file-crawler');
const { detectStack } = require('./backend/services/stack-detector');
const { generateCertificate } = require('./backend/services/certificate-generator');

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

function printHelp() {
  console.log(`
${ANSI.bold}${ANSI.cyan}🚀 LaunchGate CLI — Enterprise Production Readiness & Pre-Launch Preflight${ANSI.reset}

${ANSI.bold}USAGE:${ANSI.reset}
  launchgate [command] [options]

${ANSI.bold}COMMANDS:${ANSI.reset}
  scan [path]        Run static analysis scan on project (default command)
  magic [path]       ✨ Transmute vibe-coded project into turnkey production-ready SaaS
  ui                 Launch the local LaunchGate Web Dashboard (http://localhost:4545)
  mcp                Launch the native Model Context Protocol (MCP) server for AI IDEs
  init-hooks [path]  Install Git pre-push hook preventing P0 release blockers
  help               Show this help message

${ANSI.bold}OPTIONS:${ANSI.reset}
  --path <dir>       Path to project directory (default: current working directory)
  --gates <ids>      Comma-separated gate numbers to run, e.g. 1,2,3,4 (default: all 12)
  --fail-on-p0       Exit with status code 1 if any P0 Critical Blockers are found (CI mode)
  --fail-on-p1       Exit with status code 1 if any P0 or P1 High Risks are found
  --json             Output raw JSON results only (ideal for pipeline integration)
  --sarif            Generate OASIS launchgate.sarif for GitHub Code Scanning
  --report           Generate / update PRODUCTION_READINESS_REPORT.md in project root
  --read-only        Read-only scan: do not write .antigravity/ audit notes into target repo (CI friendly)
  --silent           Suppress banner and progress output (useful with --json)

${ANSI.bold}EXAMPLES:${ANSI.reset}
  $ npx launchgate scan
  $ npx launchgate scan --read-only --fail-on-p0
  $ npx launchgate scan --fail-on-p0 --report
  $ npx launchgate scan --gates 1,2,3 --json
  $ npx launchgate ui --host 0.0.0.0
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    const pkg = require('./package.json');
    console.log(`launchgate v${pkg.version}`);
    process.exit(0);
  }

  // Route to UI command
  if (args[0] === 'ui') {
    const hostIdx = args.findIndex(a => a === '--host' || a.startsWith('--host='));
    const targetHost = hostIdx !== -1 ? (args[hostIdx].includes('=') ? args[hostIdx].split('=')[1] : args[hostIdx + 1]) : 'localhost';
    console.log(`${ANSI.cyan}Starting LaunchGate Dashboard at http://${targetHost}:4545 ...${ANSI.reset}`);
    require('./server.js');
    return;
  }

  // Route to MCP command
  if (args[0] === 'mcp') {
    require('./mcp-server.js');
    return;
  }

  // Route to init-hooks command (Phase 2)
  if (args[0] === 'init-hooks' || args.includes('--init-hooks')) {
    const { installGitHook } = require('./backend/services/git-hooks-installer');
    const target = args[1] && !args[1].startsWith('--') ? path.resolve(args[1]) : process.cwd();
    const res = installGitHook(target);
    if (res.success) {
      console.log(`\n${ANSI.green}${ANSI.bold}✓ ${res.message}${ANSI.reset}`);
      console.log(`${ANSI.dim}Hook location: ${res.hookPath}${ANSI.reset}\n`);
    } else {
      console.error(`\n${ANSI.red}${ANSI.bold}✕ ${res.error}${ANSI.reset}\n`);
      process.exit(1);
    }
    return;
  }

  // Route to magic turnkey transmutation command
  if (args[0] === 'magic' || args.includes('--turnkey') || args.includes('--magic')) {
    const { analyzeVibeSaaS, executeTurnkeyTransmutation } = require('./backend/services/magic-turnkey-engine');
    const target = args[1] && !args[1].startsWith('--') ? path.resolve(args[1]) : process.cwd();
    
    console.log(`\n${ANSI.bold}${ANSI.magenta}✨ LaunchGate Magic Vibe-to-SaaS Transmuter${ANSI.reset}`);
    console.log(`${ANSI.dim}Target repository: ${target}${ANSI.reset}\n`);

    try {
      const analysis = analyzeVibeSaaS(target);
      console.log(`${ANSI.cyan}🔍 Detected Stack:${ANSI.reset} ${analysis.stackInfo?.frameworks?.concat(analysis.stackInfo?.languages || []).join(', ') || 'Web App'}`);
      console.log(`${ANSI.yellow}⚠️  Production Readiness Gaps:${ANSI.reset} ${analysis.gapsCount} out of ${analysis.modules.length} standard pillars missing (Initial Score: ${analysis.vibeReadinessScore}%)\n`);

      console.log(`${ANSI.bold}Transmuting codebase into Turnkey Production SaaS...${ANSI.reset}`);
      const result = await executeTurnkeyTransmutation(target);

      console.log(`\n${ANSI.green}${ANSI.bold}✓ Magic Transmutation Complete!${ANSI.reset}`);
      console.log(`${ANSI.bold}Production Assets Injected (${result.changesCount}):${ANSI.reset}`);
      result.changes.forEach(c => {
        console.log(`  ${ANSI.green}+${ANSI.reset} ${c.file} ${ANSI.dim}(${c.note || c.action})${ANSI.reset}`);
      });

      console.log(`\n${ANSI.bold}Hardened Production Readiness Score:${ANSI.reset} ${ANSI.green}${ANSI.bold}${result.newOverallScore}%${ANSI.reset}`);
      console.log(`${ANSI.dim}Your vibe-coded app is now hardened and production-ready!${ANSI.reset}\n`);
    } catch (err) {
      console.error(`\n${ANSI.red}${ANSI.bold}✕ Transmutation failed:${ANSI.reset} ${err.message}\n`);
      process.exit(1);
    }
    return;
  }

  // Parse Scan Flags
  let targetPath = process.cwd();
  let failOnP0 = false;
  let failOnP1 = false;
  let jsonOutput = false;
  let generateReport = false;
  let generateSarif = false;
  let silent = false;
  let readOnly = false;
  let selectedGates = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'scan') {
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        targetPath = path.resolve(args[i + 1]);
        i++;
      }
    } else if (arg === '--path' && args[i + 1]) {
      targetPath = path.resolve(args[++i]);
    } else if (arg.startsWith('--path=')) {
      targetPath = path.resolve(arg.split('=')[1]);
    } else if (arg === '--fail-on-p0') {
      failOnP0 = true;
    } else if (arg === '--fail-on-p1') {
      failOnP1 = true;
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--report') {
      generateReport = true;
    } else if (arg === '--sarif') {
      generateSarif = true;
    } else if (arg === '--silent') {
      silent = true;
    } else if (arg === '--read-only' || arg === '--no-write') {
      readOnly = true;
    } else if (arg === '--gates' && args[i + 1]) {
      const parts = args[++i].split(',').map(s => s.trim().toLowerCase());
      selectedGates = parts.map(p => p.startsWith('gate-') ? p : `gate-${p}`);
    } else if (arg.startsWith('--gates=')) {
      const parts = arg.split('=')[1].split(',').map(s => s.trim().toLowerCase());
      selectedGates = parts.map(p => p.startsWith('gate-') ? p : `gate-${p}`);
    } else if (!arg.startsWith('--') && i === 0) {
      targetPath = path.resolve(arg);
    }
  }

  targetPath = path.resolve(targetPath);

  if (!fs.existsSync(targetPath)) {
    console.error(`${ANSI.red}Error: Target directory does not exist: ${targetPath}${ANSI.reset}`);
    process.exit(1);
  }

  if (!jsonOutput && !silent) {
    console.log(`\n${ANSI.bold}${ANSI.cyan}═══════════════════════════════════════════════════════════════════════${ANSI.reset}`);
    console.log(`${ANSI.bold}${ANSI.cyan} 🚀 LaunchGate: Enterprise Production Readiness Preflight Runner${ANSI.reset}`);
    console.log(`${ANSI.dim} Target: ${targetPath}${ANSI.reset}`);
    console.log(`${ANSI.bold}${ANSI.cyan}═══════════════════════════════════════════════════════════════════════${ANSI.reset}\n`);
  }

  const startTime = Date.now();
  const files = crawlProject(targetPath);
  const stack = detectStack(targetPath, files);

  if (!jsonOutput && !silent) {
    const stackNames = stack.allBadges.map(b => b.name).join(', ') || 'Standard Web Stack';
    console.log(`${ANSI.dim}📦 Detected Stack:${ANSI.reset} ${ANSI.bold}${stackNames}${ANSI.reset} (${files.length} source files indexed)`);
    console.log(`${ANSI.dim}🔍 Executing Production Readiness Audit Matrix...${ANSI.reset}\n`);
  }

  const { results, project } = await runAllGates(targetPath, null, selectedGates, { readOnly });

  let totalP0 = 0;
  let totalP1 = 0;
  let totalP2 = 0;
  let totalPassed = 0;

  const gatesArray = Object.keys(results).map(id => results[id]);

  for (const g of gatesArray) {
    if (g.stats) {
      totalP0 += (g.stats.p0 || 0);
      totalP1 += (g.stats.p1 || 0);
      totalP2 += (g.stats.p2 || 0);
      totalPassed += (g.stats.passed || 0);
    }
  }

  const overallScore = project.overallScore || 0;
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  if (generateReport) {
    try {
      generateCertificate(targetPath);
      if (!jsonOutput && !silent) {
        console.log(`${ANSI.green}✓ Saved PRODUCTION_READINESS_REPORT.md in project root${ANSI.reset}\n`);
      }
    } catch (e) {
      if (!silent) console.error(`${ANSI.red}Failed to generate report: ${e.message}${ANSI.reset}`);
    }
  }

  if (generateSarif) {
    try {
      const { generateSarifReport } = require('./backend/services/sarif-generator');
      const sarif = generateSarifReport(targetPath, { gates: results, overallScore });
      if (!jsonOutput && !silent) {
        console.log(`${ANSI.green}✓ Saved launchgate.sarif (OASIS v2.1.0) in project root (${sarif.totalResults} findings mapped)${ANSI.reset}\n`);
      }
    } catch (e) {
      if (!jsonOutput && !silent) console.error(`${ANSI.red}Failed to generate SARIF: ${e.message}${ANSI.reset}`);
    }
  }

  if (jsonOutput) {
    const output = {
      projectPath: targetPath,
      scanTime: new Date().toISOString(),
      durationSeconds: parseFloat(duration),
      stack: stack.allBadges.map(b => b.name),
      overallScore,
      stats: { p0: totalP0, p1: totalP1, p2: totalP2, passed: totalPassed },
      verdict: totalP0 === 0 && totalP1 === 0 && overallScore >= 90 ? 'CERTIFIED_READY' : totalP0 === 0 && overallScore >= 70 ? 'CONDITIONAL_RELEASE' : 'LAUNCH_BLOCKED',
      gates: results
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Terminal formatted table
    console.log(`${ANSI.bold}GATE RESULTS:${ANSI.reset}`);
    for (const g of gatesArray) {
      let statusColor = ANSI.green;
      let statusLabel = 'PASSED ';
      if (g.status === 'failed') {
        statusColor = ANSI.red;
        statusLabel = 'BLOCKER';
      } else if (g.status === 'warning') {
        statusColor = ANSI.yellow;
        statusLabel = 'WARNING';
      }

      const scoreStr = `${g.score || 0}%`.padStart(4, ' ');
      const p0Str = g.stats?.p0 ? `${ANSI.red}${g.stats.p0} P0${ANSI.reset}` : `${ANSI.dim}0 P0${ANSI.reset}`;
      const p1Str = g.stats?.p1 ? `${ANSI.yellow}${g.stats.p1} P1${ANSI.reset}` : `${ANSI.dim}0 P1${ANSI.reset}`;
      const namePad = g.name.padEnd(52, ' ').slice(0, 52);

      console.log(`  ${ANSI.dim}G${String(g.number).padStart(2, '0')}${ANSI.reset} ${namePad} ${statusColor}[${statusLabel}]${ANSI.reset} ${scoreStr}  ${p0Str} ${p1Str}`);
    }

    console.log(`\n${ANSI.bold}SUMMARY:${ANSI.reset}`);
    console.log(`  Readiness Score : ${ANSI.bold}${overallScore >= 90 ? ANSI.green : overallScore >= 70 ? ANSI.yellow : ANSI.red}${overallScore}%${ANSI.reset}`);
    console.log(`  Blockers (P0)   : ${totalP0 > 0 ? ANSI.red : ANSI.green}${totalP0}${ANSI.reset}`);
    console.log(`  High Risks (P1) : ${totalP1 > 0 ? ANSI.yellow : ANSI.green}${totalP1}${ANSI.reset}`);
    console.log(`  Hygiene (P2)    : ${totalP2}`);
    console.log(`  Passed Checks   : ${ANSI.green}${totalPassed}${ANSI.reset}`);
    console.log(`  Scan Duration   : ${duration}s`);

    let verdictBadge = '';
    if (totalP0 === 0 && totalP1 === 0 && overallScore >= 90) {
      verdictBadge = `${ANSI.bgGreen}${ANSI.white}${ANSI.bold} ✓ CERTIFIED READY FOR PRODUCTION ${ANSI.reset}`;
    } else if (totalP0 === 0 && overallScore >= 70) {
      verdictBadge = `${ANSI.bgYellow}${ANSI.white}${ANSI.bold} ⚠ CONDITIONAL RELEASE (REVIEW HIGH RISKS) ${ANSI.reset}`;
    } else {
      verdictBadge = `${ANSI.bgRed}${ANSI.white}${ANSI.bold} ✕ LAUNCH BLOCKED (P0 CRITICAL BLOCKERS DETECTED) ${ANSI.reset}`;
    }

    console.log(`\n  VERDICT: ${verdictBadge}\n`);
  }

  // CI/CD Failure Exit Codes
  if (failOnP0 && totalP0 > 0) {
    if (!jsonOutput && !silent) {
      console.error(`${ANSI.red}${ANSI.bold}CI Check Failed: ${totalP0} P0 Critical Blocker(s) detected.${ANSI.reset}`);
    }
    process.exit(1);
  }

  if (failOnP1 && (totalP0 > 0 || totalP1 > 0)) {
    if (!jsonOutput && !silent) {
      console.error(`${ANSI.red}${ANSI.bold}CI Check Failed: Found ${totalP0} P0 and ${totalP1} P1 issues.${ANSI.reset}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
  });
}

module.exports = { main };
