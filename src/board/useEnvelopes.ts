'use client';

import { useMemo } from 'react';
import { useDesign } from '@/store/useDesign';
import { collectEnvelopes, type Envelope } from './envelopes';

/**
 * Memoised for the viewport, whose components use these as render input.
 *
 * Separate from envelopes.ts on purpose: that file is pure with type-only
 * imports so the acceptance check can run it directly under node. Pulling the
 * store in there would drag Zustand into a plain node process, which is exactly
 * what broke the check when this hook briefly lived beside the maths.
 */
export function useEnvelopes(): Envelope[] {
  const box = useDesign((s) => s.box);
  const lid = useDesign((s) => s.lid);
  const boards = useDesign((s) => s.boards);
  const library = useDesign((s) => s.boardLibrary);
  const objects = useDesign((s) => s.objects);
  const objectLibrary = useDesign((s) => s.objectLibrary);
  return useMemo(
    () => collectEnvelopes(boards, library, objects, objectLibrary, box, lid),
    [boards, library, objects, objectLibrary, box, lid]
  );
}
