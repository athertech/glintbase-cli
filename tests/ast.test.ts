import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  detectFramework,
  scanRoutes,
  indexDocumentation,
  generateLlmsTxt,
  generateLlmsFullTxt,
  injectWebMcpProvider,
  restoreBackup,
  generateMcpRoute,
  generateAuthMd,
  generateRobotsTxt,
  generateArdJson,
  generateOpenApiSpec,
  generateNotFoundRoute,
  generateMiddleware,
  generateAiCatalogJson,
} from '../src/ast/index.js';
import { AccessSubagent } from '../src/harness/subagents/access.js';

describe('Phase 4: AST Codebase Extractors & Living Artifacts', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'glintbase-ast-test-'));
  });

  afterEach(() => {
    try {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      /* ignore */
    }
  });

  describe('Framework Detection', () => {
    it('detects Next.js App Router project', () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { next: '14.2.0', react: '18.2.0' } })
      );
      mkdirSync(join(testDir, 'app'), { recursive: true });
      writeFileSync(join(testDir, 'app', 'layout.tsx'), 'export default function Root() {}');

      const profile = detectFramework(testDir);
      expect(profile.framework).toBe('next-app-router');
      expect(profile.hasAppRouter).toBe(true);
      expect(profile.hasPagesRouter).toBe(false);
      expect(profile.layoutFile).toBeDefined();
    });

    it('detects Next.js Pages Router project', () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { next: '14.2.0', react: '18.2.0' } })
      );
      mkdirSync(join(testDir, 'pages', 'api'), { recursive: true });
      writeFileSync(join(testDir, 'pages', '_app.tsx'), 'export default function App() {}');

      const profile = detectFramework(testDir);
      expect(profile.framework).toBe('next-pages-router');
      expect(profile.hasPagesRouter).toBe(true);
      expect(profile.hasAppRouter).toBe(false);
    });

    it('detects Express project', () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { express: '^4.19.0' } })
      );

      const profile = detectFramework(testDir);
      expect(profile.framework).toBe('express');
      expect(profile.name).toBe('Express.js');
    });

    it('detects FastAPI project via main.py', () => {
      writeFileSync(
        join(testDir, 'main.py'),
        'from fastapi import FastAPI\napp = FastAPI()\n@app.get("/")\ndef root(): pass\n'
      );

      const profile = detectFramework(testDir);
      expect(profile.framework).toBe('fastapi');
      expect(profile.isTypeScript).toBe(false);
    });
  });

  describe('Route Scanner', () => {
    it('extracts exported HTTP methods and params from Next.js App Router', () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { next: '14.0.0' } })
      );
      const routeDir = join(testDir, 'app', 'api', 'products', '[id]');
      mkdirSync(routeDir, { recursive: true });

      const routeTs = `
/**
 * Retrieve product details by identifier
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return Response.json({ id: params.id });
}

export async function DELETE(req: Request) {
  return new Response(null, { status: 204 });
}
`;
      writeFileSync(join(routeDir, 'route.ts'), routeTs);

      const routes = scanRoutes(testDir);
      expect(routes.length).toBe(2);

      const getRoute = routes.find(r => r.method === 'GET');
      expect(getRoute).toBeDefined();
      expect(getRoute?.path).toBe('/api/products/[id]');
      expect(getRoute?.description).toContain('Retrieve product details');
      expect(getRoute?.parameters?.[0].name).toBe('id');
      expect(getRoute?.parameters?.[0].in).toBe('path');

      const delRoute = routes.find(r => r.method === 'DELETE');
      expect(delRoute).toBeDefined();
      expect(delRoute?.path).toBe('/api/products/[id]');
    });

    it('extracts routes from Express call expressions', () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { express: '4.18.0' } })
      );
      mkdirSync(join(testDir, 'routes'), { recursive: true });

      const expressCode = `
import { Router } from 'express';
const router = Router();

// Get list of all users
router.get('/users', (req, res) => res.json([]));
router.post('/users', (req, res) => res.status(201).json({}));

export default router;
`;
      writeFileSync(join(testDir, 'routes', 'users.ts'), expressCode);

      const routes = scanRoutes(testDir);
      expect(routes.length).toBe(2);
      expect(routes.some(r => r.path === '/users' && r.method === 'GET')).toBe(true);
      expect(routes.some(r => r.path === '/users' && r.method === 'POST')).toBe(true);
    });

    it('extracts routes from Python FastAPI file', () => {
      const pyCode = `
from fastapi import FastAPI
app = FastAPI()

@app.get("/items/{item_id}")
def read_item(item_id: int):
    return {"item_id": item_id}

@app.post("/items")
def create_item():
    return {}
`;
      writeFileSync(join(testDir, 'main.py'), pyCode);

      const routes = scanRoutes(testDir);
      expect(routes.length).toBe(2);
      expect(routes.some(r => r.path === '/items/{item_id}' && r.method === 'GET')).toBe(true);
      expect(routes.some(r => r.path === '/items' && r.method === 'POST')).toBe(true);
    });
  });

  describe('Documentation Indexer', () => {
    it('indexes markdown docs with frontmatter and headings', () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: 'my-agent-api', description: 'Comprehensive API platform' })
      );
      mkdirSync(join(testDir, 'docs', 'guides'), { recursive: true });

      const doc1 = `---
title: Quickstart Tutorial
description: Learn how to set up your environment in under 5 minutes.
---

# Quickstart Tutorial

Follow these steps to initialize the SDK and start building.

## Prerequisites

Node.js >= 20.
`;

      const doc2 = `# Authentication

Learn how Bearer tokens and API keys work across all endpoints.

## Bearer Token

Include Authorization header.
`;

      writeFileSync(join(testDir, 'docs', 'guides', 'quickstart.md'), doc1);
      writeFileSync(join(testDir, 'docs', 'auth.md'), doc2);

      const result = indexDocumentation(testDir);
      expect(result.projectTitle).toBe('my-agent-api');
      expect(result.docs.length).toBe(2);

      const qsDoc = result.docs.find(d => d.title === 'Quickstart Tutorial');
      expect(qsDoc).toBeDefined();
      expect(qsDoc?.description).toBe('Learn how to set up your environment in under 5 minutes.');
      expect(qsDoc?.urlPath).toBe('/docs/guides/quickstart');
      expect(qsDoc?.estimatedTokens).toBeGreaterThan(10);

      // Verify llms.txt generation
      const llmsTxt = generateLlmsTxt(result, 'https://example.com');
      expect(llmsTxt).toContain('# my-agent-api');
      expect(llmsTxt).toContain('> Comprehensive API platform');
      expect(llmsTxt).toContain('[Quickstart Tutorial](https://example.com/docs/guides/quickstart)');
      expect(llmsTxt).toContain('## Optional');
      expect(llmsTxt).toContain('[Full Documentation](https://example.com/llms-full.txt)');

      // Verify llms-full.txt generation
      const fullTxt = generateLlmsFullTxt(result, 'https://example.com');
      expect(fullTxt).toContain('# my-agent-api — Complete Documentation');
      expect(fullTxt).toContain('## Document: Quickstart Tutorial');
      expect(fullTxt).toContain('Node.js >= 20.');
    });
  });

  describe('Safe WebMCP AST Injector', () => {
    it('injects WebMcpProvider and creates .bak backup safely', () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { next: '14.0.0', react: '18.0.0' } })
      );
      mkdirSync(join(testDir, 'app'), { recursive: true });

      const originalLayout = `import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
`;
      const layoutPath = join(testDir, 'app', 'layout.tsx');
      writeFileSync(layoutPath, originalLayout);

      const injection = injectWebMcpProvider(testDir);
      expect(injection.success).toBe(true);
      expect(injection.backupPath).toBeDefined();
      expect(existsSync(injection.backupPath!)).toBe(true);
      expect(existsSync(injection.componentPath!)).toBe(true);

      // Verify layout file was updated
      const modifiedLayout = readFileSync(layoutPath, 'utf-8');
      expect(modifiedLayout).toContain('import { WebMcpProvider }');
      expect(modifiedLayout).toContain('<WebMcpProvider>{children}</WebMcpProvider>');

      // Verify backup restoration
      const restored = restoreBackup(layoutPath);
      expect(restored).toBe(true);
      expect(existsSync(injection.backupPath!)).toBe(false);
      expect(readFileSync(layoutPath, 'utf-8')).toBe(originalLayout);
    });

    it('skips injection if WebMcpProvider is already present', () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ dependencies: { next: '14.0.0' } })
      );
      mkdirSync(join(testDir, 'app'), { recursive: true });

      const layoutWithProvider = `import { WebMcpProvider } from '../components/WebMcpProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <WebMcpProvider>{children}</WebMcpProvider>
      </body>
    </html>
  );
}
`;
      const layoutPath = join(testDir, 'app', 'layout.tsx');
      writeFileSync(layoutPath, layoutWithProvider);

      const injection = injectWebMcpProvider(testDir);
      expect(injection.success).toBe(true);
      expect(injection.diff).toContain('already integrated');
    });
  });

  describe('Living Artifact Generators', () => {
    it('generates streamable HTTP MCP server route with discovered routes', () => {
      const routes = [
        {
          path: '/api/v1/users',
          method: 'GET',
          file: 'app/api/v1/users/route.ts',
          description: 'Fetch all users',
          framework: 'next-app-router',
        },
      ];

      const mcpContent = generateMcpRoute(routes, 'next-app-router');
      expect(mcpContent).toContain('export async function GET');
      expect(mcpContent).toContain('export async function POST');
      expect(mcpContent).toContain('text/event-stream');
      expect(mcpContent).toContain('jsonrpc');
      expect(mcpContent).toContain('get_v1_users');
    });

    it('generates WorkOS-compliant auth.md with canonical 8 stages', () => {
      const authMd = generateAuthMd({
        projectName: 'Acme SaaS',
        baseUrl: 'https://acme.io',
      });
      expect(authMd).toContain('# Machine-Readable Authentication Guide');
      expect(authMd).toContain('WorkOS `auth.md` & RFC 9728');
      expect(authMd).toContain('## 1. Discover Endpoints');
      expect(authMd).toContain('## 2. Pick a Method');
      expect(authMd).toContain('## 3. Register Machine Client');
      expect(authMd).toContain('## 4. Token Claim Protocol');
      expect(authMd).toContain('## 5. Token Exchange Grant');
      expect(authMd).toContain('## 6. Use Bearer Token');
      expect(authMd).toContain('## 7. Auth Errors & Problem Details');
      expect(authMd).toContain('## 8. Token Revocation & Session Cleanup');
      expect(authMd).toContain('invalid_claim_token');
      expect(authMd).toContain('claimed_or_in_flight');
      expect(authMd).toContain('curl -X POST https://acme.io/api/auth/token');
    });

    it('generates compliant robots.txt with all AI crawler permissions and Content-Signals', () => {
      const robots = generateRobotsTxt();
      expect(robots).toContain('User-agent: ClaudeBot');
      expect(robots).toContain('User-agent: GPTBot');
      expect(robots).toContain('User-agent: PerplexityBot');
      expect(robots).toContain('User-agent: Google-Extended');
      expect(robots).toContain('User-agent: Anthropic-AI');
      expect(robots).toContain('User-agent: Cohere-AI');
      expect(robots).toContain('User-agent: Amazonbot');
      expect(robots).toContain('User-agent: Applebot-Extended');
      expect(robots).toContain('Content-Signals: search=yes, ai-train=no');
    });

    it('generates .well-known/ard.json manifest', () => {
      const ard = JSON.parse(generateArdJson({ name: 'Acme', baseUrl: 'https://acme.com' }));
      expect(ard.version).toBe('0.91');
      expect(ard.endpoints.documentation).toBe('https://acme.com/llms.txt');
      expect(ard.endpoints.mcp).toBe('https://acme.com/api/mcp');
      expect(ard.capabilities.mcp).toBe(true);
    });

    it('generates .well-known/ai-catalog.json adhering to Agent-Card WG standard', () => {
      const aiCatalog = JSON.parse(generateAiCatalogJson({ name: 'Acme', baseUrl: 'https://acme.com' }));
      expect(aiCatalog.$schema).toContain('agent-card.org');
      expect(aiCatalog.provider.name).toBe('Acme');
      expect(Array.isArray(aiCatalog.services)).toBe(true);
      expect(aiCatalog.services.some((s: any) => s.type === 'mcp')).toBe(true);
    });

    it('generates OpenAPI 3.1 specification from discovered routes', () => {
      const specStr = generateOpenApiSpec({
        title: 'Acme API',
        baseUrl: 'https://api.acme.com',
        routes: [
          {
            path: '/api/v1/orders',
            method: 'GET',
            file: 'app/api/v1/orders/route.ts',
            description: 'List orders',
            parameters: [{ name: 'limit', in: 'query', type: 'number', required: false }],
          },
          {
            path: '/api/v1/orders',
            method: 'POST',
            file: 'app/api/v1/orders/route.ts',
            description: 'Create order',
          },
        ],
      });

      const spec = JSON.parse(specStr);
      expect(spec.openapi).toBe('3.1.0');
      expect(spec.info.title).toBe('Acme API');
      expect(spec.paths['/api/v1/orders']).toBeDefined();
      expect(spec.paths['/api/v1/orders'].get).toBeDefined();
      expect(spec.paths['/api/v1/orders'].post).toBeDefined();
      expect(spec.paths['/api/v1/orders'].get.parameters[0].name).toBe('limit');
    });

    it('generates Anti-SPA 404 Route Handler for App Router and Pages Router', () => {
      const appRouter404 = generateNotFoundRoute('next-app-router');
      expect(appRouter404).toContain('export default function NotFound()');
      expect(appRouter404).toContain('404 - Not Found');

      const pagesRouter404 = generateNotFoundRoute('next-pages-router');
      expect(pagesRouter404).toContain('export default function Custom404()');
      expect(pagesRouter404).toContain('404 - Not Found');
    });

    it('generates Content Negotiation and Vary: Accept middleware', () => {
      const middlewareCode = generateMiddleware();
      expect(middlewareCode).toContain('export function middleware');
      expect(middlewareCode).toContain("response.headers.set('Vary', 'Accept')");
      expect(middlewareCode).toContain('text/markdown');
    });

    it('AccessSubagent proposes OpenAPI 3.1, Anti-SPA 404, and middleware artifacts', async () => {
      const agent = new AccessSubagent();
      const artifacts = await agent.generateArtifacts({
        cwd: testDir,
        projectName: 'Acme Cloud',
        projectDescription: 'API Platform',
        domainUrl: 'https://acme.io',
        framework: 'next-app-router',
        existingFiles: {},
      });

      expect(artifacts.length).toBe(3);
      expect(artifacts.some(a => a.targetPath.includes('openapi.json'))).toBe(true);
      expect(artifacts.some(a => a.targetPath.includes('not-found.tsx'))).toBe(true);
      expect(artifacts.some(a => a.targetPath.includes('middleware.ts'))).toBe(true);
      expect(artifacts.every(a => a.layer === 'access')).toBe(true);
    });
  });
});
