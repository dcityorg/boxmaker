'use client';

import type { BoxParams, CutoutSurface, LidParams } from '@/store/useDesign';

export type Vec3 = readonly [number, number, number];

/**
 * A surface's frame in world coordinates.
 *
 * `origin` is world position of that surface's user (0, 0), on its INTERIOR
 * face. `u` and `v` are unit vectors along its user +X and +Y. `n` is the unit
 * inward normal -- the direction something sitting on the surface grows.
 *
 * This makes every surface interchangeable: a point at user (x, y) standing `d`
 * off the surface is `origin + u*x + v*y + n*d`, whichever surface it is. The
 * per-surface special cases in geometry/cutouts.ts:99-176 remain the authority
 * and are untouched; this mirrors them so objects can be resolved generically
 * instead of growing a sixth hand-written copy of the same table.
 */
export interface SurfaceBasis {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  n: Vec3;
}

export function surfaceBasis(
  surface: CutoutSurface,
  box: BoxParams,
  lid: LidParams
): SurfaceBasis {
  const hl = box.length / 2;
  const hw = box.width / 2;
  const t = box.wallThickness;
  const inset = t + lid.boxGap + lid.coverShoulderWallThickness;

  switch (surface) {
    case 'floor':
      // User 0,0 at the interior FRONT-LEFT corner; grows up into the box.
      return {
        origin: [-hl + t, -hw + t, box.floorThickness],
        u: [1, 0, 0],
        v: [0, 1, 0],
        n: [0, 0, 1],
      };
    case 'lid':
      // The plate underside rests on the box rim at z = box.height. User +X is
      // mirrored because the underside is what you see from inside.
      return {
        origin: [hl - inset, -hw + inset, box.height],
        u: [-1, 0, 0],
        v: [0, 1, 0],
        n: [0, 0, -1],
      };
    // Walls: user 0,0 at the interior bottom-left AS VIEWED FROM INSIDE, user
    // +Y straight up from the INTERIOR floor.
    case 'front':
      return {
        origin: [hl - t, -hw + t, box.floorThickness],
        u: [-1, 0, 0],
        v: [0, 0, 1],
        n: [0, 1, 0],
      };
    case 'back':
      return {
        origin: [-hl + t, hw - t, box.floorThickness],
        u: [1, 0, 0],
        v: [0, 0, 1],
        n: [0, -1, 0],
      };
    case 'left':
      return {
        origin: [-hl + t, -hw + t, box.floorThickness],
        u: [0, 1, 0],
        v: [0, 0, 1],
        n: [1, 0, 0],
      };
    default:
      return {
        origin: [hl - t, hw - t, box.floorThickness],
        u: [0, -1, 0],
        v: [0, 0, 1],
        n: [-1, 0, 0],
      };
  }
}

/** Surface user (x, y) standing `depth` off the surface -> world. */
export function surfacePointToWorld(
  b: SurfaceBasis,
  x: number,
  y: number,
  depth: number
): Vec3 {
  return [
    b.origin[0] + b.u[0] * x + b.v[0] * y + b.n[0] * depth,
    b.origin[1] + b.u[1] * x + b.v[1] * y + b.n[1] * depth,
    b.origin[2] + b.u[2] * x + b.v[2] * y + b.n[2] * depth,
  ];
}

/**
 * World point -> that surface's user (x, y), dropping the normal component.
 *
 * Dropping it IS the orthographic projection along the surface normal, which is
 * what a cutout does: a feature anywhere inside the box lands on the surface it
 * points at, however far away it started.
 */
export function worldToSurfacePoint(b: SurfaceBasis, p: Vec3): { x: number; y: number } {
  const d: Vec3 = [p[0] - b.origin[0], p[1] - b.origin[1], p[2] - b.origin[2]];
  return { x: dot(d, b.u), y: dot(d, b.v) };
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Every surface, keyed by the inward normal it presents. */
const BY_INWARD_NORMAL: Array<{ surface: CutoutSurface; n: Vec3 }> = [
  { surface: 'floor', n: [0, 0, 1] },
  { surface: 'lid', n: [0, 0, -1] },
  { surface: 'front', n: [0, 1, 0] },
  { surface: 'back', n: [0, -1, 0] },
  { surface: 'left', n: [1, 0, 0] },
  { surface: 'right', n: [-1, 0, 0] },
];

/**
 * Which surface a feature pointing in world direction `dir` exits through.
 *
 * A feature heading in +X leaves through the right wall, whose inward normal is
 * -X, so the match is the surface whose normal opposes the direction. `dir` must
 * be axis-aligned, which it always is here: object rotation is restricted to
 * quarter turns for exactly this reason.
 */
export function surfaceFacing(dir: Vec3): CutoutSurface | null {
  for (const s of BY_INWARD_NORMAL) {
    if (dot(dir, s.n) < -0.5) return s.surface;
  }
  return null;
}
