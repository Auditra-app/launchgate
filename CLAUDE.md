# CLAUDE.md — LaunchGate Preflight Standards

This project enforces the 12 LaunchGate Enterprise Production Readiness Gates. When assisting in this repository:

## Coding Standards & Security Gates
1. **Secrets & Env**: Never introduce unmasked API keys or database strings. Never prefix private secrets with `NEXT_PUBLIC_` or `VITE_`.
2. **Auth & IDOR Defense**: Every mutating route must verify session auth server-side. Scope all database reads/updates by the active user's `userId` or `orgId`.
3. **Input Validation**: Validate all incoming API payloads using strict Zod / Valibot schemas before database execution.
4. **Webhooks**: Validate cryptographic signatures on raw request bodies before execution.
5. **AI Safety**: Keep LLM calls server-side with bounded `maxOutputTokens` and timeout handling.
6. **Error Handling**: Log structured errors; never leave empty `catch (e) {}` blocks; avoid console.log statements in production code.

## Verification Commands
- Run LaunchGate Preflight Check:
  ```bash
  node ./cli.js --scan
  ```
- Check for P0 blockers:
  ```bash
  node ./cli.js --scan --fail-on-p0
  ```
