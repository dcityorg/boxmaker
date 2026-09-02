'use client';

import type { BoxObjectParams, BoardDefinition, BoardPlacement } from './types';
import type { BoxParams, LidParams } from '@/store/useDesign';
import { boardToSurface, boardZToWorldZ, surfaceToWorldXY } from './compile';

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

/** World Z of the lid's plate underside: it rests on the box rim. */
function lidUndersideZ(box: BoxParams): number {
  return box.height;
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
    label: placement.boardName,
    line: placement.line,
    frame,
    min: [x0, y0, fz(z0)],
    max: [x1, y1, fz(z1)],
  };
}

/**
 * The volume a free-standing object occupies.
 *
 * Each surface uses its OWN user frame -- the same mapping its cutouts use in
 * geometry/cutouts.ts:99-176 -- and the object grows from that surface's
 * INTERIOR face inward, starting `offset` away from it.
 */
export function objectEnvelope(o: BoxObjectParams, box: BoxParams, lid: LidParams): Envelope {
  const hx = o.sizeX / 2;
  const hy = o.sizeY / 2;
  const near = o.offset;
  const far = o.offset + o.depth;

  let min: [number, number, number];
  let max: [number, number, number];
  let frame: 'box' | 'lid' = 'box';

  switch (o.surface) {
    case 'floor': {
      const c = surfaceToWorldXY('floor', o.x, o.y, box, lid);
      min = [c.x - hx, c.y - hy, box.floorThickness + near];
      max = [c.x + hx, c.y + hy, box.floorThickness + far];
      break;
    }
    case 'lid': {
      const c = surfaceToWorldXY('lid', o.x, o.y, box, lid);
      const under = lidUndersideZ(box);
      min = [c.x - hx, c.y - hy, toLidFrame(box, lid, under - far)];
      max = [c.x + hx, c.y + hy, toLidFrame(box, lid, under - near)];
      frame = 'lid';
      break;
    }
    // Walls: user X runs along the wall as seen from INSIDE, user Y is height
    // above the INTERIOR floor. Depth runs inward, away from the wall.
    case 'front': {
      const wx = box.length / 2 - box.wallThickness - o.x;
      const face = -box.width / 2 + box.wallThickness;
      min = [wx - hx, face + near, box.floorThickness + o.y - hy];
      max = [wx + hx, face + far, box.floorThickness + o.y + hy];
      break;
    }
    case 'back': {
      const wx = -box.length / 2 + box.wallThickness + o.x;
      const face = box.width / 2 - box.wallThickness;
      min = [wx - hx, face - far, box.floorThickness + o.y - hy];
      max = [wx + hx, face - near, box.floorThickness + o.y + hy];
      break;
    }
    case 'left': {
      const wy = -box.width / 2 + box.wallThickness + o.x;
      const face = -box.length / 2 + box.wallThickness;
      min = [face + near, wy - hx, box.floorThickness + o.y - hy];
      max = [face + far, wy + hx, box.floorThickness + o.y + hy];
      break;
    }
    default: {
      const wy = box.width / 2 - box.wallThickness - o.x;
      const face = box.length / 2 - box.wallThickness;
      min = [face - far, wy - hx, box.floorThickness + o.y - hy];
      max = [face - near, wy + hx, box.floorThickness + o.y + hy];
      break;
    }
  }

  return { kind: 'object', label: o.name, line: o.line, frame, min, max };
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
  library: BoardDefinition[],
  objects: BoxObjectParams[],
  box: BoxParams,
  lid: LidParams
): Envelope[] {
  const byName = new Map(library.map((b) => [b.name.trim().toLowerCase(), b]));
  const out: Envelope[] = [];
  for (const p of boards) {
    const board = byName.get(p.boardName.trim().toLowerCase());
    // A placement naming a board that is not loaded is reported by
    // compileBoards; there is simply nothing to draw for it here.
    if (board) out.push(boardEnvelope(p, board, box, lid));
  }
  for (const o of objects) out.push(objectEnvelope(o, box, lid));
  return out;
}
