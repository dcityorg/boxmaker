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
import { compileObject } from './compileObject';
import type { BoardDefinition, BoardPlacement, ObjectDefinition, ObjectPlacement } from './types';

export interface CompiledBoards {
  standoffs: StandoffParams[];
  cutouts: CutoutParams[];
  errors: string[];
}

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
  if (placements.length === 0) return { standoffs: [], cutouts: [], errors: [] };

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
export function compileObjects(
  placements: ObjectPlacement[],
  library: ObjectDefinition[],
  box: BoxParams,
  lid: LidParams
): { cutouts: CutoutParams[]; errors: string[] } {
  if (placements.length === 0) return { cutouts: [], errors: [] };
  const byName = new Map(library.map((o) => [key(o.name), o]));
  const cutouts: CutoutParams[] = [];
  const errors: string[] = [];
  for (const p of placements) {
    const obj = byName.get(key(p.objectName));
    if (!obj) {
      errors.push(
        `line ${p.line}: no object named "${p.objectName}" is loaded -- import its .object.txt file`
      );
      continue;
    }
    const out = compileObject(p, obj, box, lid);
    cutouts.push(...out.cutouts);
    for (const e of out.errors) errors.push(`line ${p.line}: ${e}`);
  }
  return { cutouts, errors };
}

export function effectiveFeatures(state: {
  box: BoxParams;
  lid: LidParams;
  standoffs: StandoffParams[];
  cutouts: CutoutParams[];
  boards: BoardPlacement[];
  boardLibrary: BoardDefinition[];
  objects: ObjectPlacement[];
  objectLibrary: ObjectDefinition[];
}): {
  standoffs: StandoffParams[];
  cutouts: CutoutParams[];
  boardErrors: string[];
  objectErrors: string[];
} {
  const boards = compileBoards(state.boards, state.boardLibrary, state.box, state.lid);
  // An object's BODY is never geometry, but its cutouts are: a potentiometer
  // shaft needs a real hole.
  const objects = compileObjects(state.objects, state.objectLibrary, state.box, state.lid);
  return {
    standoffs: [...state.standoffs, ...boards.standoffs],
    cutouts: [...state.cutouts, ...boards.cutouts, ...objects.cutouts],
    boardErrors: boards.errors,
    objectErrors: objects.errors,
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
  objectErrors: string[];
} {
  const box = useDesign((s) => s.box);
  const lid = useDesign((s) => s.lid);
  const standoffs = useDesign((s) => s.standoffs);
  const cutouts = useDesign((s) => s.cutouts);
  const boards = useDesign((s) => s.boards);
  const boardLibrary = useDesign((s) => s.boardLibrary);
  const objects = useDesign((s) => s.objects);
  const objectLibrary = useDesign((s) => s.objectLibrary);

  return useMemo(
    () =>
      effectiveFeatures({ box, lid, standoffs, cutouts, boards, boardLibrary, objects, objectLibrary }),
    [box, lid, standoffs, cutouts, boards, boardLibrary, objects, objectLibrary]
  );
}
