/**
 * Unified ARS score bands and letter grades.
 * ARS 3.0 Standard Grade Alignment:
 * - A+ (95–100): Certified Autonomous Ready (Leading)
 * - A  (86–94):  Enterprise Agent Ready (Advanced)
 * - B  (70–85):  Functionally Autonomous (Production Baseline)
 * - C  (48–69):  Partial Agent Support (Intermittent Failures)
 * - D  (28–47):  Human-Centric Legacy (Severe Gaps)
 * - F  (0–27):   Autonomous Incompatible (Agent Blind)
 */

import type { ArsGrade } from './checks/types.js';

export type ScoreBandKey = 'elite' | 'friendly' | 'capable' | 'legacy';

export interface ScoreBand {
  key: ScoreBandKey;
  label: string;
  displayLabel: string;
  min: number;
  max: number;
}

export interface GradeBand {
  grade: ArsGrade;
  label: string;
  description: string;
  min: number;
  max: number;
}

const GRADE_BANDS: GradeBand[] = [
  {
    grade: 'A+',
    label: 'Certified Autonomous Ready',
    description: 'Leading standard compliance across all operational layers.',
    min: 95,
    max: 100,
  },
  {
    grade: 'A',
    label: 'Enterprise Agent Ready',
    description: 'Advanced readiness with robust discovery, access, and usability.',
    min: 86,
    max: 94,
  },
  {
    grade: 'B',
    label: 'Functionally Autonomous',
    description: 'Meets production baseline; minor gaps in emerging protocols.',
    min: 70,
    max: 85,
  },
  {
    grade: 'C',
    label: 'Partial Agent Support',
    description: 'Intermittent agent execution failures due to missing specs.',
    min: 48,
    max: 69,
  },
  {
    grade: 'D',
    label: 'Human-Centric Legacy',
    description: 'Severe protocol gaps; agents struggle with access and parsing.',
    min: 28,
    max: 47,
  },
  {
    grade: 'F',
    label: 'Autonomous Incompatible',
    description: 'Agent blind; missing discovery, auth, and machine interfaces.',
    min: 0,
    max: 27,
  },
];

const BANDS: ScoreBand[] = [
  {
    key: 'elite',
    label: 'Agent-Native',
    displayLabel: 'Elite Agent-Native',
    min: 90,
    max: 100,
  },
  {
    key: 'friendly',
    label: 'AI-Friendly',
    displayLabel: 'AI-Friendly Ecosystem',
    min: 70,
    max: 89,
  },
  {
    key: 'capable',
    label: 'AI-Capable',
    displayLabel: 'AI-Capable Ecosystem',
    min: 40,
    max: 69,
  },
  {
    key: 'legacy',
    label: 'Legacy Ecosystem',
    displayLabel: 'Legacy Ecosystem',
    min: 0,
    max: 39,
  },
];

export function getArsGrade(score: number): GradeBand {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const band of GRADE_BANDS) {
    if (s >= band.min && s <= band.max) return band;
  }
  return GRADE_BANDS[GRADE_BANDS.length - 1];
}

export function scoreBand(score: number): ScoreBand {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  for (const band of BANDS) {
    if (s >= band.min && s <= band.max) return band;
  }
  return BANDS[BANDS.length - 1];
}

export function scoreBandLabel(score: number): string {
  return scoreBand(score).label;
}

export const SCORE_BANDS = BANDS;
export const ARS_GRADE_BANDS = GRADE_BANDS;
