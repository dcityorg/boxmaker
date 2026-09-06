'use client';

import type { BoxSurface, ObjectPlacement, ObjectPlacementParseError } from './types';
import { evaluateExpression } from './expr';
import { placementVariables, type PlacementContext } from './placementVars';

const SURFACES: BoxSurface[] = ['front', 'back', 'left', 'right', 'floor', 'lid'];

/**
 * Parse the objects textarea. One placed object per line:
 *   Surface,X,Y,Rotation,Offset,ObjectName
 *
 * Mirrors the boards textarea: X,Y is where the object's 0,0 CORNER lands in
 * that surface's user frame, rotation is CCW quarter turns about that corner,
 * and the name is everything past the 5th comma so commas inside it survive.
 *
 * Offset is the gap between the surface and the object's base face -- 0 for
 * something stuck straight to the wall, more for something on a spacer.
 */
export function parseObjectPlacementsText(
  text: string,
  ctx?: PlacementContext
): {
  placements: ObjectPlacement[];
  errors: ObjectPlacementParseError[];
} {
  const placements: ObjectPlacement[] = [];
  const errors: ObjectPlacementParseError[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('//')) continue;

    const head: string[] = [];
    let start = 0;
    let short = false;
    for (let f = 0; f < 5; f++) {
      const comma = raw.indexOf(',', start);
      if (comma === -1) {
        short = true;
        break;
      }
      head.push(raw.slice(start, comma).trim());
      start = comma + 1;
    }
    if (short) {
      errors.push({
        line: lineNo,
        reason: 'expected 6 fields (Surface,X,Y,Rotation,Offset,ObjectName)',
      });
      continue;
    }

    const surface = head[0].toLowerCase() as BoxSurface;
    if (!SURFACES.includes(surface)) {
      errors.push({ line: lineNo, reason: `Surface must be one of ${SURFACES.join(', ')}` });
      continue;
    }

    // Each numeric field may be an arithmetic expression -- see expr.ts.
    const vars = placementVariables(ctx, surface);
    const names = ['X', 'Y', 'Rotation', 'Offset'];
    const nums: number[] = [];
    let bad: string | null = null;
    for (let f = 0; f < 4; f++) {
      const { value, error } = evaluateExpression(head[f + 1], vars);
      if (value === null) {
        bad = `${names[f]}: ${error}`;
        break;
      }
      nums.push(value);
    }
    if (bad !== null) {
      errors.push({ line: lineNo, reason: bad });
      continue;
    }
    const [x, y, rotation, offset] = nums;
    if (!Number.isInteger(rotation / 90)) {
      errors.push({ line: lineNo, reason: `Rotation must be a multiple of 90, got ${rotation}` });
      continue;
    }

    const objectName = raw.slice(start).trim();
    if (objectName === '') {
      errors.push({ line: lineNo, reason: 'ObjectName is empty' });
      continue;
    }

    placements.push({ line: lineNo, surface, x, y, rotation, offset, objectName });
  }

  return { placements, errors };
}
