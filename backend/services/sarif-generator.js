/**
 * LaunchGate Enterprise SARIF (Static Analysis Results Interchange Format) Exporter
 * Generates OASIS SARIF v2.1.0 JSON reports compatible with GitHub Code Scanning,
 * GitLab Security Center, VS Code Problems panel, and SonarQube.
 */

const path = require('path');
const fs = require('fs');

/**
 * Converts LaunchGate project findings into SARIF v2.1.0 schema
 */
function generateSarifReport(projectPath, projectData) {
  const normalized = path.resolve(projectPath);
  const gates = projectData.gates || {};

  const rulesMap = new Map();
  const results = [];

  // Severity translation to SARIF levels
  // P0 -> error
  // P1 -> warning
  // P2 -> note
  // PASSED -> none (not emitted in results)
  const mapLevel = (severity) => {
    switch (severity) {
      case 'P0': return 'error';
      case 'P1': return 'warning';
      case 'P2': return 'note';
      default: return 'none';
    }
  };

  for (const [gateId, gateResult] of Object.entries(gates)) {
    if (!gateResult || !Array.isArray(gateResult.findings)) continue;

    for (const finding of gateResult.findings) {
      if (finding.severity === 'PASSED') continue;

      const ruleId = finding.rule 
        ? finding.rule.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_.]/g, '')
        : (finding.id || `LG-${gateId}`);

      if (!rulesMap.has(ruleId)) {
        rulesMap.set(ruleId, {
          id: ruleId,
          name: finding.title || ruleId,
          shortDescription: {
            text: finding.title || ruleId
          },
          fullDescription: {
            text: finding.description || finding.title || ''
          },
          help: {
            text: finding.remediation || 'Inspect and remediate finding according to LaunchGate production readiness standard.'
          },
          properties: {
            tags: ['security', 'production-readiness', gateId, finding.severity],
            precision: 'high',
            problem: {
              severity: finding.severity === 'P0' ? 'critical' : (finding.severity === 'P1' ? 'high' : 'medium')
            }
          }
        });
      }

      // Format file path relative to project root
      let relFile = finding.file || 'repository';
      if (path.isAbsolute(relFile)) {
        relFile = path.relative(normalized, relFile);
      }
      relFile = relFile.replace(/\\/g, '/');

      const startLine = parseInt(finding.line, 10) || 1;

      results.push({
        ruleId,
        level: mapLevel(finding.severity),
        message: {
          text: `${finding.title}: ${finding.description}`
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: relFile,
                uriBaseId: '%SRCROOT%'
              },
              region: {
                startLine,
                startColumn: 1
              }
            }
          }
        ],
        fixes: finding.remediation ? [
          {
            description: {
              text: finding.remediation
            }
          }
        ] : []
      });
    }
  }

  const sarifLog = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'LaunchGate',
            fullName: 'LaunchGate Enterprise Production Readiness & Pre-Launch Preflight',
            version: '2.4.0',
            informationUri: 'https://github.com/launchgate/launchgate',
            rules: Array.from(rulesMap.values())
          }
        },
        invocations: [
          {
            executionSuccessful: true,
            endTimeUtc: new Date().toISOString()
          }
        ],
        results
      }
    ]
  };

  const outputPath = path.join(normalized, 'launchgate.sarif');
  fs.writeFileSync(outputPath, JSON.stringify(sarifLog, null, 2), 'utf8');

  return {
    sarifLog,
    outputPath,
    totalRules: rulesMap.size,
    totalResults: results.length
  };
}

module.exports = {
  generateSarifReport
};
