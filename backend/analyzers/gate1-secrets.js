const path = require('path');
const { readFile, getSnippet, matchFiles } = require('../services/file-crawler');

module.exports = {
  id: 'gate-1',
  number: 1,
  name: 'Secrets, Credentials & Environment Hygiene',
  category: 'Security & Secrets',
  description: 'Audits .gitignore rules, scans tracked files for hardcoded secrets/keys, detects client prefix leaks, and verifies environment variable validation.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    // 1. Audit .gitignore
    const gitignoreContent = readFile(projectPath, '.gitignore');
    if (!gitignoreContent) {
      findings.push({
        id: 'SEC-GITIGNORE-MISSING',
        severity: 'P1',
        title: 'Missing .gitignore file',
        description: 'No .gitignore file found in the project root. Local secrets, environment files, and build artifacts may be committed accidentally.',
        file: '.gitignore',
        remediation: 'Create a .gitignore file and include .env, .env*.local, node_modules/, dist/, and sensitive credential patterns.',
        rule: 'Preflight Secrets Rule 1.1'
      });
      p1Count++;
    } else {
      const gitignoreLines = gitignoreContent.split('\n').map(l => l.trim()).filter(Boolean);
      const ignoresEnv = gitignoreLines.some(l => l.includes('.env'));
      const ignoresPemKey = gitignoreLines.some(l => l.includes('*.pem') || l.includes('*.key') || l.includes('.pem') || l.includes('.key'));
      const ignoresServiceAccount = gitignoreLines.some(l => l.includes('service-account') || l.includes('*service-account*.json') || l.includes('credentials.json'));

      if (!ignoresEnv) {
        findings.push({
          id: 'SEC-GITIGNORE-NO-ENV',
          severity: 'P0',
          title: '.gitignore missing .env exclusion',
          description: '.gitignore does not explicitly ignore .env or .env*.local files. High risk of leaking production credentials to Git.',
          file: '.gitignore',
          snippet: gitignoreLines.slice(0, 5).join('\n'),
          remediation: 'Add `.env`, `.env*.local`, `.env.production` to your .gitignore immediately.',
          rule: 'Preflight Secrets Rule 1.2'
        });
        p0Count++;
      } else {
        findings.push({
          id: 'SEC-GITIGNORE-ENV-OK',
          severity: 'PASSED',
          title: '.gitignore excludes environment files',
          description: '.env exclusion is properly declared in .gitignore.',
          file: '.gitignore'
        });
        passedCount++;
      }

      if (!ignoresPemKey) {
        findings.push({
          id: 'SEC-GITIGNORE-NO-KEYS',
          severity: 'P2',
          title: '.gitignore missing private key/pem exclusions',
          description: '.gitignore should explicitly exclude *.pem, *.key, and *.keystore files.',
          file: '.gitignore',
          remediation: 'Append `*.pem`, `*.key`, `*.keystore`, and `*.p12` to .gitignore.',
          rule: 'Preflight Secrets Rule 1.3'
        });
        p2Count++;
      }
    }

    // 2. Scan tracked code files for hardcoded secrets
    const codeFiles = files.filter(f => 
      !f.includes('.min.') && 
      !f.endsWith('.lock') && 
      !f.endsWith('.json.map') &&
      !f.startsWith('data/') &&
      !f.startsWith('backend/analyzers/') &&
      !f.includes('quick-fix-engine') &&
      /\.(js|jsx|ts|tsx|py|json|yaml|yml|toml|sql|env|env\.example|sh|bat)$/i.test(f)
    );

    const secretPatterns = [
      {
        regex: /AKIA[0-9A-Z]{16}/g,
        title: 'Hardcoded AWS Access Key ID',
        severity: 'P0',
        remediation: 'Remove AWS key and load from server environment variables (process.env.AWS_ACCESS_KEY_ID).'
      },
      {
        regex: /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}/g,
        title: 'Hardcoded GitHub Personal Access Token',
        severity: 'P0',
        remediation: 'Revoke and rotate the GitHub token immediately. Load from secure server environment.'
      },
      {
        regex: /(?:sk|rk)_(?:live)_[0-9a-zA-Z]{24,}/g,
        title: 'Hardcoded Live Stripe Secret Key',
        severity: 'P0',
        remediation: 'Stripe live secret keys give full financial access. Remove immediately and load via process.env.STRIPE_SECRET_KEY.'
      },
      {
        regex: /sk-[a-zA-Z0-9_-]{20,T3BlbkFJ[a-zA-Z0-9_-]{20,}/g,
        title: 'Hardcoded OpenAI API Secret Key',
        severity: 'P0',
        remediation: 'Remove OpenAI key. Access strictly from server-side environment variables.'
      },
      {
        regex: /AIza[0-9A-Za-z\-_]{35}/g,
        title: 'Hardcoded Google / Firebase API Key',
        severity: 'P1',
        remediation: 'Verify whether this API key is intended for public browser consumption. If private, move to server environment.'
      },
      {
        regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/g,
        title: 'Embedded Cryptographic Private Key',
        severity: 'P0',
        remediation: 'Never commit raw private keys to source code. Store in secret manager or mount at runtime.'
      },
      {
        regex: /(?:postgres|postgresql|mongodb\+srv|mongodb|mysql|redis):\/\/[a-zA-Z0-9._%+-]+:[^@\s"']+@[a-zA-Z0-9.-]+/g,
        title: 'Hardcoded Database Connection String with Credentials',
        severity: 'P0',
        remediation: 'Extract database URI into DATABASE_URL environment variable. Never hardcode credentials in source code.'
      }
    ];

    for (const file of codeFiles) {
      const content = readFile(projectPath, file);
      if (!content) continue;

      const lines = content.split(/\r?\n/);

      for (const pattern of secretPatterns) {
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          // Skip dummy placeholders, documentation examples, and template generators
          if (
            lineText.includes('placeholder') || 
            lineText.includes('your-key-here') || 
            lineText.includes('EXAMPLE') ||
            lineText.includes('user:password@') ||
            lineText.includes('username:password@') ||
            lineText.includes('user:pass@') ||
            lineText.includes('localhost:5432/dbname') ||
            lineText.includes('sk_live_...')
          ) {
            continue;
          }

          if (pattern.regex.test(lineText)) {
            // Mask the secret for safe display
            const maskedSnippet = getSnippet(content, i + 1, 1).replace(pattern.regex, '[REDACTED_SECRET]');
            findings.push({
              id: `SEC-LEAK-${file.replace(/[^a-zA-Z0-9]/g, '_')}-${i + 1}`,
              severity: pattern.severity,
              title: `${pattern.title} in ${file}`,
              description: `Detected potential secret matching pattern ${pattern.title} at line ${i + 1}.`,
              file,
              line: i + 1,
              snippet: maskedSnippet,
              remediation: pattern.remediation,
              rule: 'Preflight Secrets Rule 1.4'
            });

            if (pattern.severity === 'P0') p0Count++;
            else if (pattern.severity === 'P1') p1Count++;
          }
        }
      }

      // 3. Check for Public Client Environment Variable Prefix Leaks
      // e.g. NEXT_PUBLIC_... containing SECRET, SERVICE_ROLE, PRIVATE, PASSWORD
      const clientPrefixRegex = /(NEXT_PUBLIC_|VITE_|REACT_APP_|PUBLIC_)([A-Z0-9_]*(?:SECRET|PRIVATE|SERVICE_ROLE|ADMIN_KEY|TOKEN)[A-Z0-9_]*)/gi;
      let match;
      while ((match = clientPrefixRegex.exec(content)) !== null) {
        const fullVar = match[0];
        const lineNum = content.substring(0, match.index).split('\n').length;
        findings.push({
          id: `SEC-CLIENT-PREFIX-${file.replace(/[^a-zA-Z0-9]/g, '_')}-${lineNum}`,
          severity: 'P0',
          title: `Sensitive Credential Leaked via Client Prefix (${fullVar})`,
          description: `The variable ${fullVar} uses a public client prefix (NEXT_PUBLIC_/VITE_/REACT_APP_) which compiles into browser JavaScript bundles, exposing private secrets to the public web.`,
          file,
          line: lineNum,
          snippet: getSnippet(content, lineNum, 1),
          remediation: `Remove the public client prefix. Rename to standard private server variable (e.g., remove NEXT_PUBLIC_ or VITE_) and access strictly on the server runtime.`,
          rule: 'Preflight Secrets Rule 1.5'
        });
        p0Count++;
      }
    }

    // 4. Check for .env.example
    const hasEnvExample = files.includes('.env.example') || files.includes('.env.sample') || files.includes('.env.template');
    if (!hasEnvExample) {
      findings.push({
        id: 'SEC-ENV-EXAMPLE-MISSING',
        severity: 'P2',
        title: 'Missing .env.example template',
        description: 'No .env.example found. Developers and CI pipelines may lack clarity on required runtime environment variables.',
        file: '.env.example',
        remediation: 'Create a .env.example file containing dummy placeholders for all required environment variables.',
        rule: 'Preflight Secrets Rule 1.6'
      });
      p2Count++;
    } else {
      findings.push({
        id: 'SEC-ENV-EXAMPLE-OK',
        severity: 'PASSED',
        title: '.env.example template is present',
        description: 'A template file for environment variables exists in the project root.',
        file: '.env.example'
      });
      passedCount++;
    }

    // 5. Check for Environment Variable Schema Validation (Zod, envalid, t3-oss, pydantic)
    const hasEnvValidation = files.some(f => {
      const c = readFile(projectPath, f);
      return c && (
        c.includes('@t3-oss/env-nextjs') ||
        c.includes('envalid') ||
        (c.includes('z.object(') && (c.includes('process.env') || f.includes('env'))) ||
        c.includes('BaseSettings') ||
        c.includes('envSchema')
      );
    });

    if (hasEnvValidation) {
      findings.push({
        id: 'SEC-ENV-VALIDATION-OK',
        severity: 'PASSED',
        title: 'Runtime environment validation detected',
        description: 'Project validates environment variable presence and types on startup.',
        file: 'env-config'
      });
      passedCount++;
    } else {
      findings.push({
        id: 'SEC-ENV-VALIDATION-WARN',
        severity: 'P2',
        title: 'Missing runtime environment variable validation',
        description: 'No schema validator (e.g., Zod, @t3-oss/env-nextjs, envalid, or Pydantic BaseSettings) detected to validate required environment variables at boot.',
        file: 'src/env.mjs',
        remediation: 'Implement an environment schema (e.g., using Zod) that fails fast during startup if required variables are missing.',
        rule: 'Preflight Secrets Rule 1.7'
      });
      p2Count++;
    }

    // Score calculation
    let score = 100;
    score -= (p0Count * 30);
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
