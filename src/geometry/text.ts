'use client';

import * as opentype from 'opentype.js';
import { getManifold } from './manifold';
import type { CrossSection, Manifold } from 'manifold-3d';
import type {
  BoxParams,
  LidParams,
  TextLabelParams,
  TextLabelSurface,
  TextLabelDirection,
} from '@/store/useDesign';

/* -------------------------------------------------------------------------- */
/*  Font registry                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Bundled fonts shipped from public/fonts/. Family names are the keys users
 * type into the Font column of the Text Labels textarea.
 *
 * Entry forms:
 *   string                          -- one TTF (typically a variable font;
 *                                       Bold:yes uses the `wght` axis).
 *   { regular, bold }               -- two TTFs (static fonts that need a
 *                                       separate bold file so Bold:yes works).
 *
 * To add a font:
 *   1. Drop the .ttf into public/fonts/
 *   2. Add an entry here
 *   3. (Optional) consider whether the font prints well at small sizes; thin
 *      strokes don't survive a 0.4mm nozzle.
 */
type FontEntry = string | { regular: string; bold: string };
const BUNDLED_FONT_URLS: Record<string, FontEntry> = {
  'Atkinson Hyperlegible': {
    regular: '/fonts/AtkinsonHyperlegible-Regular.ttf',
    bold: '/fonts/AtkinsonHyperlegible-Bold.ttf',
  },
  'JetBrains Mono': '/fonts/JetBrainsMono.ttf',
  // Inter is excluded for now -- its [opsz,wght] axes confuse opentype.js v2's
  // default-instance picker and getPath returns nothing usable. Re-add once
  // opentype.js handles multi-axis variable fonts properly, or swap to a
  // static Inter from rsms/inter releases. See opentypejs/opentype.js#675.
  'Open Sans': '/fonts/OpenSans.ttf',
};

function hasSeparateBoldFile(name: string): boolean {
  const entry = BUNDLED_FONT_URLS[name];
  return typeof entry === 'object' && !!entry.bold;
}

const bundledCache = new Map<string, opentype.Font>();

/**
 * Active custom font (single-slot per project spec). We track both the
 * parsed Font (for geometry) and the original buffer (so Save Design can
 * embed it as base64 in the JSON for portable sharing).
 */
interface CustomFontEntry {
  font: opentype.Font;
  buffer: ArrayBuffer;
}
let customFont: { name: string; entry: CustomFontEntry } | null = null;

export const BUNDLED_FONT_NAMES = Object.keys(BUNDLED_FONT_URLS);

export function listAvailableFonts(): string[] {
  return customFont
    ? [...BUNDLED_FONT_NAMES, customFont.name]
    : [...BUNDLED_FONT_NAMES];
}

/** For Save Design: returns the active custom font's name + bytes, or null. */
export function getActiveCustomFont(): { name: string; buffer: ArrayBuffer } | null {
  return customFont ? { name: customFont.name, buffer: customFont.entry.buffer } : null;
}

export async function loadFont(name: string, bold = false): Promise<opentype.Font> {
  // Custom fonts: one slot, no bold variant -- if the user wants bold for a
  // custom font they upload a bold-weight TTF and use its family name directly.
  if (customFont && customFont.name === name) return customFont.entry.font;

  // Bundled fonts: cache regular and bold separately so the bold flag picks
  // the right file on every call without re-fetching.
  const cacheKey = `${name}|${bold ? 'bold' : 'regular'}`;
  if (bundledCache.has(cacheKey)) return bundledCache.get(cacheKey)!;

  const entry = BUNDLED_FONT_URLS[name];
  if (!entry) {
    throw new Error(
      `Unknown font "${name}". Available: ${listAvailableFonts().join(', ')}`
    );
  }
  const url = typeof entry === 'string'
    ? entry
    : bold ? entry.bold : entry.regular;
  // opentype.js v2 deprecated load(); use fetch + parse instead (the old
  // load() can return undefined in some code paths, see opentypejs/opentype.js#675).
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch font "${name}" from ${url}: HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const font = opentype.parse(buffer);
  bundledCache.set(cacheKey, font);
  return font;
}

/**
 * Register a user-uploaded font (one slot, replaces any prior custom font).
 * Stores both the parsed Font and the original bytes so Save Design can
 * embed the font in the saved JSON for portable sharing.
 */
export function registerCustomFont(name: string, font: opentype.Font, buffer: ArrayBuffer): void {
  customFont = { name, entry: { font, buffer } };
  notifyCustomFontListeners();
}

