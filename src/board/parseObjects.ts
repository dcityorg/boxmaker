'use client';

import type { BoxObjectParams, BoxObjectParseError } from './types';

/**
 * Kept out of the store so it stays a pure function with type-only imports --
 * the acceptance check runs this file directly under node, where a runtime
 * import of the Zustand store could not resolve.
 */
const OBJECT_SURFACES: Array<BoxObjectParams['surface']> = [
  'front', 'back', 'left', 'right', 'floor', 'lid',
];

/**
 * Parse the objects textarea. One non-printed occupant per line:
 *   Surface,X,Y,SizeX,SizeY,Depth,Offset,Name
 *
 * Objects never touch geometry -- they are drawn as ghosts and checked for
 * interference, nothing more. They anchor to one of the six surfaces and use
 * THAT surface's existing user frame, the same one its cutouts use, so there is
 * no new coordinate system: a battery on the floor is `floor`, and the same
 * battery velcroed to a wall is `left`, whose frame already measures height up
 * from the interior floor.
 *
 * Name is everything past the 7th comma, so commas inside a name survive.
 */
export function parseObjectsText(text: string): {
  objects: BoxObjectParams[];
  errors: BoxObjectParseError[];
} {
  const objects: BoxObjectParams[] = [];
  const errors: BoxObjectParseError[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('//')) continue;

    // Split the seven fixed fields, then take the rest as the name.
    const head: string[] = [];
    let start = 0;
    let short = false;
    for (let f = 0; f < 7; f++) {
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
        line: i + 1,
        reason: 'expected 8 fields (Surface,X,Y,SizeX,SizeY,Depth,Offset,Name)',
      });
      continue;
    }

    const surface = head[0].toLowerCase();
    if (!OBJECT_SURFACES.includes(surface as BoxObjectParams['surface'])) {
      errors.push({
        line: i + 1,
        reason: `Surface must be one of ${OBJECT_SURFACES.join(', ')}`,
      });
      continue;
    }

    const nums = head.slice(1).map((t) => parseFloat(t));
    if (nums.some((n) => !Number.isFinite(n))) {
      errors.push({ line: i + 1, reason: 'non-numeric field' });
      continue;
    }
    const [x, y, sizeX, sizeY, depth, offset] = nums;
    if (sizeX <= 0 || sizeY <= 0 || depth <= 0) {
      errors.push({ line: i + 1, reason: 'SizeX, SizeY and Depth must be positive' });
      continue;
    }

    const name = raw.slice(start).trim();
    if (name === '') {
      errors.push({ line: i + 1, reason: 'Name is empty' });
      continue;
    }

    objects.push({
      line: i + 1,
      surface: surface as BoxObjectParams['surface'],
      x, y, sizeX, sizeY, depth, offset, name,
    });
  }

  return { objects, errors };
}

