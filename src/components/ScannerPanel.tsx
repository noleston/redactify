import { useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scan, Loader2, ShieldAlert, ChevronDown, TriangleAlert } from 'lucide-react';
import { useScanStore, type Finding, type RedactionStrategy } from '../store/useScanStore';
import { applyRedactionToText } from '../lib/applyRedaction';
import { CATEGORY_LABELS, type PiiCategory } from '../lib/piiRules';

// ─── Strategy option config ──────────────────────────────────────────────────
const STRATEGIES: { value: RedactionStrategy; label: string; preview: string }[] = [
  { value: 'blackout', label: 'Blackout', preview: '████' },
  { value: 'mask',     label: 'Mask',     preview: 'Jo***h' },
  { value: 'pseudonym',label: 'Tag',      preview: '[EMAIL-1]' },
];

// ─── Category badge colors ────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<PiiCategory, string> = {
  CONTACT:     'text-blue-400  bg-blue-400/10',
  FINANCIAL:   'text-amber-400 bg-amber-400/10',
  IDENTITY:    'text-red-400   bg-red-400/10',
  NETWORK:     'text-violet-400 bg-violet-400/10',
  CREDENTIALS: 'text-orange-400 bg-orange-400/10',
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface ScannerPanelProps {
  /** Callback to get the current raw text from the left Monaco editor */
  getEditorText: () => string;
  /**
   * Callback to apply text replacement via editor.executeEdits so that
   * undo history is preserved. Receives the new full text.
   */
  applyEdit: (newText: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ScannerPanel({ getEditorText, applyEdit }: ScannerPanelProps) {
  const {
    isScanning, findings, selectedIds, strategy, error,
    startScan, clearFindings,
    toggleSelection, selectAll, deselectAll,
    setStrategy,
  } = useScanStore();

  const strategyRef = useRef<HTMLSelectElement>(null);

  // ── Group findings by category ─────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<PiiCategory, Finding[]>();
    for (const f of findings) {
      const cat = f.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(f);
    }
    return map;
  }, [findings]);

  const hasFindings = findings.length > 0;
  const hasSelected = selectedIds.size > 0;
  const totalSelected = selectedIds.size;

  // ── Scan ───────────────────────────────────────────────────────────────────
  const handleScan = () => {
    const text = getEditorText();
    if (!text.trim()) return;
    startScan(text);
  };

  // ── Apply ──────────────────────────────────────────────────────────────────
  const handleApply = () => {
    if (!hasSelected) return;
    const rawText = getEditorText();
    const newText = applyRedactionToText(rawText, findings, selectedIds, strategy);
    applyEdit(newText);
    clearFindings();
  };

  // ── Group-level select/deselect ────────────────────────────────────────────
  const handleGroupToggle = (cat: PiiCategory) => {
    const ids = (grouped.get(cat) ?? []).map((f) => f.id);
    const allSelected = ids.every((id) => selectedIds.has(id));
    if (allSelected) deselectAll(ids);
    else selectAll(ids);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-l border-[#333] text-[#cccccc] font-sans select-none">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="h-6 bg-[#252526] px-3 flex items-center justify-between shrink-0">
        <span className="text-[9px] text-[#888] font-bold uppercase tracking-wider flex items-center gap-1.5">
          <ShieldAlert className="w-3 h-3" />
          PII Scanner
        </span>
        {hasFindings && (
          <button
            onClick={clearFindings}
            className="text-[9px] text-[#555] hover:text-[#aaa] uppercase tracking-wider transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Strategy selector ──────────────────────────────────────────────── */}
      <div className="px-3 pt-2.5 pb-2 shrink-0 border-b border-[#2a2a2a]">
        <div className="text-[9px] text-[#555] uppercase tracking-wider mb-1.5">Strategy</div>
        <div className="flex gap-1.5">
          {STRATEGIES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStrategy(s.value)}
              className={`flex-1 rounded px-1.5 py-1 text-[11px] transition-colors border ${
                strategy === s.value
                  ? 'border-[#e03131] bg-[#e03131]/10 text-white'
                  : 'border-[#333] text-[#666] hover:border-[#555] hover:text-[#aaa]'
              }`}
            >
              <div className="font-medium">{s.label}</div>
              <div className="text-[9px] opacity-60 font-mono mt-0.5 truncate">{s.preview}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Scan button ────────────────────────────────────────────────────── */}
      <div className="px-3 pt-2.5 pb-2 shrink-0">
        <button
          id="scanner-scan-btn"
          onClick={handleScan}
          disabled={isScanning}
          className="w-full flex items-center justify-center gap-1.5 h-7 rounded bg-[#e03131]/90 hover:bg-[#e03131] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-semibold tracking-wide transition-colors"
        >
          {isScanning ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <Scan className="w-3 h-3" />
              Scan for PII
            </>
          )}
        </button>
      </div>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2">

        {/* Error */}
        {error && (
          <div className="mx-1 mt-1 rounded px-2 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[11px]">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!isScanning && !hasFindings && !error && (
          <div className="flex flex-col items-center justify-center h-24 text-[#444] text-[11px] text-center px-4">
            <Scan className="w-5 h-5 mb-2 opacity-30" />
            Run scan to detect emails, phones, IDs and more
          </div>
        )}

        {/* Grouped findings */}
        <AnimatePresence initial={false}>
          {[...grouped.entries()].map(([cat, items]) => {
            const catIds = items.map((f) => f.id);
            const allSelected = catIds.every((id) => selectedIds.has(id));
            const someSelected = catIds.some((id) => selectedIds.has(id));

            return (
              <motion.div
                key={cat}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="mt-2"
              >
                {/* Category header */}
                <button
                  onClick={() => handleGroupToggle(cat)}
                  className="w-full flex items-center gap-1.5 px-1 py-0.5 rounded hover:bg-[#2a2a2a] transition-colors group"
                >
                  {/* Group checkbox */}
                  <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                    allSelected
                      ? 'bg-[#e03131] border-[#e03131]'
                      : someSelected
                      ? 'bg-[#e03131]/40 border-[#e03131]/60'
                      : 'border-[#444] group-hover:border-[#666]'
                  }`}>
                    {(allSelected || someSelected) && (
                      <svg className="w-2 h-2 text-white" viewBox="0 0 10 10" fill="none">
                        {allSelected
                          ? <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          : <path d="M2.5 5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        }
                      </svg>
                    )}
                  </div>

                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${CATEGORY_COLORS[cat]}`}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                  <span className="ml-auto text-[10px] text-[#555]">{items.length}</span>
                  <ChevronDown className="w-3 h-3 text-[#444]" />
                </button>

                {/* Items */}
                <div className="mt-0.5 space-y-px pl-1">
                  {items.map((finding) => (
                    <button
                      key={finding.id}
                      onClick={() => toggleSelection(finding.id)}
                      className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-[#2a2a2a] transition-colors text-left group"
                    >
                      {/* Item checkbox */}
                      <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                        selectedIds.has(finding.id)
                          ? 'bg-[#e03131] border-[#e03131]'
                          : 'border-[#444] group-hover:border-[#666]'
                      }`}>
                        {selectedIds.has(finding.id) && (
                          <svg className="w-1.5 h-1.5 text-white" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>

                      {/* Label + value */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] text-[#555] uppercase tracking-wider leading-none mb-0.5">
                          {finding.label}
                        </div>
                        <div className="text-[11px] text-[#ccc] font-mono truncate">
                          {finding.value}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {hasFindings && (
        <div className="shrink-0 px-3 py-2 border-t border-[#2a2a2a] space-y-2">
          {/* Apply button */}
          <button
            id="scanner-apply-btn"
            onClick={handleApply}
            disabled={!hasSelected}
            className="w-full flex items-center justify-center gap-1.5 h-7 rounded bg-[#e03131]/90 hover:bg-[#e03131] disabled:opacity-30 disabled:cursor-not-allowed text-white text-[11px] font-semibold tracking-wide transition-colors"
          >
            Apply {totalSelected > 0 ? `(${totalSelected})` : ''}
          </button>

          {/* Disclaimer */}
          <div className="flex gap-1.5 items-start text-[#555] text-[9px] leading-snug">
            <TriangleAlert className="w-3 h-3 shrink-0 mt-px text-[#444]" />
            <span>Scanner relies on strict patterns. Manual review of names and context is still required.</span>
          </div>
        </div>
      )}
    </div>
  );
}
