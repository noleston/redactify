import { useRef, useEffect, useState, useCallback } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { useRedactionStore } from './store';
import { Check, Copy, Trash2, Eraser, Shield, Type, Settings, ScanLine } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import rLogo from './assets/r_logo.svg';
import ScannerPanel from './components/ScannerPanel';
import { useScanStore, type Finding } from './store/useScanStore';
import { applyEditToMonaco } from './lib/applyRedaction';


const getReplacementText = (originalText: string, replacementType: string, fixedLength: boolean, strictMasking: boolean) => {
  const parts = originalText.split(/(\r?\n)/);
  return parts.map((part: string) => {
    if (part.match(/\r?\n/)) return part;
    if (!part) return part;
    if (replacementType === 'blackout') {
      if (fixedLength) return '████████';
      if (strictMasking) return '█'.repeat(part.length);
      return part.replace(/[^\t ]/g, '█');
    } else if (replacementType === 'empty') {
      return '';
    } else if (replacementType === 'redacted') {
      if (fixedLength || strictMasking) return '[REDACTED]';
      return part.replace(/(\S+)/g, '[REDACTED]');
    }
    return part;
  }).join('');
};

const hasNonEmptySelection = (selections: any[] | null | undefined) =>
  !!selections?.some((selection: any) => !selection.isEmpty());

const comparePositions = (a: any, b: any) => {
  if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber;
  return a.column - b.column;
};

