'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDesign, parseStandoffsText, parseCutoutsText, parseTextLabelsText, type DesignState } from './useDesign';

/**
 * Snapshot fields tracked by undo/redo. Excludes derived state (parsed
 * standoffs/cutouts/textLabels arrays), error lists, and transient UI flags
 * like `isDirty` -- those are re-derived from the snapshot's text fields.
 */
type Snapshot = Pick<DesignState,
  | 'designName'
  | 'appearance'
  | 'box'
  | 'lid'
  | 'snap'
  | 'standoffsText'
  | 'cutoutsText'
  | 'textLabelsText'
>;

function snapshot(s: DesignState): Snapshot {
  return {
    designName: s.designName,
    appearance: { ...s.appearance },
    box: { ...s.box },
    lid: { ...s.lid },
    snap: { ...s.snap },
    standoffsText: s.standoffsText,
    cutoutsText: s.cutoutsText,
    textLabelsText: s.textLabelsText,
  };
}

function snapshotEquals(a: Snapshot, b: Snapshot): boolean {
  if (a.designName !== b.designName) return false;
  if (a.standoffsText !== b.standoffsText) return false;
  if (a.cutoutsText !== b.cutoutsText) return false;
  if (a.textLabelsText !== b.textLabelsText) return false;
  // Object fields: JSON compare. Cheap enough for the small param objects.
  if (JSON.stringify(a.appearance) !== JSON.stringify(b.appearance)) return false;
  if (JSON.stringify(a.box) !== JSON.stringify(b.box)) return false;
  if (JSON.stringify(a.lid) !== JSON.stringify(b.lid)) return false;
  if (JSON.stringify(a.snap) !== JSON.stringify(b.snap)) return false;
  return true;
}

const HISTORY_LIMIT = 100;
// Rapid changes within this window collapse into a single undo entry --
// slider drags, color-picker drags, arrow-key spam, and textarea typing
// all become one undo step per burst instead of one per onChange.
const COALESCE_MS = 400;

/**
 * Hand-rolled undo/redo for the design store. Subscribes to state changes,
 * snapshots design fields, and supports Cmd-Z / Cmd-Shift-Z (Ctrl on Win).
 *
 * Coalescing: a burst of rapid writes is recorded as one undo entry. The
 * pre-burst snapshot is held in `pendingPrev` and pushed to the undo stack
 * once the user pauses for COALESCE_MS, or immediately when undo() / redo()
 * is invoked.
 */
export function useUndoRedo() {
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const lastSnapRef = useRef<Snapshot | null>(null);
  const pendingPrevRef = useRef<Snapshot | null>(null);
  const coalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateCanFlags = useCallback(() => {
    setCanUndo(undoStack.current.length > 0 || pendingPrevRef.current !== null);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  const commitPending = useCallback(() => {
    if (coalesceTimerRef.current !== null) {
      clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = null;
    }
    if (pendingPrevRef.current) {
      undoStack.current.push(pendingPrevRef.current);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
      pendingPrevRef.current = null;
    }
  }, []);

  const apply = useCallback((s: Snapshot) => {
    applyingRef.current = true;
    const standoffsParse = parseStandoffsText(s.standoffsText);
    const cutoutsParse = parseCutoutsText(s.cutoutsText);
    const textLabelsParse = parseTextLabelsText(s.textLabelsText);
    useDesign.setState({
      designName: s.designName,
      appearance: { ...s.appearance },
      box: { ...s.box },
      lid: { ...s.lid },
      snap: { ...s.snap },
      standoffsText: s.standoffsText,
      standoffs: standoffsParse.standoffs,
      standoffErrors: standoffsParse.errors,
      cutoutsText: s.cutoutsText,
      cutouts: cutoutsParse.cutouts,
      cutoutErrors: cutoutsParse.errors,
      textLabelsText: s.textLabelsText,
      textLabels: textLabelsParse.labels,
      textLabelErrors: textLabelsParse.errors,
      isDirty: true,
    });
    lastSnapRef.current = s;
    // Release the applying flag in the next tick so the subscribe
    // notification triggered by this setState is ignored.
    setTimeout(() => {
      applyingRef.current = false;
    }, 0);
    updateCanFlags();
  }, [updateCanFlags]);

  const undo = useCallback(() => {
    commitPending();
    if (undoStack.current.length === 0) {
      updateCanFlags();
      return;
    }
    const target = undoStack.current.pop()!;
    if (lastSnapRef.current) redoStack.current.push(lastSnapRef.current);
    apply(target);
  }, [apply, commitPending, updateCanFlags]);

  const redo = useCallback(() => {
    commitPending();
    if (redoStack.current.length === 0) {
      updateCanFlags();
      return;
    }
    const target = redoStack.current.pop()!;
    if (lastSnapRef.current) undoStack.current.push(lastSnapRef.current);
    apply(target);
  }, [apply, commitPending, updateCanFlags]);

  // 1. Initialize last snapshot on mount.
  useEffect(() => {
    lastSnapRef.current = snapshot(useDesign.getState());
  }, []);

  // 2. Subscribe to design changes. Open a burst (pendingPrev = pre-burst
  //    snapshot) on the first change after a quiet period, then reset the
  //    timer on every subsequent change. The timer commits the pre-burst
  //    snapshot to the undo stack as a single entry.
  useEffect(() => {
    const unsub = useDesign.subscribe((s) => {
      if (applyingRef.current) return;
      const next = snapshot(s);
      if (lastSnapRef.current && snapshotEquals(lastSnapRef.current, next)) return;

      if (pendingPrevRef.current === null && lastSnapRef.current) {
        pendingPrevRef.current = lastSnapRef.current;
      }
      if (coalesceTimerRef.current !== null) clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = setTimeout(() => {
        coalesceTimerRef.current = null;
        commitPending();
        updateCanFlags();
      }, COALESCE_MS);

      // Any new edit branch invalidates the redo stack.
      redoStack.current = [];
      lastSnapRef.current = next;
      updateCanFlags();
    });
    return () => {
      unsub();
      if (coalesceTimerRef.current !== null) {
        clearTimeout(coalesceTimerRef.current);
        coalesceTimerRef.current = null;
      }
    };
  }, [commitPending, updateCanFlags]);

  // 3. Keyboard shortcuts. Cmd-Z / Ctrl-Z (undo), Cmd-Shift-Z / Ctrl-Y (redo).
  //    Defer to native browser undo only when focus is on a real text-entry
  //    element (textarea, contenteditable, or <input> of a text-bearing type).
  //    Sliders, color pickers, buttons, checkboxes etc. pass through so the
  //    user can Cmd-Z after tabbing away from a number field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === 'TEXTAREA') return;
        if (tag === 'INPUT') {
          const t = (target as HTMLInputElement).type;
          if (
            t === 'text' ||
            t === 'search' ||
            t === 'email' ||
            t === 'url' ||
            t === 'tel' ||
            t === 'password' ||
            t === 'number'
          ) {
            return;
          }
        }
      }
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return { undo, redo, canUndo, canRedo };
}
