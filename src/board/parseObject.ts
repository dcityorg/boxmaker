'use client';

import type { ObjectCutout, ObjectDefinition, ObjectFace, ObjectParseError } from './types';

/**
 * Parse a *.object.txt definition -- a reusable non-printed part.
 *
 *   [object]     Name / Size key-value lines
 *   [cutouts]    Face, Round, X, Y, Z, Diameter, Clearance
 *                Face, Rect,  X, Y, Z, Width, Height, CornerRadius, Clearance
 *
 * Same shape as a board file so the two read alike: `//` comments anywhere on a
 * line, exact field counts, 1-based line numbers on every error.
 */
export function parseObjectFile(text: string): {
  object: ObjectDefinition | null;
  errors: ObjectParseError[];
} {
  const errors: ObjectParseError[] = [];
  const cutouts: ObjectCutout[] = [];

  let name: string | null = null;
  let sizeX: number | null = null;
  let sizeY: number | null = null;
  let sizeZ: number | null = null;

  let section: string | null = null;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = stripComment(lines[i]);
    if (raw === '') continue;

    const header = raw.match(/^\[([A-Za-z]+)\]$/);
    if (header) {
      section = header[1].toLowerCase();
      if (section !== 'object' && section !== 'cutouts') {
        errors.push({ line: lineNo, reason: `unknown section [${header[1]}]` });
        section = null;
      }
      continue;
    }
    if (section === null) {
      errors.push({ line: lineNo, reason: 'content before the first [section] header' });
      continue;
    }

    const tokens = raw.split(',').map((t) => t.trim());

    if (section === 'object') {
      const key = tokens[0].toLowerCase();
      if (key === 'name') {
        const idx = raw.indexOf(',');
        const value = idx === -1 ? '' : raw.slice(idx + 1).trim();
        if (value === '') errors.push({ line: lineNo, reason: 'Name is empty' });
        else name = value;
      } else if (key === 'size') {
        const nums = numbers(tokens.slice(1));
        if (tokens.length !== 4 || nums === null) {
          errors.push({ line: lineNo, reason: 'expected Size, <X>, <Y>, <Z>' });
        } else if (nums.some((n) => n <= 0)) {
          errors.push({ line: lineNo, reason: 'Size must be positive in all three axes' });
        } else {
          [sizeX, sizeY, sizeZ] = nums;
        }
      } else {
        errors.push({
          line: lineNo,
          reason: `unknown [object] key "${tokens[0]}" (Name, Size)`,
        });
      }
      continue;
    }

    // [cutouts]
    const face = parseFace(tokens[0]);
    if (face === null) {
      errors.push({
        line: lineNo,
        reason: `Face must be one of base top x+ x- y+ y-, got "${tokens[0]}"`,
      });
      continue;
    }
    const shape = (tokens[1] ?? '').toLowerCase();
    if (shape === 'round') {
      const nums = numbers(tokens.slice(2));
      if (tokens.length !== 7 || nums === null) {
        errors.push({
          line: lineNo,
          reason: `Round expects 7 fields (Face,Round,X,Y,Z,Diameter,Clearance), got ${tokens.length}`,
        });
        continue;
      }
      const [x, y, z, diameter, clearance] = nums;
      if (diameter <= 0) {
        errors.push({ line: lineNo, reason: 'Diameter must be positive' });
        continue;
      }
      cutouts.push({ line: lineNo, face, kind: 'round', x, y, z, diameter, clearance });
    } else if (shape === 'rect') {
      const nums = numbers(tokens.slice(2));
      if (tokens.length !== 9 || nums === null) {
        errors.push({
          line: lineNo,
          reason:
            `Rect expects 9 fields (Face,Rect,X,Y,Z,Width,Height,CornerRadius,Clearance), ` +
            `got ${tokens.length}`,
        });
        continue;
      }
      const [x, y, z, width, height, cornerRadius, clearance] = nums;
      if (width <= 0 || height <= 0) {
        errors.push({ line: lineNo, reason: 'Width and Height must be positive' });
        continue;
      }
      cutouts.push({ line: lineNo, face, kind: 'rect', x, y, z, width, height, cornerRadius, clearance });
    } else {
      errors.push({
        line: lineNo,
        reason: `Shape must be "Round" or "Rect", got "${tokens[1] ?? ''}"`,
      });
    }
  }

  if (name === null) errors.push({ line: 0, reason: '[object] Name is required' });
  if (sizeX === null) errors.push({ line: 0, reason: '[object] Size is required' });

  if (errors.length > 0) return { object: null, errors };
  return {
    object: {
      name: name as string,
      sizeX: sizeX as number,
      sizeY: sizeY as number,
      sizeZ: sizeZ as number,
      cutouts,
    },
    errors,
  };
}

function stripComment(line: string): string {
  const idx = line.indexOf('//');
  return (idx === -1 ? line : line.slice(0, idx)).trim();
}

function numbers(tokens: string[]): number[] | null {
  const nums = tokens.map((t) => parseFloat(t));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

function parseFace(token: string | undefined): ObjectFace | null {
  const v = (token ?? '').toLowerCase().replace(/\s+/g, '');
  if (v === 'base' || v === 'top' || v === 'x+' || v === 'x-' || v === 'y+' || v === 'y-') return v;
  return null;
}

/** Same insurance as normalizeBoardDefinition, for stored object definitions. */
export function normalizeObjectDefinition(o: ObjectDefinition): ObjectDefinition {
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    ...o,
    sizeX: num(o.sizeX, 1),
    sizeY: num(o.sizeY, 1),
    sizeZ: num(o.sizeZ, 1),
    cutouts: o.cutouts ?? [],
  };
}