export function clearCustomFonts(): void {
  customFont = null;
  notifyCustomFontListeners();
}

/**
 * Subscribe to changes in the active custom font (register / clear). Used by
 * UI components that mirror the font name -- on mount they pick up whatever
 * is already active (e.g., restored from IndexedDB by useAutoSave), and any
 * subsequent change fires the listener.
 *
 * Returns an unsubscribe function.
 */
type CustomFontListener = () => void;
const customFontListeners = new Set<CustomFontListener>();

export function subscribeToCustomFont(listener: CustomFontListener): () => void {
  customFontListeners.add(listener);
  return () => {
    customFontListeners.delete(listener);
  };
}

function notifyCustomFontListeners(): void {
  customFontListeners.forEach((l) => l());
}

/* -------------------------------------------------------------------------- */
/*  Bezier sampling                                                            */
/* -------------------------------------------------------------------------- */

const BEZIER_SEGMENTS = 8;

function sampleCubic(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  n: number
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    pts.push([x, y]);
  }
  return pts;
}

function sampleQuad(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  n: number
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    pts.push([x, y]);
  }
  return pts;
}

/* -------------------------------------------------------------------------- */
/*  Path -> 2D polygons                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Convert opentype.js path commands to closed 2D polygons. Each `Z` (close)
 * ends a polygon. Points are returned in the path's original coords
 * (opentype.js Y-down -- baseline at y=0, ascenders are y < 0 because the
 * font designer's Y-up is flipped to canvas Y-down by opentype.js).
 */
function pathToPolygons(commands: opentype.PathCommand[]): Array<Array<[number, number]>> {
  const polygons: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  let lastX = 0;
  let lastY = 0;

  const finish = () => {
    if (current.length >= 3) polygons.push(current);
    current = [];
  };

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      finish();
      current.push([cmd.x, cmd.y]);
      lastX = cmd.x;
      lastY = cmd.y;
    } else if (cmd.type === 'L') {
      current.push([cmd.x, cmd.y]);
      lastX = cmd.x;
      lastY = cmd.y;
    } else if (cmd.type === 'C') {
      const sampled = sampleCubic(
        [lastX, lastY],
        [cmd.x1, cmd.y1],
        [cmd.x2, cmd.y2],
        [cmd.x, cmd.y],
        BEZIER_SEGMENTS
      );
      for (const p of sampled) current.push(p);
      lastX = cmd.x;
      lastY = cmd.y;
    } else if (cmd.type === 'Q') {
      const sampled = sampleQuad(
        [lastX, lastY],
        [cmd.x1, cmd.y1],
        [cmd.x, cmd.y],
        BEZIER_SEGMENTS
      );
      for (const p of sampled) current.push(p);
      lastX = cmd.x;
      lastY = cmd.y;
    } else if (cmd.type === 'Z') {
      finish();
    }
  }
  finish();
  return polygons;
}

/* -------------------------------------------------------------------------- */
/*  Public API: text -> CrossSection / Manifold                                */
/* -------------------------------------------------------------------------- */

/**
 * Build a 2D CrossSection for the given text, centered on the XY origin.
 *
 * The glyphs lie in the XY plane with ascenders pointing +Y (math Y-up) and
 * characters flowing +X. Cap-height of the font is scaled to `textHeight`
 * (mm), so a TextHeight of 5 means uppercase letters are roughly 5mm tall.
 *
 * If `bold` is true and the font has a `wght` variation axis (any v2-style
 * variable font), the glyphs are rendered at weight 700. For static fonts
 * (no `fvar` table), bold is silently ignored -- a console warning is logged
 * so users know why their "yes" had no effect.
 *
 * EvenOdd fill rule sidesteps any winding-direction question between
 * opentype.js's canvas-Y-down output and our math-Y-up downstream geometry.
 */
