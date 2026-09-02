'use client';

import type { BoxParams, CutoutParams, LidParams, StandoffParams } from '@/store/useDesign';
import type { BoardDefinition, BoardFeatureSide, BoardPlacement, ComponentsFacing } from './types';

/** Degrees of slack when deciding whether a rotation is orthogonal. */
const ORTHO_TOLERANCE = 1e-6;

export interface CompiledBoard {
  standoffs: StandoffParams[];
  cutouts: CutoutParams[];
  /** Things that stopped part of the board compiling. Not geometry warnings. */
  errors: string[];
}

/**
 * Turn one placed board into ordinary standoff and cutout records.
 *
 * Everything the board feature does happens here: from this point on the rest
 * of the app sees nothing but the same StandoffParams / CutoutParams it has
 * always handled, so geometry, validation and the viewport ghosts need no
 * knowledge of boards at all.
 *
 * The emitted coordinates are in each target surface's existing USER frame, so
 * they feed floorAnchorXY / lidAnchorXY in geometry/standoffs.ts unchanged.
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

  // --- standoffs: always on the surface the board is mounted to -----------
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

  // --- cutouts: whichever surface the feature happens to point at ---------
  const quarter = orthogonalQuarterTurns(placement.rotation);

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

    // Rect. CutoutParams rects are axis-aligned in the surface frame and carry
    // no rotation of their own, so a board turned to a non-orthogonal angle
    // cannot be represented. Standoffs and round cutouts are fine at any
    // angle; only rects are constrained. Lifting this means adding an optional
    // rotation to CutoutParams and one CrossSection.rotate in geometry.
    if (quarter === null) {
      errors.push(
        `board "${board.name}": rectangular cutouts need a rotation of 0, 90, 180 or 270 ` +
          `(this board is at ${placement.rotation})`
      );
      continue;
    }
    const swapped = quarter % 2 === 1;
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

  return { standoffs, cutouts, errors };
}

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
 */
export function boardToSurface(
  placement: BoardPlacement,
  bx: number,
  by: number
): { x: number; y: number } {
  const mx = isMirrored(placement) ? -bx : bx;
  const rad = (placement.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: placement.x + mx * cos - by * sin,
    y: placement.y + mx * sin + by * cos,
  };
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
 * Derived from floorAnchorXY / lidAnchorXY in geometry/standoffs.ts:
 *   floor: wx = -L/2 + wallT + x     lid: wx = +L/2 - inset - x
 *          wy = -W/2 + wallT + y          wy = -W/2 + inset + y
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
  const inset = box.wallThickness + lid.boxGap + lid.coverShoulderWallThickness;
  const shift = from === 'floor' ? box.wallThickness - inset : inset - box.wallThickness;
  return {
    x: box.length - box.wallThickness - inset - x,
    y: y + shift,
  };
}

/**
 * 0, 1, 2 or 3 quarter turns if the rotation is orthogonal, else null.
 * Odd counts swap a rectangle's two dimensions.
 */
function orthogonalQuarterTurns(rotationDeg: number): number | null {
  const normalized = ((rotationDeg % 360) + 360) % 360;
  const quarter = normalized / 90;
  const nearest = Math.round(quarter);
  if (Math.abs(quarter - nearest) > ORTHO_TOLERANCE) return null;
  return nearest % 4;
}
