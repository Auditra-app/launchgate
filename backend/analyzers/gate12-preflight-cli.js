const path = require('path');
const { readFile } = require('../services/file-crawler');

module.exports = {
  id: 'gate-12',
  number: 12,
  name: 'Preflight CLI Suite, Clean Build & Release Certificate',
  category: 'CLI Preflight & Release',
  description: 'Validates CLI preflight configurations, checks script definitions, provides live interactive terminal runners, and unlocks the final Release Certificate.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    const pkgJsonStr = readFile(projectPath, 'package.json');
    let pkg = {};
    if (pkgJsonStr) {
      try { pkg = JSON.parse(pkgJsonStr); } catch (e) {}
    }

    const scripts = pkg.scripts || {};

    // 1. Check for Typecheck Script
    const hasTsConfig = files.includes('tsconfig.json');
    const hasTypecheckScript = Boolean(scripts.typecheck || scripts['type-check'] || scripts.tsc);

    if (hasTsConfig && !hasTypecheckScript) {
      findings.push({
        id: 'CLI-NO-TYPECHECK-SCRIPT',
        severity: 'P2',
        title: 'Missing "typecheck" script in package.json',
        description: 'Project uses TypeScript (`tsconfig.json`) but does not define a `"typecheck": "tsc --noEmit"` script for CI and pre-commit checks.',
        file: 'package.json',
        remediation: 'Add `"typecheck": "tsc --noEmit"` to `"scripts"` in package.json.',
        rule: 'Preflight CLI Rule 12.1 (Typecheck Script)'
      });
      p2Count++;
    } else if (hasTypecheckScript) {
      findings.push({
        id: 'CLI-TYPECHECK-SCRIPT-OK',
        severity: 'PASSED',
        title: 'Typecheck script configured',
        description: `Found script: "typecheck": "${scripts.typecheck || scripts['type-check'] || scripts.tsc}".`,
        file: 'package.json'
      });
      passedCount++;
    }

    // 2. Check for Lint Script
    const hasLintScript = Boolean(scripts.lint);
    if (!hasLintScript) {
      findings.push({
        id: 'CLI-NO-LINT-SCRIPT',
        severity: 'P2',
        title: 'Missing "lint" script in package.json',
        description: 'No `"lint"` script defined in package.json to catch syntax and styling regressions.',
        file: 'package.json',
        remediation: 'Add `"lint": "eslint ."` or `"lint": "biome check ."` to package.json scripts.',
        rule: 'Preflight CLI Rule 12.2 (Lint Script)'
      });
      p2Count++;
    } else {
      findings.push({
        id: 'CLI-LINT-SCRIPT-OK',
        severity: 'PASSED',
        title: 'Linter script configured',
        description: `Found script: "lint": "${scripts.lint}".`,
        file: 'package.json'
      });
      passedCount++;
    }

    // 3. Check for Production Build Script
    const hasBuildScript = Boolean(scripts.build);
    if (!hasBuildScript && stackInfo.framework) {
      findings.push({
        id: 'CLI-NO-BUILD-SCRIPT',
        severity: 'P1',
        title: 'Missing "build" script in package.json',
        description: 'Framework project does not define a `"build"` script in package.json. Automated CI/CD and deployment targets will fail to generate production bundles.',
        file: 'package.json',
        remediation: 'Add `"build": "next build"` (or framework build command) to package.json scripts.',
        rule: 'Preflight CLI Rule 12.3 (Production Build Script)'
      });
      p1Count++;
    } else if (hasBuildScript) {
      findings.push({
        id: 'CLI-BUILD-SCRIPT-OK',
        severity: 'PASSED',
        title: 'Production build script configured',
        description: `Found script: "build": "${scripts.build}".`,
        file: 'package.json'
      });
      passedCount++;
    }

    // 4. Interactive CLI Runner Commands
    const recommendedCommands = {
      typecheck: hasTsConfig ? 'npx tsc --noEmit' : 'echo "No TypeScript config detected"',
      lint: hasLintScript ? 'npm run lint' : 'npx eslint .',
      audit: 'npm audit --production',
      build: hasBuildScript ? 'npm run build' : 'echo "No build script configured"'
    };

    findings.push({
      id: 'CLI-LIVE-RUNNERS-READY',
      severity: 'PASSED',
      title: 'Interactive Preflight CLI Suite ready for live execution',
      description: 'You can execute live Typecheck, Linter, Dependency Audit, and Dry-Run Build directly from the dashboard terminal runner.',
      file: 'cli-suite'
    });
    passedCount++;

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
      recommendedCommands,
      stats: { p0: p0Count, p1: p1Count, p2: p2Count, passed: passedCount }
    };
  }
};
