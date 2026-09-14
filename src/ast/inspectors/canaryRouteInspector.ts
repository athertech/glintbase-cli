/**
 * White-Box AST Inspector: Canary Route & 404 Handler Inspection
 * Specification: GLINTBASE_AUDIT_3_0_UPGRADE_SPEC.md (Section 4)
 *
 * Verifies that the codebase implements authentic HTTP 404 handlers
 * (e.g. app/not-found.tsx, pages/404.tsx) rather than catch-all redirects
 * returning soft 200 SPA shells.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface CanaryRouteInspectionResult {
  hasCustomNotFound: boolean;
  notFoundFile?: string;
  isAuthentic404: boolean;
  hasCatchAllSpaLeak: boolean;
}

export function inspectCanaryRoutes(rootDir: string): CanaryRouteInspectionResult {
  const notFoundCandidates = [
    join(rootDir, 'app', 'not-found.tsx'),
    join(rootDir, 'app', 'not-found.jsx'),
    join(rootDir, 'src', 'app', 'not-found.tsx'),
    join(rootDir, 'src', 'app', 'not-found.jsx'),
    join(rootDir, 'pages', '404.tsx'),
    join(rootDir, 'pages', '404.jsx'),
    join(rootDir, 'src', 'pages', '404.tsx'),
    join(rootDir, 'src', 'pages', '404.jsx'),
  ];

  let notFoundFile: string | undefined;
  for (const f of notFoundCandidates) {
    if (existsSync(f)) {
      notFoundFile = f;
      break;
    }
  }

  const hasCustomNotFound = Boolean(notFoundFile);

  // Check next.config.js / next.config.mjs / vercel.json for catch-all rewrites
  let hasCatchAllSpaLeak = false;
  const configFiles = [
    join(rootDir, 'next.config.js'),
    join(rootDir, 'next.config.mjs'),
    join(rootDir, 'next.config.ts'),
    join(rootDir, 'vercel.json'),
  ];

  for (const cf of configFiles) {
    if (existsSync(cf)) {
      const content = readFileSync(cf, 'utf-8');
      if (content.includes('/:path*') && (content.includes('destination: "/"') || content.includes('destination: "/index.html"'))) {
        hasCatchAllSpaLeak = true;
        break;
      }
    }
  }

  return {
    hasCustomNotFound,
    notFoundFile,
    isAuthentic404: hasCustomNotFound && !hasCatchAllSpaLeak,
    hasCatchAllSpaLeak,
  };
}
