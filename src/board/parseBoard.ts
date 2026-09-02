'use client';

import type {
  BoardCutout,
  BoardDefinition,
  BoardEdge,
  BoardEdgeCutout,
  BoardFeatureSide,
  BoardKeepout,
  BoardMount,
  BoardParseError,
} from './types';

/**
 * Parse a *.board.txt board definition file.
 *
 * Sectioned plain text. Section headers are `[name]` on their own line; body
 * lines are comma-delimited in the same style as the app's textareas.
 *
 *   [board]      Name / Size / Thickness / CornerRadius / Height / HeightBelow
 *   [mounts]     X, Y, BoardHoleDia
 *   [cutouts]    Side, Shape, X, Y, <shape args>, Clearance
 *   [edges]      Edge, Pos, Z, SizeAlong, SizeZ, CornerRadius, Clearance
 *   [keepouts]   X, Y, SizeX, SizeY, Height, Side          (optional)
 *
 * `//` starts a comment anywhere on a line, including after data, and runs to
 * the end of the line. That differs from the design textareas, which only
 * honour `//` at the start of a line -- a board file is written once and read
 * many times, so trailing notes earn their keep.
 *
 * Errors carry 1-based line numbers so the importer can point at the offending
 * row. A file with any error is not turned into a BoardDefinition.
 */
