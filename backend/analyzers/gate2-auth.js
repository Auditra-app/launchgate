const path = require('path');
const { readFile, getSnippet } = require('../services/file-crawler');
const { getUnprotectedMutations } = require('../services/route-graph');

module.exports = {
  id: 'gate-2',
  number: 2,
  name: 'Authentication, Session Integrity & BOLA/IDOR Defense',
  category: 'Access Control & Auth',
  description: 'Maps all API routes and mutations, flags endpoints missing server-side authentication, detects Broken Object Level Authorization (BOLA/IDOR), and verifies RBAC/cookie policies.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    // AST-based route analysis (primary signal, precise line numbers)
    const astFlaggedFiles = new Set();
    try {
      const unprotected = getUnprotectedMutations(projectPath);
      const seen = new Set();
      for (const route of unprotected) {
        const key = `${route.file}:${route.method}:${route.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (route.path.includes('webhook') || route.path.includes('health') || route.path.includes('public')) continue;
        astFlaggedFiles.add(route.file);
        findings.push({
          id: `AUTH-UNPROTECTED-AST-${route.file.replace(/[^a-zA-Z0-9]/g, '-')}-${route.method}-${route.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
          severity: 'P0',
          title: `Unprotected mutation route (AST): ${route.method} ${route.path}`,
          description: `AST analysis shows ${route.method} ${route.path} in ${route.file} has no detected auth/session middleware. This is high risk for BOLA/IDOR.`,
          file: route.file,
          line: route.line || null,
          snippet: null,
          remediation: 'Add server-side auth middleware (e.g., requireAuth/ensureSession). Enforce resource ownership checks (userId/orgId) and scope DB queries by authenticated identity.',
          rule: 'Preflight Auth Rule 2.1 (Server-Side Auth & BOLA Defense)'
        });
        p0Count++;
        if (p0Count >= 5) break;
      }
    } catch (e) { /* fall back to heuristics */ }

    // 1. Locate API routes and handlers
    // Next.js App Router (app/api/**/route.ts|js), Pages Router (pages/api/**.ts|js), Express routes, FastAPI endpoints
    const routeFiles = files.filter(f => 
      (f.includes('api/') || f.includes('routes/') || f.includes('endpoints/') || f.includes('server/actions') || f.endsWith('server.js')) &&
      /\.(js|jsx|ts|tsx|py)$/.test(f)
    );

    const sessionIdentifiers = [
      'auth(',
      'getServerSession',
      'getSession',
      'createRouteHandlerClient',
      'supabase.auth.getUser',
      'verifySession',
      'req.user',
      'req.session',
      'authenticate',
      'jwt.verify',
      'get_current_user',
      'requireAuth',
      'withAuth',
      'protectRoute',
      'clerkClient',
      'currentUser'
    ];

    let verifiedRouteCount = 0;

    for (const file of routeFiles) {
      const content = readFile(projectPath, file);
      if (!content) continue;

      const hasSessionCheck = sessionIdentifiers.some(ident => content.includes(ident));
      const isPublicRoute = file.includes('login') || file.includes('signup') || file.includes('register') || file.includes('health') || file.includes('public') || file.includes('webhook');

      // Check for mutating methods
      const hasPost = /export\s+(?:async\s+)?function\s+POST/i.test(content) || /router\.post\(/i.test(content) || /@app\.post\(/i.test(content) || /app\.post\(/i.test(content);
      const hasPut = /export\s+(?:async\s+)?function\s+PUT/i.test(content) || /router\.put\(/i.test(content) || /@app\.put\(/i.test(content) || /app\.put\(/i.test(content);
      const hasDelete = /export\s+(?:async\s+)?function\s+DELETE/i.test(content) || /router\.delete\(/i.test(content) || /@app\.delete\(/i.test(content) || /app\.delete\(/i.test(content);
      const hasPatch = /export\s+(?:async\s+)?function\s+PATCH/i.test(content) || /router\.patch\(/i.test(content) || /@app\.patch\(/i.test(content) || /app\.patch\(/i.test(content);

      const isMutating = hasPost || hasPut || hasDelete || hasPatch;

      if (isMutating && !hasSessionCheck && !isPublicRoute && !astFlaggedFiles.has(file)) {
        const lineNum = 1;
        findings.push({
          id: `AUTH-MUTATION-UNGUARDED-${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'P0',
          title: `Mutating Route Missing Server-Side Session Auth (${file})`,
          description: `This endpoint defines mutating handlers (POST/PUT/DELETE/PATCH) but does not verify server session authentication. Anyone can trigger mutations unauthenticated.`,
          file,
          line: lineNum,
          snippet: getSnippet(content, 1, 4),
          remediation: `Wrap this handler in a server-side session check (e.g. const session = await auth(); if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });).`,
          rule: 'Preflight Auth Rule 2.1 (Zero-Trust API)'
        });
        p0Count++;
      } else if (hasSessionCheck) {
        verifiedRouteCount++;
      }

      // 2. BOLA / IDOR Detection: Querying by ID without scoping by user or tenant
      // Example: prisma.order.findUnique({ where: { id } }) without userId
      // or supabase.from('orders').select().eq('id', req.params.id)
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isDbQueryWithId = (
          (line.includes('.findUnique(') || line.includes('.delete(') || line.includes('.update(') || line.includes('.findFirst(') || line.includes('.findById(') || line.includes('.findByPk(')) &&
          (line.includes('params.id') || line.includes('req.params.id') || line.includes('id: id') || line.includes('where: { id }') || line.includes('req.query.id'))
        );

        const hasUserScope = (
          content.includes('userId') || 
          content.includes('user_id') || 
          content.includes('orgId') || 
          content.includes('org_id') ||
          content.includes('tenantId') ||
          content.includes('tenant_id') ||
          content.includes('ownerId') ||
          content.includes('accountId')
        );

        if (isDbQueryWithId && !hasUserScope && !isPublicRoute) {
          findings.push({
            id: `BOLA-IDOR-${file.replace(/[^a-zA-Z0-9]/g, '_')}-${i + 1}`,
            severity: 'P0',
            title: `Potential BOLA / IDOR Vulnerability in ${file}`,
            description: `Database mutation or query accesses a record directly by user-supplied ID without verifying ownership or tenant isolation against the session. An attacker could alter other users' records by guessing IDs.`,
            file,
            line: i + 1,
            snippet: getSnippet(content, i + 1, 2),
            remediation: `Scope the query by the authenticated session user: e.g., \`where: { id: params.id, userId: session.user.id }\`.`,
            rule: 'Preflight Auth Rule 2.2 (BOLA/IDOR Defense)'
          });
          p0Count++;
        }
      }

      // 3. Admin & RBAC checks
      if ((file.includes('admin') || content.includes('/admin/')) && !isPublicRoute) {
        const hasRoleCheck = content.includes('role ===') || content.includes('role ==') || content.includes('isAdmin') || content.includes('hasPermission') || content.includes('ROLE_ADMIN') || content.includes('requireAdmin');
        if (!hasRoleCheck) {
          findings.push({
            id: `AUTH-ADMIN-RBAC-MISSING-${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
            severity: 'P1',
            title: `Admin Endpoint Missing Explicit RBAC Role Verification (${file})`,
            description: `This file contains administrative operations or paths, but does not explicitly verify the user's role (e.g. session.user.role === 'admin'). Standard authenticated users might access admin privileges.`,
            file,
            line: 1,
            snippet: getSnippet(content, 1, 3),
            remediation: `Add explicit role verification: \`if (session?.user?.role !== 'ADMIN') throw new ForbiddenException();\``,
            rule: 'Preflight Auth Rule 2.3 (Role-Based Access Control)'
          });
          p1Count++;
        }
      }

      // 4. Insecure Cookie settings
      // checks for res.cookie or cookies().set with missing httpOnly / secure
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('res.cookie(') || line.includes('cookies().set(')) {
          const cookieBlock = lines.slice(i, i + 6).join(' ');
          if (cookieBlock.includes('httpOnly: false')) {
            findings.push({
              id: `AUTH-COOKIE-HTTPONLY-${file.replace(/[^a-zA-Z0-9]/g, '_')}-${i + 1}`,
              severity: 'P1',
              title: `Cookie explicitly set with httpOnly: false`,
              description: `Session or auth cookies set with httpOnly: false can be stolen via Cross-Site Scripting (XSS).`,
              file,
              line: i + 1,
              snippet: getSnippet(content, i + 1, 2),
              remediation: `Set \`httpOnly: true\` and \`secure: process.env.NODE_ENV === 'production'\` on all authentication cookies.`,
              rule: 'Preflight Auth Rule 2.4'
            });
            p1Count++;
          }
        }
      }
    }

    if (verifiedRouteCount > 0 && p0Count === 0) {
      findings.push({
        id: 'AUTH-SERVER-VERIFIED-OK',
        severity: 'PASSED',
        title: 'Server-side session verification confirmed',
        description: `Verified server-side authentication patterns across ${verifiedRouteCount} protected endpoints.`,
        file: 'api-routes'
      });
      passedCount++;
    }

    if (routeFiles.length === 0) {
      findings.push({
        id: 'AUTH-NO-ROUTES',
        severity: 'PASSED',
        title: 'No server API routes found',
        description: 'Application appears to be static or client-focused; no direct API routes requiring session gates.',
        file: 'root'
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