export async function buildTextCrossSection(
  text: string,
  fontName: string,
  textHeight: number,
  bold = false
): Promise<CrossSection | null> {
  if (!text || textHeight <= 0) return null;
  const { CrossSection } = await getManifold();
  const font = await loadFont(fontName, bold);

  const SIZE_PX = 1000;
  // Three ways bold can be satisfied:
  //   1. The font has a separate Bold TTF (Atkinson) -- loadFont already
  //      returned the bold-weighted Font, nothing more to do here.
  //   2. The font is a variable font with a wght axis (JetBrains Mono, Open
  //      Sans, most custom uploads) -- pass `variation: {wght: 700}` to
  //      getPath. opentype.js v2 supports this option at runtime even though
  //      it's not declared in the TS types (see opentype.js dist ~line 6063).
  //   3. Neither -- bold cannot be rendered. Warn and continue with regular.
  const usingBoldFile = bold && hasSeparateBoldFile(fontName);
  const hasWeightAxis = !!(
    (font.tables as { fvar?: { axes?: Array<{ tag?: string }> } }).fvar?.axes?.some(
      (a) => a.tag === 'wght'
    )
  );
  if (bold && !usingBoldFile && !hasWeightAxis) {
    console.warn(
      `[BoxMaker text] font "${fontName}" has no bold variant; "Bold: yes" ignored.`
    );
  }
  const renderOpts = bold && !usingBoldFile && hasWeightAxis
    ? ({ variation: { wght: 700 } } as opentype.RenderOptions)
    : undefined;
  const path = font.getPath(text, 0, 0, SIZE_PX, renderOpts);
  const polygons = pathToPolygons(path.commands);
  if (polygons.length === 0) return null;

  // Scale: opentype's cap-height (in design units) maps to textHeight mm.
  const unitsPerEm = font.unitsPerEm;
  const os2 = (font.tables as { os2?: { sCapHeight?: number } }).os2;
  const capHeightDesign = os2?.sCapHeight ?? font.ascender;
  const capHeightPx = (capHeightDesign / unitsPerEm) * SIZE_PX;
  const scale = textHeight / capHeightPx;

  // Center on origin using the path's bounding box.
  const bbox = path.getBoundingBox();
  const cx = (bbox.x1 + bbox.x2) / 2;
  const cy = (bbox.y1 + bbox.y2) / 2;

  // Flip Y (opentype is canvas-Y-down; we want math-Y-up).
  const transformed = polygons.map((poly) =>
    poly.map(([x, y]) => [(x - cx) * scale, -(y - cy) * scale] as [number, number])
  );

  return new CrossSection(transformed, 'EvenOdd');
}

/**
 * Extrude text to a 3D Manifold at the given depth.
 *
 * Result: glyphs lie in the XY plane, extruded along +Z, centered on the
 * origin in all three axes. Caller rotates and translates to position on
 * the target surface.
 *
 * Returns null for empty/invalid input.
 */
export async function buildTextSlab(
  text: string,
  fontName: string,
  textHeight: number,
  depth: number,
  bold = false
): Promise<Manifold | null> {
  if (!text || textHeight <= 0 || depth <= 0) return null;
  const { Manifold } = await getManifold();
  const xs = await buildTextCrossSection(text, fontName, textHeight, bold);
  if (!xs) return null;
  const m = Manifold.extrude(xs, depth, undefined, undefined, undefined, true);
  xs.delete();
  return m;
}

/* -------------------------------------------------------------------------- */
/*  Per-surface positioning                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Rotation (degrees, CCW positive) applied to the text within its 2D plane
 * so the TOP of the glyphs points toward the named direction (a box edge
 * or face).
 *
 * Per-surface 2D frame in world coords (see useDesign.ts for the user-facing
 * convention):
 *   lid:   user X = -X world (mirrored from outside view), user Y = +Y world
 *          (default top = world +Y back)
 *   floor: user X = +X world, user Y = +Y world (default top = world -Y front,
 *                                                via the slab's 180-X flip)
 *   front: user X = +X world, user Y = +Z world (default top = world +Z up)
 *   back:  user X = -X world, user Y = +Z world (default top = world +Z up)
 *   left:  user X = -Y world, user Y = +Z world (default top = world +Z up)
 *   right: user X = +Y world, user Y = +Z world (default top = world +Z up)
 *
 * For each surface, two of the six directions are parallel to the surface
 * normal and rejected at parse time -- so the table below only handles the
 * four in-plane directions per surface. Unknown combos return 0 as a
 * defensive fallback.
 */
