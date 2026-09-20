/**
 * Glintbase MCP Tool Suite (ARS 3.0)
 *
 * 17 Composable, Production-Grade MCP Tools:
 * 1.  glintbase_audit                 Full ARS 3.0 audit (AST + live probes, dynamic denominator)
 * 2.  glintbase_get_score             Ultra-compact score card (<200 tokens)
 * 3.  glintbase_discover_surfaces     Machine entrypoint detection matrix
 * 4.  glintbase_simulate_flight       Multi-agent flight simulator (Claude Code, Cursor, Perplexity, Swarm)
 * 5.  glintbase_counterfactual_proof  Side-by-side delta before/after living artifacts
 * 6.  glintbase_calculate_token_tax   Prompt bloat & context window burn calculator
 * 7.  glintbase_check_schema_friction OpenAPI/MCP parameter hallucination risk index
 * 8.  glintbase_generate_artifact     Living artifact synthesizer with in-memory ArsSandbox check
 * 9.  glintbase_sandbox_validate      In-memory AST sandbox evaluation
 * 10. glintbase_inspect_webmcp        Client-side WebMCP window.modelContext & DOM inspector
 * 11. glintbase_ci_gate               Zero-drift CI quality gate with PR markdown comments
 * 12. glintbase_get_skill             Retrieve full markdown skill playbook
 * 13. glintbase_install_skill         Scaffold .agents/skills/<name>/SKILL.md directly to workspace
 * 14. glintbase_audit_canaries        Detect soft-200 SPA leaks & anti-hallucination barriers
 * 15. glintbase_verify_agent_auth     Validate WorkOS auth.md & RFC 9728 machine credentials
 * 16. glintbase_audit_mutation_safety Audit Idempotency-Key locks & mutation hints on POST/PUT/DELETE
 * 17. glintbase_compliance_report     Executive Board-Ready OWASP LLM Top 10 & ISO 42001 assessment
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { runCodebaseArs3Audit } from '../../core/codebaseAudit.js';
import { runArs3Probes } from '../../core/probes/index.js';
import { resolveAuditTarget } from '../../core/urlPolicy.js';
import { inspectWorkspaceGaps } from '../../session/agentBrain.js';
import { scanRoutes } from '../../ast/routeScanner.js';
import {
  generateRobotsTxt,
  generateAuthMd,
  generateArdJson,
  generateMcpRoute,
  generateNotFoundRoute,
  generateMiddleware,
} from '../../ast/generators.js';
import { getWebMcpComponentTemplate } from '../../ast/injector.js';
import { generateLlmsTxt, generateLlmsFullTxt, indexDocumentation } from '../../ast/docIndexer.js';
import { ArsSandbox } from '../../core/sandbox.js';
import {
  runSimulation,
  generateJourneyTreeSvg,
  svgToBase64,
  buildReplayUrl,
  generateClaudeArtifactCode,
} from '../../simulator/index.js';
import { analyzeTokenTax, estimateTokenCount } from '../../simulator/telemetry/tokenTax.js';
import { evaluateSchemaFriction } from '../../simulator/telemetry/schemaFriction.js';
import { inspectGitDrift, formatGitHubStepSummary } from '../../commands/ci.js';
import { BUNDLED_SKILLS, installSkillToDisk } from '../skills/index.js';
import { auditCanaryRoutes } from '../../core/security/canaryAuditor.js';
import { verifyAgentAuth } from '../../core/security/authVerifier.js';
import { auditMutationSafety } from '../../core/security/mutationAuditor.js';
import { generateComplianceReport } from '../../core/security/complianceReporter.js';

export function registerAllTools(server: McpServer): void {
  // ── 1. glintbase_audit ──────────────────────────────────────────────────────────
  server.tool(
    'glintbase_audit',
    `Execute comprehensive ARS 3.0 agent-readiness audit across 6 pillars (Discovery, Access, Usability, Semantic, Architecture, Safety). Accepts a local directory or remote URL. Returns letter grade (A+ to F), total score (0-100), dynamic denominator breakdown, and top blockers with actionable remediation recipes. Set verbose=true for all 119 individual check results.`,
    {
      target: z.string().optional().describe('Target codebase directory (e.g. ".") or URL (e.g. "https://docs.example.com")'),
      failUnder: z.number().optional().describe('Optional threshold (0-100) to check against'),
      verbose: z.boolean().optional().describe('Include exhaustive list of all 119 check results (default: false)'),
    },
    async ({ target = '.', failUnder, verbose = false }) => {
      try {
        const targetInfo = resolveAuditTarget(target);
        const effectiveTarget = targetInfo.isUrl ? (targetInfo.normalizedUrl || targetInfo.target) : targetInfo.target;
        const scorecard = targetInfo.isUrl
          ? await runArs3Probes(effectiveTarget)
          : await runCodebaseArs3Audit(effectiveTarget);

        const blockers = (scorecard.results || [])
          .filter(c => c.status === 'fail' || c.status === 'warn')
          .slice(0, 5)
          .map(c => ({
            checkId: c.checkId,
            name: c.name || c.checkId,
            status: c.status,
            earnedPoints: c.earnedPoints,
            maxPoints: c.maxPoints,
            message: c.message,
            fixHint: c.remediation?.fixCommand || null,
          }));

        const passesGate = failUnder !== undefined ? scorecard.score >= failUnder : undefined;

        const layerSummaries = Object.values(scorecard.layers).map(l => ({
          layer: l.layer,
          name: l.name,
          score: `${l.totalEarned}/${l.baseMax}`,
          status: l.statusText,
        }));

        const summary = {
          target: effectiveTarget,
          archetype: scorecard.archetype.label,
          grade: scorecard.grade,
          score: scorecard.score,
          baseDenominator: scorecard.baseDenominator,
          activeDenominator: scorecard.activeDenominator,
          totalEarned: scorecard.totalEarned,
          passesGate,
          layers: layerSummaries,
          topBlockers: blockers,
          ...(verbose ? { allChecks: scorecard.results } : {}),
        };

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 2. glintbase_get_score ──────────────────────────────────────────────────────
  server.tool(
    'glintbase_get_score',
    `Fetch an ultra-compact ARS 3.0 score card (<200 tokens). Ideal for quick checks and CI status monitoring without burning agent context window.`,
    {
      target: z.string().optional().describe('Target codebase directory or URL (default: ".")'),
      failUnder: z.number().optional().describe('Optional quality gate threshold (e.g. 75)'),
    },
    async ({ target = '.', failUnder = 75 }) => {
      try {
        const targetInfo = resolveAuditTarget(target);
        const effectiveTarget = targetInfo.isUrl ? (targetInfo.normalizedUrl || targetInfo.target) : targetInfo.target;
        const scorecard = targetInfo.isUrl
          ? await runArs3Probes(effectiveTarget)
          : await runCodebaseArs3Audit(effectiveTarget);

        const result = {
          target: effectiveTarget,
          score: scorecard.score,
          grade: scorecard.grade,
          archetype: scorecard.archetype.label,
          passesGate: scorecard.score >= failUnder,
          layers: Object.fromEntries(
            Object.values(scorecard.layers).map(l => [l.layer, `${l.totalEarned}/${l.baseMax}`])
          ),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 3. glintbase_discover_surfaces ──────────────────────────────────────────────
  server.tool(
    'glintbase_discover_surfaces',
    `Discover all machine-readable entrypoints in a codebase or API ecosystem: robots.txt, llms.txt, llms-full.txt, .well-known/ard.json, auth.md, mcp.json, streamable /api/mcp route, WebMCP provider, and OpenAPI specs.`,
    {
      target: z.string().optional().describe('Target codebase directory (default: ".")'),
    },
    async ({ target = '.' }) => {
      try {
        const targetDir = resolve(process.cwd(), target);
        const gaps = inspectWorkspaceGaps(targetDir);
        const routes = scanRoutes(targetDir, gaps.profile);

        const hasMcpRoute = gaps.hasMcp
          || existsSync(join(targetDir, 'app', 'api', 'mcp', 'route.ts'))
          || existsSync(join(targetDir, 'src', 'app', 'api', 'mcp', 'route.ts'))
          || existsSync(join(targetDir, 'routes', 'mcp.ts'));

        const hasWebMcp = existsSync(join(targetDir, 'src', 'components', 'WebMcpProvider.tsx'))
          || existsSync(join(targetDir, 'components', 'WebMcpProvider.tsx'));

        const hasOpenApi = existsSync(join(targetDir, 'openapi.json'))
          || existsSync(join(targetDir, 'public', 'openapi.json'));

        const surfaces = [
          { type: 'robots_txt', found: gaps.hasRobots, path: 'public/robots.txt' },
          { type: 'llms_txt', found: gaps.hasLlms, path: 'public/llms.txt' },
          { type: 'auth_md', found: gaps.hasAuth, path: 'public/auth.md' },
          { type: 'ard_json', found: gaps.hasArd, path: '.well-known/ard.json' },
          { type: 'mcp_route', found: hasMcpRoute, path: 'app/api/mcp/route.ts' },
          { type: 'webmcp', found: hasWebMcp, path: 'components/WebMcpProvider.tsx' },
          { type: 'openapi', found: hasOpenApi, path: 'openapi.json' },
        ];

        const result = {
          target: targetDir,
          framework: gaps.profile.name,
          routesDiscovered: routes.length,
          documentationFiles: gaps.docsCount,
          totalSurfaces: surfaces.length,
          foundCount: surfaces.filter(s => s.found).length,
          missingCount: surfaces.filter(s => !s.found).length,
          surfaces,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 4. glintbase_simulate_flight ────────────────────────────────────────────────
  server.tool(
    'glintbase_simulate_flight',
    `Run the Glintbase Agent Flight Simulator across synthetic coding personas (claude-code, cursor, perplexity). Simulates how autonomous agents navigate your docs/APIs, evaluates breadcrumb traces, detects soft-404 traps, and calculates the hallucination risk score.`,
    {
      target: z.string().optional().describe('Target codebase directory or URL (default: ".")'),
      persona: z.enum(['claude-code', 'cursor', 'perplexity']).optional().describe('Agent persona to simulate (default: claude-code)'),
      intent: z.string().optional().describe('Developer intent to attempt (e.g. "Authenticate and call payment endpoint")'),
      mode: z.enum(['deterministic', 'live']).optional().describe('Simulation mode: deterministic | live (default: deterministic)'),
      verbose: z.boolean().optional().describe('Include full step-by-step breadcrumb logs'),
    },
    async ({ target = '.', persona = 'claude-code', intent, mode = 'deterministic', verbose = false }) => {
      try {
        const targetInfo = resolveAuditTarget(target);
        const effectiveTarget = targetInfo.isUrl ? (targetInfo.normalizedUrl || targetInfo.target) : targetInfo.target;
        const simResult = await runSimulation({
          target: effectiveTarget,
          agent: persona as any,
          intent,
          mode: mode as any,
        });

        const tel = simResult.telemetry;
        const replayUrl = buildReplayUrl(effectiveTarget, tel, simResult.persona.name);
        const svg = generateJourneyTreeSvg(tel, simResult.persona.name, effectiveTarget, replayUrl);
        const svgBase64 = svgToBase64(svg);
        const artifactCode = generateClaudeArtifactCode(svg, tel, simResult.persona.name, effectiveTarget, replayUrl);

        const result = {
          persona: simResult.persona.name,
          intent: intent || 'Autonomous API exploration & authentication',
          outcome: tel.outcome,
          success: tel.outcome === 'completed',
          totalHops: tel.steps.length,
          totalTokensBurned: tel.totalTokensBurned,
          schemaFrictionScore: tel.schemaFrictionScore,
          hallucinationRisk: tel.schemaFrictionScore > 50 ? 'HIGH' : tel.schemaFrictionScore > 25 ? 'MEDIUM' : 'LOW',
          failureBottleneck: tel.failureBottleneck || null,
          failureMode: tel.failureMode || null,
          failureDetails: tel.failureDetails || null,
          suggestedRemediation: tel.suggestedRemediation || null,
          replayUrl,
          stepsSummary: tel.steps.map(s => `[${s.action}] ${s.details} (${s.status})`),
          ...(verbose ? { detailedSteps: tel.steps } : {}),
        };

        const markdownVisual = `### 🕹️ Glintbase Visual Flight Simulator (${simResult.persona.name})
**Target**: \`${effectiveTarget}\` | **Outcome**: **${tel.outcome.toUpperCase()}** | **Tokens**: ${tel.totalTokensBurned.toLocaleString()} | **Friction**: ${tel.schemaFrictionScore}/100

[🕹️ Open Full Interactive Cockpit Replay](${replayUrl})

<details>
<summary><b>View Visual Journey Tree Diagram (SVG / Artifact)</b></summary>

${artifactCode}

</details>`;

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
            { type: 'image' as const, data: svgBase64, mimeType: 'image/svg+xml' },
            { type: 'text' as const, text: markdownVisual },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 5. glintbase_counterfactual_proof ───────────────────────────────────────────
  server.tool(
    'glintbase_counterfactual_proof',
    `Generate an empirical before-and-after proof card. Compares baseline agent performance against simulated performance with Glintbase living artifacts installed, proving token savings and failure rate reduction.`,
    {
      target: z.string().optional().describe('Target codebase directory (default: ".")'),
      persona: z.enum(['claude-code', 'cursor', 'perplexity']).optional().describe('Agent persona to simulate'),
    },
    async ({ target = '.', persona = 'claude-code' }) => {
      try {
        const targetDir = resolve(process.cwd(), target);
        const simResult = await runSimulation({
          target: targetDir,
          agent: persona as any,
          mode: 'deterministic',
        });

        const cf = simResult.counterfactual;
        if (!cf) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'already_optimal',
                message: 'This workspace already achieves full agent readiness without friction traps.',
                telemetry: simResult.telemetry,
              }, null, 2),
            }],
          };
        }

        const proof = {
          persona: simResult.persona.name,
          before: {
            outcome: cf.before.outcome,
            totalTokensBurned: cf.before.totalTokensBurned,
            failureBottleneck: cf.before.failureBottleneck || 'None',
          },
          after: {
            outcome: cf.after.outcome,
            totalTokensBurned: cf.after.totalTokensBurned,
            failureBottleneck: cf.after.failureBottleneck || 'None',
          },
          deltas: {
            tokensSavedPercent: `${cf.tokensSavedPercent}%`,
            latencySavedPercent: `${cf.latencySavedPercent}%`,
            fixedBottlenecks: cf.fixedBottlenecks,
            resolved: cf.resolved,
          },
          verdict: cf.tokensSavedPercent > 30
            ? 'PROVEN: Adding living artifacts reduces agent context window burn significantly.'
            : 'MODERATE: Modest token reduction achieved.',
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(proof, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 6. glintbase_calculate_token_tax ───────────────────────────────────────────
  server.tool(
    'glintbase_calculate_token_tax',
    `Calculate the Token Tax and Prompt Bloat multiplier for documentation and API endpoints. Quantifies how many unnecessary tokens external coding agents burn on unoptimized HTML/schemas vs concise living artifacts.`,
    {
      target: z.string().optional().describe('Target codebase directory (default: ".")'),
    },
    async ({ target = '.' }) => {
      try {
        const targetDir = resolve(process.cwd(), target);
        const gaps = inspectWorkspaceGaps(targetDir);
        const docs = indexDocumentation(targetDir);

        const docTexts = docs.docs.map(d => d.content).join('\n\n');
        const sampleText = docTexts || `Total documentation pages: ${gaps.docsCount}, routes: ${gaps.routesCount}.`;
        const analysis = analyzeTokenTax(sampleText);
        const cleanTokens = estimateTokenCount(sampleText.replace(/<[^>]*>/g, '').replace(/\n{3,}/g, '\n\n'));
        const bloatRatio = cleanTokens > 0 ? Number((analysis.tokens / cleanTokens).toFixed(2)) : 1.0;

        const result = {
          target: targetDir,
          promptBloatMultiplier: `${bloatRatio}x`,
          rawDocumentTokens: analysis.tokens,
          cleanArtifactTokens: cleanTokens,
          wastedTokensPerCall: Math.max(0, analysis.tokens - cleanTokens),
          dollarTaxUsd: analysis.dollarTaxUsd,
          estimatedCostPer1kRuns: `$${(analysis.dollarTaxUsd * 1000).toFixed(2)}`,
          assessment: bloatRatio > 2.0
            ? 'HIGH TOKEN TAX: Agents burn substantial context on repetitive boilerplate.'
            : 'EFFICIENT: Token overhead is well controlled.',
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 7. glintbase_check_schema_friction ─────────────────────────────────────────
  server.tool(
    'glintbase_check_schema_friction',
    `Analyze OpenAPI specs or MCP tool schemas for schema friction points that trigger LLM hallucinations (missing descriptions, untyped "any", missing required arrays, ambiguous parameter names).`,
    {
      target: z.string().optional().describe('Target codebase directory (default: ".")'),
    },
    async ({ target = '.' }) => {
      try {
        const targetDir = resolve(process.cwd(), target);
        const gaps = inspectWorkspaceGaps(targetDir);
        const routes = scanRoutes(targetDir, gaps.profile);

        const mockProperties: Record<string, any> = {};
        for (const r of routes) {
          for (const p of r.parameters || []) {
            mockProperties[p.name] = {
              type: p.type || 'string',
              description: (p as any).description || '',
            };
          }
        }

        const schema = {
          type: 'object',
          properties: mockProperties,
          required: routes.flatMap(r => (r.parameters || []).filter(p => p.required).map(p => p.name)),
        };

        const friction = evaluateSchemaFriction(schema);

        const result = {
          target: targetDir,
          schemaFrictionScore: friction.score,
          rating: friction.rating,
          totalPropertiesAnalyzed: friction.analyzedPropertiesCount,
          issues: friction.issues,
          bottlenecks: friction.bottlenecks,
          hallucinationRisk: friction.score > 40 ? 'HIGH' : friction.score > 15 ? 'MEDIUM' : 'LOW',
          recommendation: friction.score > 0
            ? 'Add explicit parameter descriptions and strict required arrays to prevent agent hallucinations.'
            : 'Schema is strictly typed and agent-safe.',
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 8. glintbase_generate_artifact ─────────────────────────────────────────────
  server.tool(
    'glintbase_generate_artifact',
    `Synthesize a production-ready living agent artifact (robots, llms, llms-full, auth, mcp, webmcp, ard, not-found, middleware). Validates the generated code in-memory with ArsSandbox before returning. Set writeToDisk=true to automatically write to standard project paths (e.g. public/llms.txt, app/api/mcp/route.ts, app/not-found.tsx).`,
    {
      spec: z.enum(['robots', 'llms', 'llms-full', 'auth', 'mcp', 'webmcp', 'ard', 'not-found', 'middleware']).describe('Artifact to generate'),
      framework: z.enum(['next-app-router', 'next-pages', 'express', 'vite', 'generic']).optional().describe('Target framework (auto-detected if omitted)'),
      writeToDisk: z.boolean().optional().describe('If true, writes the generated artifact to disk (default: false)'),
      targetDir: z.string().optional().describe('Target codebase directory (default: ".")'),
    },
    async ({ spec, framework, writeToDisk = false, targetDir = '.' }) => {
      try {
        const root = resolve(process.cwd(), targetDir);
        const gaps = inspectWorkspaceGaps(root);
        const activeFramework = framework || gaps.profile.name;
        const routes = scanRoutes(root, gaps.profile);
        const docs = indexDocumentation(root);

        let content = '';
        let targetPath = '';

        switch (spec) {
          case 'robots':
            content = generateRobotsTxt();
            targetPath = join(gaps.profile.publicDir, 'robots.txt');
            break;
          case 'llms':
            content = generateLlmsTxt(docs);
            targetPath = join(gaps.profile.publicDir, 'llms.txt');
            break;
          case 'llms-full':
            content = generateLlmsFullTxt(docs);
            targetPath = join(gaps.profile.publicDir, 'llms-full.txt');
            break;
          case 'auth':
            content = generateAuthMd({ projectName: gaps.profile.name, routes });
            targetPath = join(gaps.profile.publicDir, 'auth.md');
            break;
          case 'mcp':
            content = generateMcpRoute(routes, activeFramework as any);
            targetPath = activeFramework.startsWith('next') ? 'app/api/mcp/route.ts' : 'routes/mcp.ts';
            break;
          case 'webmcp':
            content = getWebMcpComponentTemplate(true);
            targetPath = 'components/WebMcpProvider.tsx';
            break;
          case 'ard':
            content = generateArdJson({ name: gaps.profile.name, hasMcp: gaps.hasMcp, hasAuth: gaps.hasAuth });
            targetPath = '.well-known/ard.json';
            break;
          case 'not-found':
            content = generateNotFoundRoute(activeFramework as any);
            targetPath = activeFramework.startsWith('next') ? 'app/not-found.tsx' : 'routes/not-found.ts';
            break;
          case 'middleware':
            content = generateMiddleware();
            targetPath = 'middleware.ts';
            break;
        }

        // Validate in-memory with ArsSandbox
        const sandbox = new ArsSandbox();
        const verification = sandbox.verifyArtifact({
          targetPath,
          content,
          action: 'create',
          rationale: `Synthesized ${spec} artifact`,
          pointsImpact: 10,
          layer: 'usability',
        });

        let written = false;
        let finalPath = join(root, targetPath);

        if (writeToDisk) {
          const dir = dirname(finalPath);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(finalPath, content, 'utf-8');
          written = true;
        }

        const result = {
          spec,
          framework: activeFramework,
          targetPath,
          writtenToDisk: written,
          sandboxVerification: {
            valid: verification.errors.length === 0,
            diagnostics: verification.diagnostics,
            errors: verification.errors,
          },
          contentLength: content.length,
          preview: content.slice(0, 600) + (content.length > 600 ? '\n... [truncated]' : ''),
          fullContent: content,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 9. glintbase_sandbox_validate ──────────────────────────────────────────────
  server.tool(
    'glintbase_sandbox_validate',
    `Validate one or more prospective artifact files in an in-memory virtual filesystem against ARS 3.0 rules and simulated agent navigation before writing to disk.`,
    {
      files: z.array(
        z.object({
          path: z.string().describe('Virtual file destination (e.g. "public/llms.txt")'),
          content: z.string().describe('File content to validate'),
        })
      ).describe('Array of proposed files to validate'),
    },
    async ({ files }) => {
      try {
        const sandbox = new ArsSandbox();
        const verifications = files.map(f =>
          sandbox.verifyArtifact({
            targetPath: f.path,
            content: f.content,
            action: 'create',
            rationale: 'In-memory validation',
            pointsImpact: 10,
            layer: 'usability',
          })
        );

        const allValid = verifications.every(v => v.errors.length === 0);
        const result = {
          totalFilesChecked: files.length,
          allValid,
          results: verifications.map((v, i) => ({
            path: files[i].path,
            valid: v.errors.length === 0,
            diagnostics: v.diagnostics,
            errors: v.errors,
          })),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 10. glintbase_inspect_webmcp ───────────────────────────────────────────────
  server.tool(
    'glintbase_inspect_webmcp',
    `Inspect client-side WebMCP DOM registrations (window.modelContext / document.modelContext), dynamic tools, and HTML form tool annotations for in-browser agent interoperability.`,
    {
      target: z.string().optional().describe('Target codebase directory (default: ".")'),
    },
    async ({ target = '.' }) => {
      try {
        const root = resolve(process.cwd(), target);
        const candidatePaths = [
          join(root, 'src', 'components', 'WebMcpProvider.tsx'),
          join(root, 'components', 'WebMcpProvider.tsx'),
          join(root, 'src', 'app', 'layout.tsx'),
          join(root, 'app', 'layout.tsx'),
        ];

        let foundFile = '';
        let content = '';

        for (const p of candidatePaths) {
          if (existsSync(p)) {
            foundFile = p;
            content = readFileSync(p, 'utf-8');
            break;
          }
        }

        const hasModelContext = content.includes('window.modelContext') || content.includes('modelContext');
        const hasRegisterTool = content.includes('registerTool');
        const hasModelContextReady = content.includes('modelContextReady');

        const result = {
          target: root,
          providerFound: Boolean(foundFile),
          filePath: foundFile || null,
          checks: {
            hasModelContextRegistration: hasModelContext,
            hasDynamicRegisterToolApi: hasRegisterTool,
            dispatchesModelContextReadyEvent: hasModelContextReady,
          },
          status: (hasModelContext && hasRegisterTool) ? 'COMPLIANT' : 'MISSING_OR_INCOMPLETE',
          remediationHint: !foundFile
            ? 'Run glintbase_generate_artifact with spec="webmcp" to synthesize WebMcpProvider.tsx.'
            : null,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 11. glintbase_ci_gate ──────────────────────────────────────────────────────
  server.tool(
    'glintbase_ci_gate',
    `Run the Glintbase Enterprise CI quality gate. Evaluates --fail-under score threshold, checks for git drift against base branch, and returns a formatted GitHub PR markdown comment with pass/fail verdict.`,
    {
      threshold: z.number().optional().default(75).describe('Minimum ARS score required to pass (default: 75)'),
      baseRef: z.string().optional().default('origin/main').describe('Base git branch to evaluate drift against'),
      target: z.string().optional().describe('Target codebase directory (default: ".")'),
    },
    async ({ threshold = 75, baseRef = 'origin/main', target = '.' }) => {
      try {
        const root = resolve(process.cwd(), target);
        const scorecard = await runCodebaseArs3Audit(root);
        const drift = inspectGitDrift(baseRef, root);
        const passed = scorecard.score >= threshold && !drift.driftDetected;

        const prComment = formatGitHubStepSummary(
          scorecard,
          threshold,
          passed,
          root,
          drift.reasons,
          []
        );

        const result = {
          passed,
          score: scorecard.score,
          threshold,
          grade: scorecard.grade,
          archetype: scorecard.archetype.label,
          driftDetected: drift.driftDetected,
          driftReasons: drift.reasons,
          prCommentMarkdown: prComment,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 12. glintbase_get_skill ────────────────────────────────────────────────────
  server.tool(
    'glintbase_get_skill',
    `Fetch full step-by-step markdown guidelines for any of the 8 bundled Glintbase skills: glintbase-agent-readiness, living-artifacts-architect, agent-auth-handbook, streamable-mcp-builder, webmcp-browser-integration, token-tax-and-schema-optimizer, flight-simulator-replay, zero-drift-ci-gate.`,
    {
      skillName: z.string().describe('Skill identifier (e.g. "glintbase-agent-readiness" or "agent-auth-handbook")'),
    },
    async ({ skillName }) => {
      const skill = BUNDLED_SKILLS[skillName];
      if (!skill) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Unknown skill: "${skillName}". Available skills: ${Object.keys(BUNDLED_SKILLS).join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: skill.content,
          },
        ],
      };
    }
  );

  // ── 13. glintbase_install_skill ────────────────────────────────────────────────
  server.tool(
    'glintbase_install_skill',
    `Scaffold a physical SKILL.md bundle directly into your repository (defaults to .agents/skills/<skill-name>/SKILL.md). Makes the skill immediately discoverable by Cursor, Claude Code, Windsurf, or Antigravity agents.`,
    {
      skillName: z.string().describe('Name of the skill to install'),
      targetDir: z.string().optional().default('.agents/skills').describe('Base directory to install the skill into (default: .agents/skills)'),
    },
    async ({ skillName, targetDir = '.agents/skills' }) => {
      try {
        const installResult = installSkillToDisk(skillName, targetDir);
        const result = {
          installed: true,
          skillName,
          title: installResult.skill.title,
          filePath: installResult.path,
          message: `Installed "${installResult.skill.title}" to ${installResult.path}. Your coding agent can now load this skill automatically!`,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 14. glintbase_audit_canaries ───────────────────────────────────────────────
  server.tool(
    'glintbase_audit_canaries',
    `Audit a codebase or live URL for soft-200 SPA leaks that cause autonomous AI agents to hallucinate fake endpoints. Probes non-existent routes and inspects AST for dedicated 404 boundaries (app/not-found.tsx, pages/404.tsx).`,
    {
      target: z.string().optional().describe('Target codebase directory or URL (default: ".")'),
    },
    async ({ target = '.' }) => {
      try {
        const result = await auditCanaryRoutes(target);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 15. glintbase_verify_agent_auth ────────────────────────────────────────────
  server.tool(
    'glintbase_verify_agent_auth',
    `Validate autonomous agent authentication readiness conforming to WorkOS auth.md and RFC 9728 specifications. Verifies machine credential exchange, Bearer token protocols, rate-limit headers, and session revocation endpoints.`,
    {
      target: z.string().optional().describe('Target codebase directory or URL (default: ".")'),
    },
    async ({ target = '.' }) => {
      try {
        const result = await verifyAgentAuth(target);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 16. glintbase_audit_mutation_safety ────────────────────────────────────────
  server.tool(
    'glintbase_audit_mutation_safety',
    `Audit state-changing API endpoints (POST/PUT/DELETE/PATCH) for Idempotency-Key locks, critical financial risks, and MCP mutation safety annotations (destructiveHint, readOnlyHint). Prevents duplicate agent transactions during retry loops.`,
    {
      target: z.string().optional().describe('Target codebase directory (default: ".")'),
    },
    async ({ target = '.' }) => {
      try {
        const result = auditMutationSafety(target);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );

  // ── 17. glintbase_compliance_report ────────────────────────────────────────────
  server.tool(
    'glintbase_compliance_report',
    `Generate an executive Board-Ready Zero-Trust AI Agent Compliance Assessment mapped to OWASP Top 10 for LLMs/Agents (LLM01, LLM07, LLM08) and ISO/IEC 42001 AI Management System (Clauses A.6.2, A.8.4, A.9.1).`,
    {
      target: z.string().optional().describe('Target codebase directory (default: ".")'),
    },
    async ({ target = '.' }) => {
      try {
        const result = await generateComplianceReport(target);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message }) }],
          isError: true,
        };
      }
    }
  );
}
