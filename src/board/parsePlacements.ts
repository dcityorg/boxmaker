'use client';

import type { BoardPlacement, BoardPlacementParseError, ComponentsFacing } from './types';

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
 * BoardName is everything past the 10th comma, so commas inside a board's name
 * survive -- the same trick parseTextLabelsText uses for label text. Lines
 * starting with `//` are comments; blank lines are skipped.
 */
export function parseBoardsText(text: string): {
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

    // Everything except Surface (0) and Components (4) is numeric.
    const numericTokens = [head[1], head[2], head[3], head[5], head[6], head[7], head[8], head[9]];
    const nums = numericTokens.map((t) => parseFloat(t));
    if (nums.some((n) => !Number.isFinite(n))) {
      errors.push({ line: lineNo, reason: 'non-numeric field' });
      continue;
    }
    const [x, y, rotation, standoffHeight, standoffOd, standoffHoleDia, standoffHoleDepth, baseFillet] = nums;

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
