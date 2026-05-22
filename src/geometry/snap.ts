'use client';

import { getManifold } from './manifold';
import type { Manifold } from 'manifold-3d';
import {
  type BoxParams,
  type LidParams,
  type SnapFitParams,
  exteriorDimensions,
  interiorDimensions,
} from '@/store/useDesign';

export type SideKey = 'front' | 'back' | 'left' | 'right';

function enabledSides(snap: SnapFitParams): SideKey[] {
  const out: SideKey[] = [];
  if (snap.snapFront) out.push('front');
  if (snap.snapBack) out.push('back');
  if (snap.snapLeft) out.push('left');
  if (snap.snapRight) out.push('right');
  return out;
}

/** Computed nub width along the wall, clamped per user's min/max settings. */
function nubWidthFor(side: SideKey, box: BoxParams, snap: SnapFitParams): number {
  const intr = interiorDimensions(box);
  const wallLen = side === 'front' || side === 'back' ? intr.length : intr.width;
  const raw = (snap.nubWidthRatio / 100) * wallLen;
  return Math.min(snap.nubWidthMax, Math.max(snap.nubWidthMin, raw));
}

/**
 * Isoceles triangle sizing for the nub/cavity cross-section.
 *
 * Apex angle = 90° (right angle); base angles = 45° each. Wall-side length is
 * set by the user (`nubHeight`); apex stick-out is exactly `nubHeight / 2`.
 * Matches Gary's printed reference part — the measured angle between the two
 * sloped FACES (not the projected slope lines) is 90°.
 *
 * No clamping by shoulder dimensions — if `nubHeight > coverShoulderDepth` or
 * the apex exceeds `coverShoulderWallThickness`, the cavity will visibly break
 * through the shoulder. The user controls the value directly.
 */
function nubCrossSection(snap: SnapFitParams): { side: number; depth: number } {
  const side = Math.max(0, snap.nubHeight);
  return { side, depth: side / 2 };
}

/**
 * Build one snap-fit prism in world space.
 *
 * Cross-section: an isoceles triangle with one face flat against the wall,
 * apex pointing into the box interior at half the wall-side height.
 * The prism is extruded along the wall direction the full `widthAlongWall`.
 *
 * Built as an explicit 6-vertex polyhedron (faster and cleaner than
 * extrude + boolean cuts):
 *   v0..v3   four corners of the wall rectangle
 *   v4, v5   two endpoints of the apex ridge
 *
 * Local coords used during construction (rotated/translated per side at the end):
 *   X = inward (away from wall, 0..d)
 *   Y = along wall (centered, −w/2..+w/2)
 *   Z = vertical (0..h, then shifted so the top sits at topZ)
 */
async function buildNub(
  widthAlongWall: number,
  wallSideLength: number,
  apexDepth: number,
  topZ: number,
  wallFaceCoord: number,
  side: SideKey
): Promise<Manifold> {
  const { Mesh, Manifold } = await getManifold();

  const h = wallSideLength;
  const d = apexDepth;
  const w = widthAlongWall;

  const vertProperties = new Float32Array([
    0, -w / 2,   0,       // 0: wall-bottom, −y end
    0,  w / 2,   0,       // 1: wall-bottom, +y end
    0,  w / 2,   h,       // 2: wall-top,    +y end
    0, -w / 2,   h,       // 3: wall-top,    −y end
    d, -w / 2,   h / 2,   // 4: apex,        −y end
    d,  w / 2,   h / 2,   // 5: apex,        +y end
  ]);

  // Triangles wound CCW from outside (manifold's convention).
  const triVerts = new Uint32Array([
    // Wall face (outward = −X)
    0, 3, 2,
    0, 2, 1,
    // Top slope (outward = +X, +Z)
    3, 4, 5,
    3, 5, 2,
    // Bottom slope (outward = +X, −Z)
    0, 1, 5,
    0, 5, 4,
    // End face at −Y (triangular cross-section)
    0, 4, 3,
    // End face at +Y (triangular cross-section)
    1, 2, 5,
  ]);

  const mesh = new Mesh({ numProp: 3, vertProperties, triVerts });
  let prism = new Manifold(mesh);

  // Per-side: rotate so local +X (inward) points the correct way in world,
  // then translate to the wall face and put the top at topZ.
  switch (side) {
    case 'front':
      // Inward = +Y. Rotate +90° about Z: X → Y, Y → −X.
      prism = prism.rotate([0, 0, 90]);
      prism = prism.translate(0, wallFaceCoord, topZ - h);
      break;
    case 'back':
      // Inward = −Y. Rotate −90° about Z.
      prism = prism.rotate([0, 0, -90]);
      prism = prism.translate(0, wallFaceCoord, topZ - h);
      break;
    case 'left':
      // Inward = +X already.
      prism = prism.translate(wallFaceCoord, 0, topZ - h);
      break;
    case 'right':
      // Inward = −X. Flip about Z.
      prism = prism.rotate([0, 0, 180]);
      prism = prism.translate(wallFaceCoord, 0, topZ - h);
      break;
  }

  return prism;
}

