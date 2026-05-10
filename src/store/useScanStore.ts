import { create } from 'zustand';
import type { PiiCategory } from '../lib/piiRules';

export type RedactionStrategy = 'blackout' | 'mask' | 'pseudonym';

export interface Finding {
  id: string;
  ruleId?: string;
  label: string;
  category: PiiCategory;
  value: string;
  index: number;
  length: number;
  selected: boolean;
  startOffset?: number;
  endOffset?: number;
  score: number;
  debug: { reason: string; points: number }[];
}

interface ScanStore {
  // Scanner state
  isScanning: boolean;
  findings: Finding[];
  selectedIds: Set<string>;
  strategy: RedactionStrategy;
  error: string | null;

  // Worker ref (not persisted, held in store for convenience)
  _worker: Worker | null;

  // Actions
  startScan: (text: string) => void;
  cancelScan: () => void;
  clearFindings: () => void;
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  deselectAll: (ids: string[]) => void;
  setStrategy: (strategy: RedactionStrategy) => void;
}

export const useScanStore = create<ScanStore>((set, get) => ({
  isScanning: false,
  findings: [],
  selectedIds: new Set(),
  strategy: 'blackout',
  error: null,
  _worker: null,

  startScan: (text: string) => {
    // Terminate any previous worker
    get()._worker?.terminate();

    const worker = new Worker(
      new URL('../workers/scanner.worker.ts', import.meta.url),
      { type: 'module' }
    );

    set({ isScanning: true, findings: [], selectedIds: new Set(), error: null, _worker: worker });

    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'RESULT') {
        // Auto-select all findings by default
        const findings = (msg.findings as Finding[]).map((finding) => ({
          ...finding,
          selected: true,
        }));
        const allIds = new Set<string>(findings.map((f) => f.id));
        set({ isScanning: false, findings, selectedIds: allIds, _worker: null });
      } else if (msg.type === 'ERROR') {
        set({ isScanning: false, error: msg.message, _worker: null });
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      set({ isScanning: false, error: err.message, _worker: null });
      worker.terminate();
    };

    worker.postMessage({ type: 'SCAN', text });
  },

  cancelScan: () => {
    get()._worker?.terminate();
    set({ isScanning: false, _worker: null });
  },

  clearFindings: () => {
    set({ findings: [], selectedIds: new Set(), error: null });
  },

  toggleSelection: (id: string) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return {
        selectedIds: next,
        findings: state.findings.map((finding) =>
          finding.id === id ? { ...finding, selected: next.has(id) } : finding
        ),
      };
    });
  },

  selectAll: (ids: string[]) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      ids.forEach((id) => next.add(id));
      const idSet = new Set(ids);
      return {
        selectedIds: next,
        findings: state.findings.map((finding) =>
          idSet.has(finding.id) ? { ...finding, selected: true } : finding
        ),
      };
    });
  },

  deselectAll: (ids: string[]) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      ids.forEach((id) => next.delete(id));
      const idSet = new Set(ids);
      return {
        selectedIds: next,
        findings: state.findings.map((finding) =>
          idSet.has(finding.id) ? { ...finding, selected: false } : finding
        ),
      };
    });
  },

  setStrategy: (strategy: RedactionStrategy) => set({ strategy }),
}));
