/**
 * Multi-Agent Rule & Prompt Exporter
 * Generates tailored rule files for Cursor, Claude Code, Windsurf, Copilot, and Antigravity.
 */

const fs = require('fs');
const path = require('path');

const AGENT_TEMPLATES = {
  cursor: {
    filename: '.cursor/rules/launchgate.mdc',
    altFilename: '.cursorrules',
    title: 'Cursor IDE Rules (.cursor/rules/launchgate.mdc)',
    generate: (projectPath) => `---
description: Enterprise Production Readiness & Preflight Security Standards
globs: *
alwaysApply: true
---

# LaunchGate Production Readiness Standards (Cursor Agent)

Before implementing, refactoring, or approving any code changes in this repository, strictly adhere to the 12 LaunchGate production gates:

## 1. Secrets & Environment Hygiene (Gate 1)
- Never hardcode secrets, tokens, API keys, private certificates, or database connection strings.
- Never expose private credentials to client bundles via \`NEXT_PUBLIC_\`, \`VITE_\`, \`REACT_APP_\`, or \`PUBLIC_\` prefixes.
- Keep \`.env*\` strictly ignored in \`.gitignore\` and provide an up-to-date \`.env.example\`.

## 2. Authentication, Session & BOLA/IDOR (Gate 2)
- All mutating endpoints (POST, PUT, PATCH, DELETE) and private data endpoints MUST verify user session server-side.
- Prevent Broken Object Level Authorization (BOLA/IDOR): Always scope database queries by authenticated \`user_id\` / \`tenant_id\`.
- Enforce Role-Based Access Control (RBAC) on admin procedures.

## 3. Database Security & Input Validation (Gate 3)
- Never use raw SQL string concatenation. Always use parameterized queries or type-safe ORMs.
- Enforce PostgreSQL / Supabase Row-Level Security (RLS) on all public tables.
- Every API endpoint MUST validate request body, query params, and URL params with strict schemas (Zod, Valibot, Yup, Pydantic).

## 4. Webhooks, Idempotency & Rate Limiting (Gate 4)
- Incoming webhooks (Stripe, Clerk, custom) MUST verify raw cryptographic signatures before parsing payload.
- Implement idempotency keys to safely handle duplicate webhook deliveries.
- Apply rate limiting to all public endpoints (auth, reset-password, AI inference).

## 5. AI / LLM Guardrails (Gate 5)
- All AI SDK calls (Gemini, OpenAI, Anthropic) MUST run strictly server-side.
- Set strict \`maxOutputTokens\`, timeouts, and structured schema parsing.
- Enforce per-user rate limits and credit quotas.

## 6. Observability & Error Handling (Gate 6)
- Setup Sentry with environment tags and scrub sensitive PII from telemetry before sending.
- Wrap UI trees with React Error Boundaries; prevent unhandled promise rejections.

## 7. Performance & Resource Leaks (Gate 7)
- Eliminate N+1 queries. Always paginate list queries.
- Clean up timers, subscriptions, and WebSocket connections in effect cleanups.

## 8. Verification Command
Run preflight verification at any time:
\`\`\`bash
node ./cli.js --scan --fail-on-p0
\`\`\`
`
  },

  claude: {
    filename: 'CLAUDE.md',
    title: 'Claude Code (CLAUDE.md)',
    generate: (projectPath) => `# CLAUDE.md — LaunchGate Preflight Standards

This project enforces the 12 LaunchGate Enterprise Production Readiness Gates. When assisting in this repository:

## Coding Standards & Security Gates
1. **Secrets & Env**: Never introduce unmasked API keys or database strings. Never prefix private secrets with \`NEXT_PUBLIC_\` or \`VITE_\`.
2. **Auth & IDOR Defense**: Every mutating route must verify session auth server-side. Scope all database reads/updates by the active user's \`userId\` or \`orgId\`.
3. **Input Validation**: Validate all incoming API payloads using strict Zod / Valibot schemas before database execution.
4. **Webhooks**: Validate cryptographic signatures on raw request bodies before execution.
5. **AI Safety**: Keep LLM calls server-side with bounded \`maxOutputTokens\` and timeout handling.
6. **Error Handling**: Log structured errors; never leave empty \`catch (e) {}\` blocks; avoid console.log statements in production code.

## Verification Commands
- Run LaunchGate Preflight Check:
  \`\`\`bash
  node ./cli.js --scan
  \`\`\`
- Check for P0 blockers:
  \`\`\`bash
  node ./cli.js --scan --fail-on-p0
  \`\`\`
`
  },

  windsurf: {
    filename: '.windsurfrules',
    title: 'Windsurf Cascade Rules (.windsurfrules)',
    generate: (projectPath) => `# Windsurf Cascade Preflight Rules (LaunchGate)

You are the Senior Software Architect and Release Engineer for this repository.
Always respect the 12 LaunchGate production gates:

- Never expose server secrets or private credentials to client bundles.
- Mutating API endpoints must authenticate user sessions on the server.
- Database queries must always check tenant/user ownership (BOLA/IDOR protection).
- Validate all incoming payloads with schema libraries (Zod, Pydantic).
- Always verify webhook signatures using raw body buffers.
- Keep error logs structured and ensure graceful fallback UI states exist.
- Run preflight scan before submitting changes: \`node ./cli.js --scan\`
`
  },

  copilot: {
    filename: '.github/copilot-instructions.md',
    title: 'GitHub Copilot (.github/copilot-instructions.md)',
    generate: (projectPath) => `# GitHub Copilot Repository Instructions (LaunchGate)

Follow LaunchGate production readiness standards across all code suggestions:
- Zero Hardcoded Secrets: Maintain clean \`.gitignore\` and use environment variables.
- Zero IDOR/BOLA: Always ensure database operations check session user tenancy.
- Strict Input Validation: Validate all API parameters and JSON bodies with Zod.
- Secure Webhooks: Verify raw cryptographic signatures before parsing events.
- Healthchecks: Ensure \`/api/health\` endpoint is maintained.
`
  }
};

function exportAgentRule(projectPath, agentType) {
  const agent = AGENT_TEMPLATES[agentType];
  if (!agent) {
    throw new Error(`Unsupported agent type: ${agentType}. Choose from: ${Object.keys(AGENT_TEMPLATES).join(', ')}`);
  }

  const content = agent.generate(projectPath);
  const targetFilePath = path.join(projectPath, agent.filename);
  const targetDir = path.dirname(targetFilePath);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.writeFileSync(targetFilePath, content, 'utf8');

  return {
    success: true,
    agentType,
    filePath: targetFilePath,
    relativePath: agent.filename,
    title: agent.title
  };
}

function getAvailableAgentTypes() {
  return Object.keys(AGENT_TEMPLATES).map(key => ({
    id: key,
    title: AGENT_TEMPLATES[key].title,
    filename: AGENT_TEMPLATES[key].filename
  }));
}

module.exports = {
  exportAgentRule,
  getAvailableAgentTypes
};
