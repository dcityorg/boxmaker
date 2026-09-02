'use client';

import type { BoxParams, CutoutParams, CutoutSurface, LidParams, StandoffParams } from '@/store/useDesign';
import type {
  BoardDefinition,
  BoardEdge,
  BoardFeatureSide,
  BoardPlacement,
  ComponentsFacing,
} from './types';

export interface CompiledBoard {
  standoffs: StandoffParams[];
  cutouts: CutoutParams[];
  /** Things that stopped the board compiling. Not geometry warnings. */
  errors: string[];
}

/** Board-local outward direction of each named edge. */
const EDGE_DIRECTION: Record<BoardEdge, readonly [number, number]> = {
  'x+': [1, 0],
  'x-': [-1, 0],
  'y+': [0, 1],
  'y-': [0, -1],
};

/**
 * Turn one placed board into ordinary standoff and cutout records.
 *
 * Everything the board feature does happens here: from this point on the rest
 * of the app sees nothing but the same StandoffParams / CutoutParams it has
 * always handled, so geometry, validation and the viewport ghosts need no
 * knowledge of boards at all.
 *
 * Emitted coordinates are in each target surface's existing USER frame, so they
 * feed floorAnchorXY / lidAnchorXY / the per-wall cases in geometry/cutouts.ts
 * unchanged.
 */
export function compileBoard(
  placement: BoardPlacement,
  board: BoardDefinition,
  box: BoxParams,
  lid: LidParams
): CompiledBoard {
  const standoffs: StandoffParams[] = [];
  const cutouts: CutoutParams[] = [];
  const errors: string[] = [];

  const quarter = quarterTurns(placement.rotation);
  if (quarter === null) {
    return {
      standoffs,
      cutouts,
      errors: [
        `board "${board.name}": rotation must be a multiple of 90, got ${placement.rotation}`,
      ],
    };
  }

  // --- mounting holes -> standoffs, always on the mounting surface ---------
  for (const m of board.mounts) {
    const { x, y } = boardToSurface(placement, m.x, m.y);
    standoffs.push({
      surface: placement.surface,
      x,
      y,
      od: placement.standoffOd,
      height: placement.standoffHeight,
      holeDia: placement.standoffHoleDia,
      holeDepth: placement.standoffHoleDepth,
      baseFillet: placement.baseFillet,
    });
  }

  // --- component cutouts -> whichever of floor/lid the feature points at ---
  const swapped = quarter % 2 === 1;

  for (const c of board.cutouts) {
    const target = targetSurface(c.side, placement.components);
    const local = boardToSurface(placement, c.x, c.y);
    const { x, y } = convertFrame(placement.surface, target, local.x, local.y, box, lid);

    if (c.kind === 'round') {
      const diameter = c.diameter + 2 * c.clearance;
      if (diameter <= 0) {
        errors.push(`board "${board.name}": round cutout at ${c.x},${c.y} has non-positive size`);
        continue;
      }
      cutouts.push({ surface: target, kind: 'round', x, y, diameter });
      continue;
    }

    // A quarter turn swaps a rectangle's two dimensions; the surface frames'
    // axes do not otherwise reorder, and mirroring leaves a centred rectangle
    // unchanged.
    const width = (swapped ? c.sizeY : c.sizeX) + 2 * c.clearance;
    const height = (swapped ? c.sizeX : c.sizeY) + 2 * c.clearance;
    if (width <= 0 || height <= 0) {
      errors.push(`board "${board.name}": rect cutout at ${c.x},${c.y} has non-positive size`);
      continue;
    }
    cutouts.push({
      surface: target,
      kind: 'rect',
      x,
      y,
      width,
      height,
      cornerRadius: Math.max(0, c.cornerRadius + c.clearance),
    });
  }

  // --- connector cutouts -> whichever side wall the board edge faces -------
  for (const e of board.edges) {
    const wall = wallFacedBy(placement, e.edge, quarter);
    const point = edgePoint(board, e.edge, e.pos);
    const local = boardToSurface(placement, point[0], point[1]);
    const world = surfaceToWorldXY(placement.surface, local.x, local.y, box, lid);

    const width = e.sizeAlong + 2 * e.clearance;
    const height = e.sizeZ + 2 * e.clearance;
    if (width <= 0 || height <= 0) {
      errors.push(`board "${board.name}": ${e.edge} connector has non-positive size`);
      continue;
    }

    cutouts.push({
      surface: wall,
      kind: 'rect',
      x: wallAlongCoordinate(wall, world.x, world.y, box),
      // Wall frames measure Y up from the INTERIOR floor, not from z = 0.
      y: boardZToWorldZ(placement, board, e.z, box) - box.floorThickness,
      width,
      height,
      cornerRadius: Math.max(0, e.cornerRadius + e.clearance),
    });
  }

  return { standoffs, cutouts, errors };
}

