# LaunchGate Privacy Policy & Data Handling

**Last Updated**: October 2026

## 1. Local-Only Execution Architecture
LaunchGate is architected as a local preflight command center:
- **Zero Cloud Code Ingestion**: All static analysis, code scanning, file crawling, and heuristics are performed strictly on your local machine or in your private CI/CD runtime.
- **No Third-Party Analytics / Telemetry**: LaunchGate does not transmit project source code, file structures, or environment variables to remote telemetry servers.
- **Local Storage Boundary**: Audit histories, cached snapshots, and compliance reports are stored locally on your machine in `~/.launchgate` (or project-relative storage).

## 2. API Keys & Secrets Security
LaunchGate audits your project for exposed secrets (e.g., API keys, database strings). LaunchGate will:
- Never log, transmit, or persist raw unmasked secrets.
- Always redact detected keys in generated HTML and terminal reports (`[REDACTED_SECRET]`).
- Run strictly within loopback network interfaces (`127.0.0.1` / `localhost`).

## 3. Network Isolation
LaunchGate server routes reject non-local HTTP origins and Host headers by default to prevent DNS rebinding or cross-site request attacks.

## 4. Contact & Disclosures
For security disclosures or privacy inquiries, contact the LaunchGate engineering team via your repository issue tracker.
