/**
 * Version identifiers printed by the CLI.
 * CLI_VERSION is this package's version; the scoring model (ARS_LABEL / ARS_SCORE_VERSION)
 * and the check registry come from @glintbase/scanner-core, the engine scan.glintbase.dev uses.
 */

import { createRequire } from 'node:module';
import { ARS_LABEL, ARS_SCORE_VERSION, getAllChecks } from '@glintbase/scanner-core';

const require = createRequire(import.meta.url);

/** Resolved from package.json (one level above both src/ and dist/). */
export const CLI_VERSION: string = (require('../package.json') as { version: string }).version;

/** Version of the bundled ARS engine package (@glintbase/scanner-core). */
export const ENGINE_VERSION: string = (() => {
  try {
    return (require('@glintbase/scanner-core/package.json') as { version: string }).version;
  } catch {
    return 'unknown';
  }
})();

export { ARS_LABEL, ARS_SCORE_VERSION };

/** Number of checks in the ARS registry (the source of truth; never hard-code it). */
export const CHECK_COUNT: number = getAllChecks().length;

/** e.g. "3.3.0 (ars-3.2.0, @glintbase/scanner-core 3.3.0)" */
export const VERSION_STRING = `${CLI_VERSION} (${ARS_SCORE_VERSION}, @glintbase/scanner-core ${ENGINE_VERSION})`;
