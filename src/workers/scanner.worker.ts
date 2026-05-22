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

const RULE_PRIORITY: Record<string, number> = {
  config_link_vpn: 100,
  ssh_private_key_header: 95,
  aws_secret_key: 90,
  wireguard_private_key: 90,
  reality_public_key: 90,
  reality_short_id: 88,
  proxy_password: 87,
  proxy_username: 86,
  yaml_docker_secret: 85,
  uuid_vless_id: 80,
  db_password_in_url: 80,
  proxy_server_ip: 75,
};

function getEnd(finding: Pick<ScanFinding, 'index' | 'length'>): number {
  return finding.index + finding.length;
}

function compareFindings(a: ScanFinding, b: ScanFinding): number {
  if (a.index !== b.index) return a.index - b.index;
  if (a.length !== b.length) return b.length - a.length;
  return a.ruleId.localeCompare(b.ruleId);
}

function removeOverlaps(findings: ScanFinding[]): ScanFinding[] {
  const sorted = [...findings].sort((a, b) => {
    const aPri = RULE_PRIORITY[a.ruleId] ?? 0;
    const bPri = RULE_PRIORITY[b.ruleId] ?? 0;
    if (aPri !== bPri) return bPri - aPri;
    if (a.length !== b.length) return b.length - a.length;
    return a.index - b.index;
  });

  const resolved: ScanFinding[] = [];
  for (const current of sorted) {
    const end = getEnd(current);
    const hasOverlap = resolved.some(r => current.index < getEnd(r) && end > r.index);
    if (!hasOverlap) resolved.push(current);
  }

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