/**
 * Build the union of all enabled box nubs (the male snap parts).
 * Returns null if no sides are enabled.
 */
export async function buildBoxNubs(
  box: BoxParams,
  lid: LidParams,
  snap: SnapFitParams
): Promise<Manifold | null> {
  const sides = enabledSides(snap);
  if (sides.length === 0) return null;

  const ext = exteriorDimensions(box);
  const { side: nubSide, depth: nubDepth } = nubCrossSection(snap);
  // Sit the nub at the BOTTOM of where the shoulder will be when seated —
  // i.e., its top is at (shoulder bottom in world) + nubSide, offset down by
  // `boxGap` for assembly clearance. This way the shoulder can descend through
  // the box rim without colliding with the nub; only the last `nubSide` of travel
  // engages the snap. With the nub at the rim instead, a tall shoulder would
  // bind against the nub through its entire descent.
  const nubTopZ = box.height - lid.coverShoulderDepth + nubSide - lid.boxGap;

  const nubs: Manifold[] = [];
  for (const side of sides) {
    const cavityWidth = nubWidthFor(side, box, snap);
    const nubW = Math.max(1, cavityWidth - snap.nubBoxShrink);

    let wallCoord: number;
    switch (side) {
      case 'front': wallCoord = -ext.width  / 2 + box.wallThickness; break;
      case 'back':  wallCoord =  ext.width  / 2 - box.wallThickness; break;
      case 'left':  wallCoord = -ext.length / 2 + box.wallThickness; break;
      case 'right': wallCoord =  ext.length / 2 - box.wallThickness; break;
    }

    nubs.push(
      await buildNub(
        nubW,
        nubSide,
        nubDepth,
        nubTopZ,
        wallCoord,
        side
      )
    );
  }

  let result = nubs[0];
  for (let i = 1; i < nubs.length; i++) {
    const next = result.add(nubs[i]);
    result.delete();
    nubs[i].delete();
    result = next;
  }
  return result;
}

/**
 * Build the union of all enabled lid cavities (the female snap parts).
 * These will be subtracted from the lid body. Returns null if no sides are
 * enabled.
 *
 * `shoulderBottomZ`: world Z of the shoulder's bottom face in the lid's
 *                    local frame. (In our lid.ts the lid is built with
 *                    shoulder bottom at z=0.)
 */
export async function buildLidCavities(
  box: BoxParams,
  lid: LidParams,
  snap: SnapFitParams,
  shoulderBottomZ: number
): Promise<Manifold | null> {
  const sides = enabledSides(snap);
  if (sides.length === 0) return null;

  const ext = exteriorDimensions(box);
  const { side: nubSide, depth: nubDepth } = nubCrossSection(snap);
  // Cavity sits at the bottom of the shoulder — mirroring the nub. The cavity
  // spans local Z [shoulderBottomZ, shoulderBottomZ + nubSide].
  const cavityTopZ = shoulderBottomZ + nubSide;

  const shoulderInset = box.wallThickness + lid.boxGap;

  // ─────────────────────────────────────────────────────────────────────
  // COPLANAR-FACE GOTCHA — DO NOT REMOVE THIS OFFSET
  //
  // The cavity's wall face is intentionally pushed 0.01 mm OUTSIDE the
  // shoulder's outer face. Without this offset, the two faces would be
  // exactly coplanar, and Manifold's boolean subtract produces a broken
  // result for some sides but not others:
  //   - The cavity volume IS removed from the lid (the diagnostic
  //     `removed=` matches the cavity union volume exactly).
  //   - BUT the lid's outer face is preserved as a single intact
  //     rectangle. The cavity becomes an INVISIBLE INTERNAL VOID — you
  //     get a hollow pocket inside the rim with no opening on the face
  //     where the snap is supposed to engage.
  //
  // Empirically this manifested as left/right cavities being invisible
  // while front/back worked, even though both pairs had identical
  // coplanar wall faces. We never isolated why one axis triggered it and
  // the other didn't — likely an internal triangulation/tolerance detail
  // in manifold-3d's WASM. The fix is to ensure the cutter never lies
  // exactly in the target's surface plane.
  //
  // SYMPTOMS that point back here:
  //   - A snap cavity, pocket, or any subtracted feature looks "missing"
  //     on the rendered surface even though Manifold reports the correct
  //     volume removed.
  //   - The same operation works on one face/axis but not the symmetric
  //     opposite (e.g., one side of an axis-aligned cut shows, the other
  //     doesn't).
  //
  // FIX: offset the cutter by ~0.01 mm so its face lies just outside the
  // surface plane. This is well below FDM print tolerance (~±0.15 mm),
  // so it has no functional impact on the printed part.
  //
  // Apply the same trick if you add new subtracted features (vents,
  // labels embossed below the surface, etc.) and they fail to break
  // through the visible face.
  // ─────────────────────────────────────────────────────────────────────
  const coplanarBreak = 0.01;

  const cavities: Manifold[] = [];
  for (const side of sides) {
    const cavityWidth = nubWidthFor(side, box, snap);

    let wallCoord: number;
    switch (side) {
      case 'front': wallCoord = -ext.width  / 2 + shoulderInset - coplanarBreak; break;
      case 'back':  wallCoord =  ext.width  / 2 - shoulderInset + coplanarBreak; break;
      case 'left':  wallCoord = -ext.length / 2 + shoulderInset - coplanarBreak; break;
      case 'right': wallCoord =  ext.length / 2 - shoulderInset + coplanarBreak; break;
    }

    cavities.push(
      await buildNub(
        cavityWidth,
        nubSide,
        nubDepth,
        cavityTopZ,
        wallCoord,
        side
      )
    );

    if (snap.nubChamferAmountOnCover > 0) {
      // Wedge's bottom face would otherwise be coplanar with the lid
      // shoulder's bottom face — push it down by the same coplanar break
      // we use on the wall side. See the long comment above.
      cavities.push(
        await buildLidEntryChamferWedge(
          cavityWidth,
          snap.nubChamferAmountOnCover,
          shoulderBottomZ - coplanarBreak,
          wallCoord,
          side
        )
      );
    }
  }

  let result = cavities[0];
  for (let i = 1; i < cavities.length; i++) {
    const next = result.add(cavities[i]);
    result.delete();
    cavities[i].delete();
    result = next;
  }
  return result;
}