function textDirectionRotation(surface: TextLabelSurface, direction: TextLabelDirection): number {
  switch (surface) {
    case 'lid':
      // Lid surface uses identity surface-rotation, so the text 2D frame
      // maps directly to world: 2D +X = world +X, 2D +Y = world +Y (BACK
      // of box). Default text top therefore points to world +Y -- this is
      // the "normally readable from a front-of-box viewer" orientation
      // matching Fusion BoxMaker's convention.
      if (direction === 'back')  return 0;
      if (direction === 'front') return 180;
      if (direction === 'left')  return 90;   // +Y user -> -X user (world -X)
      if (direction === 'right') return -90;  // +Y user -> +X user (world +X)
      return 0;
    case 'floor':
      // Floor's surface rotation is 180 deg around X axis. That flips Y and
      // Z but LEAVES X alone, so the text 2D frame in world is:
      //   2D +X = world +X, 2D +Y = world -Y (front of box).
      // The position formula does NOT flip user X (front-left origin,
      // standard right-handed sketch convention). Direction rotations match
      // the lid since the slab's world-frame X is unchanged.
      if (direction === 'front') return 0;
      if (direction === 'back')  return 180;
      if (direction === 'left')  return 90;   // +Y user -> -X user (world -X)
      if (direction === 'right') return -90;  // +Y user -> +X user (world +X)
      return 0;
    case 'front':
      // Default top = world +Z (lid edge).
      if (direction === 'lid')   return 0;
      if (direction === 'floor') return 180;
      if (direction === 'left')  return 90;
      if (direction === 'right') return -90;
      return 0;
    case 'back':
      // Default top = world +Z. X axis flipped vs front, so left/right swap.
      if (direction === 'lid')   return 0;
      if (direction === 'floor') return 180;
      if (direction === 'left')  return -90;
      if (direction === 'right') return 90;
      return 0;
    case 'left':
      // 2D user X = -Y world. front/back are along ±Y world.
      if (direction === 'lid')   return 0;
      if (direction === 'floor') return 180;
      if (direction === 'front') return -90;  // world -Y = +X user
      if (direction === 'back')  return 90;
      return 0;
    case 'right':
      // 2D user X = +Y world. Mirror of left wall.
      if (direction === 'lid')   return 0;
      if (direction === 'floor') return 180;
      if (direction === 'front') return 90;   // world -Y = -X user
      if (direction === 'back')  return -90;
      return 0;
  }
}

const COPLANAR_EPS = 0.01;

/**
 * Build and position one text label as a 3D Manifold ready to be unioned
 * (emboss) or subtracted (deboss) from the host body.
 *
 * The slab is built in standard orientation (text in XY, extruded along +Z),
 * then 2D-rotated for Direction, then surface-rotated to align with the
 * target outer face, then translated to (x, y) on the surface at the proper
 * depth for emboss vs deboss.
 *
 * For floor: the slab is flipped 180-deg around X so the text reads correctly
 * when the printed box is turned upside-down to view its bottom face.
 */