export function parseBoardFile(text: string): {
  board: BoardDefinition | null;
  errors: BoardParseError[];
} {
  const errors: BoardParseError[] = [];
  const mounts: BoardMount[] = [];
  const cutouts: BoardCutout[] = [];
  const edges: BoardEdgeCutout[] = [];
  const keepouts: BoardKeepout[] = [];

  let name: string | null = null;
  let sizeX: number | null = null;
  let sizeY: number | null = null;
  let thickness = 1.6;
  let cornerRadius = 0;
  let height = 0;        // 0 = not measured; treated as a bare PCB
  let heightBelow = 0;

  let section: string | null = null;
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = stripComment(lines[i]);
    if (raw === '') continue;

    const header = raw.match(/^\[([A-Za-z]+)\]$/);
    if (header) {
      section = header[1].toLowerCase();
      if (!['board', 'mounts', 'cutouts', 'keepouts', 'edges'].includes(section)) {
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

    switch (section) {
      case 'board': {
        const key = tokens[0].toLowerCase();
        if (key === 'name') {
          // Free text: everything past the first comma, so commas survive.
          const idx = raw.indexOf(',');
          const value = idx === -1 ? '' : raw.slice(idx + 1).trim();
          if (value === '') {
            errors.push({ line: lineNo, reason: 'Name is empty' });
          } else {
            name = value;
          }
        } else if (key === 'size') {
          const nums = numbers(tokens.slice(1));
          if (tokens.length !== 3 || nums === null) {
            errors.push({ line: lineNo, reason: 'expected Size, <X>, <Y>' });
          } else if (nums[0] <= 0 || nums[1] <= 0) {
            errors.push({ line: lineNo, reason: 'Size must be positive' });
          } else {
            [sizeX, sizeY] = nums;
          }
        } else if (
          key === 'thickness' ||
          key === 'cornerradius' ||
          key === 'height' ||
          key === 'heightbelow'
        ) {
          const nums = numbers(tokens.slice(1));
          if (tokens.length !== 2 || nums === null) {
            errors.push({ line: lineNo, reason: `expected ${tokens[0]}, <value>` });
          } else if (nums[0] < 0) {
            errors.push({ line: lineNo, reason: `${tokens[0]} cannot be negative` });
          } else if (key === 'thickness') {
            thickness = nums[0];
          } else if (key === 'cornerradius') {
            cornerRadius = nums[0];
          } else if (key === 'height') {
            height = nums[0];
          } else {
            heightBelow = nums[0];
          }
        } else {
          errors.push({
            line: lineNo,
            reason: `unknown [board] key "${tokens[0]}" (Name, Size, Thickness, CornerRadius, Height, HeightBelow)`,
          });
        }
        break;
      }

      case 'mounts': {
        const nums = numbers(tokens);
        if (tokens.length !== 3 || nums === null) {
          errors.push({ line: lineNo, reason: `expected 3 fields (X,Y,HoleDia), got ${tokens.length}` });
          break;
        }
        const [x, y, holeDia] = nums;
        if (holeDia <= 0) {
          errors.push({ line: lineNo, reason: 'HoleDia must be positive' });
          break;
        }
        mounts.push({ line: lineNo, x, y, holeDia });
        break;
      }

      case 'cutouts': {
        const side = parseSide(tokens[0]);
        if (side === null) {
          errors.push({ line: lineNo, reason: `Side must be "top" or "bottom", got "${tokens[0]}"` });
          break;
        }
        const kind = (tokens[1] ?? '').toLowerCase();
        if (kind === 'round') {
          const nums = numbers(tokens.slice(2));
          if (tokens.length !== 6 || nums === null) {
            errors.push({
              line: lineNo,
              reason: `Round expects 6 fields (Side,Round,X,Y,Diameter,Clearance), got ${tokens.length}`,
            });
            break;
          }
          const [x, y, diameter, clearance] = nums;
          if (diameter <= 0) {
            errors.push({ line: lineNo, reason: 'Diameter must be positive' });
            break;
          }
          cutouts.push({ line: lineNo, side, kind: 'round', x, y, diameter, clearance });
        } else if (kind === 'rect') {
          const nums = numbers(tokens.slice(2));
          if (tokens.length !== 8 || nums === null) {
            errors.push({
              line: lineNo,
              reason:
                `Rect expects 8 fields (Side,Rect,X,Y,SizeX,SizeY,CornerRadius,Clearance), got ${tokens.length}`,
            });
            break;
          }
          const [x, y, sx, sy, cr, clearance] = nums;
          if (sx <= 0 || sy <= 0) {
            errors.push({ line: lineNo, reason: 'SizeX and SizeY must be positive' });
            break;
          }
          cutouts.push({ line: lineNo, side, kind: 'rect', x, y, sizeX: sx, sizeY: sy, cornerRadius: cr, clearance });
        } else {
          errors.push({ line: lineNo, reason: `Shape must be "Round" or "Rect", got "${tokens[1] ?? ''}"` });
        }
        break;
      }

      case 'keepouts': {
        const side = parseSide(tokens[5]);
        const nums = numbers(tokens.slice(0, 5));
        if (tokens.length !== 6 || nums === null || side === null) {
          errors.push({
            line: lineNo,
            reason: `expected 6 fields (X,Y,SizeX,SizeY,Height,Side), got ${tokens.length}`,
          });
          break;
        }
        const [x, y, sx, sy, height] = nums;
        if (sx <= 0 || sy <= 0 || height <= 0) {
          errors.push({ line: lineNo, reason: 'SizeX, SizeY and Height must be positive' });
          break;
        }
        keepouts.push({ line: lineNo, x, y, sizeX: sx, sizeY: sy, height, side });
        break;
      }

      case 'edges': {
        const edge = parseEdge(tokens[0]);
        const nums = numbers(tokens.slice(1));
        if (tokens.length !== 7 || nums === null || edge === null) {
          errors.push({
            line: lineNo,
            reason:
              `expected 7 fields (Edge,Pos,Z,SizeAlong,SizeZ,CornerRadius,Clearance) ` +
              `with Edge one of x+ x- y+ y-, got ${tokens.length} fields`,
          });
          break;
        }
        const [pos, z, sizeAlong, sizeZ, cornerRadius, clearance] = nums;
        if (sizeAlong <= 0 || sizeZ <= 0) {
          errors.push({ line: lineNo, reason: 'SizeAlong and SizeZ must be positive' });
          break;
        }
        edges.push({ line: lineNo, edge, pos, z, sizeAlong, sizeZ, cornerRadius, clearance });
        break;
      }
    }
  }

  if (name === null) errors.push({ line: 0, reason: '[board] Name is required' });
  if (sizeX === null || sizeY === null) errors.push({ line: 0, reason: '[board] Size is required' });
  if (mounts.length === 0) errors.push({ line: 0, reason: 'at least one [mounts] hole is required' });
  if (height > 0 && height < thickness) {
    errors.push({
      line: 0,
      reason: `Height (${height}) is less than Thickness (${thickness}) -- Height is measured from the NON-component face, so it includes the board itself`,
    });
  }

  if (errors.length > 0) return { board: null, errors };

  return {
    board: {
      name: name as string,
      sizeX: sizeX as number,
      sizeY: sizeY as number,
      thickness,
      cornerRadius,
      height,
      heightBelow,
      mounts,
      cutouts,
      edges,
      keepouts,
    },
    errors,
  };
}

/** Drop a `//` comment wherever it starts, then trim. */
function stripComment(line: string): string {
  const idx = line.indexOf('//');
  return (idx === -1 ? line : line.slice(0, idx)).trim();
}

/** Parse every token as a finite number, or null if any fails. */
function numbers(tokens: string[]): number[] | null {
  const nums = tokens.map((t) => parseFloat(t));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

function parseEdge(token: string | undefined): BoardEdge | null {
  const v = (token ?? '').toLowerCase().replace(/\s+/g, '');
  if (v === 'x+' || v === 'x-' || v === 'y+' || v === 'y-') return v;
  return null;
}

function parseSide(token: string | undefined): BoardFeatureSide | null {
  const v = (token ?? '').toLowerCase();
  if (v === 'top' || v === 'bottom') return v;
  return null;
}
