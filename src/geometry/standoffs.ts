'use client';

import { getManifold } from './manifold';
import type { Manifold } from 'manifold-3d';
import {
  type BoxParams,
  type LidParams,
  type StandoffParams,
} from '@/store/useDesign';

const CYLINDER_SEGMENTS = 32;

/**
 * Build one standoff body (cylinder, optionally with a base fillet) standing
 * upright with its BASE at z=0 and axis on +Z. The "base" is the surface-
 * attached end (where the fillet, if any, blooms outward). Caller orients
 * (floor: as-is; lid: mirror over XY) and translates into place.
 *
 * Fillet implementation: revolve a 2D profile around the Y axis. The profile
 * is a rectangle (radius r, height h) with a quarter-circle bulge of radius
 * `f` at the (0, 0) corner. Manifold's `revolve` treats input Y as output Z.
 */
async function buildStandoffBody(s: StandoffParams): Promise<Manifold> {
  const { Manifold, CrossSection } = await getManifold();
  const r = s.od / 2;
  const h = s.height;
  const f = Math.min(s.baseFillet, r - 0.05, h - 0.05);

  if (f <= 0) {
    return Manifold.cylinder(h, r, undefined, CYLINDER_SEGMENTS, false);
  }

  const ARC_SEGMENTS = 8;
  const profile: [number, number][] = [];
  profile.push([0, 0]);
  profile.push([r + f, 0]);
  // Quarter arc, centered at (r+f, f), from angle -π/2 to -π (CW in XY).
  for (let i = 1; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    const angle = -Math.PI / 2 - t * (Math.PI / 2);
    profile.push([
      (r + f) + f * Math.cos(angle),
      f + f * Math.sin(angle),
    ]);
  }
  profile.push([r, h]);
  profile.push([0, h]);

  const xs = new CrossSection(profile);
  const solid = Manifold.revolve(xs, CYLINDER_SEGMENTS);
  xs.delete();
  return solid;
}

/** Hole cylinder centered on +Z, base at z=0, extending up by holeDepth. */
async function buildStandoffHole(s: StandoffParams): Promise<Manifold | null> {
  if (s.holeDia <= 0 || s.holeDepth <= 0) return null;
  const { Manifold } = await getManifold();
  return Manifold.cylinder(s.holeDepth, s.holeDia / 2, undefined, CYLINDER_SEGMENTS, false);
}

/**
 * Floor anchor (matches Fusion BoxMaker): 0,0 at the interior BACK-RIGHT
 * corner -- the "lower-left" of the top-down view convention. User +X grows
 * toward the world -X side; user +Y grows toward the world -Y side (front).
 */
function floorAnchorXY(box: BoxParams, x: number, y: number): { wx: number; wy: number } {
  return {
    wx: +box.length / 2 - box.wallThickness - x,
    wy: +box.width / 2 - box.wallThickness - y,
  };
}

/**
 * Lid anchor (matches Fusion BoxMaker): 0,0 at the BACK-LEFT inner corner
 * of the shoulder pocket -- the "bottom-left" when you lie inside the box
 * with your head against the back wall and look up at the lid.
 *
 * +X grows toward the right (world +X, same as floor). +Y grows toward the
 * FRONT (world -Y, OPPOSITE of the floor). The inner-radius on the pocket
 * corners is ignored -- 0,0 references the square corner.
 */
function lidAnchorXY(
  box: BoxParams,
  lid: LidParams,
  x: number,
  y: number
): { wx: number; wy: number } {
  const inset = box.wallThickness + lid.boxGap + lid.coverShoulderWallThickness;
  return {
    wx: -box.length / 2 + inset + x,
    wy: +box.width / 2 - inset - y,
  };
}

function unionAll(arr: Manifold[]): Manifold | null {
  if (arr.length === 0) return null;
  let acc = arr[0];
  for (let i = 1; i < arr.length; i++) {
    const next = acc.add(arr[i]);
    acc.delete();
    arr[i].delete();
    acc = next;
  }
  return acc;
}

/**
 * Build all floor-surface standoffs (rising from the interior floor).
 * Returns separated bodies + holes so the caller can union bodies into the
 * box body and then subtract holes — that lets `HoleDepth > Height` cut
 * through the standoff AND continue into the floor material in a single
 * boolean step.
 */
export async function buildFloorStandoffs(
  box: BoxParams,
  standoffs: StandoffParams[]
): Promise<{ bodies: Manifold | null; holes: Manifold | null }> {
  const floor = standoffs.filter((s) => s.surface === 'floor');
  if (floor.length === 0) return { bodies: null, holes: null };

  const bodies: Manifold[] = [];
  const holes: Manifold[] = [];

  for (const s of floor) {
    const { wx, wy } = floorAnchorXY(box, s.x, s.y);
    const baseZ = box.floorThickness; // standoff base sits on the interior floor

    const body = await buildStandoffBody(s);
    bodies.push(body.translate(wx, wy, baseZ));
    body.delete();

    const hole = await buildStandoffHole(s);
    if (hole) {
      // Hole drilled from the free end (top, z = baseZ + height) down by holeDepth.
      const holeBaseZ = baseZ + s.height - s.holeDepth;
      holes.push(hole.translate(wx, wy, holeBaseZ));
      hole.delete();
    }
  }

  return { bodies: unionAll(bodies), holes: unionAll(holes) };
}

/**
 * Build all lid-surface standoffs (hanging from the underside of the lid plate).
 *
 * The lid is modeled standalone with its underside at z=0 — shoulder occupies
 * z ∈ [0, shoulderDepth], plate above that. A lid standoff's attached (filleted)
 * end is at the plate's underside (z = shoulderDepth); its free end hangs at
 * z = shoulderDepth - height. To get the fillet at the TOP (where it joins the
 * plate), we mirror the unit standoff across the XY plane before translating.
 */
export async function buildLidStandoffs(
  box: BoxParams,
  lid: LidParams,
  standoffs: StandoffParams[]
): Promise<{ bodies: Manifold | null; holes: Manifold | null }> {
  const lidOnes = standoffs.filter((s) => s.surface === 'lid');
  if (lidOnes.length === 0) return { bodies: null, holes: null };

  const bodies: Manifold[] = [];
  const holes: Manifold[] = [];

  for (const s of lidOnes) {
    const { wx, wy } = lidAnchorXY(box, lid, s.x, s.y);

    const upright = await buildStandoffBody(s);
    // Mirror over XY plane so the fillet end (was z=0) ends up at z=0 after
    // flipping orientation — i.e., body now extends z ∈ [-height, 0], with
    // the attached end at z=0 and the free end at z=-height. Then translate up
    // so the attached end lands at z = shoulderDepth.
    const flipped = upright.mirror([0, 0, 1]);
    upright.delete();
    bodies.push(flipped.translate(wx, wy, lid.coverShoulderDepth));
    flipped.delete();

    const hole = await buildStandoffHole(s);
    if (hole) {
      // Hole drilled from the free (bottom) end upward by holeDepth.
      const holeBaseZ = lid.coverShoulderDepth - s.height;
      holes.push(hole.translate(wx, wy, holeBaseZ));
      hole.delete();
    }
  }

  return { bodies: unionAll(bodies), holes: unionAll(holes) };
}
