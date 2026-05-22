'use client';

import { getManifold } from './manifold';
import type { Manifold } from 'manifold-3d';
import {
  type BoxParams,
  type LidParams,
  type SnapFitParams,
  type StandoffParams,
  type CutoutParams,
  type TextLabelParams,
  exteriorDimensions,
} from '@/store/useDesign';
import { buildBoxNubs } from './snap';
import { buildFloorStandoffs } from './standoffs';
import { buildBoxCutouts } from './cutouts';
import { buildBoxTextLabels, buildBoxSeparateDebossCutters } from './text';

/**
 * Build a rounded-rectangle prism centered on the XY origin, resting on Z=0.
 * Done by inflating a smaller centered square by `radius` so the outline gets
 * rounded corners, then extruding to `height`.
 */
async function roundedPrism(
  length: number,
  width: number,
  height: number,
  cornerRadius: number
): Promise<Manifold> {
  const { CrossSection, Manifold } = await getManifold();

  // Guard: zero or negative dimensions return an empty cube. Caller's
  // responsibility to validate, but better safe than crash.
  if (length <= 0 || width <= 0 || height <= 0) {
    return Manifold.cube([0.001, 0.001, 0.001]);
  }

  // Clamp radius: cannot exceed half the smaller side. A 0 radius means
  // a plain square (no offset needed).
  const maxR = Math.max(0, Math.min(length, width) / 2 - 0.001);
  const r = Math.max(0, Math.min(cornerRadius, maxR));

  let xs: ReturnType<typeof CrossSection.square>;
  if (r <= 0) {
    xs = CrossSection.square([length, width], true);
  } else {
    // Shrink, then inflate to get rounded corners.
    xs = CrossSection.square([length - 2 * r, width - 2 * r], true).offset(
      r,
      'Round',
      2,
      32 // 32 segments per full circle → 8 segments per 90° corner
    );
  }

  const prism = Manifold.extrude(xs, height);
  xs.delete();
  return prism;
}

/**
 * Build the hollow box from BoxParams.
 *
 * Geometry: outer rounded-rectangle prism (BoxLength × BoxWidth × BoxHeight)
 * minus an inner rounded-rectangle cavity. The cavity floor sits at
 * z = FloorThickness; the cavity opens at the top (z = BoxHeight).
 * Box is centered on X/Y so the origin is the geometric center of the base.
 */
export async function buildBox(
  box: BoxParams,
  lid?: LidParams,
  snap?: SnapFitParams,
  standoffs?: StandoffParams[],
  cutouts?: CutoutParams[],
  textLabels?: TextLabelParams[]
): Promise<Manifold> {
  const ext = exteriorDimensions(box);

  const outer = await roundedPrism(
    ext.length,
    ext.width,
    ext.height,
    box.outerCornerRadius
  );

  const cavityLength = ext.length - 2 * box.wallThickness;
  const cavityWidth = ext.width - 2 * box.wallThickness;
  const cavityHeight = ext.height - box.floorThickness;

  let body: Manifold;
  if (cavityLength <= 0 || cavityWidth <= 0 || cavityHeight <= 0) {
    body = outer;
  } else {
    const cavity = await roundedPrism(
      cavityLength,
      cavityWidth,
      cavityHeight,
      box.innerCornerRadius
    );
    const liftedCavity = cavity.translate(0, 0, box.floorThickness);
    cavity.delete();
    body = outer.subtract(liftedCavity);
    outer.delete();
    liftedCavity.delete();
  }

  // Add snap-fit nubs on the interior walls.
  if (lid && snap) {
    const nubs = await buildBoxNubs(box, lid, snap);
    if (nubs) {
      const withNubs = body.add(nubs);
      body.delete();
      nubs.delete();
      body = withNubs;
    }
  }

  // Union in floor standoffs, then subtract their holes (one pass so a hole
  // depth that exceeds the standoff height can continue through into the floor).
  if (standoffs && standoffs.length > 0) {
    const { bodies, holes } = await buildFloorStandoffs(box, standoffs);
    if (bodies) {
      const withBodies = body.add(bodies);
      body.delete();
      bodies.delete();
      body = withBodies;
    }
    if (holes) {
      const drilled = body.subtract(holes);
      body.delete();
      holes.delete();
      body = drilled;
    }
  }

  // Subtract wall + floor cutouts last so they cut cleanly through everything,
  // including standoffs that might happen to overlap with a cutout footprint.
  if (lid && cutouts && cutouts.length > 0) {
    const cuts = await buildBoxCutouts(box, lid, cutouts);
    if (cuts) {
      const cut = body.subtract(cuts);
      body.delete();
      cuts.delete();
      body = cut;
    }
  }

  // Text labels: emboss bodies union into the wall material, deboss cutters
  // subtract from it. SeparateBody emboss labels are NOT unioned here (the
  // separate body sits in place); but separate-body DEBOSS labels DO need
  // their recess cut so the separate body can sit flush.
  if (lid && textLabels && textLabels.length > 0) {
    const { emboss, deboss } = await buildBoxTextLabels(box, lid, textLabels);
    if (emboss) {
      const withEmboss = body.add(emboss);
      body.delete();
      emboss.delete();
      body = withEmboss;
    }
    if (deboss) {
      const debossed = body.subtract(deboss);
      body.delete();
      deboss.delete();
      body = debossed;
    }
    const sepDeboss = await buildBoxSeparateDebossCutters(box, lid, textLabels);
    if (sepDeboss) {
      const debossed = body.subtract(sepDeboss);
      body.delete();
      sepDeboss.delete();
      body = debossed;
    }
  }

  return body;
}
