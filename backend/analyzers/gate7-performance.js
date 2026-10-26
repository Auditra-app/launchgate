const path = require('path');
const fs = require('fs');
const { readFile, getSnippet } = require('../services/file-crawler');

module.exports = {
  id: 'gate-7',
  number: 7,
  name: 'Performance, Bundling, Caching & Resource Leaks',
  category: 'Performance & Scalability',
  description: 'Detects N+1 database queries inside loops, uncleaned timers/event listeners in React effects, blocking synchronous file I/O, unpaginated queries, and overweight media.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    const codeFiles = files.filter(f => /\.(js|jsx|ts|tsx)$/.test(f) && !f.startsWith('backend/analyzers/'));

    // 1. N+1 Query Patterns (DB/API calls inside loops)
    for (const f of codeFiles) {
      const content = readFile(projectPath, f);
      if (!content) continue;

      // Look for loop constructs containing DB calls
      const loopRegex = /(?:for\s*\([^)]+\)|for\s+await\s*\([^)]+\)|\.map\s*\(\s*(?:async\s*)?[a-zA-Z0-9_,(){}\s]*=>|\.forEach\s*\(\s*(?:async\s*)?[a-zA-Z0-9_,(){}\s]*=>)\s*\{([^}]+)\}/g;
      let match;
      while ((match = loopRegex.exec(content)) !== null) {
        const loopBody = match[1];
        if (
          loopBody.includes('await prisma.') ||
          loopBody.includes('await db.') ||
          loopBody.includes('await supabase.from') ||
          (loopBody.includes('await fetch(') && !f.includes('test'))
        ) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          findings.push({
            id: `PERF-N-PLUS-ONE-${f.replace(/[^a-zA-Z0-9]/g, '_')}-${lineNum}`,
            severity: 'P1',
            title: `Potential N+1 Database / API Query in Loop (${f})`,
            description: `Database query or network fetch executed inside a loop. This degrades database throughput and leads to high latency under production load.`,
            file: f,
            line: lineNum,
            snippet: getSnippet(content, lineNum, 2),
            remediation: 'Batch queries using `findMany({ where: { id: { in: ids } } })` or `Promise.all` with bulk fetching.',
            rule: 'Preflight Performance Rule 7.1 (N+1 Query Elimination)'
          });
          p1Count++;
        }
      }

      // 2. Resource Leaks in useEffect (missing cleanup)
      if (content.includes('useEffect(')) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('useEffect(')) {
            const effectBlock = lines.slice(i, i + 30).join('\n');
            const hasIntervalOrListener = effectBlock.includes('setInterval(') || effectBlock.includes('addEventListener(');
            const hasCleanup = effectBlock.includes('return () =>') || effectBlock.includes('clearInterval(') || effectBlock.includes('removeEventListener(');

            if (hasIntervalOrListener && !hasCleanup) {
              findings.push({
                id: `PERF-EFFECT-LEAK-${f.replace(/[^a-zA-Z0-9]/g, '_')}-${i + 1}`,
                severity: 'P1',
                title: `Resource Leak in useEffect (Missing Timer/Listener Cleanup) in ${f}`,
                description: `A timer (setInterval) or event listener is registered inside \`useEffect\` without returning a cleanup function. This creates memory leaks and duplicate execution on component re-renders.`,
                file: f,
                line: i + 1,
                snippet: getSnippet(content, i + 1, 3),
                remediation: 'Return a cleanup function: `return () => { clearInterval(timer); };` or `removeEventListener`.',
                rule: 'Preflight Performance Rule 7.2 (Memory Leak Prevention)'
              });
              p1Count++;
            }
          }
        }
      }

      // 3. Blocking Synchronous I/O in API Routes
      if (f.includes('api/') || f.includes('routes/')) {
        if (content.includes('fs.readFileSync') || content.includes('fs.writeFileSync') || content.includes('execSync(')) {
          const lineNum = content.split('\n').findIndex(l => l.includes('Sync(')) + 1;
          findings.push({
            id: `PERF-BLOCKING-SYNC-IO-${f.replace(/[^a-zA-Z0-9]/g, '_')}`,
            severity: 'P1',
            title: `Blocking Synchronous I/O in Request Handler (${f})`,
            description: `Using \`fs.readFileSync\`, \`writeFileSync\`, or \`execSync\` blocks the single-threaded Node.js event loop, preventing the server from handling other concurrent requests.`,
            file: f,
            line: lineNum,
            snippet: getSnippet(content, lineNum, 2),
            remediation: 'Use asynchronous non-blocking alternatives (`fs.promises.readFile`, `await fs.writeFile`).',
            rule: 'Preflight Performance Rule 7.3 (Non-Blocking I/O)'
          });
          p1Count++;
        }
      }

      // 4. Unpaginated List Queries
      if (content.includes('.findMany(') && !content.includes('take:') && !content.includes('limit:') && !content.includes('pagination')) {
        const lineNum = content.split('\n').findIndex(l => l.includes('.findMany(')) + 1;
        findings.push({
          id: `PERF-UNPAGINATED-FINDMANY-${f.replace(/[^a-zA-Z0-9]/g, '_')}-${lineNum}`,
          severity: 'P2',
          title: `Unpaginated findMany Query in ${f}`,
          description: `Query fetches records without \`take\` or \`limit\`. As the production table grows to thousands of records, this causes severe query latency and memory consumption.`,
          file: f,
          line: lineNum,
          snippet: getSnippet(content, lineNum, 2),
          remediation: 'Always specify pagination limits: e.g. `take: 50, skip: (page - 1) * 50`.',
          rule: 'Preflight Performance Rule 7.4 (Mandatory Query Pagination)'
        });
        p2Count++;
      }
    }

    // 5. Large Media Asset Weight (> 1.5MB images)
    const publicAssets = files.filter(f => (f.startsWith('public/') || f.startsWith('assets/')) && /\.(png|jpe?g|bmp|gif)$/i.test(f));
    for (const asset of publicAssets) {
      try {
        const fullPath = path.join(projectPath, asset);
        const stat = fs.statSync(fullPath);
        const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
        if (stat.size > 1.5 * 1024 * 1024) {
          findings.push({
            id: `PERF-HEAVY-ASSET-${asset.replace(/[^a-zA-Z0-9]/g, '_')}`,
            severity: 'P2',
            title: `Large Static Image Asset (${sizeMb} MB) in ${asset}`,
            description: `Uncompressed image file exceeds 1.5 MB, hurting Largest Contentful Paint (LCP) and mobile bandwidth.`,
            file: asset,
            remediation: 'Convert image to modern WebP or AVIF format and compress using Sharp, Squoosh, or Next.js Image component.',
            rule: 'Preflight Performance Rule 7.5 (Asset Compression)'
          });
          p2Count++;
        }
      } catch (e) {}
    }

    if (p1Count === 0 && p0Count === 0) {
      findings.push({
        id: 'PERF-HYGIENE-OK',
        severity: 'PASSED',
        title: 'Core performance hygiene verified',
        description: 'No blocking synchronous I/O or blatant N+1 queries detected in standard execution paths.',
        file: 'performance'
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
