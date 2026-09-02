'use client';

import { useMemo } from 'react';
import {
  useDesign,
  type BoxParams,
  type CutoutParams,
  type LidParams,
  type StandoffParams,
} from '@/store/useDesign';
import { compileBoard } from './compile';
import type { BoardDefinition, BoardPlacement } from './types';

export interface CompiledBoards {
  standoffs: StandoffParams[];
  cutouts: CutoutParams[];
  errors: string[];
}

const EMPTY: CompiledBoards = { standoffs: [], cutouts: [], errors: [] };

/** Board names are matched case-insensitively and trimmed, to be forgiving. */
function key(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Compile every placed board into standoff and cutout records.
 *
 * A placement naming a board that is not in the library is an error, not a
 * silent skip -- a design that quietly drops half its standoffs is worse than
 * one that says why.
 */
export function compileBoards(
  placements: BoardPlacement[],
  library: BoardDefinition[],
  box: BoxParams,
  lid: LidParams
): CompiledBoards {
  if (placements.length === 0) return EMPTY;

  const byName = new Map(library.map((b) => [key(b.name), b]));
  const standoffs: StandoffParams[] = [];
  const cutouts: CutoutParams[] = [];
  const errors: string[] = [];

  for (const p of placements) {
    const board = byName.get(key(p.boardName));
    if (!board) {
      errors.push(
        `line ${p.line}: no board named "${p.boardName}" is loaded -- import its .board.txt file`
      );
      continue;
    }
    const out = compileBoard(p, board, box, lid);
    standoffs.push(...out.standoffs);
    cutouts.push(...out.cutouts);
    for (const e of out.errors) errors.push(`line ${p.line}: ${e}`);
  }

  return { standoffs, cutouts, errors };
}

/**
 * The standoffs and cutouts the geometry should actually build: what the user
 * typed, plus what the placed boards compile to.
 *
 * This is the ONLY place the two are combined. Geometry, exports and (later)
 * validation all read from here, so nothing downstream has to know that boards
 * exist.
 */
export function effectiveFeatures(state: {
  box: BoxParams;
  lid: LidParams;
  standoffs: StandoffParams[];
  cutouts: CutoutParams[];
  boards: BoardPlacement[];
  boardLibrary: BoardDefinition[];
}): { standoffs: StandoffParams[]; cutouts: CutoutParams[]; boardErrors: string[] } {
  const compiled = compileBoards(state.boards, state.boardLibrary, state.box, state.lid);
  if (compiled === EMPTY) {
    return { standoffs: state.standoffs, cutouts: state.cutouts, boardErrors: [] };
  }
  return {
    standoffs: [...state.standoffs, ...compiled.standoffs],
    cutouts: [...state.cutouts, ...compiled.cutouts],
    boardErrors: compiled.errors,
  };
}

/**
 * React flavour of effectiveFeatures. Memoised on the store slices it reads,
 * so the returned arrays keep a stable identity between renders -- the mesh
 * components use them as effect dependencies and would rebuild forever
 * otherwise.
 */
export function useEffectiveFeatures(): {
  standoffs: StandoffParams[];
  cutouts: CutoutParams[];
  boardErrors: string[];
} {
  const box = useDesign((s) => s.box);
  const lid = useDesign((s) => s.lid);
  const standoffs = useDesign((s) => s.standoffs);
  const cutouts = useDesign((s) => s.cutouts);
  const boards = useDesign((s) => s.boards);
  const boardLibrary = useDesign((s) => s.boardLibrary);

  return useMemo(
    () => effectiveFeatures({ box, lid, standoffs, cutouts, boards, boardLibrary }),
    [box, lid, standoffs, cutouts, boards, boardLibrary]
  );
}
