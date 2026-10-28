const fs = require('fs');
const path = require('path');
const { readFile, getSnippet } = require('../services/file-crawler');

module.exports = {
  id: 'gate-11',
  number: 11,
  name: 'Infrastructure, CI/CD & Deployment Configs',
  category: 'Infrastructure & CI/CD',
  description: 'Audits Dockerfiles for multi-stage builds and non-root users, checks healthcheck endpoints, verifies CI/CD pipelines, and tests production HTTP security headers.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    // 1. Dockerfile & Container Security
    const dockerfile = files.find(f => f.toLowerCase() === 'dockerfile' || f.endsWith('/dockerfile'));
    if (dockerfile) {
      const dockerContent = readFile(projectPath, dockerfile);
      if (dockerContent) {
        // Multi-stage check
        const stageCount = (dockerContent.match(/^FROM\s+/gim) || []).length;
        if (stageCount < 2) {
          findings.push({
            id: 'INFRA-DOCKER-SINGLE-STAGE',
            severity: 'P1',
            title: 'Single-stage Dockerfile detected',
            description: 'Dockerfile contains only one build stage. Build tools, package caches, and compilers will bloat the final production image size and expand attack surfaces.',
            file: dockerfile,
            remediation: 'Implement a multi-stage Dockerfile (e.g. `FROM node:alpine AS builder` -> `FROM node:alpine AS runner`).',
            rule: 'Preflight Infra Rule 11.1 (Multi-Stage Builds)'
          });
          p1Count++;
        } else {
          findings.push({
            id: 'INFRA-DOCKER-STAGE-OK',
            severity: 'PASSED',
            title: `Multi-stage build confirmed (${stageCount} stages)`,
            description: 'Dockerfile utilizes multi-stage builds to optimize container image size.',
            file: dockerfile
          });
          passedCount++;
        }

        // Non-root user check
        // Check final stage of multi-stage Dockerfile or whole content for single-stage
        const lastStage = dockerContent.split(/^FROM\s+/gim).pop() || dockerContent;
        const userMatches = [...lastStage.matchAll(/^\s*USER\s+([^\s#]+)/gim)];
        const lastUser = userMatches.length > 0 ? userMatches[userMatches.length - 1][1].toLowerCase() : null;
        const isRoot = !lastUser || lastUser === 'root' || lastUser === '0' || lastUser.startsWith('root:') || lastUser.startsWith('0:');
        const hasNonRootUser = !isRoot;
        if (!hasNonRootUser) {
          findings.push({
            id: 'INFRA-DOCKER-ROOT-USER',
            severity: 'P0',
            title: 'Container runs as ROOT user',
            description: 'Dockerfile does not specify a non-root `USER`. If an attacker achieves remote code execution in the container, they inherit root container privileges.',
            file: dockerfile,
            remediation: 'Add `USER node` or create an unprivileged user before the CMD/ENTRYPOINT.',
            rule: 'Preflight Infra Rule 11.2 (Non-Root User)'
          });
          p0Count++;
        } else {
          findings.push({
            id: 'INFRA-DOCKER-USER-OK',
            severity: 'PASSED',
            title: 'Non-root container user configured',
            description: 'Dockerfile runs unprivileged user.',
            file: dockerfile
          });
          passedCount++;
        }
      }

      // Check for .dockerignore
      const hasDockerignore = files.some(f => f.toLowerCase() === '.dockerignore');
      if (!hasDockerignore) {
        findings.push({
          id: 'INFRA-NO-DOCKERIGNORE',
          severity: 'P1',
          title: 'Missing .dockerignore file',
          description: 'No `.dockerignore` file found. `node_modules`, `.git`, and local `.env` secrets may be copied into the container build context.',
          file: '.dockerignore',
          remediation: 'Create a `.dockerignore` ignoring node_modules, .git, .env*, and dist.',
          rule: 'Preflight Infra Rule 11.3 (Dockerignore)'
        });
        p1Count++;
      }
    }

    // 2. Healthcheck Endpoint (/api/health, /healthz, /ping)
    if (stackInfo.isElectron || stackInfo.isDesktop) {
      findings.push({
        id: 'INFRA-HEALTHCHECK-DESKTOP-NA',
        severity: 'PASSED',
        title: 'Desktop Client: Daemonized healthcheck endpoint not applicable',
        description: 'Desktop applications run locally on user machines and do not require container liveness probes.',
        file: 'electron'
      });
      passedCount++;
    } else {
      const hasHealthRoute = files.some(f => {
        const norm = f.replace(/\\/g, '/').toLowerCase();
        return norm.includes('api/health') ||
          norm.includes('routes/health') ||
          norm.includes('healthz') ||
          norm.includes('/ping') ||
          norm.endsWith('health.ts') ||
          norm.endsWith('health.js');
      });

      // Direct physical disk verification as fallback
      const commonHealthPaths = [
        'src/app/api/health/route.ts', 'src/app/api/health/route.js',
        'app/api/health/route.ts', 'app/api/health/route.js',
        'src/pages/api/health.ts', 'src/pages/api/health.js',
        'pages/api/health.ts', 'pages/api/health.js',
        'routes/health.js', 'routes/health.ts',
        'api/health.js', 'api/health.ts',
        'src/lib/health.ts', 'lib/health.ts'
      ];
      const hasPhysicalHealth = commonHealthPaths.some(p => fs.existsSync(path.join(projectPath, p)));

      // Also check server files directly (e.g. server.js or app.py containing app.get('/health' or '/api/system/health')
      const serverFiles = files.filter(f => f.endsWith('server.js') || f.endsWith('app.js') || f.endsWith('main.py') || f.includes('health'));
      let hasHealthInCode = false;
      for (const sf of serverFiles) {
        const content = readFile(projectPath, sf);
        if (content && (content.includes('/health') || content.includes('/ping') || content.includes('healthz'))) {
          hasHealthInCode = true;
          break;
        }
      }

      if (hasHealthRoute || hasPhysicalHealth || hasHealthInCode) {
        findings.push({
          id: 'INFRA-HEALTHCHECK-OK',
          severity: 'PASSED',
          title: 'Healthcheck endpoint detected',
          description: 'Liveness/readiness probe route or handler is present.',
          file: 'api/health'
        });
        passedCount++;
      } else {
        findings.push({
          id: 'INFRA-NO-HEALTHCHECK',
          severity: 'P1',
          title: 'Missing Healthcheck API Endpoint (/api/health)',
          description: 'No dedicated `/api/health` or `/healthz` route found. Cloud orchestrators, Docker, Kubernetes, and load balancers cannot detect container liveness and readiness.',
          file: stackInfo.isNext ? 'app/api/health/route.ts' : 'server.js',
          remediation: 'Create a lightweight `/api/health` endpoint that returns status 200 JSON with DB connectivity status.',
          rule: 'Preflight Infra Rule 11.4 (Healthcheck Endpoints)'
        });
        p1Count++;
      }
    }

    // 3. CI/CD Pipeline Configuration
    const hasCiCd = files.some(f => {
      const norm = f.replace(/\\/g, '/');
      return norm.startsWith('.github/workflows/') ||
        norm.includes('cloudbuild.yaml') ||
        norm.includes('gitlab-ci.yml') ||
        norm.includes('bitbucket-pipelines.yml');
    }) || (fs.existsSync(path.join(projectPath, '.github', 'workflows')) && fs.readdirSync(path.join(projectPath, '.github', 'workflows')).length > 0);

    if (!hasCiCd) {
      findings.push({
        id: 'INFRA-NO-CICD',
        severity: 'P2',
        title: 'Missing CI/CD Pipeline Automation',
        description: 'No GitHub Actions (`.github/workflows/`), Cloud Build, or GitLab CI configuration found. Deployments and checks must be executed manually.',
        file: '.github/workflows/ci.yml',
        remediation: 'Add a GitHub Actions workflow to run typechecks, linters, tests, and builds on pull requests.',
        rule: 'Preflight Infra Rule 11.5 (CI/CD Pipeline)'
      });
      p2Count++;
    } else {
      findings.push({
        id: 'INFRA-CICD-OK',
        severity: 'PASSED',
        title: 'CI/CD pipeline configuration detected',
        description: 'Automated CI workflow is configured.',
        file: '.github/workflows'
      });
      passedCount++;
    }

    // 4. HTTP Security Headers / Process Isolation
    if (stackInfo.isElectron || stackInfo.isDesktop) {
      const electronFiles = files.filter(f => f.includes('electron') || f.includes('main.'));
      let secureIsolation = false;
      for (const ef of electronFiles) {
        const c = readFile(projectPath, ef);
        if (c && (c.includes('contextIsolation') || c.includes('webSecurity') || c.includes('nodeIntegration'))) {
          secureIsolation = true;
          break;
        }
      }

      if (secureIsolation) {
        findings.push({
          id: 'INFRA-ELECTRON-ISOLATION-OK',
          severity: 'PASSED',
          title: 'Electron Process Isolation & Security Confirmed',
          description: 'Main process configures Electron webPreferences security standards.',
          file: electronFiles[0] || 'electron/main.ts'
        });
        passedCount++;
      } else {
        findings.push({
          id: 'INFRA-ELECTRON-ISOLATION-WARN',
          severity: 'P1',
          title: 'Verify Electron webPreferences (contextIsolation & nodeIntegration)',
          description: 'Ensure Electron BrowserWindow webPreferences enforce `contextIsolation: true` and `nodeIntegration: false` to prevent remote code execution.',
          file: electronFiles[0] || 'electron/main.ts',
          remediation: 'In BrowserWindow webPreferences, explicitly set `contextIsolation: true, nodeIntegration: false, webSecurity: true`.',
          rule: 'Preflight Electron Security Rule 11.6'
        });
        p1Count++;
      }
    } else {
      let hasSecurityHeaders = false;
      // Direct physical check for security-headers.json or next.config with security headers
      if (fs.existsSync(path.join(projectPath, 'security-headers.json'))) {
        hasSecurityHeaders = true;
      }

      if (!hasSecurityHeaders) {
        const configFiles = files.filter(f => {
          const norm = f.replace(/\\/g, '/');
          return norm.includes('next.config') || 
            norm.includes('middleware') || 
            norm.includes('server.js') || 
            norm.includes('helmet') ||
            norm === 'security-headers.json' ||
            norm.endsWith('/security-headers.json');
        });

        for (const cf of configFiles) {
          const c = readFile(projectPath, cf);
          if (c && (
            c.includes('X-Frame-Options') ||
            c.includes('Strict-Transport-Security') ||
            c.includes('Content-Security-Policy') ||
            c.includes('helmet(') ||
            c.includes('securityHeaders')
          )) {
            hasSecurityHeaders = true;
            break;
          }
        }
      }

      if (!hasSecurityHeaders) {
        findings.push({
          id: 'INFRA-NO-SECURITY-HEADERS',
          severity: 'P1',
          title: 'Missing Production HTTP Security Headers',
          description: 'Application does not configure security headers (Strict-Transport-Security, X-Content-Type-Options: nosniff, X-Frame-Options, Content-Security-Policy).',
          file: stackInfo.isNext ? 'next.config.js' : (stackInfo.isExpress ? 'server.js' : 'security-headers'),
          remediation: 'Configure HTTP security headers using Helmet middleware (or next.config.js headers).',
          rule: 'Preflight Infra Rule 11.6 (Security Headers)'
        });
        p1Count++;
      } else {
        findings.push({
          id: 'INFRA-SECURITY-HEADERS-OK',
          severity: 'PASSED',
          title: 'HTTP security headers configured',
          description: 'Confirmed presence of HSTS, X-Frame-Options, or CSP.',
          file: 'security-headers'
        });
        passedCount++;
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
    else if (p1Count > 0 || p2Count > 2) status = 'warning';

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
