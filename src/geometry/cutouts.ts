'use client';

import { getManifold } from './manifold';
import type { Manifold } from 'manifold-3d';
import {
  type BoxParams,
  type LidParams,
  type CutoutParams,
  type CutoutSurface,
} from '@/store/useDesign';

const CIRCLE_SEGMENTS = 32;

/**
 * Build the 2D cross-section of a cutout centered on the XY origin.
 * Round: circle of given diameter.
 * Rect: rounded square (shrink + offset, same trick as the box outer profile).
 */
async function cutoutCrossSection(c: CutoutParams) {
  const { CrossSection } = await getManifold();

  if (c.kind === 'round') {
    return CrossSection.circle(Math.max(0.01, c.diameter / 2), CIRCLE_SEGMENTS);
  }

  // rect
  const w = Math.max(0.01, c.width);
  const h = Math.max(0.01, c.height);
  const r = Math.max(0, Math.min(c.cornerRadius, Math.min(w, h) / 2 - 0.001));

  if (r <= 0) {
    return CrossSection.square([w, h], true);
  }
  // Shrink the square by 2r in each dimension, then inflate by r with
  // round joins -- same pattern used in box.ts and lid.ts.
  return CrossSection.square([w - 2 * r, h - 2 * r], true).offset(
    r,
    'Round',
    2,
    32
  );
}

/**
 * Build one cutout prism in world coordinates, ready to be subtracted from
 * the box body (for floor/wall cutouts) or the lid body (for lid cutouts).
 *
 * The prism's long axis is centered on origin, then rotated to align with the
 * surface's outward normal, then translated to the cutout center on the
 * surface. The prism is intentionally long (well past any wall thickness) so
 * the subtract always pierces cleanly.
 */
