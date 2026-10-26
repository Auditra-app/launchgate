# LaunchGate: Enterprise Production Readiness & Pre-Launch Command Center

**LaunchGate** is an enterprise-grade, local pre-launch command center that audits web and full-stack software repositories across 12 rigorous production readiness gates.

Access the interactive dashboard locally at **`http://localhost:4545`**, or run it headlessly in CI/CD pipelines and AI IDE agents.

---

## 🚀 Quick Start Options

### 1. Interactive Web Dashboard
```bash
npm start
# or run the one-click script:
start.bat   # Windows
./start.sh  # macOS / Linux
```
Open **`http://localhost:4545`** to browse projects, run selective gates, and view reports.

### 2. Headless CLI Runner (CI/CD & Git Hooks)
Run instant preflight checks directly from your terminal:
```bash
# 🪄 Turnkey Magic: Transmute vibe-coded prototype into production SaaS
node cli.js magic [path]

# Run preflight scan on current directory
node cli.js

# Block CI/CD pipeline if any P0 Critical Blockers are found
node cli.js --fail-on-p0

# Scan specific gates with JSON output
node cli.js --gates 1,2,3,4 --json

# Generate PRODUCTION_READINESS_REPORT.md on completion
node cli.js --report --fail-on-p0
```

### 3. Native Model Context Protocol (MCP) Server for AI IDEs
LaunchGate implements the open **Model Context Protocol (MCP)** over stdio, allowing AI agents inside **Cursor**, **Claude Code**, **Windsurf**, and **Antigravity** to execute scans and fix code autonomously.

#### A. Claude Code (`claude`)
Add to `~/.claude/config.json` or `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "launchgate": {
      "command": "node",
      "args": ["<path-to-launchgate>/mcp-server.js"]
    }
  }
}
```

#### B. Cursor IDE
In Cursor Settings (`Settings -> Features -> MCP -> Add New MCP Server`):
- **Name**: `launchgate`
- **Type**: `command`
- **Command**: `node <path-to-launchgate>/mcp-server.js`

#### C. Windsurf (Cascade)
In `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "launchgate": {
      "command": "node",
      "args": ["<path-to-launchgate>/mcp-server.js"]
    }
  }
}
```

#### Available MCP Tools:
- `launchgate_magic_turnkey_harden`: ✨ Transmutes a vibe-coded SaaS into turnkey production readiness. Injects enterprise security headers, rate limiting, healthcheck, React error boundaries, legal docs, robots/sitemap, Docker, and CI/CD.
- `launchgate_list_gates`: Lists all 12 gates and requirements.
- `launchgate_scan`: Runs a static scan on target project.
- `launchgate_get_findings`: Retrieves categorized findings with code snippets and remediation guidelines.
- `launchgate_verify_gate`: Signs off on a gate after resolving findings.
- `launchgate_generate_certificate`: Generates `PRODUCTION_READINESS_REPORT.md`.

---

## ✨ Magic Vibe-to-SaaS Transmuter (Turnkey Production Engine)
Vibe-coded prototypes built with AI (Cursor, v0, Bolt, Lovable, Claude Code) are visually functional but lack essential production infrastructure, security, performance, and legal compliance.

LaunchGate features a 1-click **Magic Transmutation Suite** that analyzes and generates:
1. 🛡️ **Enterprise Security Headers & Helmet Configuration** (`security-headers.json` & `next.config.js`)
2. 🛑 **Distributed Rate Limiting Middleware** (`middleware.ts` or `middleware/rate-limiter.js`)
3. 🩺 **Resilient `/api/health` Diagnostic Route** (uptime, memory telemetry, cache-control)
4. 💥 **Fault-Tolerant React UI Error Boundary** (`app/error.tsx` or `ErrorBoundary.tsx`)
5. 💳 **Hardened Webhook Signature & Idempotency Guard** (`lib/webhook-guard.ts` for Stripe/Clerk)
6. ⚖️ **Turnkey SaaS Legal Pack** (`app/terms/page.tsx` & `app/privacy/page.tsx`)
7. 🔍 **SEO & Viral OpenGraph Social Pack** (`public/robots.txt` & `public/sitemap.xml`)
8. 🐳 **Multi-Stage Production Docker & Compose** (unprivileged `nextjs/node` user + healthchecks)
9. 🚀 **GitHub Actions Production Preflight CI/CD** (`.github/workflows/production-preflight.yml`)
10. 🎨 **Branded 404 Recovery Route** (`app/not-found.tsx` or `public/404.html`)
11. 🧹 **Automated Code Hygiene** (safely strips `debugger;` statements and production console spam)
12. 📦 **Preflight CI Scripts** (injects `typecheck`, `lint`, and `build` into `package.json`)
13. 🔒 **Environment Hygiene** (`.env.example` template + `.gitignore` protection)

