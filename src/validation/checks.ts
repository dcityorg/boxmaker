/**
 * Design-validation checks -- the "silent failure" catcher.
 *
 * Every function here is pure derived state: it reads params and returns
 * warnings, never touching the store. Components call their section's
 * function inside useMemo and render the results with <WarningList>;
 * WarningMarkers in the viewport renders the `ghost` shapes of every
 * warning that has one.
 *
 * Severity is wording guidance, not styling: 'hard' means the geometry is
 * broken or the parts cannot assemble ("will"); 'advisory' means it may
 * print or assemble poorly ("may"), or is probably a typo. Both render in
 * the same amber style, matching the original snap-fit warnings.
 *
 * Ghost frames: 'box' shapes are in world/box coordinates; 'lid' shapes are
 * in lid-local coordinates (underside of the shoulder at z=0) and the
 * viewport applies the same z-offset it applies to the lid mesh.
 */

import {
  type BoxParams,
  type LidParams,
  type SnapFitParams,
  type StandoffParams,
  type CutoutParams,
  type TextLabelParams,
} from '@/store/useDesign';

export type Vec3 = [number, number, number];

export type WarningGhost =
  | { kind: 'cylinder'; frame: 'box' | 'lid'; pos: Vec3; axis: 'x' | 'y' | 'z'; radius: number; length: number }
  | { kind: 'box'; frame: 'box' | 'lid'; pos: Vec3; size: Vec3 }
  | { kind: 'sphere'; frame: 'box' | 'lid'; pos: Vec3; radius: number };

export interface DesignWarning {
  severity: 'hard' | 'advisory';
  /** 1-based textarea line, for per-line (standoff/cutout/label) checks. */
  line?: number;
  /**
   * Where a COMPILED feature came from, e.g. `board "OLED2-42inch" mount 3`.
   * Set instead of `line`, because such a feature has no line in any textarea
   * and pointing at one would send the reader to the wrong place entirely.
   */
  source?: string;
  message: string;
  ghost?: WarningGhost;
}

/** Minimum printable material span: ~2 perimeters at a 0.4 mm nozzle. */
const MIN_PRINTABLE_MM = 0.8;
/** How far ghost shapes are inflated past the feature so they wrap it visibly. */
const GHOST_WRAP = 0.3;
/** Float-comparison slop so values exactly on a boundary don't warn. */
const EPS = 1e-6;

/** Format a mm value for messages: up to 2 decimals, no trailing zeros. */
function fmt(n: number): string {
  return String(Number(n.toFixed(2)));
}

/** Interior floor span (the region standoffs/cutouts address on the floor). */
function interiorSpan(box: BoxParams): { x: number; y: number } {
  return { x: box.length - 2 * box.wallThickness, y: box.width - 2 * box.wallThickness };
}

/** Lid pocket span (the region lid features address; 0,0 at a pocket corner). */
function pocketSpan(box: BoxParams, lid: LidParams): { x: number; y: number } {
  const inset = box.wallThickness + lid.boxGap + lid.coverShoulderWallThickness;
  return { x: box.length - 2 * inset, y: box.width - 2 * inset };
}

/** Floor user (x, y) -> world XY. Mirrors floorAnchorXY in geometry/standoffs.ts. */
function floorToWorld(box: BoxParams, x: number, y: number): { wx: number; wy: number } {
  return {
    wx: -box.length / 2 + box.wallThickness + x,
    wy: -box.width / 2 + box.wallThickness + y,
  };
}

/** Lid user (x, y) -> lid-local XY. Mirrors lidAnchorXY in geometry/standoffs.ts. */
function lidToLocal(box: BoxParams, lid: LidParams, x: number, y: number): { wx: number; wy: number } {
  const inset = box.wallThickness + lid.boxGap + lid.coverShoulderWallThickness;
  return {
    wx: +box.length / 2 - inset - x,
    wy: -box.width / 2 + inset + y,
  };
}