async function buildOneCutout(
  c: CutoutParams,
  box: BoxParams,
  lid: LidParams
): Promise<Manifold> {
  const { Manifold } = await getManifold();

  const xs = await cutoutCrossSection(c);

  // Prism length: just enough to pierce the target material with ~1mm
  // overshoot on each face. Keeping it short prevents (e.g.) a front-wall
  // cutout from also slicing through the back wall, and stops floor / lid
  // cutouts from extending into standoffs that share their XY footprint.
  const PRISM_OVERSHOOT = 2; // mm total -- 1mm beyond each face
  let prismLength: number;
  switch (c.surface) {
    case 'floor':
      prismLength = box.floorThickness + PRISM_OVERSHOOT;
      break;
    case 'lid':
      prismLength = lid.coverThicknessAtEdge + PRISM_OVERSHOOT;
      break;
    default:
      prismLength = box.wallThickness + PRISM_OVERSHOOT;
      break;
  }

  // center=true keeps the prism centered on origin along Z
  let prism = Manifold.extrude(xs, prismLength, undefined, undefined, undefined, true);
  xs.delete();

  // Rotation + translation per surface. See the derivation table below.
  //
  // Each wall defines a local 2D frame (u, v) on the surface plus an outward
  // normal n. The cutout's (x, y) are measured in (u, v) from the surface's
  // origin. Rotations align the prism's default frame [+X, +Y, +Z] with
  // [u, v, n] in world coords. (See PROJECT-BRIEF.md sec 3.9 for the
  // user-facing convention; the per-wall math is documented inline.)
  switch (c.surface) {
    case 'floor': {
      // Floor 0,0 at the box's interior BACK-RIGHT corner (Fusion BoxMaker
      // convention): "lower-left" when viewing the floor from a top view.
      // User +X grows toward the world -X side; user +Y grows toward the
      // world -Y side (front). Prism centered at the floor's mid-thickness
      // so it pierces cleanly with a ~1mm overshoot on each face.
      const wx = +box.length / 2 - box.wallThickness - c.x;
      const wy = +box.width / 2 - box.wallThickness - c.y;
      prism = prism.translate(wx, wy, box.floorThickness / 2);
      break;
    }
    case 'lid': {
      // Lid is modeled standalone: shoulder z in [0, shoulderDepth], plate
      // above. Cutout pierces through the plate; center the prism on the
      // plate's mid-thickness so it bites symmetrically.
      //
      // Lid coordinate frame (matches Fusion BoxMaker, intentionally
      // different from the floor):
      //   0,0 at the BACK-LEFT inner corner of the shoulder pocket. This is
      //   "bottom-left" when you lie inside the box with your head against
      //   the back wall and look up at the lid. User +X grows toward the
      //   right (world +X, unchanged); user +Y grows toward the FRONT (world
      //   -Y, opposite of the floor convention). The inner-radius on the
      //   pocket corners is ignored -- 0,0 references the square corner.
      const inset = box.wallThickness + lid.boxGap + lid.coverShoulderWallThickness;
      const wx = -box.length / 2 + inset + c.x;
      const wy = +box.width / 2 - inset - c.y;
      const plateMidZ = lid.coverShoulderDepth + lid.coverThicknessAtEdge / 2;
      prism = prism.translate(wx, wy, plateMidZ);
      break;
    }
    case 'front': {
      // Wall material at world Y in [-W/2, -W/2 + wallT]. Center the prism
      // INSIDE the wall (not on the outer face) so its short length covers
      // the wall material without overshooting to the opposite wall.
      // u=+X, v=+Z (up), n=-Y. 90 deg around X sends [+X, +Y, +Z] -> [+X, +Z, -Y].
      prism = prism.rotate([90, 0, 0]);
      const wx = -box.length / 2 + box.wallThickness + c.x;
      const wy = -box.width / 2 + box.wallThickness / 2;
      const wz = box.floorThickness + c.y;
      prism = prism.translate(wx, wy, wz);
      break;
    }
    case 'back': {
      // Wall material at world Y in [+W/2 - wallT, +W/2]. u=-X, v=+Z, n=+Y.
      // -90 around X then 180 around Y: -> [-X, +Z, +Y].
      prism = prism.rotate([-90, 0, 0]);
      prism = prism.rotate([0, 180, 0]);
      const wx = box.length / 2 - box.wallThickness - c.x;
      const wy = box.width / 2 - box.wallThickness / 2;
      const wz = box.floorThickness + c.y;
      prism = prism.translate(wx, wy, wz);
      break;
    }
    case 'left': {
      // Wall material at world X in [-L/2, -L/2 + wallT]. u=-Y, v=+Z, n=-X.
      // -90 around Y then 90 around X: -> [-Y, +Z, -X].
      prism = prism.rotate([0, -90, 0]);
      prism = prism.rotate([90, 0, 0]);
      const wx = -box.length / 2 + box.wallThickness / 2;
      const wy = box.width / 2 - box.wallThickness - c.x;
      const wz = box.floorThickness + c.y;
      prism = prism.translate(wx, wy, wz);
      break;
    }
    case 'right': {
      // Wall material at world X in [+L/2 - wallT, +L/2]. u=+Y, v=+Z, n=+X.
      // 90 around Y then 90 around X: -> [+Y, +Z, +X].
      prism = prism.rotate([0, 90, 0]);
      prism = prism.rotate([90, 0, 0]);
      const wx = box.length / 2 - box.wallThickness / 2;
      const wy = -box.width / 2 + box.wallThickness + c.x;
      const wz = box.floorThickness + c.y;
      prism = prism.translate(wx, wy, wz);
      break;
    }
  }

  return prism;
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
 * Build the union of all cutouts on the BOX body (front/back/left/right walls
 * + floor). The caller subtracts this from the box body.
 */
export async function buildBoxCutouts(
  box: BoxParams,
  lid: LidParams,
  cutouts: CutoutParams[]
): Promise<Manifold | null> {
  const boxSurfaces: CutoutSurface[] = ['front', 'back', 'left', 'right', 'floor'];
  const filtered = cutouts.filter((c) => boxSurfaces.includes(c.surface));
  if (filtered.length === 0) return null;

  const prisms: Manifold[] = [];
  for (const c of filtered) {
    prisms.push(await buildOneCutout(c, box, lid));
  }
  return unionAll(prisms);
}

/**
 * Build the union of all cutouts on the LID body (lid surface only). The
 * caller subtracts this from the lid body. Note: this is built in lid-local
 * coordinates (matching how the lid is modeled in lid.ts).
 */
export async function buildLidCutouts(
  box: BoxParams,
  lid: LidParams,
  cutouts: CutoutParams[]
): Promise<Manifold | null> {
  const filtered = cutouts.filter((c) => c.surface === 'lid');
  if (filtered.length === 0) return null;

  const prisms: Manifold[] = [];
  for (const c of filtered) {
    prisms.push(await buildOneCutout(c, box, lid));
  }
  return unionAll(prisms);
}
