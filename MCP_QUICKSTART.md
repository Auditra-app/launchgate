# 🚀 LaunchGate MCP Quickstart & Free Hosting Guide

A concise, step-by-step guide to hosting, integrating, and testing **LaunchGate MCP** in under 2 minutes for **$0**.

---

## ⚡ 1. How to Host It for FREE

### Option A: Local Hosting (Recommended — 100% Free, Zero Servers)
MCP is natively designed to run locally over `stdio`. Your IDE spawns LaunchGate on-demand and kills it when you close the IDE. It uses 0 cloud resources and runs with zero latency.

* **Command**: `node <PATH_TO_LAUNCHGATE>/mcp-server.js`

### Option B: Free Cloud Hosting (Render / Railway / Fly.io / Docker)
If you want a shared team server accessible from anywhere:
1. Deploy this repo to **Render** or **Railway** (free hobby tiers).
2. Set Environment Variables:
   * `HOST=0.0.0.0`
   * `LAUNCHGATE_TOKEN=your-team-secret-key`
3. Connect your IDE via SSH tunnel or `@modelcontextprotocol/server-proxy`.

---

## 🛠️ 2. Connect LaunchGate to Your IDE (60 Seconds)

Replace `F:/App Checker Tool` with your actual path (use forward slashes `/`).

### A. Cursor IDE
1. Open Cursor Settings (`Ctrl + ,` or `Cmd + ,`) → **Features** → **MCP**.
2. Click **+ Add New MCP Server**:
   * **Name**: `launchgate`
   * **Type**: `command`
   * **Command**: `node F:/App Checker Tool/mcp-server.js`
3. You will see a green status light: **`launchgate (12 tools)`**.

### B. Claude Code CLI
Run this one command in your terminal:
```bash
claude mcp add launchgate node "F:/App Checker Tool/mcp-server.js"
```

### C. Windsurf (Cascade)
Add to `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "launchgate": {
      "command": "node",
      "args": ["F:/App Checker Tool/mcp-server.js"]
    }
  }
}
```

---

## 🧪 3. How to Test & Use It

### Method 1: Test Directly From Your IDE Chat
Open any project in Cursor, Claude Code, or Windsurf and type:

1. **To Audit**:
   > *"Run a preflight scan on this repository using LaunchGate."*
2. **To Get Fix Prompts**:
   > *"Show me all P0 blockers found by LaunchGate and how to fix them."*
3. **To Auto-Harden & Verify**:
   > *"Use launchgate_magic_turnkey_harden to fix all gaps and generate my release certificate."*

The AI will execute the scan, bring exact line numbers with code snippets, apply patches, and output `PRODUCTION_READINESS_REPORT.md`.

---

### Method 2: Test via the Web Dashboard & Demo App
1. **Start the Launcher**:
   * **Windows**: Double-click `start.bat`
   * **macOS / Linux**: Run `./start.sh`
2. **Browser opens automatically** at `http://localhost:4545`.
3. **Click `⚡ Try Demo`** in the top bar:
   * Instantly loads our pre-bundled Next.js + Stripe + Gemini AI prototype.
   * Runs the scan and displays real-time security blockers.
   * Click **`✨ Magic SaaS`** to watch LaunchGate auto-heal the codebase to 100%!

---

## 💻 4. Ready for CLI Commands
Whenever you are ready for cloud deployment, tell me what you want to do:
* `"Deploy web dashboard to Vercel"`
* `"Set up Supabase database"`
* `"Publish to npm registry"`
* `"Create Docker image"`

I will execute the CLI commands for you directly!
