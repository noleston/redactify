import type { Finding, RedactionStrategy } from '../store/useScanStore';

type PseudoMap = Map<string, string>;

function getIndex(finding: Finding): number {
  return finding.index ?? finding.startOffset ?? 0;
}

function getLength(finding: Finding): number {
  return finding.length ?? Math.max(0, (finding.endOffset ?? 0) - (finding.startOffset ?? 0));
}

function getEnd(finding: Finding): number {
  return getIndex(finding) + getLength(finding);
}

function compareAscending(a: Finding, b: Finding): number {
  const aIndex = getIndex(a);
  const bIndex = getIndex(b);
  if (aIndex !== bIndex) return aIndex - bIndex;

  const aLength = getLength(a);
  const bLength = getLength(b);
  if (aLength !== bLength) return bLength - aLength;

  return (a.ruleId ?? a.label).localeCompare(b.ruleId ?? b.label);
}

function pickLongest(findings: Finding[]): Finding {
  return findings.reduce((best, current) => {
    const currentLength = getLength(current);
    const bestLength = getLength(best);
    if (currentLength !== bestLength) return currentLength > bestLength ? current : best;
    return compareAscending(current, best) < 0 ? current : best;
  });
}

function removeOverlaps(findings: Finding[]): Finding[] {
  const sorted = [...findings].sort(compareAscending);
  if (sorted.length === 0) return [];

  const resolved: Finding[] = [];
  let cluster: Finding[] = [sorted[0]];
  let clusterEnd = getEnd(sorted[0]);

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];

    if (getIndex(current) < clusterEnd) {
      cluster.push(current);
      clusterEnd = Math.max(clusterEnd, getEnd(current));
      continue;
    }

    resolved.push(pickLongest(cluster));
    cluster = [current];
    clusterEnd = getEnd(current);
  }

  resolved.push(pickLongest(cluster));
  return resolved.sort(compareAscending);
}

function maskValue(value: string): string {
  return value.replace(/[a-zA-Z0-9А-Яа-я]/gu, '*');
}

function pseudoLabel(finding: Finding): string {
  return finding.label
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

function buildPseudoMap(findings: Finding[], selectedIds: Set<string>): PseudoMap {
  const counters = new Map<string, number>();
  const pseudoMap: PseudoMap = new Map();
  const selected = removeOverlaps(findings.filter((finding) => selectedIds.has(finding.id)));

  for (const finding of selected) {
    const label = pseudoLabel(finding);
    const key = `${finding.ruleId ?? label}:${finding.value}`;

    if (pseudoMap.has(key)) continue;

    const count = (counters.get(label) ?? 0) + 1;
    counters.set(label, count);
    pseudoMap.set(key, `[${label}-${count}]`);
  }

  return pseudoMap;
}

function getReplacement(finding: Finding, strategy: RedactionStrategy, pseudoMap: PseudoMap): string {
  switch (strategy) {
    case 'blackout':
      return '█'.repeat(finding.value.length);
    case 'mask':
      return maskValue(finding.value);
    case 'pseudonym': {
      const label = pseudoLabel(finding);
      const key = `${finding.ruleId ?? label}:${finding.value}`;
      return pseudoMap.get(key) ?? `[${label}]`;
    }
  }
}

export function applyRedactionToText(
  text: string,
  findings: Finding[],
  selectedIds: Set<string>,
  strategy: RedactionStrategy
): string {
  const selected = removeOverlaps(findings.filter((finding) => selectedIds.has(finding.id)));
  if (selected.length === 0) return text;

  const pseudoMap = strategy === 'pseudonym' ? buildPseudoMap(findings, selectedIds) : new Map();
  const sorted = [...selected].sort((a, b) => getIndex(b) - getIndex(a));

  let result = text;
  for (const finding of sorted) {
    const index = getIndex(finding);
    const length = getLength(finding);
    const endIndex = index + length;

    if (index < 0 || length <= 0 || endIndex > result.length) continue;

    const replacement = getReplacement(finding, strategy, pseudoMap);
    result = result.slice(0, index) + replacement + result.slice(index + length);
  }

  return result;
}

export function applyEditToMonaco(editor: any, newText: string): void {
  if (!editor) return;

  const model = editor.getModel();
  if (!model) return;

  editor.executeEdits('pii-scanner', [
    {
      range: model.getFullModelRange(),
      text: newText,
      forceMoveMarkers: true,
    },
  ]);

  editor.focus();
}
