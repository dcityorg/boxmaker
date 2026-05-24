'use client';

import { useEffect, useRef } from 'react';
import * as opentype from 'opentype.js';
import { useDesign } from './useDesign';
import { buildDesignFile, parseDesignFile, designFromUrlHash } from './persistence';
import { idbLoadCustomFont } from './fontCache';
import { registerCustomFont } from '@/geometry/text';

const LS_KEY = 'boxmaker:lastDesign';
const URL_HASH_PREFIX = '#design=';
const DEBOUNCE_MS = 500;

/**
 * Auto-save the current design to localStorage (debounced) and restore on
 * first mount. The custom font is persisted separately in IndexedDB (see
 * fontCache.ts) -- localStorage holds only design parameters because the
 * font bytes can be large.
 *
 * Restore order on mount:
 *   1. Custom font from IndexedDB (so text labels can resolve their font
 *      reference before the design's first geometry build).
 *   2. URL hash (shared link) -- takes precedence over localStorage.
 *   3. localStorage (last session).
 *
 * Mount this once at the top of the editor tree.
 */
export function useAutoSave() {
  const restoredRef = useRef(false);
  const writeTimerRef = useRef<number | null>(null);

  // 1. Restore on first mount. Font first (so it's available for the first
  //    geometry build), then URL hash takes priority over localStorage --
  //    if a friend shared a design via URL, that's what they're here to see.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (typeof window === 'undefined') return;

    (async () => {
      // a) Custom font from IndexedDB (if any). Step (b) or (c) below will
      //    then re-parse any text labels that reference it. If neither fires,
      //    the default state has no labels so there's nothing to re-parse.
      try {
        const cached = await idbLoadCustomFont();
        if (cached) {
          const font = opentype.parse(cached.buffer);
          registerCustomFont(cached.name, font, cached.buffer);
        }
      } catch (err) {
        console.warn('[BoxMaker] IndexedDB font restore failed (ignoring):', err);
      }

      // b) URL hash (shared link).
      if (window.location.hash.startsWith(URL_HASH_PREFIX)) {
        try {
          const hashValue = window.location.hash.slice(URL_HASH_PREFIX.length);
          const design = designFromUrlHash(hashValue);
          useDesign.getState().loadDesign(design);
          // Clear the hash so further edits don't appear to be "shared state."
          history.replaceState(null, '', window.location.pathname + window.location.search);
          return;
        } catch (err) {
          console.warn('[BoxMaker] URL hash design failed to load (ignoring):', err);
        }
      }

      // c) localStorage (last session).
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const design = parseDesignFile(raw);
        useDesign.getState().loadDesign(design);
      } catch (err) {
        console.warn('[BoxMaker] localStorage restore failed (ignoring):', err);
      }
    })();
  }, []);

  // 2. Subscribe + debounce-write on every state change.
  useEffect(() => {
    const unsubscribe = useDesign.subscribe((s) => {
      if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
      writeTimerRef.current = window.setTimeout(() => {
        try {
          const file = buildDesignFile({
            designName: s.designName,
            appearance: s.appearance,
            box: s.box,
            lid: s.lid,
            snap: s.snap,
            standoffsText: s.standoffsText,
            cutoutsText: s.cutoutsText,
            textLabelsText: s.textLabelsText,
            customFont: null, // intentionally omitted -- per-session only
          });
          localStorage.setItem(LS_KEY, JSON.stringify(file));
        } catch (err) {
          console.warn('[BoxMaker] localStorage save failed:', err);
        }
      }, DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
    };
  }, []);
}
