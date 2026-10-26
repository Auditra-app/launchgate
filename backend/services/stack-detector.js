const fs = require('fs');
const path = require('path');
const { readFile } = require('./file-crawler');

function detectStack(projectPath, files) {
  const stack = {
    framework: null,
    frameworks: [],
    languages: [],
    databases: [],
    tooling: [],
    aiEngines: [],
    authProviders: [],
    deployment: [],
    packageManager: 'unknown',
    hasTypeScript: false,
    hasDockerfile: false,
    hasTailwind: false,
    hasSentry: false,
    hasPrisma: false,
    hasSupabase: false,
    hasFirebase: false,
    isElectron: false,
    isNext: false,
    isVite: false,
    isExpress: false,
    isDesktop: false,
    isCli: false,
    isWeb: true,
    allBadges: []
  };

  // Inspect package.json
  const pkgJsonStr = readFile(projectPath, 'package.json');
  let pkg = {};
  if (pkgJsonStr) {
    try {
      pkg = JSON.parse(pkgJsonStr);
      stack.packageManager = 'npm';
      if (files.includes('pnpm-lock.yaml')) stack.packageManager = 'pnpm';
      else if (files.includes('yarn.lock')) stack.packageManager = 'yarn';
      else if (files.includes('bun.lockb') || files.includes('bun.lock')) stack.packageManager = 'bun';
    } catch (e) {}
  }

  // Inspect Python files
  const reqTxt = readFile(projectPath, 'requirements.txt') || '';
  const pyproject = readFile(projectPath, 'pyproject.toml') || '';
  const pythonContent = (reqTxt + '\n' + pyproject).toLowerCase();

  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {})
  };

  const hasDep = (depName) => Boolean(allDeps[depName]);
  const hasDepMatching = (regex) => Object.keys(allDeps).some(d => regex.test(d));

  // Language detection
  if (files.some(f => f.endsWith('.ts') || f.endsWith('.tsx')) || hasDep('typescript') || files.includes('tsconfig.json')) {
    stack.languages.push('TypeScript');
    stack.hasTypeScript = true;
  }
  if (files.some(f => f.endsWith('.js') || f.endsWith('.jsx'))) {
    stack.languages.push('JavaScript');
  }
  if (files.some(f => f.endsWith('.py')) || reqTxt || pyproject) {
    stack.languages.push('Python');
  }
  if (files.some(f => f.endsWith('.go'))) stack.languages.push('Go');
  if (files.some(f => f.endsWith('.rs'))) stack.languages.push('Rust');

  // Framework detection
  if (hasDep('electron') || files.some(f => f.startsWith('electron/') || f.includes('electron.')) || files.includes('electron-builder.yml')) {
    stack.frameworks.push('Electron');
    stack.isElectron = true;
    stack.isDesktop = true;
    stack.isWeb = false;
    if (!stack.framework) stack.framework = 'Electron';
  }
  if (hasDep('next') || files.includes('next.config.js') || files.includes('next.config.ts') || files.includes('next.config.mjs')) {
    stack.frameworks.push('Next.js');
    stack.isNext = true;
    if (!stack.framework) stack.framework = 'Next.js';
  }
  if (hasDep('vite') || files.some(f => f.startsWith('vite.config'))) {
    stack.frameworks.push('Vite');
    stack.isVite = true;
    if (!stack.framework) stack.framework = 'Vite';
  }
  if (hasDep('react') && !stack.frameworks.includes('Next.js')) {
    stack.frameworks.push('React');
    if (!stack.framework) stack.framework = 'React';
  }
  if (hasDep('vue') || hasDep('nuxt')) {
    stack.frameworks.push(hasDep('nuxt') ? 'Nuxt' : 'Vue');
  }
  if (hasDep('express')) {
    stack.frameworks.push('Express');
    stack.isExpress = true;
    if (!stack.framework) stack.framework = 'Express';
  }
  if (hasDep('fastify')) stack.frameworks.push('Fastify');
  if (hasDep('nestjs') || hasDep('@nestjs/core')) stack.frameworks.push('NestJS');
  if (pythonContent.includes('fastapi')) stack.frameworks.push('FastAPI');
  if (pythonContent.includes('streamlit')) stack.frameworks.push('Streamlit');
  if (pythonContent.includes('django')) stack.frameworks.push('Django');
  if (pythonContent.includes('flask')) stack.frameworks.push('Flask');

  // Database / ORM detection
  if (hasDep('@prisma/client') || hasDep('prisma') || files.some(f => f.endsWith('.prisma'))) {
    stack.databases.push('Prisma');
    stack.hasPrisma = true;
  }
  if (hasDep('drizzle-orm')) stack.databases.push('Drizzle');
  if (hasDep('@supabase/supabase-js') || files.some(f => f.startsWith('supabase/'))) {
    stack.databases.push('Supabase');
    stack.hasSupabase = true;
  }
  if (hasDep('firebase') || hasDep('firebase-admin') || files.includes('firebase.json')) {
    stack.databases.push('Firebase');
    stack.hasFirebase = true;
  }
  if (hasDep('pg') || hasDep('postgres') || pythonContent.includes('psycopg2') || pythonContent.includes('asyncpg')) {
    stack.databases.push('PostgreSQL');
  }
  if (hasDep('mongodb') || hasDep('mongoose') || pythonContent.includes('pymongo')) {
    stack.databases.push('MongoDB');
  }
  if (hasDep('redis') || hasDep('ioredis') || hasDep('@upstash/redis')) {
    stack.databases.push('Redis');
  }

  // Styling & UI
  if (hasDep('tailwindcss') || files.some(f => f.startsWith('tailwind.config'))) {
    stack.tooling.push('Tailwind CSS');
    stack.hasTailwind = true;
  }
  if (hasDep('@shadcn/ui') || files.includes('components.json')) {
    stack.tooling.push('shadcn/ui');
  }

  // Observability & Error Monitoring
  if (hasDepMatching(/@sentry\//) || pythonContent.includes('sentry-sdk') || files.some(f => f.includes('sentry.'))) {
    stack.tooling.push('Sentry');
    stack.hasSentry = true;
  }
  if (hasDep('posthog-js') || hasDep('posthog-node')) stack.tooling.push('PostHog');

  // AI & LLM SDKs
  if (hasDep('@google/genai') || hasDep('@google/generative-ai') || pythonContent.includes('google-genai') || pythonContent.includes('google-generativeai')) {
    stack.aiEngines.push('Google Gemini');
  }
  if (hasDep('openai') || pythonContent.includes('openai')) {
    stack.aiEngines.push('OpenAI');
  }
  if (hasDep('@anthropic-ai/sdk') || pythonContent.includes('anthropic')) {
    stack.aiEngines.push('Anthropic Claude');
  }
  if (hasDep('ai')) {
    stack.aiEngines.push('Vercel AI SDK');
  }
  if (hasDep('langchain') || pythonContent.includes('langchain')) {
    stack.aiEngines.push('LangChain');
  }
  if (hasDep('elevenlabs') || pythonContent.includes('elevenlabs')) {
    stack.aiEngines.push('ElevenLabs');
  }

  // Auth
  if (hasDep('next-auth') || hasDep('@auth/core')) stack.authProviders.push('NextAuth / Auth.js');
  if (hasDep('@clerk/nextjs') || hasDep('@clerk/clerk-react')) stack.authProviders.push('Clerk');
  if (hasDep('jsonwebtoken') || hasDep('jose')) stack.authProviders.push('JWT');
  if (stack.hasSupabase) stack.authProviders.push('Supabase Auth');
  if (stack.hasFirebase) stack.authProviders.push('Firebase Auth');

  // CLI Detection
  if (pkg.bin || files.includes('cli.js')) {
    stack.isCli = true;
    stack.tooling.push('CLI Runner');
  }

  // Infrastructure & Deployment
  if (files.some(f => f.toLowerCase() === 'dockerfile') || files.some(f => f.includes('docker-compose'))) {
    stack.deployment.push('Docker');
    stack.hasDockerfile = true;
  }
  if (files.some(f => f.startsWith('.github/workflows/'))) {
    stack.deployment.push('GitHub Actions');
  }
  if (files.includes('cloudbuild.yaml') || files.includes('cloudbuild.json')) {
    stack.deployment.push('Google Cloud Build');
  }
  if (files.includes('vercel.json')) stack.deployment.push('Vercel');
  if (files.includes('wrangler.toml')) stack.deployment.push('Cloudflare');

  // Flatten into neat badge list
  const badges = [];
  if (stack.framework) badges.push({ name: stack.framework, type: 'framework', color: 'indigo' });
  stack.languages.forEach(l => badges.push({ name: l, type: 'language', color: 'blue' }));
  stack.databases.forEach(d => badges.push({ name: d, type: 'database', color: 'emerald' }));
  stack.aiEngines.forEach(a => badges.push({ name: a, type: 'ai', color: 'purple' }));
  stack.authProviders.forEach(auth => badges.push({ name: auth, type: 'auth', color: 'cyan' }));
  stack.tooling.forEach(t => badges.push({ name: t, type: 'tool', color: 'amber' }));
  stack.deployment.forEach(dep => badges.push({ name: dep, type: 'infra', color: 'rose' }));

  stack.allBadges = badges;
  return stack;
}

module.exports = { detectStack };
