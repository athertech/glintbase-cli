/**
 * Framework and Workspace Detector for Glintbase Agent Harness.
 * Identifies web frameworks, routing conventions, and public asset directories.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type DetectedFramework =
  | 'next-app-router'
  | 'next-pages-router'
  | 'astro'
  | 'remix'
  | 'sveltekit'
  | 'express'
  | 'fastapi'
  | 'django'
  | 'generic-node'
  | 'static';

export interface FrameworkProfile {
  framework: DetectedFramework;
  name: string;
  isTypeScript: boolean;
  publicDir: string;
  hasAppRouter: boolean;
  hasPagesRouter: boolean;
  routesDir?: string;
  layoutFile?: string;
  packageJsonPath?: string;
  dependencies: Record<string, string>;
}

export function detectFramework(cwd: string = process.cwd()): FrameworkProfile {
  const pkgPath = join(cwd, 'package.json');
  let dependencies: Record<string, string> = {};
  let devDependencies: Record<string, string> = {};

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      dependencies = pkg.dependencies || {};
      devDependencies = pkg.devDependencies || {};
    } catch {
      /* ignore */
    }
  }

  const allDeps = { ...devDependencies, ...dependencies };
  const hasTs = existsSync(join(cwd, 'tsconfig.json')) || Boolean(allDeps['typescript']);

  // Check public directory conventions
  let publicDir = join(cwd, 'public');
  if (!existsSync(publicDir)) {
    if (existsSync(join(cwd, 'static'))) {
      publicDir = join(cwd, 'static');
    } else {
      publicDir = cwd; // Root fallback
    }
  }

  // 1. Next.js Detection (App Router vs Pages Router)
  const isNext = Boolean(allDeps['next']);
  if (isNext) {
    const hasApp = existsSync(join(cwd, 'app')) || existsSync(join(cwd, 'src', 'app'));
    const hasPages = existsSync(join(cwd, 'pages')) || existsSync(join(cwd, 'src', 'pages'));

    let layoutFile: string | undefined;
    const layoutCandidates = [
      join(cwd, 'app', 'layout.tsx'),
      join(cwd, 'app', 'layout.jsx'),
      join(cwd, 'src', 'app', 'layout.tsx'),
      join(cwd, 'src', 'app', 'layout.jsx'),
      join(cwd, 'pages', '_app.tsx'),
      join(cwd, 'pages', '_app.jsx'),
    ];

    for (const cand of layoutCandidates) {
      if (existsSync(cand)) {
        layoutFile = cand;
        break;
      }
    }

    const routesDir = hasApp
      ? existsSync(join(cwd, 'src', 'app'))
        ? join(cwd, 'src', 'app')
        : join(cwd, 'app')
      : existsSync(join(cwd, 'src', 'pages', 'api'))
      ? join(cwd, 'src', 'pages', 'api')
      : join(cwd, 'pages', 'api');

    return {
      framework: hasApp ? 'next-app-router' : 'next-pages-router',
      name: hasApp ? 'Next.js (App Router)' : 'Next.js (Pages Router)',
      isTypeScript: hasTs,
      publicDir,
      hasAppRouter: hasApp,
      hasPagesRouter: hasPages,
      routesDir,
      layoutFile,
      packageJsonPath: existsSync(pkgPath) ? pkgPath : undefined,
      dependencies: allDeps,
    };
  }

  // 2. Astro Detection
  if (Boolean(allDeps['astro'])) {
    return {
      framework: 'astro',
      name: 'Astro',
      isTypeScript: hasTs,
      publicDir,
      hasAppRouter: false,
      hasPagesRouter: false,
      routesDir: existsSync(join(cwd, 'src', 'pages')) ? join(cwd, 'src', 'pages') : undefined,
      packageJsonPath: pkgPath,
      dependencies: allDeps,
    };
  }

  // 3. Remix / React Router v7
  if (Boolean(allDeps['@remix-run/react']) || Boolean(allDeps['@react-router/dev'])) {
    return {
      framework: 'remix',
      name: 'Remix',
      isTypeScript: hasTs,
      publicDir,
      hasAppRouter: false,
      hasPagesRouter: false,
      routesDir: existsSync(join(cwd, 'app', 'routes')) ? join(cwd, 'app', 'routes') : undefined,
      packageJsonPath: pkgPath,
      dependencies: allDeps,
    };
  }

  // 4. SvelteKit
  if (Boolean(allDeps['@sveltejs/kit'])) {
    return {
      framework: 'sveltekit',
      name: 'SvelteKit',
      isTypeScript: hasTs,
      publicDir,
      hasAppRouter: false,
      hasPagesRouter: false,
      routesDir: existsSync(join(cwd, 'src', 'routes')) ? join(cwd, 'src', 'routes') : undefined,
      packageJsonPath: pkgPath,
      dependencies: allDeps,
    };
  }

  // 5. Express
  if (Boolean(allDeps['express'])) {
    return {
      framework: 'express',
      name: 'Express.js',
      isTypeScript: hasTs,
      publicDir,
      hasAppRouter: false,
      hasPagesRouter: false,
      routesDir: existsSync(join(cwd, 'routes')) ? join(cwd, 'routes') : cwd,
      packageJsonPath: pkgPath,
      dependencies: allDeps,
    };
  }

  // 6. Python Frameworks (FastAPI, Django)
  if (existsSync(join(cwd, 'main.py')) || existsSync(join(cwd, 'app', 'main.py'))) {
    const mainContent = (
      existsSync(join(cwd, 'main.py'))
        ? readFileSync(join(cwd, 'main.py'), 'utf-8')
        : readFileSync(join(cwd, 'app', 'main.py'), 'utf-8')
    ).toLowerCase();

    if (mainContent.includes('fastapi')) {
      return {
        framework: 'fastapi',
        name: 'FastAPI',
        isTypeScript: false,
        publicDir,
        hasAppRouter: false,
        hasPagesRouter: false,
        routesDir: cwd,
        dependencies: {},
      };
    }
  }

  if (existsSync(join(cwd, 'manage.py'))) {
    return {
      framework: 'django',
      name: 'Django',
      isTypeScript: false,
      publicDir,
      hasAppRouter: false,
      hasPagesRouter: false,
      routesDir: cwd,
      dependencies: {},
    };
  }

  // 7. Generic Node.js or Static Fallback
  return {
    framework: existsSync(pkgPath) ? 'generic-node' : 'static',
    name: existsSync(pkgPath) ? 'Node.js Application' : 'Static Web Platform',
    isTypeScript: hasTs,
    publicDir,
    hasAppRouter: false,
    hasPagesRouter: false,
    packageJsonPath: existsSync(pkgPath) ? pkgPath : undefined,
    dependencies: allDeps,
  };
}
