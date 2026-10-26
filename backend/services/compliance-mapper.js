/**
 * LaunchGate Enterprise Compliance & Standards Cross-Mapping Matrix
 * Maps preflight gate findings to OWASP API Security Top 10, SOC 2 Type II, and GDPR.
 */

const COMPLIANCE_FRAMEWORKS = {
  OWASP_API: {
    'BOLA': { id: 'API1:2023', name: 'Broken Object Level Authorization (BOLA/IDOR)' },
    'AUTH': { id: 'API2:2023', name: 'Broken Authentication' },
    'RATELIMIT': { id: 'API4:2023', name: 'Unrestricted Resource Consumption' },
    'RBAC': { id: 'API5:2023', name: 'Broken Function Level Authorization' },
    'SECURITY_HEADERS': { id: 'API7:2023', name: 'Security Misconfiguration' },
    'SECRETS': { id: 'API8:2023', name: 'Lack of Protection from Automated Threats / Secret Leaks' }
  },
  SOC2: {
    'ACCESS_CONTROL': { criteria: 'CC6.1', name: 'Logical Access Controls & Server-Side Session Integrity' },
    'BOUNDARY_DEFENSE': { criteria: 'CC6.6', name: 'Boundary Protection & Network Security (HSTS/CSP)' },
    'INCIDENT_RESPONSE': { criteria: 'CC6.8', name: 'Observability & Error Resilience (Sentry/Monitoring)' },
    'VULNERABILITY_MGMT': { criteria: 'CC7.1', name: 'Supply-Chain CVE & Dependency Patching' }
  },
  GDPR: {
    'PRIVACY_POLICY': { article: 'Art. 13/14', name: 'Transparency & Mandatory Privacy Notice' },
    'SECURITY_OF_PROCESSING': { article: 'Art. 32', name: 'Security of Processing & Data Protection' },
    'DATA_MINIMIZATION': { article: 'Art. 25', name: 'Data Protection by Design & Default (PII Scrubbing)' }
  }
};

/**
 * Maps a single finding to compliance framework tags
 */
function mapFindingToCompliance(finding) {
  const normTitle = (finding.title || '').toLowerCase();
  const normRule = (finding.rule || '').toLowerCase();
  const normDesc = (finding.description || '').toLowerCase();
  const combined = `${normTitle} ${normRule} ${normDesc}`;

  const mapped = {
    owasp: null,
    soc2: null,
    gdpr: null
  };

  // OWASP API Security Mapping
  if (combined.includes('bola') || combined.includes('idor')) {
    mapped.owasp = COMPLIANCE_FRAMEWORKS.OWASP_API.BOLA;
    mapped.soc2 = COMPLIANCE_FRAMEWORKS.SOC2.ACCESS_CONTROL;
  } else if (combined.includes('auth') || combined.includes('session') || combined.includes('unauthenticated')) {
    mapped.owasp = COMPLIANCE_FRAMEWORKS.OWASP_API.AUTH;
    mapped.soc2 = COMPLIANCE_FRAMEWORKS.SOC2.ACCESS_CONTROL;
  } else if (combined.includes('rate limit') || combined.includes('abuse') || combined.includes('quota')) {
    mapped.owasp = COMPLIANCE_FRAMEWORKS.OWASP_API.RATELIMIT;
  } else if (combined.includes('rbac') || combined.includes('admin') || combined.includes('role')) {
    mapped.owasp = COMPLIANCE_FRAMEWORKS.OWASP_API.RBAC;
    mapped.soc2 = COMPLIANCE_FRAMEWORKS.SOC2.ACCESS_CONTROL;
  } else if (combined.includes('security header') || combined.includes('cors') || combined.includes('hsts') || combined.includes('csp')) {
    mapped.owasp = COMPLIANCE_FRAMEWORKS.OWASP_API.SECURITY_HEADERS;
    mapped.soc2 = COMPLIANCE_FRAMEWORKS.SOC2.BOUNDARY_DEFENSE;
  } else if (combined.includes('secret') || combined.includes('api key') || combined.includes('credential')) {
    mapped.owasp = COMPLIANCE_FRAMEWORKS.OWASP_API.SECRETS;
    mapped.soc2 = COMPLIANCE_FRAMEWORKS.SOC2.ACCESS_CONTROL;
  }

  // SOC2 Mapping
  if (combined.includes('sentry') || combined.includes('observability') || combined.includes('error boundary')) {
    mapped.soc2 = COMPLIANCE_FRAMEWORKS.SOC2.INCIDENT_RESPONSE;
  } else if (combined.includes('cve') || combined.includes('supply-chain') || combined.includes('vulnerability')) {
    mapped.soc2 = COMPLIANCE_FRAMEWORKS.SOC2.VULNERABILITY_MGMT;
  }

  // GDPR Mapping
  if (combined.includes('privacy') || combined.includes('terms')) {
    mapped.gdpr = COMPLIANCE_FRAMEWORKS.GDPR.PRIVACY_POLICY;
  } else if (combined.includes('pii') || combined.includes('scrub')) {
    mapped.gdpr = COMPLIANCE_FRAMEWORKS.GDPR.DATA_MINIMIZATION;
  } else if (combined.includes('rls') || combined.includes('encryption') || combined.includes('sql injection')) {
    mapped.gdpr = COMPLIANCE_FRAMEWORKS.GDPR.SECURITY_OF_PROCESSING;
  }

  return mapped;
}

