/**
 * Comprehensive Markdown Report Generator for Glintbase Audit 3.0.
 * Generates executive-ready, spec-compliant Markdown audit reports
 * with layer health breakdowns, AI semantic evaluation summaries,
 * protocol check details, and actionable remediation diffs.
 */

import type { Ars3Scorecard, CheckResult } from '../core/checks/types.js';

export function generateComprehensiveMarkdownReport(
  scorecard: Ars3Scorecard,
  target: string,
  options: { verbose?: boolean } = {}
): string {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const durationText = scorecard.durationMs ? `${(scorecard.durationMs / 1000).toFixed(2)}s` : 'N/A';
  const intelligence = scorecard.intelligence || 'Deterministic AST & Probes Engine (Offline)';

  // Build Health Meter Bar
  const meterFilled = Math.round(scorecard.score / 5);
  const meterEmpty = 20 - meterFilled;
  const healthMeter = '█'.repeat(meterFilled) + '░'.repeat(meterEmpty);

  // Group check results
  const failedChecks = scorecard.results.filter(r => r.status === 'fail');
  const warnChecks = scorecard.results.filter(r => r.status === 'warn');
  const bonusChecks = scorecard.results.filter(r => r.isBonus && r.status === 'pass');

  // Remediations list
  let remediationsBlock = '_None detected! Target adheres to production ARS 3.0 standards._';
  if (scorecard.remediations.length > 0) {
    remediationsBlock = scorecard.remediations.map((r, i) => {
      const diffBlock = r.diffSnippet
        ? `\n\`\`\`diff\n${r.diffSnippet}\n\`\`\``
        : '';
      const cleanFile = r.targetFile.replace(/^.*[\\/]/, '');
      return `### ${i + 1}. ${r.title}
- **Target File**: \`${r.targetFile}\`
- **Diagnostic**: ${r.description}${diffBlock}
- **Command to Apply**: \`glintbase remediate ${cleanFile}\``;
    }).join('\n\n');
  }

  // AI Semantic Evaluations Block
  let aiSection = '';
  if (scorecard.aiEvaluations && Object.keys(scorecard.aiEvaluations).length > 0) {
    const aiEntries = Object.entries(scorecard.aiEvaluations);
    const aiRows = aiEntries.map(([name, ev]: [string, any]) => {
      const badge = ev.evaluatedWithAi ? `[AI: ${ev.modelUsed || 'Active'}]` : '[Offline Heuristic]';
      const passBadge = ev.passed ? '✅ Passed' : '⚠️ Gaps Found';
      const issuesList = (ev.issues && ev.issues.length > 0)
        ? ev.issues.map((iss: string) => `  - ⚠️ ${iss}`).join('\n')
        : '  - None';
      const recsList = (ev.recommendations && ev.recommendations.length > 0)
        ? ev.recommendations.map((rec: string) => `  - 💡 ${rec}`).join('\n')
        : '  - Maintained in accordance with standard';

      return `#### ${name} · ${badge} · ${ev.score}/100 pts (${passBadge})
- **Summary**: ${ev.summary}
- **Issues Found**:
${issuesList}
- **Actionable AI Recommendations**:
${recsList}`;
    }).join('\n\n');

    aiSection = `\n---\n\n## 3. Agentic AI Semantic Evaluations\n\n${aiRows}`;
  }

  function getLayerTag(checkId: string): string {
    if (checkId.startsWith('robots') || checkId.startsWith('ard') || checkId.startsWith('ai-catalog') || checkId.startsWith('wikipedia') || checkId.startsWith('brand') || checkId.startsWith('agent') || checkId.startsWith('npm') || checkId.startsWith('skills')) {
      return 'L1 (Discovery)';
    }
    if (checkId.startsWith('content') || checkId.startsWith('page') || checkId.startsWith('anti-spa') || checkId.startsWith('llms') || checkId.startsWith('markdown') || checkId.startsWith('code-fence') || checkId.startsWith('openapi') || checkId.startsWith('developer') || checkId.startsWith('ssl') || checkId.startsWith('cors')) {
      return 'L2 (Access)';
    }
    if (checkId.startsWith('mcp') || checkId.startsWith('auth') || checkId.startsWith('webmcp') || checkId.startsWith('api') || checkId.startsWith('oauth')) {
      return 'L3 (Usability)';
    }
    return 'L4 (Commerce)';
  }

  function calcPercent(earned: number, max: number): string {
    if (max <= 0) return '100%';
    return `${Math.round((earned / max) * 100)}%`;
  }

  // Failed checks table
  const failedTable = failedChecks.length > 0
    ? `| Check Name | Layer | Points | Diagnostic |\n| :--- | :---: | :---: | :--- |\n` +
      failedChecks.map(c => `| **${c.name || c.checkId}** | \`${getLayerTag(c.checkId)}\` | ${c.earnedPoints} pts | ${c.message || 'Check failed'} |`).join('\n')
    : '_None! Zero critical protocol failures detected._';

  // Warnings table
  const warnTable = warnChecks.length > 0
    ? `| Check Name | Layer | Diagnostic |\n| :--- | :---: | :--- |\n` +
      warnChecks.slice(0, 10).map(c => `| **${c.name || c.checkId}** | \`${getLayerTag(c.checkId)}\` | ${c.message || 'Warning'} |`).join('\n') +
      (warnChecks.length > 10 ? `\n\n_... and ${warnChecks.length - 10} additional warnings._` : '')
    : '_None! Zero protocol warnings._';

  // Bonus table
  const bonusTable = bonusChecks.length > 0
    ? `| Bonus Protocol Capability | Layer | Bonus Earned | Diagnostic |\n| :--- | :---: | :---: | :--- |\n` +
      bonusChecks.map(c => `| **${c.name || c.checkId}** | \`${getLayerTag(c.checkId)}\` | **+${c.earnedPoints} pts** | ${c.message || 'Bonus capability confirmed'} |`).join('\n')
    : '_No optional bonus capabilities detected._';

  const dL = scorecard.layers.discovery;
  const aL = scorecard.layers.access;
  const uL = scorecard.layers.usability;
  const pL = scorecard.layers.payments;

  const dPct = calcPercent(dL.baseEarned, dL.baseMax);
  const aPct = calcPercent(aL.baseEarned, aL.baseMax);
  const uScore = uL.applicable ? `${uL.baseEarned} pts` : 'N/A';
  const uMax = uL.applicable ? `${uL.baseMax} pts` : 'N/A';
  const uPct = uL.applicable ? calcPercent(uL.baseEarned, uL.baseMax) : 'N/A';
  const uStat = uL.applicable ? uL.statusText : 'Excluded';
  const pScore = pL.applicable ? `${pL.baseEarned} pts` : 'N/A';
  const pMax = pL.applicable ? `${pL.baseMax} pts` : 'N/A';
  const pPct = pL.applicable ? calcPercent(pL.baseEarned, pL.baseMax) : 'N/A';
  const pStat = pL.applicable ? pL.statusText : 'Excluded from denominator';

  return `# Glintbase Agent Readiness Report (ARS 3.0)

> Autonomous evaluation of machine-readiness, discovery manifests, Streamable HTTP MCP services, and autonomous LLM tool execution for **\`${target}\`**.

---

## 1. Executive Summary & Scorecard

| Metric | Specification |
| :--- | :--- |
| **Target** | \`${target}\` |
| **ARS Standard** | \`ARS 3.0 (${scorecard.spec.toUpperCase()})\` (${scorecard.results.length} Automated Protocol Checks) |
| **Overall Score** | **\`${scorecard.score} / 100\`** (Grade ${scorecard.grade} · ${scorecard.gradeLabel}) |
| **Health Meter** | \`${healthMeter} ${scorecard.score}%\` |
| **Archetype** | \`${scorecard.archetype.label}\` |
| **Active Denominator** | \`${scorecard.activeDenominator} pts\` (Dynamic Archetype Scaling) |
| **Base / Bonus Earned** | \`${scorecard.baseEarned} base pts\` + \`${scorecard.bonusEarned} bonus pts\` = \`${scorecard.totalEarned} total pts\` |
| **Active Intelligence** | \`${intelligence}\` |
| **Audit Duration** | \`${durationText}\` |
| **Report Generated** | \`${timestamp}\` |

---

## 2. Layer-by-Layer Health Breakdown

| Layer | Score Earned | Max Base | Compliance | Status | Operational Focus |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Layer 1: Discovery** | ${dL.baseEarned} pts | ${dL.baseMax} pts | ${dPct} | ${dL.statusText} | ARD manifests, robots.txt, agent rules |
| **Layer 2: Access & Understanding** | ${aL.baseEarned} pts | ${aL.baseMax} pts | ${aPct} | ${aL.statusText} | Zero-JS readability, Anti-SPA canary 404s, code fences |
| **Layer 3: Usability & Interoperability** | ${uScore} | ${uMax} | ${uPct} | ${uStat} | Streamable HTTP MCP, tool safety hints, OAuth metadata |
| **Layer 4: Payments & Commerce** | ${pScore} | ${pMax} | ${pPct} | ${pStat} | UCP/ACP manifests, checkout idempotency |
${aiSection}

---

## 4. Evaluated Protocol Probes & Findings

### ❌ Critical Protocol Failures
${failedTable}

### 🌟 Earned Bonus Capabilities
${bonusTable}

### ⚠️ Warnings & Protocol Opportunities
${warnTable}

---

## 5. Actionable Remediations & Code Patches

${remediationsBlock}

---

### Verification & CI Integration
Run autonomous remediation locally:
\`\`\`bash
glintbase fix
\`\`\`

Enforce quality gate in GitHub Actions:
\`\`\`bash
glintbase ci ${target} --fail-under ${Math.min(80, scorecard.score)}
\`\`\`

*Report generated autonomously by [Glintbase Agent Harness](https://github.com/glintbase/cli)*
`;
}