/**
 * Classify a feature's 2D extent against a surface's [0, spanX] x [0, spanY]
 * user-frame bounds.
 */
function boundsFit(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  spanX: number,
  spanY: number
): 'inside' | 'partial' | 'outside' {
  if (x1 <= EPS || x0 >= spanX - EPS || y1 <= EPS || y0 >= spanY - EPS) return 'outside';
  if (x0 < -EPS || x1 > spanX + EPS || y0 < -EPS || y1 > spanY + EPS) return 'partial';
  return 'inside';
}

// ---------------------------------------------------------------------------
// Box
// ---------------------------------------------------------------------------

export function boxWarnings(box: BoxParams): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  if (box.wallThickness < MIN_PRINTABLE_MM) {
    warnings.push({
      severity: 'advisory',
      message: `Wall thickness (${fmt(box.wallThickness)} mm) is under ${MIN_PRINTABLE_MM} mm (~2 perimeters at a 0.4 mm nozzle) -- walls may print weak.`,
    });
  }
  if (box.floorThickness < MIN_PRINTABLE_MM) {
    warnings.push({
      severity: 'advisory',
      message: `Floor thickness (${fmt(box.floorThickness)} mm) is under ${MIN_PRINTABLE_MM} mm -- the floor may print weak.`,
    });
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Lid
// ---------------------------------------------------------------------------

/** Checks whose parameters live in the Lid Plate section. */
export function lidPlateWarnings(lid: LidParams): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  const thin: Array<[string, number]> = [
    ['Edge thickness', lid.coverThicknessAtEdge],
    ['Center thickness', lid.coverThicknessAtCenter],
  ];
  for (const [label, v] of thin) {
    if (v < MIN_PRINTABLE_MM) {
      warnings.push({
        severity: 'advisory',
        message: `${label} (${fmt(v)} mm) is under ${MIN_PRINTABLE_MM} mm -- may print weak.`,
      });
    }
  }
  // Note: center > edge is deliberately NOT warned. It just extends the
  // center material down inside the shoulder rim -- a valid design.
  return warnings;
}