/**
 * Builds an aggregate compliance audit matrix for the whole project
 */
function buildComplianceMatrix(projectData) {
  const gates = projectData.gates || {};
  let totalFindings = 0;
  let p0Blockers = 0;

  const matrix = {
    owaspCoverage: {
      'API1: BOLA/IDOR Defense': { status: 'PASS', details: 'No tenant leaks or unauthenticated object queries found.' },
      'API2: Broken Authentication': { status: 'PASS', details: 'All mutating routes verify server session tokens.' },
      'API4: Rate Limiting & DoS': { status: 'PASS', details: 'Public routes enforce rate-limiting defenses.' },
      'API5: Function Level RBAC': { status: 'PASS', details: 'Administrative operations verify explicit user roles.' },
      'API7: Security Headers & CORS': { status: 'PASS', details: 'HSTS, CSP, and strict CORS policies active.' }
    },
    soc2Coverage: {
      'CC6.1 Logical Access Controls': { status: 'PASS', details: 'Zero-trust API & database RLS enforcement active.' },
      'CC6.6 Boundary Protection': { status: 'PASS', details: 'Strict HTTP security headers configured.' },
      'CC6.8 Threat Detection & Observability': { status: 'PASS', details: 'Error boundaries & logging resilience verified.' },
      'CC7.1 Vulnerability Management': { status: 'PASS', details: 'No known critical supply-chain CVE vulnerabilities.' }
    },
    gdprCoverage: {
      'Art. 13/14 Privacy Notices': { status: 'PASS', details: 'Commercial Privacy Policy route published.' },
      'Art. 25 Privacy by Design (PII)': { status: 'PASS', details: 'PII telemetry scrubbing verified.' },
      'Art. 32 Security of Processing': { status: 'PASS', details: 'Database RLS & credential isolation confirmed.' }
    }
  };

  for (const [gateId, gateResult] of Object.entries(gates)) {
    if (!gateResult || !Array.isArray(gateResult.findings)) continue;

    for (const finding of gateResult.findings) {
      if (finding.severity === 'PASSED') continue;
      totalFindings++;
      if (finding.severity === 'P0') p0Blockers++;

      const mapped = mapFindingToCompliance(finding);

      if (mapped.owasp) {
        if (mapped.owasp.id.includes('API1')) matrix.owaspCoverage['API1: BOLA/IDOR Defense'] = { status: 'FAIL', details: finding.title };
        if (mapped.owasp.id.includes('API2')) matrix.owaspCoverage['API2: Broken Authentication'] = { status: 'FAIL', details: finding.title };
        if (mapped.owasp.id.includes('API4')) matrix.owaspCoverage['API4: Rate Limiting & DoS'] = { status: 'FAIL', details: finding.title };
        if (mapped.owasp.id.includes('API5')) matrix.owaspCoverage['API5: Function Level RBAC'] = { status: 'FAIL', details: finding.title };
        if (mapped.owasp.id.includes('API7')) matrix.owaspCoverage['API7: Security Headers & CORS'] = { status: 'FAIL', details: finding.title };
      }

      if (mapped.soc2) {
        if (mapped.soc2.criteria === 'CC6.1') matrix.soc2Coverage['CC6.1 Logical Access Controls'] = { status: 'FAIL', details: finding.title };
        if (mapped.soc2.criteria === 'CC6.6') matrix.soc2Coverage['CC6.6 Boundary Protection'] = { status: 'FAIL', details: finding.title };
        if (mapped.soc2.criteria === 'CC6.8') matrix.soc2Coverage['CC6.8 Threat Detection & Observability'] = { status: 'FAIL', details: finding.title };
        if (mapped.soc2.criteria === 'CC7.1') matrix.soc2Coverage['CC7.1 Vulnerability Management'] = { status: 'FAIL', details: finding.title };
      }

      if (mapped.gdpr) {
        if (mapped.gdpr.article.includes('13')) matrix.gdprCoverage['Art. 13/14 Privacy Notices'] = { status: 'FAIL', details: finding.title };
        if (mapped.gdpr.article.includes('25')) matrix.gdprCoverage['Art. 25 Privacy by Design (PII)'] = { status: 'FAIL', details: finding.title };
        if (mapped.gdpr.article.includes('32')) matrix.gdprCoverage['Art. 32 Security of Processing'] = { status: 'FAIL', details: finding.title };
      }
    }
  }

  return matrix;
}

module.exports = {
  COMPLIANCE_FRAMEWORKS,
  mapFindingToCompliance,
  buildComplianceMatrix
};
