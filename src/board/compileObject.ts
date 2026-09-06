'use client';

import type { CutoutParams, BoxParams, LidParams } from '@/store/useDesign';
import type { ObjectDefinition, ObjectFace, ObjectPlacement } from './types';
import { quarterTurns } from './compile';
import {
  dot,
  surfaceBasis,
  surfaceFacing,
  surfacePointToWorld,
  worldToSurfacePoint,
  type SurfaceBasis,
  type Vec3,
} from './surfaces';

export interface CompiledObject {
  cutouts: CutoutParams[];
  errors: string[];
}

/** Outward direction of each object face, in object-local axes. */
const FACE_NORMAL: Record<ObjectFace, Vec3> = {
  base: [0, 0, -1],
  top: [0, 0, 1],
  'x+': [1, 0, 0],
  'x-': [-1, 0, 0],
  'y+': [0, 1, 0],
  'y-': [0, -1, 0],
};

/**
 * A face's two free axes, in X, Y, Z order -- Width runs along the first,
 * Height along the second.
 */
const FACE_AXES: Record<ObjectFace, [Vec3, Vec3]> = {
  base: [[1, 0, 0], [0, 1, 0]],
  top: [[1, 0, 0], [0, 1, 0]],
  'x+': [[0, 1, 0], [0, 0, 1]],
  'x-': [[0, 1, 0], [0, 0, 1]],
  'y+': [[1, 0, 0], [0, 0, 1]],
  'y-': [[1, 0, 0], [0, 0, 1]],
};

function rotateQuarter(x: number, y: number, q: number): [number, number] {
  switch (((q % 4) + 4) % 4) {
    case 1:
      return [-y, x];
    case 2:
      return [-x, -y];
    case 3:
      return [y, -x];
    default:
      return [x, y];
  }
}

/** Object-local point -> world. */
function localPointToWorld(
  p: ObjectPlacement,
  b: SurfaceBasis,
  q: number,
  ox: number,
  oy: number,
  oz: number
): Vec3 {
  const [ru, rv] = rotateQuarter(ox, oy, q);
  return surfacePointToWorld(b, p.x + ru, p.y + rv, p.offset + oz);
}

/** Object-local direction -> world. Rotation and the basis, no translation. */
function localDirToWorld(b: SurfaceBasis, q: number, d: Vec3): Vec3 {
  const [ru, rv] = rotateQuarter(d[0], d[1], q);
  return [
    b.u[0] * ru + b.v[0] * rv + b.n[0] * d[2],
    b.u[1] * ru + b.v[1] * rv + b.n[1] * d[2],
    b.u[2] * ru + b.v[2] * rv + b.n[2] * d[2],
  ];
}

/**
 * Turn a placed object's holes into ordinary cutout records.
 *
 * The object BODY is never geometry -- it exists to be drawn and checked. Only
 * its [cutouts] reach the model, because a potentiometer shaft needs a real
 * hole in a real wall.
 *
 * Which box surface a hole exits through is derived, never named: the face's
 * outward direction is rotated into world space, and the surface facing back at
 * it is the one that gets cut. So one object file works on the floor, on the
 * lid, or on any wall with no edit.
 */
export function compileObject(
  placement: ObjectPlacement,
  obj: ObjectDefinition,
  box: BoxParams,
  lid: LidParams
): CompiledObject {
  const cutouts: CutoutParams[] = [];
  const errors: string[] = [];

  const q = quarterTurns(placement.rotation);
  if (q === null) {
    return {
      cutouts,
      errors: [`object "${obj.name}": rotation must be a multiple of 90, got ${placement.rotation}`],
    };
  }

  const base = surfaceBasis(placement.surface, box, lid);

  obj.cutouts.forEach((c, ci) => {
    const dirWorld = localDirToWorld(base, q, FACE_NORMAL[c.face]);
    const target = surfaceFacing(dirWorld);
    if (target === null) {
      errors.push(`object "${obj.name}": could not resolve which wall the ${c.face} face points at`);
      return;
    }
    const src = `object "${obj.name}" cutout ${ci + 1}`;

    const pWorld = localPointToWorld(placement, base, q, c.x, c.y, c.z);
    const targetBasis = surfaceBasis(target, box, lid);
    const { x, y } = worldToSurfacePoint(targetBasis, pWorld);

    if (c.kind === 'round') {
      const diameter = c.diameter + 2 * c.clearance;
      if (diameter <= 0) {
        errors.push(`object "${obj.name}": ${c.face} cutout has non-positive size`);
        return;
      }
      cutouts.push({ source: src, surface: target, kind: 'round', x, y, diameter });
      return;
    }

    // Which of the target surface's axes the object's Width axis landed on.
    // Rotation is a quarter turn, so it lands squarely on one or the other.
    const [wAxis, hAxis] = FACE_AXES[c.face];
    const wWorld = localDirToWorld(base, q, wAxis);
    const alongU = Math.abs(dot(wWorld, targetBasis.u)) > 0.5;
    void hAxis;

    const width = (alongU ? c.width : c.height) + 2 * c.clearance;
    const height = (alongU ? c.height : c.width) + 2 * c.clearance;
    if (width <= 0 || height <= 0) {
      errors.push(`object "${obj.name}": ${c.face} cutout has non-positive size`);
      return;
    }
    cutouts.push({
      source: src,
      surface: target,
      kind: 'rect',
      x,
      y,
      width,
      height,
      // Clearance changes size only, as everywhere else.
      cornerRadius: Math.max(0, c.cornerRadius),
    });
  });

  return { cutouts, errors };
}

/** World-space corners of a placed object, as a min/max pair. */
export function objectCorners(
  placement: ObjectPlacement,
  obj: ObjectDefinition,
  box: BoxParams,
  lid: LidParams
): { min: [number, number, number]; max: [number, number, number] } | null {
  const q = quarterTurns(placement.rotation);
  if (q === null) return null;
  const b = surfaceBasis(placement.surface, box, lid);
  const a = localPointToWorld(placement, b, q, 0, 0, 0);
  const c = localPointToWorld(placement, b, q, obj.sizeX, obj.sizeY, obj.sizeZ);
  return {
    min: [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.min(a[2], c[2])],
    max: [Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.max(a[2], c[2])],
  };
}
