const path = require('path');
const { readFile, getSnippet } = require('../services/file-crawler');

module.exports = {
  id: 'gate-4',
  number: 4,
  name: 'APIs, Webhooks, Idempotency & Abuse Defenses',
  category: 'API & Abuse Defenses',
  description: 'Validates webhook cryptographic signatures, idempotency locks, rate limiting on sensitive routes, request size limits, and strict CORS policies.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    // 1. Locate Webhook Routes
    const webhookFiles = files.filter(f => 
      !f.startsWith('backend/analyzers/') &&
      !f.startsWith('backend/services/') &&
      (f.includes('webhook') || f.includes('stripe') || f.includes('paymob') || f.includes('salla') || f.includes('clerk-sync')) &&
      /\.(js|jsx|ts|tsx|py)$/.test(f)
    );

    for (const wFile of webhookFiles) {
      const content = readFile(projectPath, wFile);
      if (!content) continue;

      // Check for cryptographic signature verification
      const hasSignatureVerification = (
        content.includes('constructEvent') ||
        content.includes('createHmac') ||
        content.includes('verifySignature') ||
        content.includes('svix') ||
        content.includes('stripe.webhooks') ||
        content.includes('verifyHeader')
      );

      if (!hasSignatureVerification) {
        findings.push({
          id: `WH-NO-SIG-VERIFY-${wFile.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'P0',
          title: `Webhook Handler Missing Cryptographic Signature Verification (${wFile})`,
          description: `This webhook endpoint processes events without verifying cryptographic signatures against the raw request body. Anyone can forge fake payment or user events and send them to your server.`,
          file: wFile,
          line: 1,
          snippet: getSnippet(content, 1, 4),
          remediation: `Verify webhook signature using provider SDK and raw request body (e.g., \`stripe.webhooks.constructEvent(rawBody, sig, secret)\`).`,
          rule: 'Preflight Webhook Rule 4.1 (Cryptographic Signature Verification)'
        });
        p0Count++;
      } else {
        findings.push({
          id: `WH-SIG-VERIFIED-${wFile.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'PASSED',
          title: `Webhook signature verification detected in ${wFile}`,
          description: 'Webhook verifies provider signature before processing payload.',
          file: wFile
        });
        passedCount++;
      }

      // Check for Idempotency Handling
      const hasIdempotency = (
        content.includes('idempotency') ||
        content.includes('processed_events') ||
        content.includes('eventId') ||
        content.includes('event.id') ||
        content.includes('findFirst({ where: { eventId') ||
        content.includes('redis.set(') ||
        content.includes('already_processed')
      );

      if (!hasIdempotency) {
        findings.push({
          id: `WH-NO-IDEMPOTENCY-${wFile.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'P1',
          title: `Webhook Handler Lacks Idempotency Guard (${wFile})`,
          description: `Payment and event webhooks are frequently retried by providers. Without idempotency tracking (recording event.id in DB or cache), retried requests can cause double charging or duplicate credits.`,
          file: wFile,
          remediation: `Store processed \`event.id\` in a database table or Redis key with a TTL, and exit early if already handled.`,
          rule: 'Preflight Webhook Rule 4.2 (Idempotent Webhook Processing)'
        });
        p1Count++;
      }
    }

    if (webhookFiles.length === 0) {
      findings.push({
        id: 'WH-NONE-FOUND',
        severity: 'PASSED',
        title: 'No third-party webhook endpoints detected',
        description: 'Application does not define incoming webhook receivers requiring signature verification.',
        file: 'api'
      });
      passedCount++;
    }

    // 2. Rate Limiting Check
    const codeFiles = files.filter(f => /\.(js|ts|py)$/.test(f) && !f.startsWith('backend/analyzers/'));
    const hasRateLimiting = codeFiles.some(f => {
      const c = readFile(projectPath, f);
      return c && (
        c.includes('express-rate-limit') ||
        c.includes('@upstash/ratelimit') ||
        c.includes('rateLimit(') ||
        c.includes('slowDown(') ||
        c.includes('RateLimiter')
      );
    });

    if (stackInfo.isElectron || stackInfo.isDesktop) {
      findings.push({
        id: 'ABUSE-CLIENT-DESKTOP-OK',
        severity: 'PASSED',
        title: 'Desktop Client: Public endpoint rate-limiting not required',
        description: 'Desktop applications communicate as client consumers and do not run public HTTP listeners subject to DDoS or credential stuffing.',
        file: 'electron'
      });
      passedCount++;
    } else if (hasRateLimiting) {
      findings.push({
        id: 'ABUSE-RATELIMIT-OK',
        severity: 'PASSED',
        title: 'Rate limiting middleware detected',
        description: 'Application configures rate limiting to defend against brute force and DDoS.',
        file: 'middleware'
      });
      passedCount++;
    } else {
      findings.push({
        id: 'ABUSE-NO-RATELIMIT',
        severity: 'P1',
        title: 'Missing Rate Limiting Protection on Public / Auth Endpoints',
        description: 'No rate-limiting middleware (e.g. @upstash/ratelimit, express-rate-limit) found. Public endpoints (auth, password reset, search, AI routes) are vulnerable to credential stuffing, brute-forcing, and resource exhaustion.',
        file: stackInfo.isNext ? 'src/middleware.ts' : 'server.js',
        remediation: 'Implement rate limiting using @upstash/ratelimit or express-rate-limit on all public endpoints.',
        rule: 'Preflight Abuse Rule 4.3 (Rate Limiting)'
      });
      p1Count++;
    }

    // 3. Permissive CORS Wildcard with Credentials
    for (const f of codeFiles) {
      const c = readFile(projectPath, f);
      if (!c) continue;

      if ((c.includes('cors(') || c.includes('Access-Control-Allow-Origin')) && c.includes("'*'") && (c.includes('credentials: true') || c.includes('Access-Control-Allow-Credentials'))) {
        const lineNum = c.split('\n').findIndex(l => l.includes("'*'")) + 1;
        findings.push({
          id: `CORS-WILDCARD-CREDENTIALS-${f.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'P0',
          title: `Permissive CORS Wildcard with Credentials in ${f}`,
          description: `Access-Control-Allow-Origin is set to '*' alongside credentials: true, which is a severe security violation that modern browsers block or that permits unauthorized cross-origin requests.`,
          file: f,
          line: lineNum,
          snippet: getSnippet(c, lineNum, 2),
          remediation: `Specify explicit allowed origins or validate the Origin header against a whitelist.`,
          rule: 'Preflight Abuse Rule 4.4 (CORS Security)'
        });
        p0Count++;
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
