const path = require('path');
const { readFile, getSnippet, matchFiles } = require('../services/file-crawler');

module.exports = {
  id: 'gate-3',
  number: 3,
  name: 'Database Security, Schemas, Indexes & Input Validation',
  category: 'Database & Data Integrity',
  description: 'Audits Supabase/Postgres RLS policies, Firebase security rules, raw SQL injection vectors, foreign key indexing, and input validation schemas.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    // 1. Supabase / Postgres RLS Checks
    const sqlFiles = files.filter(f => f.endsWith('.sql'));
    for (const sqlFile of sqlFiles) {
      const content = readFile(projectPath, sqlFile);
      if (!content) continue;

      // Find created tables
      const tableMatches = [...content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_".]+)/gi)];
      for (const m of tableMatches) {
        const rawTableName = m[1].replace(/["']/g, '');
        const rlsEnabledRegex = new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:[a-zA-Z0-9_".]+\\.)?${rawTableName}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
        
        if (!rlsEnabledRegex.test(content) && !rawTableName.startsWith('_')) {
          const lineNum = content.substring(0, m.index).split('\n').length;
          findings.push({
            id: `DB-RLS-DISABLED-${rawTableName}`,
            severity: 'P0',
            title: `Table '${rawTableName}' created without Row Level Security (RLS)`,
            description: `Table \`${rawTableName}\` does not have Row Level Security enabled in ${sqlFile}. If exposed via PostgREST/Supabase client, all data is publicly accessible.`,
            file: sqlFile,
            line: lineNum,
            snippet: getSnippet(content, lineNum, 2),
            remediation: `Add \`ALTER TABLE ${rawTableName} ENABLE ROW LEVEL SECURITY;\` and define explicit authenticated policies.`,
            rule: 'Preflight Database Rule 3.1 (RLS Enforcement)'
          });
          p0Count++;
        }
      }

      // Check for overly permissive RLS policies: USING (true) WITH CHECK (true)
      if (/(?:USING|WITH\s+CHECK)\s*\(\s*true\s*\)/i.test(content) && /FOR\s+(?:ALL|INSERT|UPDATE|DELETE)/i.test(content)) {
        findings.push({
          id: `DB-RLS-OVERLY-PERMISSIVE-${sqlFile.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'P0',
          title: `Overly permissive RLS policy (USING/WITH CHECK true) in ${sqlFile}`,
          description: `Detected policy allowing unrestricted public mutations on tables without checking auth.uid() or tenancy.`,
          file: sqlFile,
          remediation: `Replace \`USING (true)\` with \`USING (auth.uid() = user_id)\` or appropriate role checks.`,
          rule: 'Preflight Database Rule 3.2'
        });
        p0Count++;
      }
    }

    // 2. Firebase Rules Check
    const firestoreRules = readFile(projectPath, 'firestore.rules');
    if (firestoreRules) {
      if (firestoreRules.includes('allow read, write: if true;') || firestoreRules.includes('allow write: if true;')) {
        findings.push({
          id: 'DB-FIRESTORE-PUBLIC-WRITE',
          severity: 'P0',
          title: 'Unrestricted Public Read/Write in firestore.rules',
          description: 'Cloud Firestore security rules contain `allow read, write: if true;`. Anyone on the internet can read, modify, or delete the entire database.',
          file: 'firestore.rules',
          snippet: firestoreRules.substring(0, 300),
          remediation: 'Delegate rules authoring to firestore-rules-author or enforce request.auth != null with ownership checks.',
          rule: 'Preflight Database Rule 3.3 (Firestore Security)'
        });
        p0Count++;
      } else {
        findings.push({
          id: 'DB-FIRESTORE-OK',
          severity: 'PASSED',
          title: 'Firestore rules avoid open public access',
          description: 'No open `allow read, write: if true;` found in firestore.rules.',
          file: 'firestore.rules'
        });
        passedCount++;
      }
    }

    // 3. Raw SQL Injection Vectors
    const codeFiles = files.filter(f => /\.(js|ts|jsx|tsx|py)$/.test(f) && !f.startsWith('backend/analyzers/'));
    const sqlInjectionPatterns = [
      {
        regex: /\$queryRawUnsafe\s*\(/g,
        title: 'Prisma $queryRawUnsafe usage detected',
        severity: 'P1',
        desc: '$queryRawUnsafe bypasses parameterization. Use Prisma $queryRaw with template tags instead.'
      },
      {
        regex: /(?:\.query|\.execute)\s*\(\s*`[^`]*\$\{[^}]+\}[^`]*`/g,
        title: 'Raw SQL template literal interpolation',
        severity: 'P0',
        desc: 'Concatenating dynamic variables directly into SQL strings creates severe SQL injection vulnerabilities.'
      },
      {
        regex: /(?:\.query|\.execute)\s*\(\s*["'][^"']*\s*\+\s*[a-zA-Z0-9_.]+/g,
        title: 'Raw SQL string concatenation',
        severity: 'P0',
        desc: 'Concatenating untrusted strings into database queries allows attackers to hijack SQL execution.'
      }
    ];

    for (const file of codeFiles) {
      const content = readFile(projectPath, file);
      if (!content) continue;

      for (const pattern of sqlInjectionPatterns) {
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          findings.push({
            id: `SQLI-${file.replace(/[^a-zA-Z0-9]/g, '_')}-${lineNum}`,
            severity: pattern.severity,
            title: `${pattern.title} in ${file}`,
            description: `${pattern.desc} Line ${lineNum}.`,
            file,
            line: lineNum,
            snippet: getSnippet(content, lineNum, 2),
            remediation: 'Use parameterized queries ($1, $2, ?), prepared statements, or ORM query builders (Prisma, Drizzle). Never interpolate dynamic variables directly into query strings.',
            rule: 'Preflight Database Rule 3.4 (SQL Injection Defense)'
          });
          if (pattern.severity === 'P0') p0Count++;
          else p1Count++;
        }
      }
    }

    // 4. Missing Prisma Foreign Key Indexes
    const prismaFiles = files.filter(f => f.endsWith('.prisma'));
    for (const pFile of prismaFiles) {
      const pContent = readFile(projectPath, pFile);
      if (!pContent) continue;

      // Extract models
      const models = pContent.split(/model\s+/).slice(1);
      for (const modelChunk of models) {
        const modelName = modelChunk.split(/\s+/)[0];
        const lines = modelChunk.split('\n');

        // Look for relation fields
        for (let l = 0; l < lines.length; l++) {
          const line = lines[l];
          if (line.includes('@relation') && line.includes('fields: [')) {
            const fieldMatch = line.match(/fields:\s*\[([a-zA-Z0-9_,\s]+)\]/);
            if (fieldMatch) {
              const fkField = fieldMatch[1].trim();
              const hasIndex = modelChunk.includes(`@@index([${fkField}])`) || modelChunk.includes(`@unique`);
              if (!hasIndex) {
                findings.push({
                  id: `DB-PRISMA-FK-NO-INDEX-${modelName}-${fkField}`,
                  severity: 'P1',
                  title: `Prisma foreign key \`${fkField}\` in model \`${modelName}\` lacks an index`,
                  description: `In relational databases (PostgreSQL/MySQL), unindexed foreign keys lead to full table scans on JOIN operations and CASCADE deletes.`,
                  file: pFile,
                  remediation: `Add \`@@index([${fkField}])\` to the \`${modelName}\` model in ${pFile}.`,
                  rule: 'Preflight Database Rule 3.5 (Index Optimization)'
                });
                p1Count++;
              }
            }
          }
        }
      }
    }

    // 5. Schema Input Validation at API Boundaries
    const apiRouteFiles = files.filter(f => (f.includes('api/') || f.includes('routes/')) && /\.(ts|js|py)$/.test(f));
    let validatedApiCount = 0;
    for (const rFile of apiRouteFiles) {
      const rContent = readFile(projectPath, rFile);
      if (!rContent) continue;

      const hasZod = rContent.includes('.parse(') || rContent.includes('.safeParse(') || rContent.includes('z.object');
      const hasValibot = rContent.includes('v.parse(') || rContent.includes('v.safeParse(');
      const hasPydantic = rContent.includes('BaseModel') || rContent.includes('pydantic');

      const readsPayload = rContent.includes('req.body') || rContent.includes('request.json()') || rContent.includes('await req.json()');

      if (readsPayload && !(hasZod || hasValibot || hasPydantic)) {
        findings.push({
          id: `DB-UNVALIDATED-PAYLOAD-${rFile.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'P1',
          title: `Endpoint parses request payload without schema validation (${rFile})`,
          description: `This endpoint processes \`req.body\` or \`request.json()\` without validating it against an explicit schema (Zod, Valibot, or Pydantic). Untrusted inputs can corrupt databases or cause unhandled exceptions.`,
          file: rFile,
          remediation: `Define a Zod schema and validate payload: \`const body = mySchema.parse(await req.json());\`.`,
          rule: 'Preflight Database Rule 3.6 (Boundary Input Validation)'
        });
        p1Count++;
      } else if (hasZod || hasValibot || hasPydantic) {
        validatedApiCount++;
      }
    }

    if (validatedApiCount > 0) {
      findings.push({
        id: 'DB-INPUT-VALIDATION-OK',
        severity: 'PASSED',
        title: 'Input validation schema usage confirmed',
        description: `Detected strong schema validation (Zod/Valibot/Pydantic) protecting route boundaries.`,
        file: 'api-schemas'
      });
      passedCount++;
    }

    if (findings.length === 0) {
      findings.push({
        id: 'DB-CHECKS-CLEAN',
        severity: 'PASSED',
        title: 'Database & SQL Security Analysis Clean',
        description: `Inspected ${codeFiles.length} source files and database definitions. Scanned for raw SQL string concatenations, unparameterized $queryRawUnsafe calls, and public RLS/Firestore exposures. No vulnerabilities detected.`,
        file: codeFiles[0] || 'database'
      });
      passedCount++;
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
