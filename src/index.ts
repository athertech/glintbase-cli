#!/usr/bin/env node
/**
 * Glintbase Agent Harness CLI (ARS 3.0)
 * Supabase / UNIX-style command-driven CLI for human developers and autonomous coding agents.
 *
 * Commands:
 *   glintbase                   Print overview, workspace status, and command list
 *   glintbase init              Initialize agent resource discovery (.well-known/ard.json)
 *   glintbase doctor            Diagnose environment, framework, and surface readiness
 *   glintbase audit [target]    Full ARS 3.0 audit (119 checks, 4 layers, dynamic denominator)
 *   glintbase fix [target]      Autonomous remediation doctor (1-click PR branching & AST fixing)
 *   glintbase simulate [target] Standalone Agent Flight Simulator (Claude Code, Cursor, Perplexity)
 *   glintbase ci [url]          Enterprise CI/CD quality gate, PR drift detector & sticky comments
 *   glintbase generate <spec>   Generate living agent specifications (robots, llms, mcp, auth)
 *   glintbase remediate [spec]  Legacy alias for generate
 *   glintbase check <url> [ids] Targeted re-verification of specific probe checks
 *   glintbase bench             Agent Readiness Benchmark (ARB) evaluation suite
 *   glintbase model [target]    Inspect or configure active AI model provider
 *   glintbase connect           Connect AI provider credentials
 *   glintbase config            View or set provider, API keys, and scan settings
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { initCommand } from './commands/init.js';
import { doctorCommand } from './commands/doctor.js';
import { generateCommand } from './commands/remediate.js';
import { auditCommand } from './commands/audit.js';
import { checkCommand } from './commands/check.js';
import { fixCommand } from './commands/fix.js';
import { ciCommand } from './commands/ci.js';
import { benchCommand } from './commands/bench.js';
import { modelCommand } from './commands/model.js';
import { connectCommand } from './commands/connect.js';
import { configCommand } from './commands/config.js';
import { simulateCommand } from './commands/simulate.js';
import { brand, renderBrandHeader } from './output/banner.js';
import { executeCodebaseAudit } from './session/agentBrain.js';
import { detectFramework } from './ast/frameworkDetector.js';

const program = new Command()
  .name('glintbase')
  .description('Glintbase Agent Harness — autonomous agent-readiness auditor (ARS 3.0), Flight Simulator & CI drift shield')
  .version('3.0.0');

program.addCommand(initCommand);
program.addCommand(doctorCommand);
program.addCommand(generateCommand);
program.addCommand(auditCommand);
program.addCommand(checkCommand);
program.addCommand(fixCommand);
program.addCommand(ciCommand);
program.addCommand(benchCommand);
program.addCommand(modelCommand);
program.addCommand(connectCommand);
program.addCommand(configCommand);
program.addCommand(simulateCommand);

process.on('uncaughtException', (err) => {
  console.error(pc.red(`\n  Glintbase Error: ${err.message || err}\n`));
  process.exit(1);
});

async function main() {
  if (process.argv.slice(2).length === 0) {
    // Supabase / UNIX style: print brand header, workspace status, command usage, and exit 0
    renderBrandHeader();

    const cwd = process.cwd();
    try {
      const profile = detectFramework(cwd);
      const audit = executeCodebaseAudit(cwd);
      console.log(`  ${pc.bold('Workspace')} : ${pc.white(cwd)} (${pc.green(profile.name)})`);
      console.log(`  ${pc.bold('Readiness')} : ARS Score ${brand.orangeBold(`${audit.totalScore ?? 0}/100`)} (${pc.cyan(`Grade ${audit.grade ?? 'B'}`)}) · ${pc.dim(audit.archetype ?? 'Full-Stack')}\n`);
    } catch {
      // Fallback if not inside a recognizable workspace
    }

    program.outputHelp();
    process.exit(0);
  } else {
    program.parse();
  }
}

main().catch(err => {
  console.error(pc.red(`\n  Glintbase Error: ${err.message || err}\n`));
  process.exit(1);
});
