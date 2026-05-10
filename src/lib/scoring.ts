import levenshtein from 'fast-levenshtein';
import type { PiiRule } from './piiRules';

export interface ScoreEvidence {
  reason: string;
  points: number;
}

export const SCORE_WEIGHTS = {
  PATTERN_MATCH: 50,
  VALIDATION_SUCCESS: 50,
  CONTEXT_NEAR: 30,
  CONTEXT_FAR: 15,
  FUZZY_CONTEXT: 20,
  NEGATIVE_CONTEXT: -60,
};

export const SCORE_THRESHOLD = 70;

export const NEGATIVE_KEYWORDS = [
  'test',
  'example',
  'dummy',
  'fake',
  'sample',
  'образец',
  'тест',
  'пример',
];

function hasFuzzyContext(trigger: string, context: string): boolean {
  if (trigger.length <= 4) return false;

  const wordsInContext = context.split(/[\s,.:;!?]+/u).filter(Boolean);

  for (const word of wordsInContext) {
    if (levenshtein.get(trigger, word) < 2) return true;
  }

  return false;
}

function getPositiveContext(text: string, index: number, length: number, rule: PiiRule, radius: number): string {
  let start = Math.max(0, index - radius);
  let end = Math.min(text.length, index + length + radius);

  if (rule.strictContext) {
    const lineStart = text.lastIndexOf('\n', index);
    const lineEnd = text.indexOf('\n', index + length);
    start = Math.max(start, lineStart === -1 ? 0 : lineStart + 1);
    end = Math.min(end, lineEnd === -1 ? text.length : lineEnd);
  }

  return text.slice(start, end).toLowerCase();
}

export function calculateScore(
  value: string,
  index: number,
  length: number,
  rule: PiiRule,
  text: string
): { score: number; debug: ScoreEvidence[] } {
  const debug: ScoreEvidence[] = [];
  let score = 0;

  if (rule.validate && !rule.validate(value)) {
    return {
      score: 0,
      debug: [{ reason: 'Validation function failed', points: 0 }],
    };
  }

  score += SCORE_WEIGHTS.PATTERN_MATCH;
  debug.push({ reason: 'Regex pattern matched', points: SCORE_WEIGHTS.PATTERN_MATCH });

  if (rule.validate) {
    score += SCORE_WEIGHTS.VALIDATION_SUCCESS;
    debug.push({ reason: 'Validation function passed', points: SCORE_WEIGHTS.VALIDATION_SUCCESS });
  }

  const contextWindow = text.slice(Math.max(0, index - 50), index + length + 50).toLowerCase();
  let hasNegativeContext = false;

  for (const keyword of NEGATIVE_KEYWORDS) {
    if (contextWindow.includes(keyword)) {
      score += SCORE_WEIGHTS.NEGATIVE_CONTEXT;
      debug.push({ reason: `Negative keyword found: "${keyword}"`, points: SCORE_WEIGHTS.NEGATIVE_CONTEXT });
      hasNegativeContext = true;
      break;
    }
  }

  const nearContext = getPositiveContext(text, index, length, rule, 20);
  const farContext = getPositiveContext(text, index, length, rule, 50);
  let contextScore = 0;

  for (const trigger of rule.mustHaveContext) {
    const triggerLower = trigger.toLowerCase();

    if (nearContext.includes(triggerLower)) {
      contextScore = SCORE_WEIGHTS.CONTEXT_NEAR;
      debug.push({ reason: `Direct context near: "${trigger}"`, points: SCORE_WEIGHTS.CONTEXT_NEAR });
      break;
    }

    if (farContext.includes(triggerLower)) {
      contextScore = SCORE_WEIGHTS.CONTEXT_FAR;
      debug.push({ reason: `Direct context far: "${trigger}"`, points: SCORE_WEIGHTS.CONTEXT_FAR });
      break;
    }

    if (hasFuzzyContext(triggerLower, farContext)) {
      contextScore = SCORE_WEIGHTS.FUZZY_CONTEXT;
      debug.push({ reason: `Fuzzy context match: "${trigger}"`, points: SCORE_WEIGHTS.FUZZY_CONTEXT });
      break;
    }
  }

  if (hasNegativeContext) {
    return { score: 0, debug };
  }

  if (rule.mustHaveContext.length > 0 && contextScore === 0) {
    return {
      score: 0,
      debug: [{ reason: 'Required context not found', points: 0 }],
    };
  }

  score += contextScore;

  return { score, debug };
}
