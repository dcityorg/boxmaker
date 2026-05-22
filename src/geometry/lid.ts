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
import { buildLidCavities } from './snap';
import { buildLidStandoffs } from './standoffs';
import { buildLidCutouts } from './cutouts';
import { buildLidTextLabels, buildLidSeparateDebossCutters } from './text';

/**
 * Build a rounded-rectangle prism centered on XY, resting on Z=0.
 * Shared helper duplicated from box.ts intentionally — keeping geometry
 * modules self-contained makes them easier to extract later.
 */
async function roundedPrism(
  length: number,
  width: number,
  height: number,
  cornerRadius: number
): Promise<Manifold> {
  const { CrossSection, Manifold } = await getManifold();
  if (length <= 0 || width <= 0 || height <= 0) {
    return Manifold.cube([0.001, 0.001, 0.001]);
  }
  const maxR = Math.max(0, Math.min(length, width) / 2 - 0.001);
  const r = Math.max(0, Math.min(cornerRadius, maxR));
  let xs: ReturnType<typeof CrossSection.square>;
  if (r <= 0) {
    xs = CrossSection.square([length, width], true);
  } else {
    xs = CrossSection.square([length - 2 * r, width - 2 * r], true).offset(
      r,
      'Round',
      2,
      32
    );
  }
  const prism = Manifold.extrude(xs, height);
  xs.delete();
  return prism;
}

/**
 * Build the lid, modeled standalone with its underside at z=0 (so the
 * shoulder protrudes downward into negative Z and the plate sits at
 * z ∈ [shoulderDepth, shoulderDepth + edgeThickness]).
 *
 * Caller transforms it for the viewport (floating above box / snapped down).
 */
export async function buildLid(
  box: BoxParams,
  lid: LidParams,
  snap?: SnapFitParams,
  standoffs?: StandoffParams[],
  cutouts?: CutoutParams[],
  textLabels?: TextLabelParams[]
): Promise<Manifold> {
  const ext = exteriorDimensions(box);

  // The plate occupies z ∈ [shoulderDepth, shoulderDepth + edgeThickness].
  // The shoulder occupies z ∈ [0, shoulderDepth].
  // Combined as union, then a center pocket is subtracted from the underside
  // of the plate to thin the middle.
  const plate = await roundedPrism(
    ext.length,
    ext.width,
    lid.coverThicknessAtEdge,
    box.outerCornerRadius
  );
  const plateLifted = plate.translate(0, 0, lid.coverShoulderDepth);
  plate.delete();

  // Shoulder block: the shoulder's *outer face* sits inside the box cavity
  // with `boxGap` clearance, so it's inset from the box exterior by
  // (wallThickness + boxGap). Note: NOT inset by shoulderWallThickness — that
  // controls the shoulder wall thickness, not its outer position.
  const shoulderInset = box.wallThickness + lid.boxGap;
  const shoulderLength = Math.max(0.1, ext.length - 2 * shoulderInset);
  const shoulderWidth = Math.max(0.1, ext.width - 2 * shoulderInset);
  // Shoulder corner radius: match the cavity's inner radius. Because the
  // shoulder square is centered and inset from the cavity square by `boxGap`
  // on each side, an identical corner radius gives a uniform `boxGap` clearance
  // all the way around — including the corners.
  const shoulderRadius = box.innerCornerRadius;

  let lidBody: Manifold;
  if (shoulderLength > 0.1 && shoulderWidth > 0.1 && lid.coverShoulderDepth > 0) {
    const shoulder = await roundedPrism(
      shoulderLength,
      shoulderWidth,
      lid.coverShoulderDepth,
      shoulderRadius
    );
    lidBody = plateLifted.add(shoulder);
    plateLifted.delete();
    shoulder.delete();
  } else {
    lidBody = plateLifted;
  }

  // Center pocket: thins the center of the lid AND hollows the inside of
  // the shoulder block (so the shoulder is a 4-walled rim, not a solid plug).
  // Footprint = inset from the shoulder's outer face by shoulderWallThickness.
  // Depth = (shoulderDepth + edgeThickness) - centerThickness, so the
  // remaining material above the pocket is exactly `centerThickness`.
  const pocketInset = shoulderInset + lid.coverShoulderWallThickness;
  const pocketLength = ext.length - 2 * pocketInset;
  const pocketWidth = ext.width - 2 * pocketInset;
  // Shoulder inner radius matches the outer radius (= cavity radius). Keeps
  // the lid geometry governed by a single corner-radius parameter and avoids
  // square stress-riser corners in the shoulder rim.
  const pocketRadius = shoulderRadius;
  const totalLidHeight = lid.coverShoulderDepth + lid.coverThicknessAtEdge;
  const pocketDepth = Math.max(0, totalLidHeight - lid.coverThicknessAtCenter);

  if (pocketDepth > 0 && pocketLength > 0.1 && pocketWidth > 0.1) {
    const pocket = await roundedPrism(
      pocketLength,
      pocketWidth,
      pocketDepth + 0.01, // small epsilon so the cut breaks through the bottom cleanly
      pocketRadius
    );
    // Pocket cuts upward from the bottom of the shoulder (z=0). Anything above
    // the pocket's top is the remaining plate material.
    const cut = lidBody.subtract(pocket);
    pocket.delete();
    lidBody.delete();
    lidBody = cut;
  }

  // Subtract snap-fit cavities from the shoulder's outer face.
  if (snap) {
    const cavities = await buildLidCavities(box, lid, snap, 0);
    if (cavities) {
      const withCavities = lidBody.subtract(cavities);
      lidBody.delete();
      cavities.delete();
      lidBody = withCavities;
    }
  }

  // Hang lid standoffs from the plate's underside (and drill any holes).
  if (standoffs && standoffs.length > 0) {
    const { bodies, holes } = await buildLidStandoffs(box, lid, standoffs);
    if (bodies) {
      const withBodies = lidBody.add(bodies);
      lidBody.delete();
      bodies.delete();
      lidBody = withBodies;
    }
    if (holes) {
      const drilled = lidBody.subtract(holes);
      lidBody.delete();
      holes.delete();
      lidBody = drilled;
    }
  }

  // Subtract lid cutouts (pierces the plate and any standoffs in the way).
  if (cutouts && cutouts.length > 0) {
    const cuts = await buildLidCutouts(box, lid, cutouts);
    if (cuts) {
      const cut = lidBody.subtract(cuts);
      lidBody.delete();
      cuts.delete();
      lidBody = cut;
    }
  }

  // Text labels on the lid surface.
  if (textLabels && textLabels.length > 0) {
    const { emboss, deboss } = await buildLidTextLabels(box, lid, textLabels);
    if (emboss) {
      const withEmboss = lidBody.add(emboss);
      lidBody.delete();
      emboss.delete();
      lidBody = withEmboss;
    }
    if (deboss) {
      const debossed = lidBody.subtract(deboss);
      lidBody.delete();
      deboss.delete();
      lidBody = debossed;
    }
    // Cut recesses for separate-body deboss labels too.
    const sepDeboss = await buildLidSeparateDebossCutters(box, lid, textLabels);
    if (sepDeboss) {
      const debossed = lidBody.subtract(sepDeboss);
      lidBody.delete();
      sepDeboss.delete();
      lidBody = debossed;
    }
  }

  return lidBody;
}

