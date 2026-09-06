'use client';

import type { BoardPlacement, BoardPlacementParseError, ComponentsFacing } from './types';
import { evaluateExpression } from './expr';
import { placementVariables, type PlacementContext } from './placementVars';

/** How many commas precede the free-text BoardName field. */
const NAME_FIELD_INDEX = 10;

/**
 * Parse the boards textarea. One placed board per line, comma-delimited:
 *
 *   Surface,X,Y,Rotation,Components,StandoffHeight,StandoffOD,
 *   StandoffHoleDia,HoleDepth,BaseFillet,BoardName
 *
 * Surface is `floor` or `lid`. Components is `up` or `down` in WORLD Z -- which
 * way the board's component side points once it is in the box. There is
 * deliberately no "flip" boolean: the mirroring is derived from Components in
 * compile.ts, because the boolean is counter-intuitive in the common case (see
 * BOARD-MOUNTING.md section 3.2).
 *
 * Rotation is restricted to multiples of 90. Boards are rectangular and mount
 * square to the box in practice, and the restriction buys exactness: the
 * transform in compile.ts is integer arithmetic with no trigonometry, so a
 * quarter-turned board lands on precise coordinates rather than ones carrying
 * 1e-16 of float noise. It is also what makes connector cutouts possible at all
 * -- a board edge only faces a wall squarely at a quarter turn.
 *
 * BoardName is everything past the 10th comma, so commas inside a board's name
 * survive -- the same trick parseTextLabelsText uses for label text. Lines
 * starting with `//` are comments; blank lines are skipped.
 */
export function parseBoardsText(
  text: string,
  ctx?: PlacementContext
): {
  placements: BoardPlacement[];
  errors: BoardPlacementParseError[];
} {
  const placements: BoardPlacement[] = [];
  const errors: BoardPlacementParseError[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('//')) continue;

    const split = splitKeepingTail(raw, NAME_FIELD_INDEX);
    if (split === null) {
      errors.push({ line: lineNo, reason: 'expected 11 comma-separated fields' });
      continue;
    }
    const { head, tail } = split;

    const surface = head[0].toLowerCase();
    if (surface !== 'floor' && surface !== 'lid') {
      errors.push({ line: lineNo, reason: 'Surface must be "floor" or "lid"' });
      continue;
    }

    const components = parseComponents(head[4]);
    if (components === null) {
      errors.push({
        line: lineNo,
        reason: `Components must be "up" or "down" (world Z), got "${head[4]}"`,
      });
      continue;
    }

    // Everything except Surface (0) and Components (4) is numeric, and each may
    // be an arithmetic expression -- see expr.ts.
    const vars = placementVariables(ctx, surface);
    const fields: Array<[string, string]> = [
      ['X', head[1]],
      ['Y', head[2]],
      ['Rotation', head[3]],
      ['StandoffHeight', head[5]],
      ['StandoffOD', head[6]],
      ['StandoffHoleDia', head[7]],
      ['HoleDepth', head[8]],
      ['BaseFilletRadius', head[9]],
    ];
    const nums: number[] = [];
    let bad: string | null = null;
    for (const [name, token] of fields) {
      const { value, error } = evaluateExpression(token, vars);
      if (value === null) {
        bad = `${name}: ${error}`;
        break;
      }
      nums.push(value);
    }
    if (bad !== null) {
      errors.push({ line: lineNo, reason: bad });
      continue;
    }
    const [x, y, rotation, standoffHeight, standoffOd, standoffHoleDia, standoffHoleDepth, baseFillet] = nums;

    if (!Number.isInteger(rotation / 90)) {
      errors.push({
        line: lineNo,
        reason: `Rotation must be a multiple of 90, got ${rotation}`,
      });
      continue;
    }

    const boardName = tail.trim();
    if (boardName === '') {
      errors.push({ line: lineNo, reason: 'BoardName is empty' });
      continue;
    }

    placements.push({
      line: lineNo,
      surface,
      x,
      y,
      rotation,
      components,
      standoffHeight,
      standoffOd,
      standoffHoleDia,
      standoffHoleDepth,
      baseFillet,
      boardName,
    });
  }

  return { placements, errors };
}

function parseComponents(token: string): ComponentsFacing | null {
  const v = token.toLowerCase().trim();
  if (v === 'up' || v === 'down') return v;
  return null;
}

/**
 * Split into `count` trimmed leading fields plus everything after the
 * `count`-th comma, untouched. Returns null if there are too few commas.
 */
function splitKeepingTail(
  line: string,
  count: number
): { head: string[]; tail: string } | null {
  const head: string[] = [];
  let start = 0;
  for (let f = 0; f < count; f++) {
    const comma = line.indexOf(',', start);
    if (comma === -1) return null;
    head.push(line.slice(start, comma).trim());
    start = comma + 1;
  }
  return { head, tail: line.slice(start) };
}
