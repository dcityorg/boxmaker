'use client';

import type { BoardDefinition, BoardPlacement, ObjectDefinition, ObjectPlacement } from './types';
import type { BoxParams, LidParams } from '@/store/useDesign';
import { boardToSurface, boardZToWorldZ, surfaceToWorldXY } from './compile';
import { objectCorners } from './compileObject';

/**
 * The space something occupies inside the box, as a world-space axis-aligned
 * box. Boards are axis-aligned because rotation is restricted to quarter turns,
 * and objects are declared as rectangular solids, so an AABB is exact rather
 * than an approximation.
 *
 * Coordinates are ASSEMBLED world -- the box sitting closed with its lid on.
 * `frame` says which mesh to draw with, so a lid-mounted item follows the lid
 * when the viewport explodes it; `z` is already converted to that frame.
 */
export interface Envelope {
  kind: 'board' | 'object';
  label: string;
  /** 1-based source line, for warnings. */
  line?: number;
  frame: 'box' | 'lid';
  min: [number, number, number];
  max: [number, number, number];
}

/** Lid-local Z is offset from assembled world Z by where the shoulder starts. */
function toLidFrame(box: BoxParams, lid: LidParams, z: number): number {
  return z - (box.height - lid.coverShoulderDepth);
}

function span(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

/** The volume a placed board occupies, including whatever is stacked on it. */
export function boardEnvelope(
  placement: BoardPlacement,
  board: BoardDefinition,
  box: BoxParams,
  lid: LidParams
): Envelope {
  // Opposite corners of the outline. A quarter turn keeps it axis-aligned, so
  // min/max of the two mapped corners is the exact footprint.
  const a = boardToSurface(placement, 0, 0);
  const b = boardToSurface(placement, board.sizeX, board.sizeY);
  const wa = surfaceToWorldXY(placement.surface, a.x, a.y, box, lid);
  const wb = surfaceToWorldXY(placement.surface, b.x, b.y, box, lid);
  const [x0, x1] = span(wa.x, wb.x);
  const [y0, y1] = span(wa.y, wb.y);

  // Height 0 means the board was never measured -- fall back to a bare PCB.
  const top = board.height > 0 ? board.height : board.thickness;
  const [z0, z1] = span(
    boardZToWorldZ(placement, board, -board.heightBelow, box),
    boardZToWorldZ(placement, board, top, box)
  );

  const frame: 'box' | 'lid' = placement.surface === 'lid' ? 'lid' : 'box';
  const fz = (z: number) => (frame === 'lid' ? toLidFrame(box, lid, z) : z);

  return {
    kind: 'board',
    // The definition's name, not the placement's spelling of it: lookup is
    // case-insensitive, so the two can differ, and this is the one shown in the
    // library list.
    label: board.name,
    line: placement.line,
    frame,
    min: [x0, y0, fz(z0)],
    max: [x1, y1, fz(z1)],
  };
}

/**
 * The volume a placed object occupies.
 *
 * The corner maths lives in compileObject.ts, which already has to map object
 * coordinates into the world to place the object's holes; this just wraps it
 * with a frame and a label.
 */
export function objectEnvelope(
  placement: ObjectPlacement,
  obj: ObjectDefinition,
  box: BoxParams,
  lid: LidParams
): Envelope | null {
  const corners = objectCorners(placement, obj, box, lid);
  if (!corners) return null;
  const frame: 'box' | 'lid' = placement.surface === 'lid' ? 'lid' : 'box';
  const fz = (z: number) => (frame === 'lid' ? toLidFrame(box, lid, z) : z);
  const [z0, z1] = span(fz(corners.min[2]), fz(corners.max[2]));
  return {
    kind: 'object',
    // See boardEnvelope: the definition's name is the canonical one.
    label: obj.name,
    line: placement.line,
    frame,
    min: [corners.min[0], corners.min[1], z0],
    max: [corners.max[0], corners.max[1], z1],
  };
}

/** Do two envelopes overlap? Touching faces do not count. */
export function envelopesOverlap(a: Envelope, b: Envelope, slop = 1e-6): boolean {
  for (let i = 0; i < 3; i++) {
    if (a.max[i] - slop <= b.min[i] || b.max[i] - slop <= a.min[i]) return false;
  }
  return true;
}

/** Envelope in assembled world coordinates, undoing any lid-frame shift. */
export function toWorld(e: Envelope, box: BoxParams, lid: LidParams): Envelope {
  if (e.frame === 'box') return e;
  const dz = box.height - lid.coverShoulderDepth;
  return {
    ...e,
    frame: 'box',
    min: [e.min[0], e.min[1], e.min[2] + dz],
    max: [e.max[0], e.max[1], e.max[2] + dz],
  };
}


/** Every occupant of the box, boards and objects alike. */
export function collectEnvelopes(
  boards: BoardPlacement[],
  boardLibrary: BoardDefinition[],
  objects: ObjectPlacement[],
  objectLibrary: ObjectDefinition[],
  box: BoxParams,
  lid: LidParams
): Envelope[] {
  const key = (n: string) => n.trim().toLowerCase();
  const boardsByName = new Map(boardLibrary.map((b) => [key(b.name), b]));
  const objectsByName = new Map(objectLibrary.map((o) => [key(o.name), o]));
  const out: Envelope[] = [];
  // A placement naming something that is not loaded is reported by the
  // compilers; there is simply nothing to draw for it here.
  for (const p of boards) {
    const board = boardsByName.get(key(p.boardName));
    if (board) out.push(boardEnvelope(p, board, box, lid));
  }
  for (const p of objects) {
    const obj = objectsByName.get(key(p.objectName));
    if (!obj) continue;
    const env = objectEnvelope(p, obj, box, lid);
    if (env) out.push(env);
  }
  return out;
}

/** A clearance problem, shaped for WarningList plus the pair it involves. */
export interface ClearanceWarning {
  source: string;
  message: string;
  /** The two labels, so a section can show only the clashes it is part of. */
  a: string;
  b: string;
  aKind: 'board' | 'object';
  bKind: 'board' | 'object';
}

/**
 * Every pair of occupants that actually intersect.
 *
 * The ghosts already turn red on a clash, but colour alone does not say WHAT
 * hits what, or by how much -- and with half a dozen envelopes in a box, a red
 * shape somewhere inside an opaque wall is not a diagnosis. Each pair is
 * reported once, from the first one's point of view.
 *
 * Compared in ASSEMBLED coordinates, because a lid-mounted board and a
 * floor-standing object certainly can collide and each is stored in its own
 * frame.
 */
export function interferenceWarnings(
  envelopes: Envelope[],
  box: BoxParams,
  lid: LidParams
): ClearanceWarning[] {
  const world = envelopes.map((e) => toWorld(e, box, lid));
  const out: ClearanceWarning[] = [];
  const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

  for (let i = 0; i < world.length; i++) {
    for (let j = i + 1; j < world.length; j++) {
      const a = world[i];
      const b = world[j];
      if (!envelopesOverlap(a, b)) continue;
      const by = [0, 1, 2].map((k) =>
        Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k])
      );
      out.push({
        source: a.label,
        message:
          `overlaps ${b.label} by ${fmt(by[0])} x ${fmt(by[1])} x ${fmt(by[2])} mm. ` +
          `Move one of them, or reduce a Height.`,
        a: a.label,
        b: b.label,
        aKind: a.kind,
        bKind: b.kind,
      });
    }
  }
  return out;
}

/**
 * Only the clashes one section is part of. A board-versus-object clash shows in
 * BOTH sections, deliberately: it is equally the business of either, and being
 * told about it twice beats being told in the panel you are not looking at.
 */
export function interferenceFor(
  kind: 'board' | 'object',
  envelopes: Envelope[],
  box: BoxParams,
  lid: LidParams
): ClearanceWarning[] {
  return interferenceWarnings(envelopes, box, lid).filter(
    (w) => w.aKind === kind || w.bKind === kind
  );
}