const snapSelectionToWords = (selection: any, model: any, monaco: any) => {
  if (!selection || selection.isEmpty()) return selection;

  const anchor = {
    lineNumber: selection.selectionStartLineNumber,
    column: selection.selectionStartColumn,
  };
  const active = {
    lineNumber: selection.positionLineNumber,
    column: selection.positionColumn,
  };
  const isForward = comparePositions(active, anchor) >= 0;
  const anchorWord = model.getWordAtPosition(anchor);
  const activeWord = model.getWordAtPosition(active);

  const snappedAnchorColumn = anchorWord
    ? (isForward ? anchorWord.startColumn : anchorWord.endColumn)
    : anchor.column;
  const snappedActiveColumn = activeWord
    ? (isForward ? activeWord.endColumn : activeWord.startColumn)
    : active.column;

  return new monaco.Selection(
    anchor.lineNumber,
    snappedAnchorColumn,
    active.lineNumber,
    snappedActiveColumn
  );
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const isMonacoFindWidgetVisible = () =>
  !!document.querySelector('.monaco-editor .find-widget.visible:not(.hiddenEditor)');

export default function App() {
  const monaco = useMonaco();
  const monacoRef = useRef<any>(null);
  useEffect(() => {
    if (monaco) {
      monacoRef.current = monaco;
    }
  }, [monaco]);

  const leftEditorRef = useRef<any>(null);
  const rightEditorRef = useRef<any>(null);
  const isSyncingLeft = useRef(false);
  const isSyncingRight = useRef(false);
  const isSelectingLeft = useRef(false);
  const isSelectingRight = useRef(false);
  const isSnappingSelection = useRef(false);
  const isUpdatingOutput = useRef(false);
  const copyResetTimer = useRef<number | null>(null);
  const smoothScrollRef = useRef<{
    frame: number | null;
    targetLeft: number;
    targetTop: number;
  }>({ frame: null, targetLeft: 0, targetTop: 0 });
  const scannerHighlightIdsRef = useRef<string[]>([]);
  const scannerHighlightTimerRef = useRef<number | null>(null);
  const { markers, addMarkers, clearMarkers, removeMarkers, fixedLength, strictMasking, setFixedLength, setStrictMasking, smartWordSnap, setSmartWordSnap } = useRedactionStore();
  const [toolbarBounds, setToolbarBounds] = useState<{ top: number, left: number } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [findWidgetOpen, setFindWidgetOpen] = useState(false);
  const findWidgetOpenRef = useRef(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const { clearFindings } = useScanStore();

  // ── Scanner callbacks ────────────────────────────────────────────────────
  const getEditorText = useCallback(() => {
    return leftEditorRef.current?.getValue() ?? '';
  }, []);

  const applyEdit = useCallback((newText: string) => {
    applyEditToMonaco(leftEditorRef.current, newText);
    window.setTimeout(updateOutput, 0);
  }, []);

  const focusScannerFinding = useCallback((finding: Finding) => {
    const editor = leftEditorRef.current;
    const model = editor?.getModel();
    const monacoApi = monacoRef.current;
    if (!editor || !model || !monacoApi) return;

    const startOffset = finding.startOffset ?? finding.index;
    const length = finding.length ?? Math.max(0, (finding.endOffset ?? 0) - startOffset);
    const endOffset = startOffset + length;

    if (startOffset < 0 || length <= 0 || endOffset > model.getValueLength()) return;

    const startPosition = model.getPositionAt(startOffset);
    const endPosition = model.getPositionAt(endOffset);
    const range = new monacoApi.Range(
      startPosition.lineNumber,
      startPosition.column,
      endPosition.lineNumber,
      endPosition.column
    );

    editor.setSelection(range);
    editor.revealRangeInCenter(range, monacoApi.editor.ScrollType.Smooth);
    editor.focus();

    if (scannerHighlightTimerRef.current !== null) {
      window.clearTimeout(scannerHighlightTimerRef.current);
      scannerHighlightTimerRef.current = null;
    }

    scannerHighlightIdsRef.current = editor.deltaDecorations(scannerHighlightIdsRef.current, [
      {
        range,
        options: {
          inlineClassName: 'scanner-finding-flash',
          stickiness: monacoApi.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ]);

    scannerHighlightTimerRef.current = window.setTimeout(() => {
      scannerHighlightIdsRef.current = editor.deltaDecorations(scannerHighlightIdsRef.current, []);
      scannerHighlightTimerRef.current = null;
    }, 1100);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };

    if (settingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [settingsOpen]);

  const setFindWidgetState = (open: boolean) => {
    if (findWidgetOpenRef.current === open) return;

    findWidgetOpenRef.current = open;
    setFindWidgetOpen(open);
    if (open) {
      setToolbarBounds(null);
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();
      const isFindOrReplace = key === 'f' || key === 'h' || key === 'а' || key === 'р';

      if (cmdOrCtrl && isFindOrReplace) {
        setFindWidgetState(true);
      } else if (event.key === 'Escape') {
        setFindWidgetState(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown, true);
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current);
      }
      if (scannerHighlightTimerRef.current !== null) {
        window.clearTimeout(scannerHighlightTimerRef.current);
      }
    };
  }, []);

  const handleEditorWillMount = (monaco: any) => {
    monaco.editor.defineTheme('redactify-dark-v4', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.selectionBackground': '#e03131',
        'editor.inactiveSelectionBackground': '#e0313188',
        'editor.selectionHighlightBackground': '#e0313188',
        'editor.wordHighlightBackground': '#e0313188',
        'editor.wordHighlightStrongBackground': '#e03131aa',
        'editor.findMatchBackground': '#e03131',
        'editor.findMatchHighlightBackground': '#e0313166',
        'editor.lineHighlightBackground': '#00000000',
        'editor.lineHighlightBorder': '#00000000',
        'focusBorder': '#e03131',
        'inputOption.activeBorder': '#e03131',
        'inputOption.activeBackground': '#e0313133',
        'inputOption.activeForeground': '#ffffff',
      }
    });

    monaco.editor.defineTheme('redactify-mono-v4', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.selectionBackground': '#e03131',
        'editor.inactiveSelectionBackground': '#e0313188',
        'editor.selectionHighlightBackground': '#e0313188',
        'editor.wordHighlightBackground': '#e0313188',
        'editor.wordHighlightStrongBackground': '#e03131aa',
        'editor.findMatchBackground': '#e03131',
        'editor.findMatchHighlightBackground': '#e0313166',
        'editor.lineHighlightBackground': '#00000000',
        'editor.lineHighlightBorder': '#00000000',
        'focusBorder': '#e03131',
        'inputOption.activeBorder': '#e03131',
        'inputOption.activeBackground': '#e0313133',
        'inputOption.activeForeground': '#ffffff',
      }
    });
  };
  const lastActionRef = useRef<'text' | 'redaction'>('text');
  const redactionHistoryRef = useRef<any[]>([]);

  const INITIAL_TEXT = "This is a strictly confidential document.\n\nPlease redact the details below:\nJohn Doe\nSecret Project X\n$5,000,000 funding round.\n\nYou can select multiple ranges and redact them all at once.";
  const [outputText, setOutputText] = useState(INITIAL_TEXT);

  const actionsRef = useRef<any>({});
  useEffect(() => {
    actionsRef.current = { applyRedaction, handleUndoRedaction };
  });

  const getRedactionDetails = (leftModel: any) => {
    const existingMarkers = useRedactionStore.getState().markers;
    const { fixedLength, strictMasking } = useRedactionStore.getState();

    return existingMarkers.map(m => {
      const range = leftModel.getDecorationRange(m.id);
      if (!range || range.isEmpty()) return null;

      const originalText = leftModel.getValueInRange(range);
      const dynamicReplacement = getReplacementText(originalText, m.replacementType, fixedLength, strictMasking);

      return {
        startOffset: leftModel.getOffsetAt(range.getStartPosition()),
        endOffset: leftModel.getOffsetAt(range.getEndPosition()),
        repl: dynamicReplacement
      };
    }).filter((m: any) => m !== null)
      .sort((a: any, b: any) => a.startOffset - b.startOffset);
  };

  const installSmoothWheelScroll = (editor: any) => {
    const domNode = editor.getDomNode();
    if (!domNode) return;

    const FAST_SCROLL_MULTIPLIER = 4;

    const normalizeWheelDelta = (event: WheelEvent) => {
      const lineHeight = monacoRef.current
        ? editor.getOption?.(monacoRef.current.editor.EditorOption.lineHeight)
        : 18;
      const pageHeight = editor.getLayoutInfo?.().height || 600;
      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? lineHeight
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? pageHeight
          : 1;
      const speed = event.altKey ? FAST_SCROLL_MULTIPLIER : 1;

      return {
        x: event.deltaX * multiplier * speed,
        y: event.deltaY * multiplier * speed,
      };
    };

    const animate = () => {
      const target = smoothScrollRef.current;
      const currentTop = editor.getScrollTop();
      const currentLeft = editor.getScrollLeft();
      const nextTop = currentTop + (target.targetTop - currentTop) * 0.28;
      const nextLeft = currentLeft + (target.targetLeft - currentLeft) * 0.28;

      if (Math.abs(target.targetTop - currentTop) < 0.5 && Math.abs(target.targetLeft - currentLeft) < 0.5) {
        editor.setScrollPosition({ scrollTop: target.targetTop, scrollLeft: target.targetLeft });
        target.frame = null;
        return;
      }

      editor.setScrollPosition({ scrollTop: nextTop, scrollLeft: nextLeft });
      target.frame = window.requestAnimationFrame(animate);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;

      event.preventDefault();
      const { x, y } = normalizeWheelDelta(event);
      const layout = editor.getLayoutInfo();
      const maxTop = Math.max(0, editor.getScrollHeight() - layout.height);
      const maxLeft = Math.max(0, editor.getScrollWidth() - layout.width);
      const target = smoothScrollRef.current;

      target.targetTop = clamp(
        target.frame === null ? editor.getScrollTop() + y : target.targetTop + y,
        0,
        maxTop
      );
      target.targetLeft = clamp(
        target.frame === null ? editor.getScrollLeft() + x : target.targetLeft + x,
        0,
        maxLeft
      );

      if (target.frame === null) {
        target.frame = window.requestAnimationFrame(animate);
      }
    };

    domNode.addEventListener('wheel', onWheel, { passive: false, capture: true });
  };

  const installFindWidgetObserver = (editor: any) => {
    const domNode = editor.getDomNode();
    if (!domNode) return;

    const hoverArtifactSelectors = [
      '.monaco-hover',
      '.monaco-hover-content',
      '.monaco-tooltip',
      '.monaco-editor-hover',
      '.hover-widget',
      '.workbench-hover-container',
      '.workbench-hover-pointer',
    ].join(',');

    const removeMonacoHoverArtifacts = () => {
      document.querySelectorAll(hoverArtifactSelectors).forEach((artifact) => {
        if ((window as any).__redactifyDebugMonacoHover) {
          console.debug('[redactify] removed Monaco hover artifact', artifact);
        }
        artifact.remove();
      });
    };

    const stripFindWidgetTooltips = () => {
      domNode.querySelectorAll('.find-widget [title], .find-widget [data-tooltip]').forEach((node) => {
        node.removeAttribute('title');
        node.removeAttribute('data-tooltip');
      });
    };

    const blurFocusedFindWidgetInput = () => {
      const activeElement = document.activeElement as HTMLElement | null;
      const activeWidget = activeElement?.closest?.('.find-widget');
      if (!activeElement || !activeWidget || !domNode.contains(activeWidget)) return;

      activeElement.blur();
      editor.focus();
    };

    const positionFindWidget = () => {
      const widget = domNode.querySelector('.find-widget.visible:not(.hiddenEditor)') as HTMLElement | null;
      if (!widget) return;

      const layout = editor.getLayoutInfo();
      const top = Math.max(12, layout.height - widget.offsetHeight - 12);
      widget.style.top = `${top}px`;
      widget.style.left = '12px';
      widget.style.right = 'auto';
      widget.style.transform = 'translateY(0)';
    };

    const resetHiddenFindWidgets = () => {
      const widgets = domNode.querySelectorAll('.find-widget:not(.visible), .find-widget.hiddenEditor');
      widgets.forEach((widget) => {
        if (widget.contains(document.activeElement)) {
          blurFocusedFindWidgetInput();
        }
        const element = widget as HTMLElement;
        element.style.removeProperty('top');
        element.style.removeProperty('left');
        element.style.removeProperty('right');
        element.style.removeProperty('transform');
      });
    };

    const syncFindWidgetState = () => {
      const visible = !!domNode.querySelector('.find-widget.visible:not(.hiddenEditor)');
      setFindWidgetState(visible);
      stripFindWidgetTooltips();
      removeMonacoHoverArtifacts();
      if (visible) {
        window.requestAnimationFrame(positionFindWidget);
      } else {
        blurFocusedFindWidgetInput();
        resetHiddenFindWidgets();
      }
    };

    const observer = new MutationObserver(syncFindWidgetState);
    observer.observe(domNode, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
      subtree: true,
    });

    const bodyObserver = new MutationObserver(removeMonacoHoverArtifacts);
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const suppressHoverArtifacts = () => {
      stripFindWidgetTooltips();
      window.requestAnimationFrame(removeMonacoHoverArtifacts);
    };

    const handleFindWidgetPointerDown = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('.find-widget .codicon-widget-close')) {
        blurFocusedFindWidgetInput();
      }
    };

    const handleFindWidgetKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        blurFocusedFindWidgetInput();
      }
    };

    domNode.addEventListener('mouseenter', suppressHoverArtifacts, true);
    domNode.addEventListener('mouseover', suppressHoverArtifacts, true);
    domNode.addEventListener('focusin', suppressHoverArtifacts, true);
    domNode.addEventListener('pointerdown', handleFindWidgetPointerDown, true);
    domNode.addEventListener('keydown', handleFindWidgetKeyDown, true);
    syncFindWidgetState();
  };

  const mapLeftOffsetToRight = (offset: number, details: any[]) => {
    let rightOffset = offset;
    for (const marker of details) {
      if (offset <= marker.startOffset) break;
      if (offset >= marker.endOffset) {
        rightOffset += marker.repl.length - (marker.endOffset - marker.startOffset);
      } else {
        const ratio = (offset - marker.startOffset) / (marker.endOffset - marker.startOffset);
        rightOffset += Math.floor(ratio * marker.repl.length) - (offset - marker.startOffset);
      }
    }
    return rightOffset;
  };

  const mapRightOffsetToLeft = (rightOffset: number, details: any[], leftModel: any) => {
    let leftOffset = rightOffset;
    for (const marker of details) {
      const rightStart = mapLeftOffsetToRight(marker.startOffset, details);
      const rightEnd = rightStart + marker.repl.length;

      if (rightOffset <= rightStart) break;
      if (rightOffset >= rightEnd) {
        leftOffset -= marker.repl.length - (marker.endOffset - marker.startOffset);
      } else {
        const ratio = marker.repl.length === 0 ? 0 : (rightOffset - rightStart) / marker.repl.length;
        leftOffset -= Math.floor(ratio * marker.repl.length) - Math.floor(ratio * (marker.endOffset - marker.startOffset));
      }
    }
    return Math.max(0, Math.min(leftModel.getValueLength(), leftOffset));
  };

  const snapMouseSelections = (editor: any) => {
    const { smartWordSnap } = useRedactionStore.getState();
    const model = editor.getModel();
    const selections = editor.getSelections();
    if (isSnappingSelection.current || !smartWordSnap || !model || !monacoRef.current || !selections) {
      return false;
    }

    let didSnap = false;
    const snappedSelections = selections.map((selection: any) => {
      const snappedSelection = snapSelectionToWords(selection, model, monacoRef.current);
      if (!snappedSelection.equalsSelection(selection)) didSnap = true;
      return snappedSelection;
    });

    if (!didSnap) return false;

    isSnappingSelection.current = true;
    try {
      editor.setSelections(snappedSelections);
    } finally {
      isSnappingSelection.current = false;
    }
    return true;
  };

  const syncLeftSelectionsToRight = (source: string) => {
    const leftEditor = leftEditorRef.current;
    const rightEditor = rightEditorRef.current;
    if (!leftEditor || !rightEditor || !monacoRef.current) return;

    const leftModel = leftEditor.getModel();
    const rightModel = rightEditor.getModel();
    const selections = leftEditor.getSelections();
    if (!leftModel || !rightModel || !selections) return;

    const details = getRedactionDetails(leftModel);
    const mappedSelections = selections.map((selection: any) => {
      const anchorOffset = leftModel.getOffsetAt({
        lineNumber: selection.selectionStartLineNumber,
        column: selection.selectionStartColumn
      });
      const activeOffset = leftModel.getOffsetAt({
        lineNumber: selection.positionLineNumber,
        column: selection.positionColumn
      });
      const rightAnchorPos = rightModel.getPositionAt(mapLeftOffsetToRight(anchorOffset, details));
      const rightActivePos = rightModel.getPositionAt(mapLeftOffsetToRight(activeOffset, details));

      return new monacoRef.current.Selection(
        rightAnchorPos.lineNumber,
        rightAnchorPos.column,
        rightActivePos.lineNumber,
        rightActivePos.column
      );
    });

    isSelectingLeft.current = true;
    try {
      rightEditor.setSelections(mappedSelections);
      if (source === 'mouse' && mappedSelections.length > 0) {
        rightEditor.revealRangeInCenterIfOutsideViewport(
          mappedSelections[mappedSelections.length - 1],
          monacoRef.current.ScrollType.Smooth
        );
      }
    } finally {
      isSelectingLeft.current = false;
    }
  };

  const syncRightSelectionsToLeft = (source: string) => {
    const leftEditor = leftEditorRef.current;
    const rightEditor = rightEditorRef.current;
    if (!leftEditor || !rightEditor || !monacoRef.current) return;

    const leftModel = leftEditor.getModel();
    const rightModel = rightEditor.getModel();
    const selections = rightEditor.getSelections();
    if (!leftModel || !rightModel || !selections) return;

    const details = getRedactionDetails(leftModel);
    const mappedSelections = selections.map((selection: any) => {
      const anchorOffset = rightModel.getOffsetAt({
        lineNumber: selection.selectionStartLineNumber,
        column: selection.selectionStartColumn
      });
      const activeOffset = rightModel.getOffsetAt({
        lineNumber: selection.positionLineNumber,
        column: selection.positionColumn
      });
      const leftAnchorPos = leftModel.getPositionAt(mapRightOffsetToLeft(anchorOffset, details, leftModel));
      const leftActivePos = leftModel.getPositionAt(mapRightOffsetToLeft(activeOffset, details, leftModel));

      return new monacoRef.current.Selection(
        leftAnchorPos.lineNumber,
        leftAnchorPos.column,
        leftActivePos.lineNumber,
        leftActivePos.column
      );
    });

    isSelectingRight.current = true;
    try {
      leftEditor.setSelections(mappedSelections);
      if (source === 'mouse' && mappedSelections.length > 0) {
        leftEditor.revealRangeInCenterIfOutsideViewport(
          mappedSelections[mappedSelections.length - 1],
          monacoRef.current.ScrollType.Smooth
        );
      }
    } finally {
      isSelectingRight.current = false;
    }
  };

  const handleEditorDidMount = (editor: any) => {
    leftEditorRef.current = editor;
    installSmoothWheelScroll(editor);
    installFindWidgetObserver(editor);

    editor.onDidChangeModelContent(() => {
      lastActionRef.current = 'text';
      redactionHistoryRef.current = [];
      const model = editor.getModel();
      if (model) {
        const existingMarkers = useRedactionStore.getState().markers;
        const emptyIds = existingMarkers.filter(m => {
          const r = model.getDecorationRange(m.id);
          return !r || r.isEmpty();
        }).map(m => m.id);

        if (emptyIds.length > 0) {
          useRedactionStore.getState().removeMarkers(emptyIds);
        }
      }
      updateOutput();
    });

    editor.onKeyDown((e: any) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.browserEvent.metaKey : e.browserEvent.ctrlKey;

      const isZ = e.browserEvent.code === 'KeyZ' || e.browserEvent.key.toLowerCase() === 'z' || e.browserEvent.key.toLowerCase() === 'я';
      const isF = e.browserEvent.code === 'KeyF' || e.browserEvent.key.toLowerCase() === 'f' || e.browserEvent.key.toLowerCase() === 'а';
      const isH = e.browserEvent.code === 'KeyH' || e.browserEvent.key.toLowerCase() === 'h' || e.browserEvent.key.toLowerCase() === 'р';
      const isB = e.browserEvent.code === 'KeyB' || e.browserEvent.key.toLowerCase() === 'b' || e.browserEvent.key.toLowerCase() === 'и';
      const isEscape = e.browserEvent.code === 'Escape' || e.browserEvent.key === 'Escape';
      const isBackspace = e.browserEvent.code === 'Backspace' || e.browserEvent.key === 'Backspace';

      if (cmdOrCtrl && (isF || isH)) {
        setFindWidgetState(true);
      } else if (isEscape) {
        setFindWidgetState(false);
      }

      if (cmdOrCtrl && !e.browserEvent.shiftKey) {
        if (isZ) {
          if (lastActionRef.current === 'redaction') {
            e.preventDefault(); e.stopPropagation();
            actionsRef.current.handleUndoRedaction();
          }
        } else if (isB) {
          e.preventDefault(); e.stopPropagation();
          actionsRef.current.applyRedaction('blackout', '██████');
        } else if (isBackspace) {
          e.preventDefault(); e.stopPropagation();
          actionsRef.current.applyRedaction('empty', '');
        }
      }
    });

    editor.onDidScrollChange((e: any) => {
      if (!isSyncingLeft.current && rightEditorRef.current) {
        isSyncingRight.current = true;
        rightEditorRef.current.setScrollPosition({
          scrollTop: e.scrollTop,
          scrollLeft: e.scrollLeft
        });
      }
      isSyncingLeft.current = false;
    });

    editor.onMouseUp((e: any) => {
      if (isMonacoFindWidgetVisible()) {
        setFindWidgetState(true);
        return;
      }
      setFindWidgetState(false);

      const selections = editor.getSelections();

      if (hasNonEmptySelection(selections)) {
        if (e.event && e.event.browserEvent) {
          setToolbarBounds({
            top: Math.max(10, e.event.browserEvent.clientY - 45),
            left: Math.max(10, e.event.browserEvent.clientX - 40)
          });
        }
      } else {
        setToolbarBounds(null);
      }
    });

    editor.onDidChangeCursorSelection((e: any) => {
      if (findWidgetOpenRef.current || isMonacoFindWidgetVisible()) {
        setFindWidgetState(true);
        return;
      }

      const sel = e.selection;
      if (!sel) return;

      if (e.source === 'mouse' && snapMouseSelections(editor)) {
        if (!isSelectingRight.current) {
          syncLeftSelectionsToRight(e.source);
        }
        return;
      }

      if (!hasNonEmptySelection(editor.getSelections())) {
        setToolbarBounds(null);
      } else {
        if (e.source !== 'mouse') {
          const endPos = sel.getEndPosition();
          const scrolledVisiblePosition = editor.getScrolledVisiblePosition(endPos);
          if (scrolledVisiblePosition) {
            const editorDomNode = editor.getDomNode();
            const rect = editorDomNode.getBoundingClientRect();
            setToolbarBounds({
              top: Math.max(10, rect.top + scrolledVisiblePosition.top - 45),
              left: Math.max(10, rect.left + scrolledVisiblePosition.left - 40)
            });
          }
        }
      }

      if (isSelectingRight.current) return;

      syncLeftSelectionsToRight(e.source);
    });

    updateOutput();
  };


  const handleRightEditorDidMount = (editor: any) => {
    rightEditorRef.current = editor;
    installSmoothWheelScroll(editor);
    installFindWidgetObserver(editor);

    editor.onDidChangeModelContent(() => {
      isUpdatingOutput.current = true;
      window.setTimeout(() => {
        isUpdatingOutput.current = false;
      }, 0);
    });

    editor.onDidScrollChange((e: any) => {
      if (isUpdatingOutput.current) return;

      if (!isSyncingRight.current && leftEditorRef.current) {
        isSyncingLeft.current = true;
        leftEditorRef.current.setScrollPosition({
          scrollTop: e.scrollTop,
          scrollLeft: e.scrollLeft
        });
      }
      isSyncingRight.current = false;
    });

    editor.onDidChangeCursorSelection((e: any) => {
      if (isSelectingLeft.current || isUpdatingOutput.current) return;

      const sel = e.selection;
      if (!sel) return;

      if (e.source !== 'mouse' && e.source !== 'keyboard') return;

      if (e.source === 'mouse' && snapMouseSelections(editor)) {
        syncRightSelectionsToLeft(e.source);
        return;
      }

      syncRightSelectionsToLeft(e.source);
    });
  };

  const updateOutput = () => {
    if (!leftEditorRef.current) return;
    const model = leftEditorRef.current.getModel();
    if (!model) return;

    const currentMarkers = useRedactionStore.getState().markers;
    const { fixedLength, strictMasking } = useRedactionStore.getState();

    let textDetails = currentMarkers.map(m => {
      const range = model.getDecorationRange(m.id);
      return { range, replacement: m.replacement, replacementType: m.replacementType, id: m.id };
    }).filter(m => m.range && !m.range.isEmpty());

    textDetails.sort((a, b) => {
      if (a.range.startLineNumber !== b.range.startLineNumber) {
        return b.range.startLineNumber - a.range.startLineNumber; // from bottom
      }
      return b.range.startColumn - a.range.startColumn; // from right
    });

    let newFullText = model.getValue();
    textDetails.forEach(mod => {
      if (!mod.range) return;
      const originalText = model.getValueInRange(mod.range);
      let dynamicReplacement = getReplacementText(originalText, mod.replacementType, fixedLength, strictMasking);

      const startOffset = model.getOffsetAt({ lineNumber: mod.range.startLineNumber, column: mod.range.startColumn });
      const endOffset = model.getOffsetAt({ lineNumber: mod.range.endLineNumber, column: mod.range.endColumn });
      newFullText = newFullText.substring(0, startOffset) + dynamicReplacement + newFullText.substring(endOffset);
    });

    isUpdatingOutput.current = true;
    setOutputText(newFullText);
    window.setTimeout(() => {
      isUpdatingOutput.current = false;
    }, 0);
  };

  const handleUndoRedaction = () => {
    if (lastActionRef.current !== 'redaction' || redactionHistoryRef.current.length === 0) return false;

    const lastOp = redactionHistoryRef.current.pop();
    if (!lastOp || !leftEditorRef.current) return false;

    const editor = leftEditorRef.current;

    if (lastOp.addedIds.length > 0) {
      editor.deltaDecorations(lastOp.addedIds, []);
      useRedactionStore.getState().removeMarkers(lastOp.addedIds);
    }

    if (lastOp.removedMarkers.length > 0) {
      const decsToAdd = lastOp.removedMarkers.map((rm: any) => {
        const className =
          rm.marker.replacementType === 'blackout' ? 'bg-[#264f78] border border-[#3794ff] px-0.5' :
            rm.marker.replacementType === 'empty' ? 'bg-[#333] text-[#555] line-through px-0.5' :
              'bg-[#264f78] border border-[#3794ff] px-0.5';

        return {
          range: rm.range,
          options: {
            inlineClassName: className,
            stickiness: monacoRef.current?.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          }
        };
      });

      const reAddedIds = editor.deltaDecorations([], decsToAdd);
      const newResolvedMarkers = reAddedIds.map((id: string, index: number) => ({
        id,
        replacementType: lastOp.removedMarkers[index].marker.replacementType,
        replacement: lastOp.removedMarkers[index].marker.replacement,
      }));
      useRedactionStore.getState().addMarkers(newResolvedMarkers);
    }

    if (redactionHistoryRef.current.length === 0) {
      lastActionRef.current = 'text';
    }

    setTimeout(updateOutput, 0);
    return true;
  };

  useEffect(() => {
    updateOutput();
  }, [markers, fixedLength, strictMasking]);

  const applyRedaction = (replacementType: 'blackout' | 'redacted' | 'empty' | 'custom', replacement: string) => {
    if (!leftEditorRef.current || !monacoRef.current) return;
    const editor = leftEditorRef.current;
    const model = editor.getModel();
    if (!model) return;

    let selections = editor.getSelections();
    if (!selections || selections.length === 0) return;

    selections = selections.filter((s: any) => !s.isEmpty());
    if (selections.length === 0) return;

    const existingMarkers = useRedactionStore.getState().markers;
    let markersToRemove: string[] = [];
    let rangesToAdd: any[] = [];
    let removedMarkersData: any[] = [];

    let currentIntervals = existingMarkers.map(m => {
      const range = model.getDecorationRange(m.id);
      const markerObj = existingMarkers.find(x => x.id === m.id);
      return {
        id: m.id,
        startOffset: range ? model.getOffsetAt(range.getStartPosition()) : 0,
        endOffset: range ? model.getOffsetAt(range.getEndPosition()) : 0,
        type: markerObj?.replacementType
      };
    }).filter(m => m.startOffset !== m.endOffset); // non-empty

    selections.forEach((sel: any) => {
      let selStart = model.getOffsetAt(sel.getStartPosition());
      let selEnd = model.getOffsetAt(sel.getEndPosition());

      const exactMatchIndex = currentIntervals.findIndex(m => m.startOffset === selStart && m.endOffset === selEnd && m.type === replacementType);

      if (exactMatchIndex !== -1) {
        const m = currentIntervals[exactMatchIndex];
        markersToRemove.push(m.id);
        const markerObj = existingMarkers.find(x => x.id === m.id);
        const markerRange = model.getDecorationRange(m.id);
        if (markerObj && markerRange) removedMarkersData.push({ marker: markerObj, range: markerRange });
        currentIntervals.splice(exactMatchIndex, 1);
      } else {
        let i = 0;
        while (i < currentIntervals.length) {
          let m = currentIntervals[i];

          if (Math.max(selStart, m.startOffset) <= Math.min(selEnd, m.endOffset)) {
            selStart = Math.min(selStart, m.startOffset);
            selEnd = Math.max(selEnd, m.endOffset);
            markersToRemove.push(m.id);

            const markerObj = existingMarkers.find(x => x.id === m.id);
            const markerRange = model.getDecorationRange(m.id);
            if (markerObj && markerRange) {
              removedMarkersData.push({ marker: markerObj, range: markerRange });
            }

            currentIntervals.splice(i, 1);
          } else {
            i++;
          }
        }

        rangesToAdd.push(monacoRef.current.Range.fromPositions(
          model.getPositionAt(selStart),
          model.getPositionAt(selEnd)
        ));
      }
    });

    if (markersToRemove.length === 0 && rangesToAdd.length === 0) return;

    const className =
      replacementType === 'blackout' ? 'bg-[#264f78] border border-[#3794ff] px-0.5' :
        replacementType === 'empty' ? 'bg-[#333] text-[#555] line-through px-0.5' :
          'bg-[#264f78] border border-[#3794ff] px-0.5';

    const newDecs = rangesToAdd.map((range: any) => ({
      range: range,
      options: {
        inlineClassName: className,
        stickiness: monacoRef.current.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      }
    }));

    const addedIds = editor.deltaDecorations(markersToRemove, newDecs);

    if (markersToRemove.length > 0) {
      useRedactionStore.getState().removeMarkers(markersToRemove);
    }

    const newMarkers = addedIds.map((id: string) => ({
      id,
      replacementType,
      replacement
    }));

    useRedactionStore.getState().addMarkers(newMarkers);

    redactionHistoryRef.current.push({
      addedIds: newMarkers.map(m => m.id),
      removedMarkers: removedMarkersData
    });
    lastActionRef.current = 'redaction';
  };

  const handleClear = () => {
    if (markers.length === 0) return;
    setClearConfirmOpen(true);
  };

  const confirmClear = () => {
    if (leftEditorRef.current) {
      leftEditorRef.current.deltaDecorations(markers.map(m => m.id), []);
    }
    clearMarkers();
    setToolbarBounds(null);
    setClearConfirmOpen(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(outputText);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }

    if (copyResetTimer.current !== null) {
      window.clearTimeout(copyResetTimer.current);
    }
    copyResetTimer.current = window.setTimeout(() => {
      setCopyState('idle');
      copyResetTimer.current = null;
    }, 1400);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#1e1e1e] text-[#cccccc] overflow-hidden font-sans border-[#333] relative">
      <AnimatePresence>
        {toolbarBounds && !findWidgetOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ top: toolbarBounds.top, left: toolbarBounds.left }}
            className="absolute z-50 flex items-center bg-[#2d2d2d]/95 backdrop-blur-sm border border-[#444] shadow-xl rounded-md p-0.5 gap-0.5"
          >
            <button title="Blackout (Ctrl+B)" onClick={() => applyRedaction('blackout', '██████')} className="p-1.5 hover:bg-[#444] transition-colors rounded text-[#ccc] flex items-center justify-center relative group">
              <div className="w-3.5 h-3.5 bg-current rounded-sm"></div>
            </button>
            <div className="w-px h-4 bg-[#555] mx-0.5"></div>
            <button title="Redacted" onClick={() => applyRedaction('redacted', '[REDACTED]')} className="p-1.5 hover:bg-[#444] transition-colors rounded text-[#ccc] flex items-center justify-center">
              <Type className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-[#555] mx-0.5"></div>
            <button title="Delete (Ctrl+Backspace)" onClick={() => applyRedaction('empty', '')} className="p-1.5 text-red-400 hover:bg-[#444] hover:text-red-300 transition-colors rounded flex items-center justify-center">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {clearConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40"
          >
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.1 } }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              className="w-[400px] rounded-md border border-[#454545] bg-[#252526] shadow-xl font-sans"
            >
              <div className="px-5 py-4">
                <div className="text-[13px] text-[#cccccc] mb-1.5">
                  Are you sure you want to clear all redactions?
                </div>
                <div className="text-[12px] text-[#888888] mb-4">
                  This will remove every redaction marker from the editable document. This action cannot be undone.
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={confirmClear}
                    className="h-[26px] rounded-sm bg-[#e03131] px-4 text-[12px] text-white transition-none hover:bg-[#c92a2a]"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={() => setClearConfirmOpen(false)}
                    className="h-[26px] rounded-sm bg-[#3a3d41] px-4 text-[12px] text-white transition-none hover:bg-[#4a4d51]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="h-10 bg-[#252526] flex items-center justify-between px-4 shrink-0">
        <h1 className="flex items-center">
          <img src={rLogo} alt="Redactify Logo" className="h-[24px] opacity-100" />
        </h1>
      </header>

      <motion.main
        className="grid flex-1 overflow-hidden bg-[#1e1e1e]"
        initial={false}
        animate={{
          gridTemplateColumns: scannerOpen
            ? 'minmax(0, 1fr) minmax(0, 1fr) 220px'
            : 'minmax(0, 1fr) minmax(0, 1fr) 0px',
        }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex min-w-0 flex-col overflow-hidden">
          <div className="h-6 bg-[#252526] px-3 flex items-center justify-between z-10 shrink-0">
            <span className="text-[9px] text-[#888] font-bold uppercase tracking-wider">
              Input <span className="opacity-50">editable</span>
            </span>
            <span className="text-[9px] text-[#555] font-mono uppercase">Alt/Cmd + Click for multiple</span>
          </div>
          <div className="flex-1 w-full overflow-hidden">
            <Editor
              theme="redactify-dark-v4"
              defaultLanguage="plaintext"
              defaultValue={INITIAL_TEXT}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              options={{
                minimap: { enabled: false },
                find: { addExtraSpaceOnTop: false },
                hover: { delay: 2000 },
                wordWrap: 'on',
                scrollOnMiddleClick: false,
                multiCursorModifier: 'alt',
                lineNumbersMinChars: 3,
                renderInactiveSelections: true,
                selectionHighlight: true,
                renderLineHighlight: 'none',
                hideCursorInOverviewRuler: true,
                overviewRulerLanes: 0,
                overviewRulerBorder: false,
                fontSize: 14,
                smoothScrolling: true,
                unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false, nonBasicASCII: false },
                occurrencesHighlight: 'off',
                renderValidationDecorations: 'off',
                scrollbar: {
                  useShadows: false,
                },
              }}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col bg-[#191919] overflow-hidden">
          <div className="h-6 bg-[#252526] px-3 flex items-center justify-between z-10 shrink-0 relative">
            <span className="text-[9px] text-[#888] font-bold uppercase tracking-wider">
              Output <span className="opacity-30">read-only</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                id="scanner-toggle-btn"
                onClick={() => { setScannerOpen((o) => !o); if (scannerOpen) clearFindings(); }}
                className={`relative flex h-5 items-center overflow-hidden text-[9px] font-bold uppercase tracking-wider transition-colors ${
                  scannerOpen ? 'text-[#e03131]' : 'text-[#aaa] hover:text-[#fff]'
                }`}
              >
                <ScanLine className="w-3 h-3 mr-1" />
                Scan
              </button>
              <button
                onClick={handleClear}
                disabled={markers.length === 0}
                className="relative flex h-5 items-center overflow-hidden text-[9px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-[#aaa] hover:text-[#fff]"
              >
                <Eraser className="w-3 h-3 mr-1" />
                Clear all
              </button>

              <button
                onClick={handleCopy}
                className={`relative flex h-5 items-center justify-center overflow-hidden text-[9px] font-bold uppercase tracking-wider transition-colors ${copyState === 'copied'
                  ? 'text-emerald-300'
                  : copyState === 'error'
                    ? 'text-red-300'
                    : 'text-[#aaa] hover:text-[#fff]'
                  }`}
              >
                <span className="invisible flex items-center gap-1 pointer-events-none">
                  <Check className="w-3 h-3" />
                  Copied
                </span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={copyState}
                    initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="absolute inset-0 flex items-center justify-center gap-1"
                  >
                    {copyState === 'copied' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Failed' : 'Copy'}
                  </motion.span>
                </AnimatePresence>
              </button>

              <div className="relative flex items-center" ref={settingsRef}>
                <button
                  title="Settings"
                  onClick={() => setSettingsOpen((open) => !open)}
                  className={`relative flex h-5 items-center overflow-hidden text-[9px] font-bold uppercase tracking-wider transition-colors ${settingsOpen ? 'text-[#fff]' : 'text-[#aaa] hover:text-[#fff]'
                    }`}
                >
                  <Settings className="w-3 h-3 mr-1" />
                  Settings
                </button>
                <AnimatePresence>
                  {settingsOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.1 } }}
                      transition={{ duration: 0.1, ease: "easeOut" }}
                      className="absolute right-0 top-6 mt-1 z-50 w-44 rounded-md border border-[#454545] bg-[#252526] shadow-xl flex flex-col font-sans overflow-hidden"
                    >
                      <button
                        onClick={() => setSmartWordSnap(!smartWordSnap)}
                        className="flex items-center w-full px-2 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#e03131] hover:text-white transition-none text-left"
                      >
                        <div className="w-5 flex justify-center shrink-0 mr-1.5">
                          {smartWordSnap && <Check className="w-3.5 h-3.5" />}
                        </div>
                        Smart Word Snap
                      </button>
                      <button
                        onClick={() => setFixedLength(!fixedLength)}
                        className="flex items-center w-full px-2 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#e03131] hover:text-white transition-none text-left"
                      >
                        <div className="w-5 flex justify-center shrink-0 mr-1.5">
                          {fixedLength && <Check className="w-3.5 h-3.5" />}
                        </div>
                        Fixed Length
                      </button>
                      <button
                        onClick={() => setStrictMasking(!strictMasking)}
                        className="flex items-center w-full px-2 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#e03131] hover:text-white transition-none text-left"
                      >
                        <div className="w-5 flex justify-center shrink-0 mr-1.5">
                          {strictMasking && <Check className="w-3.5 h-3.5" />}
                        </div>
                        Strict Masking
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <div className="flex-1 w-full overflow-hidden">
            <Editor
              theme="redactify-mono-v4"
              defaultLanguage="plaintext"
              value={outputText}
              beforeMount={handleEditorWillMount}
              onMount={handleRightEditorDidMount}
              options={{
                readOnly: true,
                renderInactiveSelections: true,
                selectionHighlight: true,
                renderLineHighlight: 'none',
                minimap: { enabled: false },
                find: { addExtraSpaceOnTop: false },
                hover: { delay: 2000 },
                wordWrap: 'on',
                scrollOnMiddleClick: false,
                multiCursorModifier: 'alt',
                scrollbar: {
                  vertical: 'hidden',
                  horizontal: 'hidden',
                  handleMouseWheel: false,
                  useShadows: false,
                },
                overviewRulerLanes: 0,
                overviewRulerBorder: false,
                lineNumbersMinChars: 3,
                fontSize: 14,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                smoothScrolling: true,
                hideCursorInOverviewRuler: true,
                unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
              }}
            />
          </div>
        </div>

        {/* ── PII Scanner Panel ─────────────────────────────────────────── */}
        <aside className="min-w-0 overflow-hidden">
          <AnimatePresence initial={false}>
            {scannerOpen && (
              <motion.div
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="flex h-full w-[220px] flex-col overflow-hidden"
              >
                <ScannerPanel
                  getEditorText={getEditorText}
                  applyEdit={applyEdit}
                  onFocusFinding={focusScannerFinding}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </motion.main>
    </div>
  );
}