/**
 * Lift the lid so it floats above the box rim by `gapAboveBox` mm.
 * Used by the viewport's "Assembled" view.
 *
 * The lid's local origin sits at the bottom of the shoulder. To place the
 * shoulder *just above* the box, lift by box.height + gap so the shoulder's
 * bottom is at z = boxHeight + gap.
 */
export function lidAssembledOffset(box: BoxParams, gapAboveBox = 12): number {
  return box.height + gapAboveBox;
}

/**
 * Transform a lid-frame manifold (the lid body, or a SeparateBody text mesh
 * built on the lid) into print orientation: plate-top face resting on z=0,
 * shoulder pointing up, optionally translated in +X so it sits beside the
 * box on the build plate.
 *
 * Why: the lid is designed and rendered in *assembled* orientation (plate
 * top up, shoulder hanging below). To print it -- and especially to
 * multi-color-print debossed text -- the lid needs to be flipped so the
 * deboss recesses sit on the build plate and the colored SeparateBody text
 * prints as the first layers. Bambu Studio / PrusaSlicer don't reorient
 * objects on import (you'd have to do it manually for every export), so we
 * emit the file already in print orientation.
 *
 * The transform: 180-deg rotation around the X axis, then a +Z translation
 * by the lid's full height so plate-top lands on z=0. The Y axis ends up
 * mirrored, which means text positions appear flipped in the slicer's
 * top-view -- harmless, since the user physically flips the printed part
 * to assemble it onto the box.
 *
 * Consumes its input (calls .delete()) and returns a new manifold, matching
 * the ownership pattern used elsewhere in this module.
 */
export function lidPrintOrientation(
  manifold: Manifold,
  lid: LidParams,
  xOffset = 0
): Manifold {
  const totalLidHeight = lid.coverShoulderDepth + lid.coverThicknessAtEdge;
  const rotated = manifold.rotate([180, 0, 0]);
  manifold.delete();
  const placed = rotated.translate(xOffset, 0, totalLidHeight);
  rotated.delete();
  return placed;
}
