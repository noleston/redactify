import { PII_RULES, type PiiCategory } from '../lib/piiRules';
import { calculateScore, SCORE_THRESHOLD, type ScoreEvidence } from '../lib/scoring';

export interface ScanFinding {
  id: string;
  ruleId: string;
  label: string;
  category: PiiCategory;
  value: string;
  index: number;
  length: number;
  startOffset: number;
  endOffset: number;
  score: number;
  debug: ScoreEvidence[];
}

export type WorkerInMessage =
  | { type: 'SCAN'; text: string }
  | { type: 'CANCEL' };

export type WorkerOutMessage =
  | { type: 'RESULT'; findings: ScanFinding[] }
  | { type: 'ERROR'; message: string };

type IndexedRegExpExecArray = RegExpExecArray & {
  indices?: Array<[number, number] | undefined>;
};

function getEnd(finding: Pick<ScanFinding, 'index' | 'length'>): number {
  return finding.index + finding.length;
}

function compareFindings(a: ScanFinding, b: ScanFinding): number {
  if (a.index !== b.index) return a.index - b.index;
  if (a.length !== b.length) return b.length - a.length;
  return a.ruleId.localeCompare(b.ruleId);
}

function pickLongest(findings: ScanFinding[]): ScanFinding {
  return findings.reduce((best, current) => {
    if (current.length !== best.length) return current.length > best.length ? current : best;
    return compareFindings(current, best) < 0 ? current : best;
  });
}

function removeOverlaps(findings: ScanFinding[]): ScanFinding[] {
  const sorted = [...findings].sort(compareFindings);
  if (sorted.length === 0) return [];

  const resolved: ScanFinding[] = [];
  let cluster: ScanFinding[] = [sorted[0]];
  let clusterEnd = getEnd(sorted[0]);

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];

    if (current.index < clusterEnd) {
      cluster.push(current);
      clusterEnd = Math.max(clusterEnd, getEnd(current));
      continue;
    }

    resolved.push(pickLongest(cluster));
    cluster = [current];
    clusterEnd = getEnd(current);
  }

  resolved.push(pickLongest(cluster));
  return resolved.sort(compareFindings);
}

export function scanTextForPii(text: string): ScanFinding[] {
  const findings: ScanFinding[] = [];

  for (const rule of PII_RULES) {
    rule.pattern.lastIndex = 0;

    let match: IndexedRegExpExecArray | null;
    while ((match = rule.pattern.exec(text)) !== null) {
      const value = match[rule.captureGroup];

      if (!value || value.trim().length === 0) {
        if (rule.pattern.lastIndex === match.index) rule.pattern.lastIndex++;
        continue;
      }

      const captureIndices = match.indices?.[rule.captureGroup];
      if (!captureIndices) {
        console.warn(`Rule ${rule.id} is missing 'd' flag. Check regex.`);
        if (rule.pattern.lastIndex === match.index) rule.pattern.lastIndex++;
        continue;
      }

      const [startIndex, endOffset] = captureIndices;
      const length = endOffset - startIndex;

      if (startIndex < 0 || length <= 0 || endOffset > text.length) {
        if (rule.pattern.lastIndex === match.index) rule.pattern.lastIndex++;
        continue;
      }

      const { score, debug } = calculateScore(value, startIndex, length, rule, text);

      if (score >= SCORE_THRESHOLD) {
        findings.push({
          id: `${rule.id}:${startIndex}:${length}`,
          ruleId: rule.id,
          label: rule.label,
          category: rule.category,
          value,
          index: startIndex,
          length,
          startOffset: startIndex,
          endOffset,
          score,
          debug,
        });
      }

      if (rule.pattern.lastIndex === match.index) rule.pattern.lastIndex++;
    }

    rule.pattern.lastIndex = 0;
  }

  return removeOverlaps(findings);
}

const workerSelf = typeof self === 'undefined' ? null : self;

if (workerSelf) {
  workerSelf.onmessage = (event: MessageEvent<WorkerInMessage>) => {
    const message = event.data;
    if (message.type === 'CANCEL') return;
    if (message.type !== 'SCAN') return;

    try {
      const out: WorkerOutMessage = {
        type: 'RESULT',
        findings: scanTextForPii(message.text),
      };
      workerSelf.postMessage(out);
    } catch (error) {
      const out: WorkerOutMessage = {
        type: 'ERROR',
        message: error instanceof Error ? error.message : String(error),
      };
      workerSelf.postMessage(out);
    }
  };
}
