/**
 * AST-based Route Graph Analyzer
 * Builds a route -> middleware -> handler graph for Express, Fastify-like, and
 * Next.js App Router patterns. Used by Gate 2 to detect unprotected mutations.
 */

const fs = require('fs');
const path = require('path');
const { crawlProject } = require('./file-crawler');

let acorn = null;
let tsParser = null;

try { acorn = require('acorn'); } catch (e) { /* optional */ }
try { tsParser = require('@typescript-eslint/parser'); } catch (e) { /* optional */ }

const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'use', 'route']);

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

function isRouteFile(file) {
  const f = file.toLowerCase();
  if (f.includes('/routes/') || f.includes('\\routes\\')) return true;
  if (f.includes('app.js') || f.includes('server.js') || f.includes('index.js')) return true;
  if (f.match(/route\.(js|ts|jsx|tsx)$/)) return true;
  if (f.includes('/api/') && (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.tsx'))) return true;
  if (f.includes('router')) return true;
  return false;
}

function extractString(node) {
  if (!node) return null;
  if (node.type === 'Literal') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

function extractMiddlewareNames(args) {
  const names = [];
  for (let i = 0; i < args.length - 1; i++) {
    const arg = args[i];
    if (arg.type === 'Identifier') names.push(arg.name);
    else if (arg.type === 'MemberExpression') {
      if (arg.property && arg.property.name) names.push(arg.property.name);
    } else if (arg.type === 'CallExpression' && arg.callee && arg.callee.name) {
      names.push(arg.callee.name);
    }
  }
  return names;
}

function hasAuthHint(names) {
  const authHints = ['auth', 'authenticate', 'requireAuth', 'ensureAuth', 'isAuthenticated', 'verifyToken', 'checkAuth', 'protect', 'session', 'passport', 'withAuth', 'requireSession'];
  for (const n of names) {
    const lower = String(n).toLowerCase();
    if (authHints.some(h => lower.includes(h))) return true;
  }
  return false;
}

function parseWithAcorn(code, file) {
  if (!acorn) return null;
  try {
    const isJSX = file.endsWith('.jsx') || file.endsWith('.tsx');
    return acorn.parse(code, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
      ranges: true,
      allowHashBang: true,
      ...(isJSX ? { allowReserved: true } : {})
    });
  } catch (e) {
    return null;
  }
}

function parseWithTS(code, file) {
  if (!tsParser) return null;
  try {
    return tsParser.parse(code, {
      sourceType: 'module',
      ecmaVersion: 2022,
      filePath: file,
      loc: true,
      range: true
    });
  } catch (e) {
    return null;
  }
}

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) walk(c, visitor);
    } else if (child && typeof child === 'object' && child.type) {
      walk(child, visitor);
    }
  }
}

function analyzeFile(projectPath, file) {
  const fullPath = path.join(projectPath, file);
  const code = readFileSafe(fullPath);
  if (!code) return [];

  let ast = parseWithTS(code, fullPath) || parseWithAcorn(code, fullPath);
  if (!ast) return [];

  const routes = [];

  walk(ast, (node) => {
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      if (callee.type === 'MemberExpression') {
        const method = callee.property && callee.property.name ? callee.property.name.toLowerCase() : null;
        if (method && ROUTE_METHODS.has(method) && method !== 'use' && method !== 'route') {
          const args = node.arguments || [];
          if (args.length >= 2) {
            const pathStr = extractString(args[0]);
            const middlewareNames = extractMiddlewareNames(args);
            const hasAuth = hasAuthHint(middlewareNames);
            const isMutation = ['post', 'put', 'patch', 'delete'].includes(method);
            routes.push({
              method: method.toUpperCase(),
              path: pathStr || '[dynamic]',
              file,
              line: node.loc ? node.loc.start.line : null,
              middleware: middlewareNames,
              hasAuth,
              isMutation,
              protected: hasAuth
            });
          }
        } else if (method === 'use') {
          const args = node.arguments || [];
          const middlewareNames = extractMiddlewareNames(args);
          if (middlewareNames.length > 0 && hasAuthHint(middlewareNames)) {
            routes.push({
              method: 'MIDDLEWARE',
              path: extractString(args[0]) || '[global]',
              file,
              line: node.loc ? node.loc.start.line : null,
              middleware: middlewareNames,
              hasAuth: true,
              isMutation: false,
              protected: true,
              type: 'auth-middleware'
            });
          }
        }
      }
    }
  });

  return routes;
}

function buildRouteGraph(projectPath) {
  const files = crawlProject(projectPath, 5000);
  const graph = {
    routes: [],
    protectedMutations: 0,
    unprotectedMutations: 0,
    filesScanned: 0
  };

  for (const file of files) {
    if (!isRouteFile(file)) continue;
    const ext = path.extname(file).toLowerCase();
    if (!['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(ext)) continue;
    const routes = analyzeFile(projectPath, file);
    if (routes.length === 0) continue;
    graph.filesScanned++;
    for (const r of routes) {
      graph.routes.push(r);
      if (r.isMutation) {
        if (r.protected) graph.protectedMutations++;
        else graph.unprotectedMutations++;
      }
    }
  }

  return graph;
}

function getUnprotectedMutations(projectPath) {
  const graph = buildRouteGraph(projectPath);
  return graph.routes.filter(r => r.isMutation && !r.protected);
}

module.exports = {
  buildRouteGraph,
  getUnprotectedMutations,
  analyzeFile
};
