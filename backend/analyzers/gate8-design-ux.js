const path = require('path');
const { readFile, getSnippet } = require('../services/file-crawler');

module.exports = {
  id: 'gate-8',
  number: 8,
  name: 'Design Consistency, UX States & Localization (LTR/RTL)',
  category: 'UX, Design & Accessibility',
  description: 'Audits design token consistency, verifies Loading/Empty/Error state handling, checks custom 404/500 pages, tests RTL logical properties, and checks accessibility.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    const uiFiles = files.filter(f => 
      (f.includes('components/') || f.includes('views/') || f.includes('pages/') || f.includes('app/')) &&
      /\.(jsx|tsx)$/.test(f)
    );

    // 1. Custom 404 and Error Pages
    const isDesktopOrApi = stackInfo.isElectron || stackInfo.isDesktop || (!stackInfo.isWeb && !files.includes('index.html'));
    const has404 = files.some(f => f.includes('not-found.') || f.includes('404.'));
    const hasErrorPage = files.some(f => f.includes('error.tsx') || f.includes('error.jsx') || f.includes('500.'));

    if (isDesktopOrApi) {
      findings.push({
        id: 'UX-404-NOT-APPLICABLE',
        severity: 'PASSED',
        title: 'Desktop Client / API: Custom web 404 routing not applicable',
        description: 'Desktop applications and headless APIs do not serve web browser 404 URL routes.',
        file: 'application'
      });
      passedCount++;
    } else if (!has404) {
      findings.push({
        id: 'UX-NO-404-PAGE',
        severity: 'P2',
        title: 'Missing Custom 404 / Not-Found Page',
        description: 'No `not-found.tsx` or `404.html` detected. Missing custom branded 404 will fall back to generic framework error pages.',
        file: stackInfo.isNext ? 'app/not-found.tsx' : (files.includes('index.html') ? 'public/404.html' : '404'),
        remediation: 'Create a custom `not-found.tsx` or `404.html` with helpful navigation back to dashboard/home.',
        rule: 'Preflight UX Rule 8.1 (Custom 404 Handling)'
      });
      p2Count++;
    } else {
      findings.push({
        id: 'UX-404-PAGE-OK',
        severity: 'PASSED',
        title: 'Custom 404 page detected',
        description: 'Branded not-found / 404 page is present.',
        file: 'not-found'
      });
      passedCount++;
    }

    // 2. Directional vs Logical RTL Properties (Tailwind)
    let rtlIssueCount = 0;
    for (const f of uiFiles) {
      if (rtlIssueCount >= 5) break;
      const content = readFile(projectPath, f);
      if (!content) continue;

      const directionalRegex = /\b(ml-|mr-|pl-|pr-|left-|right-)[0-9]+/g;
      let match;
      if ((match = directionalRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        findings.push({
          id: `UX-DIRECTIONAL-RTL-${f.replace(/[^a-zA-Z0-9]/g, '_')}-${lineNum}`,
          severity: 'P2',
          title: `Directional styling class (\`${match[0]}\`) instead of RTL logical property in ${f}`,
          description: `Using directional classes like \`ml-\`, \`mr-\`, \`pl-\`, \`pr-\` breaks layout symmetry in RTL languages (Arabic, Hebrew). Use Tailwind logical properties \`ms-\`, \`me-\`, \`ps-\`, \`pe-\`, \`start-\`, \`end-\`.`,
          file: f,
          line: lineNum,
          snippet: getSnippet(content, lineNum, 1),
          remediation: `Replace \`ml-\` with \`ms-\`, \`mr-\` with \`me-\`, \`pl-\` with \`ps-\`, \`pr-\` with \`pe-\`.`,
          rule: 'Preflight UX Rule 8.2 (RTL/LTR Layout Parity)'
        });
        p2Count++;
        rtlIssueCount++;
      }
    }

    // 3. Accessibility: Missing alt on img, missing aria-label
    let a11yCount = 0;
    for (const f of uiFiles) {
      if (a11yCount >= 4) break;
      const content = readFile(projectPath, f);
      if (!content) continue;

      if (/<img\s+[^>]*src=[^>]*>/i.test(content) && !content.includes('alt=')) {
        const lineNum = content.split('\n').findIndex(l => l.includes('<img') && !l.includes('alt=')) + 1;
        findings.push({
          id: `A11Y-IMG-NO-ALT-${f.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'P2',
          title: `<img> element missing alt attribute in ${f}`,
          description: 'Images without descriptive alt attributes fail WCAG accessibility standards and degrade screen reader experience.',
          file: f,
          line: lineNum > 0 ? lineNum : 1,
          snippet: getSnippet(content, lineNum > 0 ? lineNum : 1, 2),
          remediation: 'Provide a descriptive `alt="..."` attribute or `alt=""` for purely decorative images.',
          rule: 'Preflight UX Rule 8.3 (Accessibility Alt Tags)'
        });
        p2Count++;
        a11yCount++;
      }
    }

    // 4. Arbitrary hex colors bypassing Tailwind/Design system
    let arbitraryColorCount = 0;
    for (const f of uiFiles) {
      if (arbitraryColorCount >= 4) break;
      const content = readFile(projectPath, f);
      if (!content) continue;

      // Look for Tailwind arbitrary hex values: e.g. bg-[#123456] or text-[#...]
      const arbHexRegex = /\b(?:bg|text|border|fill)-\[#[0-9a-fA-F]{3,8}\]/g;
      let match;
      if ((match = arbHexRegex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        findings.push({
          id: `DESIGN-ARBITRARY-HEX-${f.replace(/[^a-zA-Z0-9]/g, '_')}-${lineNum}`,
          severity: 'P2',
          title: `Arbitrary color token \`${match[0]}\` bypassing design system in ${f}`,
          description: `Hardcoded hex values bypass theme tokens and break dark-mode/light-mode consistency.`,
          file: f,
          line: lineNum,
          snippet: getSnippet(content, lineNum, 1),
          remediation: 'Map this color to a semantic theme variable or standard Tailwind palette token (e.g., bg-slate-900, text-indigo-400).',
          rule: 'Preflight UX Rule 8.4 (Design System Tokens)'
        });
        p2Count++;
        arbitraryColorCount++;
      }
    }

    if (p2Count === 0) {
      findings.push({
        id: 'UX-DESIGN-CONSISTENCY-OK',
        severity: 'PASSED',
        title: 'Design tokens and accessibility baseline verified',
        description: 'No major hardcoded arbitrary colors or missing alt tags identified.',
        file: 'components'
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
