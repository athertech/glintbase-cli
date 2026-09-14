/**
 * CLI Command: glintbase config
 * View and manage configuration.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { loadConfig, saveConfig, resetConfig, getConfigPath, resolveConfig } from '../config.js';

export function printConfigList(): void {
  const config = loadConfig();
  const resolved = resolveConfig();
  const path = getConfigPath();

  console.log(pc.bold('\n  Glintbase Configuration\n'));
  console.log(pc.dim(`  Config File : ${path}\n`));
  console.log(`  Provider    : ${config.provider || resolved.provider || pc.dim('(none — deterministic mode)')}`);
  console.log(`  Model       : ${config.model || resolved.model || pc.dim('(default)')}`);
  console.log(`  Base URL    : ${config.baseUrl || resolved.baseUrl || pc.dim('(default)')}`);
  console.log(`  API Key     : ${config.apiKey ? pc.green('configured (store)') : (resolved.apiKey ? pc.green('configured (ambient env)') : pc.dim('(not set)'))}`);
  console.log(`  Firecrawl   : ${config.firecrawlKey ? pc.green('configured') : (resolved.firecrawlKey ? pc.green('configured (ambient env)') : pc.dim('(not set)'))}`);
  console.log(`  Profile     : ${config.scan.profile}`);
  console.log(`  Max Pages   : ${config.scan.maxPages}`);
  console.log(`  Fail Under  : ${config.scan.failUnder ?? pc.dim('(none)')}`);
  console.log('');
}

export const configCommand = new Command('config')
  .description('View and manage Glintbase configuration')
  .action(() => {
    printConfigList();
  });

configCommand
  .command('list')
  .description('Show current resolved configuration')
  .action(() => {
    printConfigList();
  });

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value (e.g. config set provider ollama)')
  .action((key: string, value: string) => {
    const validKeys = ['provider', 'model', 'baseUrl', 'apiKey', 'firecrawlKey'];
    const scanKeys = ['profile', 'maxPages', 'failUnder'];

    if (validKeys.includes(key)) {
      saveConfig({ [key]: value === 'null' ? null : value } as any);
      console.log(pc.green(`  Set ${key} = ${value === 'null' ? '(cleared)' : value}`));
    } else if (scanKeys.includes(key)) {
      const config = loadConfig();
      const scan = { ...config.scan };
      if (key === 'maxPages' || key === 'failUnder') {
        (scan as any)[key] = value === 'null' ? null : parseInt(value);
      } else {
        (scan as any)[key] = value;
      }
      saveConfig({ scan });
      console.log(pc.green(`  Set scan.${key} = ${value}`));
    } else {
      console.error(pc.red(`  Unknown key: ${key}`));
      console.log(pc.dim(`  Valid keys: ${[...validKeys, ...scanKeys.map((k) => `scan.${k}`)].join(', ')}`));
    }
  });

configCommand
  .command('reset')
  .description('Reset configuration to defaults')
  .action(() => {
    resetConfig();
    console.log(pc.green('  Configuration reset to defaults.'));
  });