export async function buildPositionedTextLabel(
  label: TextLabelParams,
  box: BoxParams,
  lid: LidParams
): Promise<Manifold | null> {
  if (!label.text || label.textHeight <= 0 || label.depth <= 0) return null;

  const { Manifold } = await getManifold();

  // 1. 2D cross-section with Direction rotation baked into the 2D frame.
  let xs = await buildTextCrossSection(label.text, label.font, label.textHeight, label.bold);
  if (!xs) return null;
  const dirRot = textDirectionRotation(label.surface, label.direction);
  if (dirRot !== 0) {
    const r = xs.rotate(dirRot);
    xs.delete();
    xs = r;
  }

  // 2. Extrude to a slab centered on origin along Z.
  const slab = Manifold.extrude(xs, label.depth, undefined, undefined, undefined, true);
  xs.delete();

  const isEmboss = label.type === 'emboss';

  // 3. Surface orientation + translation. The slab's +Z direction (depth axis)
  //    needs to align with the surface's outward normal; the slab's +X stays
  //    pointing in the surface's local +X user direction.
  switch (label.surface) {
    case 'lid': {
      // Outward = +Z. Outer face = top of plate.
      // Lid 0,0 at FRONT-LEFT of shoulder pocket as viewed from INSIDE the
      // box; user +X = world -X (left), user +Y = world +Y (back). The X
      // axis is mirrored compared to the floor because the inside-up view
      // of the lid is the mirror of looking down at the top.
      const inset = box.wallThickness + lid.boxGap + lid.coverShoulderWallThickness;
      const wx = +box.length / 2 - inset - label.x;
      const wy = -box.width / 2 + inset + label.y;
      const topOfPlate = lid.coverShoulderDepth + lid.coverThicknessAtEdge;
      const wz = isEmboss
        ? topOfPlate + label.depth / 2
        : topOfPlate - label.depth / 2 + COPLANAR_EPS;
      return slab.translate(wx, wy, wz);
    }
    case 'floor': {
      // Outward = -Z. Flip slab so depth goes -Z; also flips text Y so it
      // reads correctly from below (the flipped-box view).
      // Floor 0,0 at interior FRONT-LEFT corner; user +X = world +X (right),
      // user +Y = world +Y (back).
      const flipped = slab.rotate([180, 0, 0]);
      slab.delete();
      const wx = -box.length / 2 + box.wallThickness + label.x;
      const wy = -box.width / 2 + box.wallThickness + label.y;
      const wz = isEmboss
        ? -label.depth / 2
        : label.depth / 2 - COPLANAR_EPS;
      return flipped.translate(wx, wy, wz);
    }
    case 'front': {
      // Outward = -Y. 90-deg around X sends slab +Z to -Y.
      // Position: 0,0 at interior bottom-left viewed from inside the box.
      // For front wall, inside-view-left = box's +X side.
      const r = slab.rotate([90, 0, 0]);
      slab.delete();
      const wx = +box.length / 2 - box.wallThickness - label.x;
      const wz = box.floorThickness + label.y;
      const wy = isEmboss
        ? -box.width / 2 - label.depth / 2
        : -box.width / 2 + label.depth / 2 - COPLANAR_EPS;
      return r.translate(wx, wy, wz);
    }
    case 'back': {
      // Outward = +Y. -90 around X then 180 around Y sends +Z to +Y, -X is user-X.
      // Position: 0,0 at interior bottom-left viewed from inside the box.
      // For back wall, inside-view-left = box's -X side.
      const r1 = slab.rotate([-90, 0, 0]);
      slab.delete();
      const r2 = r1.rotate([0, 180, 0]);
      r1.delete();
      const wx = -box.length / 2 + box.wallThickness + label.x;
      const wz = box.floorThickness + label.y;
      const wy = isEmboss
        ? +box.width / 2 + label.depth / 2
        : +box.width / 2 - label.depth / 2 + COPLANAR_EPS;
      return r2.translate(wx, wy, wz);
    }
    case 'left': {
      // Outward = -X. -90 around Y then 90 around X.
      // Position: 0,0 at interior bottom-left viewed from inside the box.
      // For left wall, inside-view-left = box's -Y side (front).
      const r1 = slab.rotate([0, -90, 0]);
      slab.delete();
      const r2 = r1.rotate([90, 0, 0]);
      r1.delete();
      const wy = -box.width / 2 + box.wallThickness + label.x;
      const wz = box.floorThickness + label.y;
      const wx = isEmboss
        ? -box.length / 2 - label.depth / 2
        : -box.length / 2 + label.depth / 2 - COPLANAR_EPS;
      return r2.translate(wx, wy, wz);
    }
    case 'right': {
      // Outward = +X. 90 around Y then 90 around X.
      // Position: 0,0 at interior bottom-left viewed from inside the box.
      // For right wall, inside-view-left = box's +Y side (back).
      const r1 = slab.rotate([0, 90, 0]);
      slab.delete();
      const r2 = r1.rotate([90, 0, 0]);
      r1.delete();
      const wy = +box.width / 2 - box.wallThickness - label.x;
      const wz = box.floorThickness + label.y;
      const wx = isEmboss
        ? +box.length / 2 + label.depth / 2
        : +box.length / 2 - label.depth / 2 + COPLANAR_EPS;
      return r2.translate(wx, wy, wz);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Bulk emboss/deboss collectors                                              */
/* -------------------------------------------------------------------------- */

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

const BOX_SURFACES: ReadonlySet<TextLabelSurface> = new Set([
  'front',
  'back',
  'left',
  'right',
  'floor',
] as const);

/**
 * Build the unioned emboss bodies and deboss cutters for all labels whose
 * surface lives on the BOX (front/back/left/right/floor). Caller unions
 * `emboss` and subtracts `deboss` from the box body.
 *
 * SeparateBody labels are skipped here -- they're collected separately by
 * `collectSeparateBodies` for multi-body export.
 *
 * Font load failures are swallowed and logged so a typo in the Font column
 * doesn't crash the whole geometry rebuild.
 */
export async function buildBoxTextLabels(
  box: BoxParams,
  lid: LidParams,
  labels: TextLabelParams[]
): Promise<{ emboss: Manifold | null; deboss: Manifold | null }> {
  const emboss: Manifold[] = [];
  const deboss: Manifold[] = [];

  for (const label of labels) {
    if (!BOX_SURFACES.has(label.surface)) continue;
    if (label.separateBody) continue;

    try {
      const m = await buildPositionedTextLabel(label, box, lid);
      if (!m) {
        console.warn('[BoxMaker text] empty geometry for', label);
        continue;
      }
      if (label.type === 'emboss') emboss.push(m);
      else deboss.push(m);
    } catch (err) {
      console.warn('[BoxMaker text] build failed (box):', label, err);
    }
  }

  return { emboss: unionAll(emboss), deboss: unionAll(deboss) };
}

/**
 * Same as buildBoxTextLabels but for the lid surface only.
 */
export async function buildLidTextLabels(
  box: BoxParams,
  lid: LidParams,
  labels: TextLabelParams[]
): Promise<{ emboss: Manifold | null; deboss: Manifold | null }> {
  const emboss: Manifold[] = [];
  const deboss: Manifold[] = [];

  for (const label of labels) {
    if (label.surface !== 'lid') continue;
    if (label.separateBody) continue;

    try {
      const m = await buildPositionedTextLabel(label, box, lid);
      if (!m) {
        console.warn('[BoxMaker text] empty geometry for', label);
        continue;
      }
      if (label.type === 'emboss') emboss.push(m);
      else deboss.push(m);
    } catch (err) {
      console.warn('[BoxMaker text] build failed (lid):', label, err);
    }
  }

  return { emboss: unionAll(emboss), deboss: unionAll(deboss) };
}

/**
 * SeparateBody mode: build the unioned manifold of text labels that are
 * marked `separateBody=true` on the host surfaces. The host body is NOT
 * modified; this body is rendered (and exported) as its own object, ready
 * for multi-material slicing.
 *
 * Position note: for emboss, the slab sits on the outer face exactly where
 * the unioned version would protrude. For deboss, the slab is centered IN
 * the host material to fill the recess flush. Caller is responsible for
 * subtracting any deboss separate-bodies from the host body (so the recess
 * is visually empty in single-material view but filled by the separate body
 * in multi-material view).
 */
export async function buildBoxSeparateText(
  box: BoxParams,
  lid: LidParams,
  labels: TextLabelParams[]
): Promise<Manifold | null> {
  const bodies: Manifold[] = [];
  for (const label of labels) {
    if (!BOX_SURFACES.has(label.surface)) continue;
    if (!label.separateBody) continue;
    try {
      const m = await buildPositionedTextLabel(label, box, lid);
      if (m) bodies.push(m);
    } catch (err) {
      console.warn('[BoxMaker] separate-body text failed (box):', label, err);
    }
  }
  return unionAll(bodies);
}

export async function buildLidSeparateText(
  box: BoxParams,
  lid: LidParams,
  labels: TextLabelParams[]
): Promise<Manifold | null> {
  const bodies: Manifold[] = [];
  for (const label of labels) {
    if (label.surface !== 'lid') continue;
    if (!label.separateBody) continue;
    try {
      const m = await buildPositionedTextLabel(label, box, lid);
      if (m) bodies.push(m);
    } catch (err) {
      console.warn('[BoxMaker] separate-body text failed (lid):', label, err);
    }
  }
  return unionAll(bodies);
}

/**
 * For separate-body DEBOSS labels: even though the body itself is kept
 * separate, the host needs a matching recess so the separate body can
 * physically sit flush. This returns the cutters (deboss slabs only) for
 * separate-body labels on the given host group, to be subtracted from the
 * host body in addition to the regular non-separate deboss subtraction.
 */
export async function buildBoxSeparateDebossCutters(
  box: BoxParams,
  lid: LidParams,
  labels: TextLabelParams[]
): Promise<Manifold | null> {
  const cutters: Manifold[] = [];
  for (const label of labels) {
    if (!BOX_SURFACES.has(label.surface)) continue;
    if (!label.separateBody || label.type !== 'deboss') continue;
    try {
      const m = await buildPositionedTextLabel(label, box, lid);
      if (m) cutters.push(m);
    } catch (err) {
      console.warn('[BoxMaker] separate deboss cutter failed (box):', label, err);
    }
  }
  return unionAll(cutters);
}

export async function buildLidSeparateDebossCutters(
  box: BoxParams,
  lid: LidParams,
  labels: TextLabelParams[]
): Promise<Manifold | null> {
  const cutters: Manifold[] = [];
  for (const label of labels) {
    if (label.surface !== 'lid') continue;
    if (!label.separateBody || label.type !== 'deboss') continue;
    try {
      const m = await buildPositionedTextLabel(label, box, lid);
      if (m) cutters.push(m);
    } catch (err) {
      console.warn('[BoxMaker] separate deboss cutter failed (lid):', label, err);
    }
  }
  return unionAll(cutters);
}
