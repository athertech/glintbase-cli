/**
 * CLI JSON output — structured report for --json flag.
 * Suitable for piping to jq, CI logs, and machine consumption.
 */

import type { Ars2Scorecard } from '../core/probes/index.js';

export function formatArs2Json(scorecard: Ars2Scorecard): string {
  return JSON.stringify(scorecard, null, 2);
}