/** Checks whose parameters live in the Lid Shoulder section. */
export function lidShoulderWarnings(lid: LidParams): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  if (lid.boxGap <= 0) {
    warnings.push({
      severity: 'hard',
      message: `Box gap (${fmt(lid.boxGap)} mm) must be positive -- with no clearance the lid shoulder cannot slide into the box opening.`,
    });
  }
  if (lid.coverShoulderWallThickness < MIN_PRINTABLE_MM) {
    warnings.push({
      severity: 'advisory',
      message: `Shoulder wall (${fmt(lid.coverShoulderWallThickness)} mm) is under ${MIN_PRINTABLE_MM} mm -- may print weak.`,
    });
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Snap-fit
// ---------------------------------------------------------------------------

/**
 * The four original print-tested checks plus two typo catchers.
 * Caller gates on `anyEnabled` (all warnings hide when every side is off).
 */
export function snapWarnings(snap: SnapFitParams, lid: LidParams): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  const apexDepth = snap.nubHeight / 2;
  if (apexDepth > lid.coverShoulderWallThickness) {
    warnings.push({
      severity: 'hard',
      message: `Nub apex (${apexDepth.toFixed(2)} mm) exceeds shoulder wall thickness (${lid.coverShoulderWallThickness.toFixed(2)} mm). The cavity will break through the inner face of the lid shoulder. Reduce Nub height or increase Lid shoulder wall.`,
    });
  }
  if (snap.nubHeight > lid.coverShoulderDepth) {
    warnings.push({
      severity: 'hard',
      message: `Nub height (${snap.nubHeight.toFixed(2)} mm) exceeds shoulder depth (${lid.coverShoulderDepth.toFixed(2)} mm). The cavity will extend past the bottom of the lid shoulder. Reduce Nub height or increase Lid shoulder depth.`,
    });
  }
  if (snap.nubHeight < 2) {
    warnings.push({
      severity: 'advisory',
      message: `Nub height (${snap.nubHeight.toFixed(2)} mm) is below 2 mm -- the printed nub may not form cleanly.`,
    });
  }
  if (snap.nubHeight > 5) {
    warnings.push({
      severity: 'advisory',
      message: `Nub height (${snap.nubHeight.toFixed(2)} mm) is above 5 mm -- the lid may be difficult to get on.`,
    });
  }
  if (snap.nubChamferAmountOnCover > snap.nubHeight) {
    warnings.push({
      severity: 'advisory',
      message: `Lid lead-in (${fmt(snap.nubChamferAmountOnCover)} mm) exceeds Nub height (${fmt(snap.nubHeight)} mm) -- the chamfer swallows the cavity edge and the nub may not retain. Keep it below the nub height.`,
    });
  }
  if (snap.nubWidthMin > snap.nubWidthMax) {
    warnings.push({
      severity: 'advisory',
      message: `Min width (${fmt(snap.nubWidthMin)} mm) exceeds Max width (${fmt(snap.nubWidthMax)} mm) -- the max wins and nubs clamp to ${fmt(snap.nubWidthMax)} mm. Probably a typo.`,
    });
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Standoffs
// ---------------------------------------------------------------------------

export function standoffWarnings(
  box: BoxParams,
  lid: LidParams,
  standoffs: StandoffParams[]
): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  const interior = interiorSpan(box);
  const pocket = pocketSpan(box, lid);
  // Ceiling the assembled lid presents to the box interior. Inside the pocket
  // footprint the pocket recess adds headroom; under the shoulder rim it
  // doesn't. pocketDepth mirrors geometry/lid.ts.
  const shoulderBottomZ = box.height - lid.coverShoulderDepth;
  const pocketDepth = Math.max(
    0,
    lid.coverShoulderDepth + lid.coverThicknessAtEdge - lid.coverThicknessAtCenter
  );

  for (const s of standoffs) {
    const line = s.line;
    const first = warnings.length;
    const r = s.od / 2;

    if (s.od <= 0 || s.height <= 0) {
      warnings.push({ severity: 'hard', line, message: 'OD and Height must be > 0.' });
      attribute(warnings, first, s.source);
      continue;
    }
    if (s.holeDia > 0 && s.holeDia >= s.od) {
      warnings.push({
        severity: 'hard',
        line,
        message: `HoleDia (${fmt(s.holeDia)} mm) >= OD (${fmt(s.od)} mm) -- the hole consumes the entire standoff.`,
      });
    } else if (s.holeDia > 0 && s.od - s.holeDia < MIN_PRINTABLE_MM) {
      warnings.push({
        severity: 'advisory',
        line,
        message: `Standoff wall is only ${fmt((s.od - s.holeDia) / 2)} mm per side -- may be too thin to print. Keep OD - HoleDia >= ${MIN_PRINTABLE_MM} mm.`,
      });
    }
    if (s.baseFillet > r) {
      warnings.push({
        severity: 'advisory',
        line,
        message: `BaseFilletRadius (${fmt(s.baseFillet)} mm) exceeds the standoff radius (${fmt(r)} mm) -- the fillet is clamped to fit.`,
      });
    }

    const span = s.surface === 'floor' ? interior : pocket;
    const fit = boundsFit(s.x - r, s.x + r, s.y - r, s.y + r, span.x, span.y);
    const regionName = s.surface === 'floor' ? 'interior floor' : 'lid center pocket';
    if (fit !== 'inside') {
      const ghost = standoffGhost(box, lid, s);
      if (fit === 'outside') {
        warnings.push({
          severity: 'hard',
          line,
          message: `Standoff lies completely outside the ${regionName} (${fmt(span.x)} x ${fmt(span.y)} mm) -- it will print as a disconnected body${s.surface === 'lid' ? ' or merge into the shoulder rim' : ''}.`,
          ghost,
        });
      } else {
        warnings.push({
          severity: 'advisory',
          line,
          message: `Standoff extends past the edge of the ${regionName} (${fmt(span.x)} x ${fmt(span.y)} mm)${s.surface === 'floor' ? ' into the wall' : ' into the shoulder rim'}.`,
          ghost,
        });
      }
    }

    if (s.surface === 'floor') {
      // The fillet skirt is NOT part of the footprint boundsFit tests above --
      // that uses od/2 only. So a standoff whose body sits comfortably inside
      // the interior can still drive its fillet clean through a wall and raise
      // a bump on the OUTSIDE of the box, with nothing else here saying a word.
      //
      // Note a fillet merely REACHING the wall, or overlapping a cutout or
      // another standoff, is fine: it unions into the wall as a small gusset,
      // and cutouts are subtracted after standoffs so they trim it. Only
      // emerging through the far face of the wall is a defect.
      const f = Math.min(s.baseFillet, r - 0.05, s.height - 0.05);
      if (f > 0) {
        const reach = r + f;
        const through = Math.max(
          reach - s.x,                  // out through the left wall
          reach - (interior.x - s.x),   // ... the right
          reach - s.y,                  // ... the front
          reach - (interior.y - s.y)    // ... the back
        ) - box.wallThickness;
        if (through > EPS) {
          warnings.push({
            severity: 'advisory',
            line,
            message: `The base fillet breaks through the outside of the wall by ${fmt(through)} mm -- it will print as a bump on the exterior. Reduce BaseFilletRadius or move the standoff inward.`,
            ghost: filletGhost(box, s, reach),
          });
        }
      }

      if (s.holeDia > 0 && s.holeDepth > s.height + box.floorThickness) {
        warnings.push({
          severity: 'advisory',
          line,
          message: `HoleDepth (${fmt(s.holeDepth)} mm) punches through the floor (Height ${fmt(s.height)} + floor ${fmt(box.floorThickness)} mm). Sometimes intentional.`,
        });
      }
      // The headliner: standoff top vs. the closed lid. Skip when the
      // standoff is fully off the floor -- the disconnected-body warning
      // already covers it and a collision message would be noise.
      if (fit !== 'outside') {
        const { wx, wy } = floorToWorld(box, s.x, s.y);
        const fullyInPocket =
          wx - r >= -pocket.x / 2 - EPS &&
          wx + r <= pocket.x / 2 + EPS &&
          wy - r >= -pocket.y / 2 - EPS &&
          wy + r <= pocket.y / 2 + EPS;
        const ceilingZ = shoulderBottomZ + (fullyInPocket ? pocketDepth : 0);
        const topZ = box.floorThickness + s.height;
        if (topZ > ceilingZ + EPS) {
          const hits = fullyInPocket ? 'lid underside' : 'lid shoulder rim';
          const bottom = Math.max(ceilingZ, box.floorThickness);
          warnings.push({
            severity: 'hard',
            line,
            message: `Standoff is ${fmt(topZ - ceilingZ)} mm too tall -- it will hit the ${hits} when the lid is on. Max Height here is ${fmt(ceilingZ - box.floorThickness)} mm.`,
            ghost: {
              kind: 'cylinder',
              frame: 'box',
              pos: [wx, wy, (topZ + bottom) / 2],
              axis: 'z',
              radius: r + GHOST_WRAP,
              length: Math.max(0.1, topZ - bottom),
            },
          });
        }
      }
    } else {
      // Lid standoffs hang from the plate underside.
      if (s.holeDia > 0 && s.holeDepth > s.height + lid.coverThicknessAtCenter) {
        warnings.push({
          severity: 'advisory',
          line,
          message: `HoleDepth (${fmt(s.holeDepth)} mm) punches through the lid (Height ${fmt(s.height)} + center ${fmt(lid.coverThicknessAtCenter)} mm). Sometimes intentional.`,
        });
      }
      const maxLen = box.height - box.floorThickness;
      if (s.height > maxLen + EPS) {
        const { wx, wy } = lidToLocal(box, lid, s.x, s.y);
        const freeEnd = lid.coverShoulderDepth - s.height;
        const overshoot = s.height - maxLen;
        warnings.push({
          severity: 'hard',
          line,
          message: `Lid standoff (${fmt(s.height)} mm) is longer than the box interior height -- it will hit the floor when the lid is on. Max Height is ${fmt(maxLen)} mm.`,
          ghost: {
            kind: 'cylinder',
            frame: 'lid',
            pos: [wx, wy, freeEnd + overshoot / 2],
            axis: 'z',
            radius: r + GHOST_WRAP,
            length: overshoot,
          },
        });
      }
    }

    attribute(warnings, first, s.source);
  }
  return warnings;
}

/**
 * Re-attribute the warnings this item just produced. A compiled feature has no
 * textarea line, so pointing at one would send the reader somewhere unrelated;
 * name where it actually came from instead.
 */
function attribute(warnings: DesignWarning[], first: number, source: string | undefined): void {
  if (!source) return;
  for (let i = first; i < warnings.length; i++) {
    warnings[i].source = source;
    warnings[i].line = undefined;
  }
}

/** Red disc over just the fillet skirt at a floor standoff's base. */
function filletGhost(box: BoxParams, s: StandoffParams, reach: number): WarningGhost {
  const { wx, wy } = floorToWorld(box, s.x, s.y);
  const f = Math.min(s.baseFillet, s.od / 2 - 0.05, s.height - 0.05);
  return {
    kind: 'cylinder',
    frame: 'box',
    pos: [wx, wy, box.floorThickness + f / 2],
    axis: 'z',
    radius: reach + GHOST_WRAP,
    length: f + 2 * GHOST_WRAP,
  };
}

/** Red overlay wrapping a whole standoff (used for off-surface warnings). */
function standoffGhost(box: BoxParams, lid: LidParams, s: StandoffParams): WarningGhost {
  const r = s.od / 2 + GHOST_WRAP;
  if (s.surface === 'floor') {
    const { wx, wy } = floorToWorld(box, s.x, s.y);
    return {
      kind: 'cylinder',
      frame: 'box',
      pos: [wx, wy, box.floorThickness + s.height / 2],
      axis: 'z',
      radius: r,
      length: s.height + 2 * GHOST_WRAP,
    };
  }
  const { wx, wy } = lidToLocal(box, lid, s.x, s.y);
  return {
    kind: 'cylinder',
    frame: 'lid',
    pos: [wx, wy, lid.coverShoulderDepth - s.height / 2],
    axis: 'z',
    radius: r,
    length: s.height + 2 * GHOST_WRAP,
  };
}

// ---------------------------------------------------------------------------
// Cutouts
// ---------------------------------------------------------------------------

interface SurfaceInfo {
  /** User-frame span the cutout should stay within. */
  spanX: number;
  spanY: number;
  /** Human name for messages. */
  name: string;
  /** Material thickness the cutout pierces. */
  thickness: number;
}

/**
 * The usable extent of a surface in its own user frame, as the bounds checks
 * see it. Exported so the `maxX` / `maxY` expression variables mean exactly
 * what "extends past the edge" means here, rather than a second opinion.
 */
export function surfaceSpan(
  box: BoxParams,
  lid: LidParams,
  surface: CutoutParams['surface']
): { x: number; y: number } {
  const info = cutoutSurfaceInfo(box, lid, surface);
  return { x: info.spanX, y: info.spanY };
}

function cutoutSurfaceInfo(box: BoxParams, lid: LidParams, surface: CutoutParams['surface']): SurfaceInfo {
  const interior = interiorSpan(box);
  const wallY = box.height - box.floorThickness;
  switch (surface) {
    case 'floor':
      return { spanX: interior.x, spanY: interior.y, name: 'interior floor', thickness: box.floorThickness };
    case 'lid': {
      const p = pocketSpan(box, lid);
      return { spanX: p.x, spanY: p.y, name: 'lid center pocket area', thickness: lid.coverThicknessAtEdge };
    }
    case 'front':
    case 'back':
      return { spanX: interior.x, spanY: wallY, name: `${surface} wall`, thickness: box.wallThickness };
    case 'left':
    case 'right':
      return { spanX: interior.y, spanY: wallY, name: `${surface} wall`, thickness: box.wallThickness };
  }
}

/**
 * Cutout center in ghost coordinates (box frame for walls/floor, lid-local
 * for the lid), centered in the material thickness. Mirrors the transforms
 * in geometry/cutouts.ts.
 */
function cutoutCenter(
  box: BoxParams,
  lid: LidParams,
  surface: CutoutParams['surface'],
  x: number,
  y: number
): { frame: 'box' | 'lid'; pos: Vec3; normal: 'x' | 'y' | 'z' } {
  const halfL = box.length / 2;
  const halfW = box.width / 2;
  const wallT = box.wallThickness;
  switch (surface) {
    case 'floor': {
      const { wx, wy } = floorToWorld(box, x, y);
      return { frame: 'box', pos: [wx, wy, box.floorThickness / 2], normal: 'z' };
    }
    case 'lid': {
      const { wx, wy } = lidToLocal(box, lid, x, y);
      return {
        frame: 'lid',
        pos: [wx, wy, lid.coverShoulderDepth + lid.coverThicknessAtEdge / 2],
        normal: 'z',
      };
    }
    case 'front':
      return { frame: 'box', pos: [+halfL - wallT - x, -halfW + wallT / 2, box.floorThickness + y], normal: 'y' };
    case 'back':
      return { frame: 'box', pos: [-halfL + wallT + x, +halfW - wallT / 2, box.floorThickness + y], normal: 'y' };
    case 'left':
      return { frame: 'box', pos: [-halfL + wallT / 2, -halfW + wallT + x, box.floorThickness + y], normal: 'x' };
    case 'right':
      return { frame: 'box', pos: [+halfL - wallT / 2, +halfW - wallT - x, box.floorThickness + y], normal: 'x' };
  }
}

function cutoutGhost(box: BoxParams, lid: LidParams, c: CutoutParams): WarningGhost {
  const info = cutoutSurfaceInfo(box, lid, c.surface);
  const { frame, pos, normal } = cutoutCenter(box, lid, c.surface, c.x, c.y);
  const through = info.thickness + 2; // pierce with 1 mm overshoot per face

  if (c.kind === 'round') {
    return { kind: 'cylinder', frame, pos, axis: normal, radius: c.diameter / 2 + GHOST_WRAP, length: through };
  }
  const w = c.width + 2 * GHOST_WRAP;
  const h = c.height + 2 * GHOST_WRAP;
  // Map user (w, h) onto world axes per surface. Signs don't matter for size.
  let size: Vec3;
  if (normal === 'z') size = [w, h, through];
  else if (normal === 'y') size = [w, through, h];
  else size = [through, w, h];
  return { kind: 'box', frame, pos, size };
}

export function cutoutWarnings(
  box: BoxParams,
  lid: LidParams,
  cutouts: CutoutParams[]
): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  for (const c of cutouts) {
    const line = c.line;
    const first = warnings.length;
    let ex: number; // half-extent in user X
    let ey: number;
    if (c.kind === 'round') {
      if (c.diameter <= 0) {
        warnings.push({ severity: 'hard', line, message: 'Diameter must be > 0.' });
        attribute(warnings, first, c.source);
        continue;
      }
      ex = ey = c.diameter / 2;
    } else {
      if (c.width <= 0 || c.height <= 0) {
        warnings.push({ severity: 'hard', line, message: 'HoleX and HoleY must be > 0.' });
        attribute(warnings, first, c.source);
        continue;
      }
      ex = c.width / 2;
      ey = c.height / 2;
    }

    const info = cutoutSurfaceInfo(box, lid, c.surface);
    const fit = boundsFit(c.x - ex, c.x + ex, c.y - ey, c.y + ey, info.spanX, info.spanY);
    if (fit === 'inside') {
      attribute(warnings, first, c.source);
      continue;
    }

    const ghost = cutoutGhost(box, lid, c);
    if (fit === 'outside') {
      warnings.push({
        severity: 'hard',
        line,
        message: `Cutout lies entirely outside the ${info.name} (${fmt(info.spanX)} x ${fmt(info.spanY)} mm) -- it cuts nothing.`,
        ghost,
      });
    } else if (c.surface === 'lid') {
      warnings.push({
        severity: 'advisory',
        line,
        message: `Cutout extends past the ${info.name} (${fmt(info.spanX)} x ${fmt(info.spanY)} mm) into the shoulder rim -- this can weaken the shoulder or produce odd geometry.`,
        ghost,
      });
    } else {
      const notch = c.surface !== 'floor' ? ' OK if you intend a rim notch or corner cut.' : '';
      warnings.push({
        severity: 'advisory',
        line,
        message: `Cutout extends past the ${info.name}'s interior span (${fmt(info.spanX)} x ${fmt(info.spanY)} mm).${notch}`,
        ghost,
      });
    }

    attribute(warnings, first, c.source);
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Text labels
// ---------------------------------------------------------------------------

export function textLabelWarnings(
  box: BoxParams,
  lid: LidParams,
  labels: TextLabelParams[]
): DesignWarning[] {
  const warnings: DesignWarning[] = [];
  for (const l of labels) {
    const line = l.line;
    if (l.depth <= 0) {
      warnings.push({ severity: 'hard', line, message: 'Depth must be > 0.' });
      continue;
    }
    if (l.textHeight <= 0) {
      warnings.push({ severity: 'hard', line, message: 'TextHeight must be > 0.' });
      continue;
    }
    if (l.textHeight < 2) {
      warnings.push({
        severity: 'advisory',
        line,
        message: `TextHeight (${fmt(l.textHeight)} mm) is below 2 mm -- glyphs may not form cleanly when printed.`,
      });
    }
    if (l.type === 'deboss') {
      const hostT =
        l.surface === 'floor'
          ? box.floorThickness
          : l.surface === 'lid'
            ? lid.coverThicknessAtCenter
            : box.wallThickness;
      const hostName =
        l.surface === 'floor'
          ? 'floor'
          : l.surface === 'lid'
            ? 'lid center'
            : `${l.surface} wall`;
      if (l.depth >= hostT) {
        const { frame, pos } = cutoutCenter(box, lid, l.surface, l.x, l.y);
        warnings.push({
          severity: 'hard',
          line,
          message: `Deboss Depth (${fmt(l.depth)} mm) cuts all the way through the ${hostName} (${fmt(hostT)} mm thick). Reduce Depth.`,
          ghost: { kind: 'sphere', frame, pos, radius: Math.max(2, l.textHeight * 0.6) },
        });
      }
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Viewport aggregation
// ---------------------------------------------------------------------------

/** Every ghost shape across all sections, for WarningMarkers. */
export function collectGhosts(
  box: BoxParams,
  lid: LidParams,
  standoffs: StandoffParams[],
  cutouts: CutoutParams[],
  labels: TextLabelParams[]
): WarningGhost[] {
  return [
    ...standoffWarnings(box, lid, standoffs),
    ...cutoutWarnings(box, lid, cutouts),
    ...textLabelWarnings(box, lid, labels),
  ]
    .map((w) => w.ghost)
    .filter((g): g is WarningGhost => g !== undefined);
}