/**
 * Build one 45° lead-in wedge that bevels the lower-outer edge of a lid
 * cavity. Unioned into the cavity volume before subtracting from the lid,
 * it produces a sloped ramp at the cutout's bottom-outer corner — the spot
 * where the nub's apex first contacts the lid on descent.
 *
 * Cross-section (X-Z): right triangle with the 90° corner at the cavity's
 * lower-outer corner. Legs of length `chamferSize` along +X (inward) and
 * +Z (up); hypotenuse is the chamfer face.
 *
 * Local coords (rotated/translated per side at the end):
 *   X = inward, Y = along wall (full cavity width), Z = vertical
 *   v0..v2  triangular face at −Y end
 *   v3..v5  triangular face at +Y end
 */
async function buildLidEntryChamferWedge(
  widthAlongWall: number,
  chamferSize: number,
  shoulderBottomZ: number,
  wallFaceCoord: number,
  side: SideKey
): Promise<Manifold> {
  const { Mesh, Manifold } = await getManifold();

  const c = chamferSize;
  const w = widthAlongWall;

  const vertProperties = new Float32Array([
    0, -w / 2,  0,   // 0: outer-bottom corner, −y
    c, -w / 2,  0,   // 1: inward edge along bottom, −y
    0, -w / 2,  c,   // 2: upward edge along wall,  −y
    0,  w / 2,  0,   // 3: outer-bottom corner, +y
    c,  w / 2,  0,   // 4: inward edge along bottom, +y
    0,  w / 2,  c,   // 5: upward edge along wall,  +y
  ]);

  const triVerts = new Uint32Array([
    // Wall face (outward = −X): rectangle (0,2,5,3)
    0, 2, 5,
    0, 5, 3,
    // Bottom face (outward = −Z): rectangle (0,3,4,1)
    0, 3, 4,
    0, 4, 1,
    // Chamfer (hypotenuse) face (outward = +X, +Z): rectangle (1,4,5,2)
    1, 4, 5,
    1, 5, 2,
    // End face at −Y (triangle 0,1,2)
    0, 1, 2,
    // End face at +Y (triangle 3,5,4)
    3, 5, 4,
  ]);

  const mesh = new Mesh({ numProp: 3, vertProperties, triVerts });
  let wedge = new Manifold(mesh);

  switch (side) {
    case 'front':
      wedge = wedge.rotate([0, 0, 90]);
      wedge = wedge.translate(0, wallFaceCoord, shoulderBottomZ);
      break;
    case 'back':
      wedge = wedge.rotate([0, 0, -90]);
      wedge = wedge.translate(0, wallFaceCoord, shoulderBottomZ);
      break;
    case 'left':
      wedge = wedge.translate(wallFaceCoord, 0, shoulderBottomZ);
      break;
    case 'right':
      wedge = wedge.rotate([0, 0, 180]);
      wedge = wedge.translate(wallFaceCoord, 0, shoulderBottomZ);
      break;
  }

  return wedge;
}
