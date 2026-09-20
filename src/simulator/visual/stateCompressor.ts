/**
 * Glintbase Simulation State Compressor
 * Compresses full flight simulation telemetry into an ultra-compact,
 * URL-safe base64url string for zero-database instant replays.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import type { SimulationTelemetry } from '../types.js';

export interface ReplayPayload {
  v: number; // schema version
  timestamp: number;
  target: string;
  persona: string;
  telemetry: SimulationTelemetry;
}

/**
 * Compresses flight telemetry and metadata into a URL-safe base64url string.
 */
export function compressSimulationState(payload: ReplayPayload): string {
  const jsonStr = JSON.stringify(payload);
  const deflated = deflateSync(Buffer.from(jsonStr, 'utf-8'), { level: 9 });
  return deflated.toString('base64url');
}

/**
 * Decompresses a URL-safe base64url string back into a ReplayPayload.
 */
export function decompressSimulationState(encoded: string): ReplayPayload {
  const buffer = Buffer.from(encoded, 'base64url');
  const inflated = inflateSync(buffer);
  return JSON.parse(inflated.toString('utf-8')) as ReplayPayload;
}

/**
 * Builds the complete deep-link URL for loading the simulation in the Glintbase Web Cockpit.
 */
export function buildReplayUrl(
  target: string,
  telemetry: SimulationTelemetry,
  persona: string,
  baseUrl = 'https://scan.glintbase.dev'
): string {
  const payload: ReplayPayload = {
    v: 1,
    timestamp: Date.now(),
    target,
    persona,
    telemetry,
  };

  const hash = compressSimulationState(payload);
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/simulate#data=${hash}`;
}
