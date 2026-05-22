import levenshtein from 'fast-levenshtein';
import type { PiiRule } from './piiRules';

export interface ScoreEvidence {
  reason: string;
  points: number;
}

export const CONTEXT_RADII = {
  NEAR: 40,
  FAR: 100,
};

export const SCORE_WEIGHTS = {
  PATTERN_MATCH: 50,
  VALIDATION_SUCCESS: 50,
  CONTEXT_NEAR: 30,
  CONTEXT_FAR: 15,
  FUZZY_CONTEXT: 20,
  NEGATIVE_CONTEXT: -60,
};

export const SCORE_THRESHOLD = 70;

const AUTHORITATIVE_INFRA_RULE_IDS = new Set([
  'aws_secret_key',
  'config_link_vpn',
  'reality_public_key',
  'reality_short_id',
  'wireguard_private_key',
  'xray_private_key',
  'ssh_private_key_header',
]);

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
  if (trigger.length <= 4 || trigger.includes(' ')) return false;

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

function getAuthoritativeInfraEvidence(rule: PiiRule, value: string): ScoreEvidence | null {
  if (rule.id === 'config_link_vpn' && /^(?:vless|vmess|ss|trojan|clash|amnezia):\/\//iu.test(value)) {
    return { reason: 'Authoritative VPN config link signature', points: 100 };
  }

  if (rule.id === 'aws_secret_key' && /^[A-Za-z0-9/+=_-]{20,60}$/u.test(value)) {
    return { reason: 'Authoritative AWS secret key signature', points: 100 };
  }

  if (rule.id === 'wireguard_private_key' && /^[A-Za-z0-9+/]{42,44}=$/u.test(value)) {
    return { reason: 'Authoritative WireGuard private key signature', points: 100 };
  }

  if (rule.id === 'reality_public_key' && /^[A-Za-z0-9_-]{32,64}$/u.test(value)) {
    return { reason: 'Authoritative Reality public key signature', points: 100 };
  }

  if (rule.id === 'xray_private_key' && /^[A-Za-z0-9_-]{42,44}=?$/u.test(value)) {
    return { reason: 'Authoritative Xray private key signature', points: 100 };
  }

  if (rule.id === 'reality_short_id' && /^[0-9a-f]{2,16}$/iu.test(value)) {
    return { reason: 'Authoritative Reality short-id signature', points: 100 };
  }

  if (rule.id === 'ssh_private_key_header' && /^-----BEGIN [A-Z ]+ PRIVATE KEY-----$/u.test(value)) {
    return { reason: 'Authoritative private key header signature', points: 100 };
  }

  if (AUTHORITATIVE_INFRA_RULE_IDS.has(rule.id)) {
    return { reason: 'Authoritative infrastructure secret signature', points: 100 };
  }

  return null;
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

  if (/^█+$/.test(value) || /^\[[A-Z0-9_]+(?:-\d+)?\]$/.test(value) || !/[a-zA-Z0-9А-Яа-я]/u.test(value)) {
    return {
      score: 0,
      debug: [{ reason: 'Value is already redacted', points: 0 }],
    };
  }

  if (rule.validate && !rule.validate(value)) {
    return {
      score: 0,
      debug: [{ reason: 'Validation function failed', points: 0 }],
    };
  }

  const authoritativeEvidence = getAuthoritativeInfraEvidence(rule, value);
  if (authoritativeEvidence) {
    return {
      score: authoritativeEvidence.points,
      debug: [authoritativeEvidence],
    };
  }

  score += SCORE_WEIGHTS.PATTERN_MATCH;
  debug.push({ reason: 'Regex pattern matched', points: SCORE_WEIGHTS.PATTERN_MATCH });

  if (rule.validate) {
    score += SCORE_WEIGHTS.VALIDATION_SUCCESS;
    debug.push({ reason: 'Validation function passed', points: SCORE_WEIGHTS.VALIDATION_SUCCESS });
  }

  const contextWindow = getPositiveContext(text, index, length, rule, CONTEXT_RADII.FAR);
  let hasNegativeContext = false;

  for (const keyword of NEGATIVE_KEYWORDS) {
    if (contextWindow.includes(keyword)) {
      score += SCORE_WEIGHTS.NEGATIVE_CONTEXT;
      debug.push({ reason: `Negative keyword found: "${keyword}"`, points: SCORE_WEIGHTS.NEGATIVE_CONTEXT });
      hasNegativeContext = true;
      break;
    }
  }

  if (rule.negativeContext && !hasNegativeContext) {
    for (const keyword of rule.negativeContext) {
      if (contextWindow.includes(keyword)) {
        score += SCORE_WEIGHTS.NEGATIVE_CONTEXT;
        debug.push({ reason: `Rule negative context found: "${keyword}"`, points: SCORE_WEIGHTS.NEGATIVE_CONTEXT });
        hasNegativeContext = true;
        break;
      }
    }
  }

  const nearContext = getPositiveContext(text, index, length, rule, CONTEXT_RADII.NEAR);
  const farContext = getPositiveContext(text, index, length, rule, CONTEXT_RADII.FAR);
  let contextScore = 0;
  let contextEvidence: ScoreEvidence | null = null;

  for (const trigger of rule.mustHaveContext) {
    const triggerLower = trigger.toLowerCase();

    if (nearContext.includes(triggerLower)) {
      contextScore = SCORE_WEIGHTS.CONTEXT_NEAR;
      contextEvidence = { reason: `Direct context near: "${trigger}"`, points: SCORE_WEIGHTS.CONTEXT_NEAR };
      break;
    }

    if (contextScore < SCORE_WEIGHTS.CONTEXT_FAR && farContext.includes(triggerLower)) {
      contextScore = SCORE_WEIGHTS.CONTEXT_FAR;
      contextEvidence = { reason: `Direct context far: "${trigger}"`, points: SCORE_WEIGHTS.CONTEXT_FAR };
    } else if (contextScore < SCORE_WEIGHTS.FUZZY_CONTEXT && hasFuzzyContext(triggerLower, farContext)) {
      contextScore = SCORE_WEIGHTS.FUZZY_CONTEXT;
      contextEvidence = { reason: `Fuzzy context match: "${trigger}"`, points: SCORE_WEIGHTS.FUZZY_CONTEXT };
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
  if (contextEvidence) debug.push(contextEvidence);

  return { score, debug };
}