/* ------------------------------------------------------------------ frames */

/**
 * Does board +X run against the mounting surface's user +X?
 *
 * It mirrors exactly when the component side faces the mounting surface,
 * because the board is then being viewed from its solder side. See
 * BOARD-MOUNTING.md section 3.2.
 */
export function isMirrored(placement: BoardPlacement): boolean {
  return placement.surface === 'floor'
    ? placement.components === 'down'
    : placement.components === 'up';
}

/**
 * Board-local (bx, by) -> the MOUNTING surface's user frame.
 * Mirror first, then rotate CCW about the board origin, then translate.
 *
 * Rotation is a whole number of quarter turns, so this is exact integer
 * arithmetic on the coordinates -- no trigonometry and no float noise.
 */
export function boardToSurface(
  placement: BoardPlacement,
  bx: number,
  by: number
): { x: number; y: number } {
  const [rx, ry] = rotateQuarter(
    isMirrored(placement) ? -bx : bx,
    by,
    quarterTurns(placement.rotation) ?? 0
  );
  return { x: placement.x + rx, y: placement.y + ry };
}

/** Rotate CCW by `q` quarter turns. (x, y) -> (-y, x) each time. */
function rotateQuarter(x: number, y: number, q: number): [number, number] {
  switch (((q % 4) + 4) % 4) {
    case 1:
      return [-y, x];
    case 2:
      return [-x, -y];
    case 3:
      return [y, -x];
    default:
      return [x, y];
  }
}

/** Whole quarter turns, or null if the rotation is not a multiple of 90. */
export function quarterTurns(rotationDeg: number): number | null {
  const q = rotationDeg / 90;
  if (!Number.isInteger(q)) return null;
  return ((q % 4) + 4) % 4;
}

/**
 * Which box surface a board feature cuts through.
 *
 * A `top` feature points along the component side. With components facing up
 * that is world up, so it exits through the lid; facing down, through the
 * floor. Note this does NOT depend on which surface the board is mounted to --
 * a floor-mounted board's `top` feature still cuts the lid.
 */
export function targetSurface(
  side: BoardFeatureSide,
  components: ComponentsFacing
): 'floor' | 'lid' {
  const pointsUp = components === 'up' ? side === 'top' : side === 'bottom';
  return pointsUp ? 'lid' : 'floor';
}

/**
 * Re-express a point in the other surface's user frame, keeping it at the same
 * place in the world -- which is what an orthographic projection along Z does.
 *
 * Both directions use the same formulae because each is its own inverse.
 */
export function convertFrame(
  from: 'floor' | 'lid',
  to: 'floor' | 'lid',
  x: number,
  y: number,
  box: BoxParams,
  lid: LidParams
): { x: number; y: number } {
  if (from === to) return { x, y };
  const inset = lidInset(box, lid);
  const shift = from === 'floor' ? box.wallThickness - inset : inset - box.wallThickness;
  return { x: box.length - box.wallThickness - inset - x, y: y + shift };
}

