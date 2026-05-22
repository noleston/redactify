import { expect, test, describe } from 'vitest';
import { calculateScore, SCORE_WEIGHTS } from '../scoring';
import type { PiiRule } from '../piiRules';

describe('calculateScore', () => {
  test('does not overwrite exact far context with fuzzy context', () => {
    const rule: PiiRule = {
      id: 'test_rule',
      category: 'CONTACT',
      label: 'Test Rule',
      pattern: /hello/gud,
      captureGroup: 0,
      mustHaveContext: ['unique_trigger']
    };

    const text = 'hello ' + 'a'.repeat(25) + ' unique_trigger';
    const { score, debug } = calculateScore('hello', 0, 5, rule, text);
    
    expect(score).toBe(SCORE_WEIGHTS.PATTERN_MATCH + SCORE_WEIGHTS.CONTEXT_FAR);
    const hasFuzzy = debug.some(d => d.reason.includes('Fuzzy'));
    expect(hasFuzzy).toBe(false);
  });

  test('ignores fuzzy context if trigger contains spaces', () => {
    const rule: PiiRule = {
      id: 'test_rule_space',
      category: 'CONTACT',
      label: 'Test Rule Space',
      pattern: /hello/gud,
      captureGroup: 0,
      mustHaveContext: ['some multi word']
    };

    const text = 'hello ' + 'a'.repeat(25) + ' some typo word';
    const { score, debug } = calculateScore('hello', 0, 5, rule, text);
    
    expect(score).toBe(0);
    const hasFuzzy = debug.some(d => d.reason.includes('Fuzzy'));
    expect(hasFuzzy).toBe(false);
  });
});
