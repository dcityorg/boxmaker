'use client';

import type { BoxParams, LidParams } from '@/store/useDesign';
// Relative, not `@/`: this is a RUNTIME import, and npm run check:board runs the
// emitted JS under plain node, which does not resolve the path alias. Type-only
// imports may use `@/` freely because they erase.
import { surfaceSpan } from '../validation/checks';
import type { BoxSurface } from './types';
import type { Variables } from './expr';

/** What a placement line can refer to by name. */
export interface PlacementContext {
  box: BoxParams;
  lid: LidParams;
}

/**
 * The names available in a placement line's numeric fields.
 *
 * `maxX` and `maxY` are the extent of the surface THIS LINE names, in that
 * surface's own user frame -- so `maxX - 25.42 - 3.7` puts a part against the
 * far edge with a 3.7 mm gap, and keeps doing so after the box is resized. They
 * come from surfaceSpan() in validation/checks.ts, so they agree exactly with
 * what the "extends past the edge" warning measures.
 *
 * The box dimensions are here too, for the cases the spans do not cover.
 */
export function placementVariables(
  ctx: PlacementContext | undefined,
  surface: BoxSurface
): Variables {
  if (!ctx) return {};
  const span = surfaceSpan(ctx.box, ctx.lid, surface);
  return {
    maxX: span.x,
    maxY: span.y,
    boxL: ctx.box.length,
    boxW: ctx.box.width,
    boxH: ctx.box.height,
    wall: ctx.box.wallThickness,
    floor: ctx.box.floorThickness,
  };
}

/** Human-readable list for error messages and the sidebar legend. */
export const PLACEMENT_VARIABLE_NAMES = [
  'maxX',
  'maxY',
  'boxL',
  'boxW',
  'boxH',
  'wall',
  'floor',
] as const;
