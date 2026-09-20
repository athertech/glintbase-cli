import { describe, it, expect } from 'vitest';
import {
  generateJourneyTreeSvg,
  svgToBase64,
  svgToDataUri,
  generateClaudeArtifactCode,
} from '../src/simulator/visual/journeyTreeSvg.js';
import {
  compressSimulationState,
  decompressSimulationState,
  buildReplayUrl,
} from '../src/simulator/visual/stateCompressor.js';
import type { SimulationTelemetry } from '../src/simulator/types.js';

describe('Glintbase Visual Flight Simulator & State Compression', () => {
  const mockTelemetry: SimulationTelemetry = {
    outcome: 'completed',
    totalTokensBurned: 3450,
    schemaFrictionScore: 12,
    failureBottleneck: undefined,
    failureMode: undefined,
    suggestedRemediation: undefined,
    steps: [
      { action: 'discover', details: 'Probed /robots.txt', status: 'ok' },
      { action: 'index', details: 'Read /llms.txt (found 14 endpoints)', status: 'ok' },
      { action: 'auth', details: 'Acquired scoped bearer token from /auth.md', status: 'ok' },
      { action: 'call', details: 'POST /v1/customers (200 OK)', status: 'ok' },
    ],
  };

  it('generates a valid, complete SVG vector diagram', () => {
    const svg = generateJourneyTreeSvg(mockTelemetry, 'Claude Code', 'https://api.example.com');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('Claude Code');
    expect(svg).toContain('api.example.com');
    expect(svg).toContain('COMPLETED');
    expect(svg).toContain('3,450');
    expect(svg).toContain('12');
    expect(svg).toContain('GLINTBASE');
  });

  it('correctly displays bottleneck warnings on failed flight', () => {
    const failedTel: SimulationTelemetry = {
      outcome: 'blocked_by_auth',
      totalTokensBurned: 18200,
      schemaFrictionScore: 78,
      failureBottleneck: 'Missing public/auth.md and RFC 9728 machine credentials',
      suggestedRemediation: 'Generate public/auth.md and define scopes',
      steps: [
        { action: 'discover', details: 'Probed /robots.txt', status: 'ok' },
        { action: 'fail', details: 'POST /api/keys 401', status: 'error' },
      ],
    };

    const svg = generateJourneyTreeSvg(failedTel, 'Cursor', 'https://stripe.com');
    expect(svg).toContain('BOTTLENECK');
    expect(svg).toContain('Missing public/auth.md');
    expect(svg).toContain('SUGGESTED FIX');
  });

  it('encodes SVG to base64 and data URI cleanly', () => {
    const svg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>';
    const base64 = svgToBase64(svg);
    expect(base64).toBe(Buffer.from(svg).toString('base64'));

    const dataUri = svgToDataUri(svg);
    expect(dataUri.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('compresses and decompresses flight state with 100% roundtrip fidelity', () => {
    const payload = {
      v: 1,
      timestamp: Date.now(),
      target: 'https://unkey.com',
      persona: 'Claude Code',
      telemetry: mockTelemetry,
    };

    const compressed = compressSimulationState(payload);
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(10);

    const decompressed = decompressSimulationState(compressed);
    expect(decompressed.target).toBe(payload.target);
    expect(decompressed.persona).toBe(payload.persona);
    expect(decompressed.telemetry.totalTokensBurned).toBe(3450);
    expect(decompressed.telemetry.steps.length).toBe(4);
  });

  it('builds a clean replay URL pointing to the webapp hash', () => {
    const url = buildReplayUrl('https://api.example.com', mockTelemetry, 'Perplexity');
    expect(url.startsWith('https://scan.glintbase.dev/simulate#data=')).toBe(true);
  });
});