/**
 * Surface user coordinates -> world X/Y. Mirrors floorAnchorXY / lidAnchorXY in
 * geometry/standoffs.ts, which stay the authority.
 */
export function surfaceToWorldXY(
  surface: 'floor' | 'lid',
  x: number,
  y: number,
  box: BoxParams,
  lid: LidParams
): { x: number; y: number } {
  if (surface === 'floor') {
    return { x: -box.length / 2 + box.wallThickness + x, y: -box.width / 2 + box.wallThickness + y };
  }
  const inset = lidInset(box, lid);
  return { x: box.length / 2 - inset - x, y: -box.width / 2 + inset + y };
}

function lidInset(box: BoxParams, lid: LidParams): number {
  return box.wallThickness + lid.boxGap + lid.coverShoulderWallThickness;
}

/* ------------------------------------------------------------- connectors */

/**
 * Which wall a board edge ends up facing.
 *
 * The edge's outward direction is mirrored, quarter-turned into the mounting
 * surface's user frame, then mapped to world -- where the lid's user +X runs
 * against world +X. Because the rotation is a quarter turn, the result is always
 * exactly one of the four axis directions, which is the whole reason connector
 * cutouts need the restriction.
 */
export function wallFacedBy(
  placement: BoardPlacement,
  edge: BoardEdge,
  quarter: number
): Extract<CutoutSurface, 'front' | 'back' | 'left' | 'right'> {
  const [ex, ey] = EDGE_DIRECTION[edge];
  const [ux, uy] = rotateQuarter(isMirrored(placement) ? -ex : ex, ey, quarter);
  // Lid user +X points along world -X; floor user +X along world +X. Both have
  // user +Y along world +Y.
  const wx = placement.surface === 'floor' ? ux : -ux;
  if (wx > 0) return 'right';
  if (wx < 0) return 'left';
  return uy > 0 ? 'back' : 'front';
}

/** The point on a board edge at `pos` along it, in board coordinates. */
function edgePoint(board: BoardDefinition, edge: BoardEdge, pos: number): [number, number] {
  switch (edge) {
    case 'x+':
      return [board.sizeX, pos];
    case 'x-':
      return [0, pos];
    case 'y+':
      return [pos, board.sizeY];
    default:
      return [pos, 0];
  }
}

/**
 * World X/Y -> the along-wall user coordinate. Inverts the per-wall cases in
 * geometry/cutouts.ts:123-175, where every wall's 0,0 is its interior
 * bottom-left AS VIEWED FROM INSIDE the box.
 */
function wallAlongCoordinate(
  wall: 'front' | 'back' | 'left' | 'right',
  worldX: number,
  worldY: number,
  box: BoxParams
): number {
  switch (wall) {
    case 'front':
      return box.length / 2 - box.wallThickness - worldX;
    case 'back':
      return worldX + box.length / 2 - box.wallThickness;
    case 'left':
      return worldY + box.width / 2 - box.wallThickness;
    default:
      return box.width / 2 - box.wallThickness - worldY;
  }
}

/**
 * A height in board-local Z -> world Z, for a board sitting on its standoffs.
 *
 * The board rests on the standoffs' free ends. On the floor those rise to
 * `floorThickness + height`; under the lid they hang down to `height` below the
 * plate underside, which sits on the box rim at `box.height`. Which board face
 * touches the standoff depends on which way the components point, and board +Z
 * runs with world +Z only when they point up.
 */
export function boardZToWorldZ(
  placement: BoardPlacement,
  board: BoardDefinition,
  boardZ: number,
  box: BoxParams
): number {
  const attachZ =
    placement.surface === 'floor'
      ? box.floorThickness + placement.standoffHeight
      : box.height - placement.standoffHeight;
  // Floor: the standoff touches the board's LOWER face. Lid: its UPPER face.
  const touching =
    (placement.surface === 'floor') === (placement.components === 'up') ? 0 : board.thickness;
  const zDir = placement.components === 'up' ? 1 : -1;
  return attachZ + zDir * (boardZ - touching);
}
