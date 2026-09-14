/**
 * CLI Command: glintbase init
 * Bootstraps Agent Readiness in a repository.
 * Detects workspace framework, configures base .well-known/ard.json,
 * and provisions baseline agent discovery entrypoints.
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import pc from 'picocolors';

import { detectFramework } from '../ast/frameworkDetector.js';
import { indexDocumentation } from '../ast/docIndexer.js';
import { generateArdJson, generateRobotsTxt } from '../ast/generators.js';
import { brand } from '../output/banner.js';
import { executeCodebaseAudit } from '../session/agentBrain.js';

export const initCommand = new Command('init')
  .description('Initialize agent readiness in the current repository')
  .option('-y, --yes', 'Automatically create manifests without prompting', false)
  .option('--json', 'Output results in JSON format', false)
  .action(async (opts: any) => {
    const cwd = process.cwd();
    const profile = detectFramework(cwd);
    const docIndex = indexDocumentation(cwd);

    const publicDir = profile.publicDir;
    if (!existsSync(publicDir)) {
      mkdirSync(publicDir, { recursive: true });
    }

    const createdFiles: string[] = [];

    // 1. Provision .well-known/ard.json
    const ardDir = join(publicDir, '.well-known');
    if (!existsSync(ardDir)) {
      mkdirSync(ardDir, { recursive: true });
    }
    const ardPath = join(ardDir, 'ard.json');
    if (!existsSync(ardPath)) {
      const ardContent = generateArdJson({ name: docIndex.projectTitle });
      writeFileSync(ardPath, ardContent, 'utf-8');
      createdFiles.push('.well-known/ard.json');
    }

    // 2. Provision robots.txt if missing
    const robotsPath = join(publicDir, 'robots.txt');
    if (!existsSync(robotsPath)) {
      const robotsContent = generateRobotsTxt();
      writeFileSync(robotsPath, robotsContent, 'utf-8');
      createdFiles.push('robots.txt');
    }

    const audit = executeCodebaseAudit(cwd);

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            initialized: true,
            framework: profile.name,
            publicDir: profile.publicDir,
            createdFiles,
            currentScore: audit.totalScore,
            archetype: audit.archetype,
          },
          null,
          2
        )
      );
      return;
    }

    console.log('');
    console.log(`  ${brand.orange('✦')} ${pc.bold('Glintbase Agent Readiness Initialized')}`);
    console.log(`    ${pc.dim('Framework  :')} ${pc.green(profile.name)}`);
    console.log(`    ${pc.dim('Public Dir :')} ${pc.cyan(profile.publicDir)}`);
    console.log('');

    if (createdFiles.length > 0) {
      console.log(`  ${pc.green('✓')} Created initial agent entrypoint(s):`);
      for (const f of createdFiles) {
        console.log(`    ${pc.green('•')} ${f}`);
      }
      console.log('');
    } else {
      console.log(`  ${pc.cyan('ℹ')} Base agent manifests already present in ${publicDir}.\n`);
    }

    console.log(`  Current ARS 2.0 Score: ${pc.bold(pc.white(`${audit.totalScore}/100`))} (${audit.archetype})`);
    console.log(`  Run ${brand.orangeBold('glintbase fix')} to generate complete agent manifests, or ${brand.orangeBold('glintbase audit')} to evaluate.\n`);
  });
