const path = require('path');
const { readFile, getSnippet } = require('../services/file-crawler');

module.exports = {
  id: 'gate-9',
  number: 9,
  name: 'SEO, Metadata, Legal & Commercial Readiness',
  category: 'SEO, Legal & Commercial',
  description: 'Audits robots.txt, sitemap, OpenGraph metadata, legal links (Privacy Policy, Terms of Service), placeholder anchor links, and transactional UX feedback.',

  analyze: async function(projectPath, files, stackInfo) {
    const findings = [];
    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let passedCount = 0;

    // 1. Robots.txt and Sitemap.xml
    const isDesktopOrApi = stackInfo.isElectron || stackInfo.isDesktop || (!stackInfo.isWeb && !files.includes('index.html'));

    if (isDesktopOrApi) {
      findings.push({
        id: 'SEO-DESKTOP-NA',
        severity: 'PASSED',
        title: 'Desktop Client / Backend Service: Web crawlers (robots/sitemap) not applicable',
        description: 'Desktop applications and internal API services are not crawled by public search engine spiders.',
        file: 'application'
      });
      passedCount += 2;
    } else {
      const hasRobots = files.some(f => f.includes('robots.txt') || f.includes('robots.ts'));
      const hasSitemap = files.some(f => f.includes('sitemap.xml') || f.includes('sitemap.ts'));

      if (!hasRobots) {
        findings.push({
          id: 'SEO-NO-ROBOTS',
          severity: 'P2',
          title: 'Missing robots.txt crawler configuration',
          description: 'No `robots.txt` found in public or app directory. Search engine crawlers may index private/staging paths or fail to locate the sitemap.',
          file: 'public/robots.txt',
          remediation: 'Create a `public/robots.txt` specifying allowed agent paths and the Sitemap URL.',
          rule: 'Preflight SEO Rule 9.1 (Robots.txt)'
        });
        p2Count++;
      } else {
        findings.push({
          id: 'SEO-ROBOTS-OK',
          severity: 'PASSED',
          title: 'robots.txt is configured',
          description: 'Crawler directives are present.',
          file: 'robots.txt'
        });
        passedCount++;
      }

      if (!hasSitemap) {
        findings.push({
          id: 'SEO-NO-SITEMAP',
          severity: 'P2',
          title: 'Missing sitemap.xml',
          description: 'No `sitemap.xml` or `sitemap.ts` found. Search engines cannot efficiently index all dynamic and marketing pages.',
          file: 'public/sitemap.xml',
          remediation: 'Generate a static `sitemap.xml` or implement Next.js dynamic `app/sitemap.ts`.',
          rule: 'Preflight SEO Rule 9.2 (Sitemap)'
        });
        p2Count++;
      } else {
        findings.push({
          id: 'SEO-SITEMAP-OK',
          severity: 'PASSED',
          title: 'Sitemap detected',
          description: 'Sitemap configuration is present.',
          file: 'sitemap'
        });
        passedCount++;
      }
    }

    // 2. OpenGraph & Metadata Checks
    const layoutFiles = files.filter(f => f.includes('layout.tsx') || f.includes('layout.jsx') || f.includes('_app.') || f.includes('index.html'));
    let hasMetadata = false;

    for (const lf of layoutFiles) {
      const content = readFile(projectPath, lf);
      if (content && (content.includes('metadata') || content.includes('openGraph') || content.includes('<title>'))) {
        hasMetadata = true;
        break;
      }
    }

    if (hasMetadata) {
      findings.push({
        id: 'SEO-METADATA-OK',
        severity: 'PASSED',
        title: 'SEO title and metadata tags detected',
        description: 'Root layout or template defines page title and OpenGraph metadata.',
        file: 'layout'
      });
      passedCount++;
    } else {
      findings.push({
        id: 'SEO-METADATA-MISSING',
        severity: 'P2',
        title: 'Missing OpenGraph / SEO Metadata in Root Layout',
        description: 'Root layout does not define title, description, or OpenGraph preview images. Social links shared on WhatsApp, Twitter, and LinkedIn will render without rich cards.',
        file: 'app/layout.tsx',
        remediation: 'Export a `metadata` object in your root `layout.tsx` containing title, description, and openGraph images.',
        rule: 'Preflight SEO Rule 9.3 (Social Metadata)'
      });
      p2Count++;
    }

    // 3. Legal Readiness: Privacy Policy & Terms of Service
    const hasPrivacy = files.some(f => f.toLowerCase().includes('privacy'));
    const hasTerms = files.some(f => f.toLowerCase().includes('terms') || f.toLowerCase().includes('license'));

    if (!hasPrivacy) {
      findings.push({
        id: 'LEGAL-NO-PRIVACY',
        severity: 'P1',
        title: 'Missing Privacy Policy page or document',
        description: 'No Privacy Policy document or route found. Required for distribution, user data handling disclosure, and commercial store compliance.',
        file: isDesktopOrApi ? 'PRIVACY.md' : (stackInfo.isNext ? 'app/privacy/page.tsx' : 'public/privacy.html'),
        remediation: 'Create a Privacy Policy document (or `/privacy` route) detailing user data handling and security disclosures.',
        rule: 'Preflight Legal Rule 9.4 (Mandatory Privacy Policy)'
      });
      p1Count++;
    } else {
      findings.push({
        id: 'LEGAL-PRIVACY-OK',
        severity: 'PASSED',
        title: 'Privacy Policy document / route exists',
        description: 'Privacy Policy documentation detected.',
        file: 'privacy'
      });
      passedCount++;
    }

    if (!hasTerms) {
      findings.push({
        id: 'LEGAL-NO-TERMS',
        severity: 'P2',
        title: 'Missing Terms of Service / License document',
        description: 'No Terms of Service or LICENSE file found. Essential for commercial liability protection and distribution rights.',
        file: isDesktopOrApi ? 'LICENSE' : (stackInfo.isNext ? 'app/terms/page.tsx' : 'public/terms.html'),
        remediation: 'Add a `LICENSE` or `TERMS.md` outlining acceptable use, warranties, and distribution rights.',
        rule: 'Preflight Legal Rule 9.5 (Terms of Service)'
      });
      p2Count++;
    } else {
      findings.push({
        id: 'LEGAL-TERMS-OK',
        severity: 'PASSED',
        title: 'Terms / License document detected',
        description: 'License or commercial terms documentation is present.',
        file: 'license'
      });
      passedCount++;
    }

    // 4. Broken "#" Anchor links in Navigation / Footer
    const uiFiles = files.filter(f => (f.includes('components/') || f.includes('views/')) && /\.(jsx|tsx)$/.test(f));
    let placeholderLinkCount = 0;

    for (const f of uiFiles) {
      if (placeholderLinkCount >= 3) break;
      const content = readFile(projectPath, f);
      if (!content) continue;

      if (content.includes('href="#"') || content.includes("href='#'")) {
        const lineNum = content.split('\n').findIndex(l => l.includes('href="#"') || l.includes("href='#'")) + 1;
        findings.push({
          id: `LEGAL-PLACEHOLDER-LINK-${f.replace(/[^a-zA-Z0-9]/g, '_')}`,
          severity: 'P2',
          title: `Dead placeholder link (href="#") in ${f}`,
          description: `Detected unlinked anchor with \`href="#"\`. Users clicking this in production will encounter dead clicks.`,
          file: f,
          line: lineNum,
          snippet: getSnippet(content, lineNum, 1),
          remediation: 'Replace placeholder "#" with valid route destinations or replace with a `<button>` if handling an action.',
          rule: 'Preflight Legal Rule 9.6 (No Placeholder Links)'
        });
        p2Count++;
        placeholderLinkCount++;
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
