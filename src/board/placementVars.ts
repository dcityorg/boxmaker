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
 * All three are the extent of the surface THIS LINE names: `maxX` and `maxY` in
 * that surface's own user frame, `maxZ` perpendicular to it -- the clear
 * interior distance across to whatever faces it. For a wall they read as
 * (along the wall, height, depth to the opposite wall).
 *
 * So `maxX - 25.42 - 3.7` puts a part against the far edge with a 3.7 mm gap,
 * and `maxZ - 21.2` as an Offset pushes it across to the opposite wall. Both
 * keep meaning that after the box is resized.
 *
 * There are deliberately NO exterior box dimensions here. Gary asked what
 * boxL/boxW/boxH were for and the honest answer was nothing: everything placed
 * is INSIDE, so an exterior dimension is only ever a 2x-wall-thickness error
 * waiting to be made, and silently. maxX/maxY/maxZ already answer every
 * question they could. If a real need turns up, add a name that says what it
 * is rather than one that invites the mistake.
 */
export function placementVariables(
  ctx: PlacementContext | undefined,
  surface: BoxSurface
): Variables {
  if (!ctx) return {};
  const span = surfaceSpan(ctx.box, ctx.lid, surface);
  return { maxX: span.x, maxY: span.y, maxZ: span.z };
}

/** Human-readable list for error messages and the sidebar legend. */
export const PLACEMENT_VARIABLE_NAMES = ['maxX', 'maxY', 'maxZ'] as const;