---

## 🤖 Universal AI Agent Rule Exporter
Export LaunchGate rules directly into your project with 1 click from the dashboard (`</> Export Rules`):
- **Cursor IDE**: Generates `.cursor/rules/launchgate.mdc`
- **Claude Code**: Generates `CLAUDE.md`
- **Windsurf**: Generates `.windsurfrules`
- **GitHub Copilot**: Generates `.github/copilot-instructions.md`
- **Antigravity**: Generates `.antigravity/gate-X-audit.md` and `.antigravity/gate-X-fix.md`

---

## 🛡️ The 12 Production Audit Gates

1. **Gate 1: Secrets, Credentials & Environment Hygiene**  
   Audits `.gitignore`, scans for hardcoded API keys, JWT secrets, database connection URIs, client prefix leaks (`NEXT_PUBLIC_`, `VITE_`), and runtime env validation.
2. **Gate 2: Authentication, Session Integrity & BOLA/IDOR Defense**  
   Maps API routes and server actions, flags unauthenticated mutations, detects Broken Object Level Authorization (BOLA/IDOR), and checks RBAC on admin routes.
3. **Gate 3: Database Security, Schemas, Indexes & Input Validation**  
   Audits Supabase/PostgreSQL RLS policies, Firebase security rules, raw SQL injection vectors, foreign key indexes, and boundary schema validation (Zod/Valibot).
4. **Gate 4: APIs, Webhooks, Idempotency & Abuse Defenses**  
   Verifies webhook cryptographic signature verification (Stripe, Clerk, custom), idempotency locks, rate limiting, and CORS headers.
5. **Gate 5: AI / LLM Cost, Quota & Prompt Injection Guards**  
   Validates server-only isolation of AI SDKs (Gemini, OpenAI, Anthropic), `maxOutputTokens` budgeting, structured response validation, and credit quotas.
6. **Gate 6: Observability, Sentry & Error Resilience**  
   Audits Sentry SDK setup, UI React Error Boundaries, unhandled rejection listeners, silent catch blocks, and PII telemetry scrubbing.
7. **Gate 7: Performance, Bundling, Caching & Resource Leaks**  
   Detects N+1 loop queries, uncleaned intervals/listeners in `useEffect`, blocking synchronous I/O, unpaginated queries, and overweight media.
8. **Gate 8: Design Consistency, UX States & Localization (LTR/RTL)**  
   Audits design token consistency, checks Loading/Empty/Error state handling, custom 404/500 pages, RTL logical properties (`ms-`, `me-`), and accessibility.
9. **Gate 9: SEO, Metadata, Legal & Commercial Readiness**  
   Audits `robots.txt`, `sitemap.xml`, OpenGraph metadata, Privacy Policy/Terms pages, placeholder `#` anchor links, and transactional feedback.
10. **Gate 10: Code Hygiene, Duplication & Context7 SDK Audit**  
    Detects leftover console logs, debugger keywords, TODO/FIXME blockers, dead code blocks, duplicated utility functions, and generates a Context7 SDK audit manifest.
11. **Gate 11: Infrastructure, CI/CD & Deployment Configs**  
    Audits Dockerfiles (multi-stage, non-root user), `/api/health` endpoints, CI/CD pipeline triggers, and production HTTP security headers.
12. **Gate 12: Preflight CLI Suite, Clean Build & Release Certificate**  
    Provides live interactive terminal runners (typecheck, lint, audit, build) and unlocks the formal timestamped `PRODUCTION_READINESS_REPORT.md` release certificate.

---

## 📄 License
MIT License — Enterprise Ready.
