const path = require('path');
const { readFile, getSnippet } = require('../services/file-crawler');

module.exports = {
  id: 'gate-5',
  number: 5,
  name: 'AI / LLM Cost, Quota & Prompt Injection Guards',
  category: 'AI & Inference Safety',
  description: 'Audits AI/LLM SDK usage for server-only isolation, token budgeting (maxOutputTokens), structured response schema validation, and per-user credit quotas.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    // Precise regexes for AI SDK imports (avoids substring collisions like "email" or "maintain" matching "ai")
    const aiImportPatterns = [
      /(?:from|require\s*\()\s*['"]@google\/genai['"]/i,
      /(?:from|require\s*\()\s*['"]@google\/generative-ai['"]/i,
      /(?:from|require\s*\()\s*['"]openai(?:[/'"].*)?['"]/i,
      /(?:from|require\s*\()\s*['"]@anthropic-ai\/sdk['"]/i,
      /(?:from|require\s*\()\s*['"]elevenlabs['"]/i,
      /(?:from|require\s*\()\s*['"](?:@langchain\/|langchain)['"]/i,
      /\bfrom\s+['"]ai['"]/i,
      /\brequire\s*\(\s*['"]ai['"]\s*\)/i,
      // Python imports
      /^\s*(?:import\s+(?:google\.genai|google\.generativeai|openai|anthropic|langchain)|from\s+(?:google\.genai|google\.generativeai|openai|anthropic|langchain)\b)/m
    ];

    const codeFiles = files.filter(f => /\.(js|jsx|ts|tsx|py)$/.test(f) && !f.startsWith('backend/analyzers/'));
    const aiFiles = [];

    for (const file of codeFiles) {
      const content = readFile(projectPath, file);
      if (!content) continue;

      const hasAiImport = aiImportPatterns.some(pattern => pattern.test(content));
      if (hasAiImport) {
        aiFiles.push({ file, content });
      }
    }

    if (aiFiles.length === 0) {
      findings.push({
        id: 'AI-NOT-USED',
        severity: 'PASSED',
        title: 'No AI/LLM SDKs detected in codebase',
        description: 'Codebase does not import Gemini, OpenAI, Anthropic, or other LLM packages.',
        file: 'dependencies'
      });
      passedCount++;

      return {
        id: this.id,
        number: this.number,
        name: this.name,
        category: this.category,
        status: 'passed',
        score: 100,
        findings,
        stats: { p0: 0, p1: 0, p2: 0, passed: 1 }
      };
    }

    // AI is used! Run deep checks
    for (const { file, content } of aiFiles) {
      // 1. Client Component Leak Check ('use client')
      // Ensure 'use client' is a directive at the top of the file, not inside a template string
      const first500Chars = content.slice(0, 500);
      const isClientComponent = /^\s*['"]use client['"];?/m.test(first500Chars);
      if (isClientComponent) {
        findings.push({
          id: `AI-CLIENT-COMPONENT-LEAK-${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'P0',
          title: `AI/LLM SDK Imported in Client Component (${file})`,
          description: `This file contains 'use client' while importing an AI SDK. This exposes API keys to browser clients and allows end users to execute arbitrary prompts on your billing account.`,
          file,
          snippet: getSnippet(content, 1, 4),
          remediation: `Move all AI inference calls strictly into server runtimes (Next.js Server Actions or /api/ route handlers).`,
          rule: 'Preflight AI Rule 5.1 (Server Runtime Isolation)'
        });
        p0Count++;
      }

      // 2. maxOutputTokens / max_tokens bounding
      const callsGeneration = (
        content.includes('generateContent') ||
        content.includes('chat.completions.create') ||
        content.includes('messages.create') ||
        content.includes('streamText(')
      );

      if (callsGeneration) {
        const hasTokenLimit = (
          content.includes('maxOutputTokens') ||
          content.includes('max_tokens') ||
          content.includes('maxTokens')
        );

        if (!hasTokenLimit) {
          findings.push({
            id: `AI-NO-TOKEN-BOUND-${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
            severity: 'P1',
            title: `LLM Generation Call Lacks maxOutputTokens Budget (${file})`,
            description: `Model generation is called without specifying \`maxOutputTokens\` or \`max_tokens\`. An uncontrolled prompt or repetitive loop can generate tens of thousands of tokens, exhausting API credits.`,
            file,
            remediation: `Enforce a strict token budget: e.g. \`maxOutputTokens: 2048\` or \`max_tokens: 1000\`.`,
            rule: 'Preflight AI Rule 5.2 (Cost & Token Budgeting)'
          });
          p1Count++;
        } else {
          findings.push({
            id: `AI-TOKEN-BOUND-OK-${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
            severity: 'PASSED',
            title: `Token limits enforced on model call in ${file}`,
            description: 'maxOutputTokens / max_tokens parameter is properly configured.',
            file
          });
          passedCount++;
        }

        // 3. Structured Output & Schema Validation
        if (content.includes('JSON.parse(')) {
          const hasSchema = content.includes('responseSchema') || content.includes('zod') || content.includes('z.object');
          if (!hasSchema) {
            findings.push({
              id: `AI-UNVALIDATED-JSON-${file.replace(/[^a-zA-Z0-9]/g, '_')}`,
              severity: 'P1',
              title: `Unvalidated LLM JSON Output Parsing in ${file}`,
              description: `Calling JSON.parse directly on raw model output without schema validation (responseSchema or Zod) causes runtime crashes when models hallucinate or return unexpected formats.`,
              file,
              remediation: `Use Gemini responseSchema or validate parsed JSON using a Zod schema before accessing properties.`,
              rule: 'Preflight AI Rule 5.3 (Structured Output Validation)'
            });
            p1Count++;
          }
        }
      }
    }

    // 4. Check for User Credit / Quota Tracking
    const hasQuotaTracking = aiFiles.some(({ content }) => 
      content.includes('credits') ||
      content.includes('quota') ||
      content.includes('decrement') ||
      content.includes('ratelimit') ||
      content.includes('usage')
    );

    if (!hasQuotaTracking) {
      findings.push({
        id: 'AI-NO-QUOTA-TRACKING',
        severity: 'P1',
        title: 'Missing Per-User Quota / Credit Deduction Logic for AI Calls',
        description: 'No credit check or user rate quota detected before triggering AI inference. A single authenticated user could spam requests and drain API balances.',
        file: 'api/ai',
        remediation: 'Implement user credit deduction or per-user rate limiting prior to calling LLM APIs.',
        rule: 'Preflight AI Rule 5.4 (Usage Quotas)'
      });
      p1Count++;
    } else {
      findings.push({
        id: 'AI-QUOTA-TRACKING-OK',
        severity: 'PASSED',
        title: 'User quota / credit tracking detected',
        description: 'Verified usage tracking or quota guards on AI endpoints.',
        file: 'api/ai'
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
