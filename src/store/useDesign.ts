'use client';

import { create } from 'zustand';

export type ViewMode = 'box' | 'lid' | 'assembled';
export type DimensionMode = 'exterior' | 'interior';

/**
 * Internally, length/width/height are ALWAYS the box's exterior dimensions.
 * `mode` is purely a UI display toggle — it controls which numbers the
 * sliders show and which set the user's edits write back. Toggling the mode
 * never changes the physical box.
 */
export interface BoxParams {
  mode: DimensionMode;
  length: number;        // BoxLength  (X) — exterior
  width: number;         // BoxWidth   (Y) — exterior
  height: number;        // BoxHeight  (Z) — exterior
  wallThickness: number;
  floorThickness: number;
  outerCornerRadius: number;
  innerCornerRadius: number;
}

/**
 * Lid sits on top of the box. Plate matches the box's outer footprint;
 * shoulder block hangs down inside the box opening with BoxGap clearance.
 * Center pocket reduces center thickness without affecting the rim.
 */
export interface LidParams {
  coverThicknessAtEdge: number;
  coverThicknessAtCenter: number;
  coverShoulderWallThickness: number;
  coverShoulderDepth: number;
  boxGap: number;
}

/**
 * Snap-fit clip parameters. The print-tested signature feature.
 * Each side of the box has a triangular-prism "nub" that engages with a
 * matching cavity in the lid's shoulder. Per-side toggles let users skip
 * sides where the snap would interfere with other features.
 */
export interface SnapFitParams {
  snapFront: boolean;
  snapBack: boolean;
  snapLeft: boolean;
  snapRight: boolean;
  nubHeight: number;               // mm — wall-side length of the right-isoceles cross-section (apex 90°, depth = nubHeight/2)
  nubChamferAmountOnCover: number; // mm — 45° lead-in chamfer on the lid cutout's lower-outer edge
  nubWidthRatio: number;           // % of interior wall length
  nubWidthMin: number;             // mm — minimum width clamp
  nubWidthMax: number;             // mm — maximum width clamp
  nubBoxShrink: number;            // mm — how much narrower the box nub is than the cavity
}

/**
 * A single standoff: cylinder rising from the floor or hanging from the lid
 * interior, optionally with a concentric screw hole and base fillet.
 *
 * Surface coordinate frames (matches Fusion BoxMaker):
 *   Floor: 0,0 at interior BACK-RIGHT corner -- "lower-left" of top view.
 *          User +X grows toward the world -X side; user +Y grows toward
 *          the world -Y side (front).
 *   Lid:   0,0 at the BACK-LEFT inner corner of the shoulder pocket --
 *          "bottom-left" when lying inside the box with head at the back
 *          wall, looking up. User +X grows toward the world +X (right);
 *          user +Y grows toward the world -Y (front). Inner-radius on the
 *          pocket is ignored.
 *
 * Canonical state lives in `standoffsText` (a comma-delimited textarea), and
 * `standoffs` is derived by parsing that text on every edit.
 */
export interface StandoffParams {
  surface: 'floor' | 'lid';
  x: number;          // mm from interior front-left, along box length
  y: number;          // mm from interior front-left, along box width
  od: number;         // outer diameter (mm)
  height: number;     // height above the surface (mm)
  holeDia: number;    // 0 = no hole; otherwise concentric screw hole diameter
  holeDepth: number;  // mm — from the free end of the standoff
  baseFillet: number; // 0 = none; otherwise fillet radius at the surface junction
}

export interface StandoffParseError {
  line: number;       // 1-based line number in the source text
  reason: string;     // human-readable explanation
}

export type CutoutSurface = 'front' | 'back' | 'left' | 'right' | 'floor' | 'lid';

/**
 * A cutout: hole through a wall, the floor, or the lid. Round or rectangular.
 * Position is the cutout's center in the surface's 2D sketch frame.
 *
 * Walls: 0,0 at the wall's interior bottom-left when viewed from outside the
 *        box. +X is viewer's right, +Y is up (world +Z).
 * Floor: 0,0 at the interior back-right corner -- "lower-left" of top view.
 *        User +X grows toward the world -X side; user +Y grows toward world
 *        -Y (front). Matches Fusion BoxMaker.
 * Lid:   0,0 at the BACK-LEFT inner corner of the shoulder pocket -- the
 *        "bottom-left" when lying inside the box with head at the back wall,
 *        looking up. User +X to world +X (right), user +Y to world -Y (front).
 */
export type CutoutParams =
  | {
      surface: CutoutSurface;
      kind: 'round';
      x: number;
      y: number;
      diameter: number;
    }
  | {
      surface: CutoutSurface;
      kind: 'rect';
      x: number;
      y: number;
      width: number;       // along surface local X
      height: number;      // along surface local Y
      cornerRadius: number;
    };

export interface CutoutParseError {
  line: number;
  reason: string;
}

const CUTOUT_SURFACES: CutoutSurface[] = ['front', 'back', 'left', 'right', 'floor', 'lid'];

export type TextLabelSurface = CutoutSurface; // same six surfaces

/**
 * Direction names a box edge or face. The TOP of the text glyphs points
 * toward that direction. For example, text on the front wall with
 * direction=`lid` reads upright (top toward the lid edge); text on the lid
 * with direction=`back` reads with the top of letters toward the back wall.
 *
 * For each surface, two of the six directions are parallel to that
 * surface's normal and don't make geometric sense (e.g., direction=`lid` on
 * the lid surface). The parser rejects those combinations.
 */
export type TextLabelDirection = 'front' | 'back' | 'left' | 'right' | 'lid' | 'floor';

/**
 * Text label: embossed (raised) or debossed (recessed) text on any surface.
 *
 * Surface coordinate frames match cutouts -- see CutoutParams docs above.
 * `direction` controls which box edge the top of the glyphs points toward
 * (e.g. "back" on the lid means text top points to the back wall edge).
 *
 * `separateBody=true` keeps the text geometry as a distinct body (not unioned
 * or subtracted from the host), enabling multi-color printing via 3MF.
 */
export interface TextLabelParams {
  surface: TextLabelSurface;
  type: 'emboss' | 'deboss';
  x: number;
  y: number;
  depth: number;       // mm; ~0.4-0.8 typical
  textHeight: number;  // mm; ~4-8 typical (cap-height)
  direction: TextLabelDirection;
  font: string;        // family name (e.g. "Inter")
  bold: boolean;
  separateBody: boolean;
  text: string;
}

export interface TextLabelParseError {
  line: number;
  reason: string;
}

const TEXT_DIRECTIONS: TextLabelDirection[] = ['front', 'back', 'left', 'right', 'lid', 'floor'];

/** Directions valid for each surface (i.e., not parallel to the surface normal). */
const VALID_DIRECTIONS_BY_SURFACE: Record<TextLabelSurface, TextLabelDirection[]> = {
  lid:   ['front', 'back', 'left', 'right'],
  floor: ['front', 'back', 'left', 'right'],
  front: ['lid', 'floor', 'left', 'right'],
  back:  ['lid', 'floor', 'left', 'right'],
  left:  ['lid', 'floor', 'front', 'back'],
  right: ['lid', 'floor', 'front', 'back'],
};

function parseBool(s: string): boolean | null {
  const v = s.toLowerCase().trim();
  if (v === 'true' || v === 'yes' || v === '1' || v === 'y') return true;
  if (v === 'false' || v === 'no' || v === '0' || v === 'n') return false;
  return null; // empty string and anything else surface as parse errors
}

/**
 * Parse a text-labels textarea. One label per line, comma-delimited.
 * Format (11 fields): Surface,Type,X,Y,Depth,TextHeight,Direction,Font,Bold,SeparateBody,Text
 *
 * The Text field is taken as everything past the 10th comma, so commas
 * inside the text are preserved verbatim.
 *
 * Lines starting with `//` (after trim) are comments. Blank lines are skipped.
 */
export function parseTextLabelsText(text: string): {
  labels: TextLabelParams[];
  errors: TextLabelParseError[];
} {
  const labels: TextLabelParams[] = [];
  const errors: TextLabelParseError[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('//')) continue;

    // Find the position of the 10th comma. Everything after it is the Text.
    let commaCount = 0;
    let tenthCommaIdx = -1;
    for (let j = 0; j < raw.length; j++) {
      if (raw[j] === ',') {
        commaCount++;
        if (commaCount === 10) {
          tenthCommaIdx = j;
          break;
        }
      }
    }
    if (tenthCommaIdx < 0) {
      errors.push({
        line: i + 1,
        reason: `expected 11 fields (last is Text), got ${commaCount + 1}`,
      });
      continue;
    }

    const head = raw.slice(0, tenthCommaIdx).split(',').map((t) => t.trim());
    const textValue = raw.slice(tenthCommaIdx + 1); // preserve leading/trailing spaces in text? Trim to be friendly.
    const trimmedText = textValue.trim();

    if (head.length !== 10) {
      errors.push({
        line: i + 1,
        reason: `expected 10 fields before the text, got ${head.length}`,
      });
      continue;
    }

    const [surfaceRaw, typeRaw, xRaw, yRaw, depthRaw, heightRaw, dirRaw, fontRaw, boldRaw, separateRaw] = head;

    const surface = surfaceRaw.toLowerCase();
    if (!CUTOUT_SURFACES.includes(surface as CutoutSurface)) {
      errors.push({
        line: i + 1,
        reason: `surface must be one of ${CUTOUT_SURFACES.join(', ')}`,
      });
      continue;
    }

    const type = typeRaw.toLowerCase();
    if (type !== 'emboss' && type !== 'deboss') {
      errors.push({ line: i + 1, reason: `type must be "emboss" or "deboss"` });
      continue;
    }

    const nums = [xRaw, yRaw, depthRaw, heightRaw].map((t) => parseFloat(t));
    if (nums.some((n) => !Number.isFinite(n))) {
      errors.push({ line: i + 1, reason: 'X, Y, Depth, TextHeight must be numeric' });
      continue;
    }
    const [x, y, depth, textHeight] = nums;

    const direction = dirRaw.toLowerCase();
    if (!TEXT_DIRECTIONS.includes(direction as TextLabelDirection)) {
      errors.push({
        line: i + 1,
        reason: `direction must be one of ${TEXT_DIRECTIONS.join(', ')}`,
      });
      continue;
    }
    const validForSurface = VALID_DIRECTIONS_BY_SURFACE[surface as TextLabelSurface];
    if (!validForSurface.includes(direction as TextLabelDirection)) {
      errors.push({
        line: i + 1,
        reason: `direction "${direction}" is parallel to the ${surface} surface; use one of ${validForSurface.join(', ')}`,
      });
      continue;
    }

    const font = fontRaw; // free-form; geometry layer validates against loaded fonts
    if (!font) {
      errors.push({ line: i + 1, reason: 'font name is required' });
      continue;
    }

    const bold = parseBool(boldRaw);
    if (bold === null) {
      errors.push({ line: i + 1, reason: `bold must be yes/no, got "${boldRaw}"` });
      continue;
    }

    const separateBody = parseBool(separateRaw);
    if (separateBody === null) {
      errors.push({
        line: i + 1,
        reason: `separateBody must be yes/no, got "${separateRaw}"`,
      });
      continue;
    }

    if (!trimmedText) {
      errors.push({ line: i + 1, reason: 'text is empty' });
      continue;
    }

    labels.push({
      surface: surface as TextLabelSurface,
      type: type as 'emboss' | 'deboss',
      x,
      y,
      depth,
      textHeight,
      direction: direction as TextLabelDirection,
      font,
      bold,
      separateBody,
      text: trimmedText,
    });
  }

  return { labels, errors };
}

/**
 * Parse the cutouts textarea. Each non-blank, non-comment line must be one of:
 *   surface,Round,X,Y,Diameter                       (5 fields)
 *   surface,Rect,X,Y,HoleX,HoleY,CornerRadius        (7 fields)
 * Surfaces: front, back, left, right, floor, lid. Comments start with //.
 */
export function parseCutoutsText(text: string): {
  cutouts: CutoutParams[];
  errors: CutoutParseError[];
} {
  const cutouts: CutoutParams[] = [];
  const errors: CutoutParseError[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('//')) continue;

    const tokens = raw.split(',').map((t) => t.trim());
    if (tokens.length < 2) {
      errors.push({ line: i + 1, reason: 'expected at least surface,kind,...' });
      continue;
    }

    const surface = tokens[0].toLowerCase();
    if (!CUTOUT_SURFACES.includes(surface as CutoutSurface)) {
      errors.push({
        line: i + 1,
        reason: `surface must be one of ${CUTOUT_SURFACES.join(', ')}`,
      });
      continue;
    }

    const kind = tokens[1].toLowerCase();
    if (kind === 'round') {
      if (tokens.length !== 5) {
        errors.push({
          line: i + 1,
          reason: `Round expects 5 fields (surface,Round,X,Y,Diameter), got ${tokens.length}`,
        });
        continue;
      }
      const nums = tokens.slice(2).map((t) => parseFloat(t));
      if (nums.some((n) => !Number.isFinite(n))) {
        errors.push({ line: i + 1, reason: 'non-numeric field' });
        continue;
      }
      const [x, y, diameter] = nums;
      cutouts.push({ surface: surface as CutoutSurface, kind: 'round', x, y, diameter });
    } else if (kind === 'rect') {
      if (tokens.length !== 7) {
        errors.push({
          line: i + 1,
          reason: `Rect expects 7 fields (surface,Rect,X,Y,HoleX,HoleY,CornerRadius), got ${tokens.length}`,
        });
        continue;
      }
      const nums = tokens.slice(2).map((t) => parseFloat(t));
      if (nums.some((n) => !Number.isFinite(n))) {
        errors.push({ line: i + 1, reason: 'non-numeric field' });
        continue;
      }
      const [x, y, width, height, cornerRadius] = nums;
      cutouts.push({
        surface: surface as CutoutSurface,
        kind: 'rect',
        x,
        y,
        width,
        height,
        cornerRadius,
      });
    } else {
      errors.push({
        line: i + 1,
        reason: `kind must be "Round" or "Rect", got "${tokens[1]}"`,
      });
    }
  }

  return { cutouts, errors };
}

/**
 * Parse a comma-delimited standoff textarea. Each non-blank, non-comment line
 * must have exactly 8 fields:
 *   surface,X,Y,OD,Height,HoleDia,HoleDepth,BaseFillet
 * Lines starting with `//` (after trimming) are comments. Errors are
 * collected with line numbers so the UI can flag them inline.
 */
export function parseStandoffsText(text: string): {
  standoffs: StandoffParams[];
  errors: StandoffParseError[];
} {
  const standoffs: StandoffParams[] = [];
  const errors: StandoffParseError[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('//')) continue;

    const tokens = raw.split(',').map((t) => t.trim());
    if (tokens.length !== 8) {
      errors.push({ line: i + 1, reason: `expected 8 fields, got ${tokens.length}` });
      continue;
    }

    const surface = tokens[0].toLowerCase();
    if (surface !== 'floor' && surface !== 'lid') {
      errors.push({ line: i + 1, reason: `surface must be "floor" or "lid"` });
      continue;
    }

    const nums = tokens.slice(1).map((t) => parseFloat(t));
    if (nums.some((n) => !Number.isFinite(n))) {
      errors.push({ line: i + 1, reason: 'non-numeric field' });
      continue;
    }

    const [x, y, od, height, holeDia, holeDepth, baseFillet] = nums;
    standoffs.push({
      surface: surface as 'floor' | 'lid',
      x, y, od, height, holeDia, holeDepth, baseFillet,
    });
  }

  return { standoffs, errors };
}

export interface AppearanceSettings {
  boxColor: string;
  lidColor: string;
  showRulers: boolean;
  view: ViewMode;
}

export interface DesignState {
  designName: string | null;
  isDirty: boolean;
  appearance: AppearanceSettings;
  box: BoxParams;
  lid: LidParams;
  snap: SnapFitParams;
  standoffsText: string;                 // canonical: raw textarea contents
  standoffs: StandoffParams[];           // derived from standoffsText
  standoffErrors: StandoffParseError[];  // derived from standoffsText
  cutoutsText: string;
  cutouts: CutoutParams[];
  cutoutErrors: CutoutParseError[];
  textLabelsText: string;
  textLabels: TextLabelParams[];
  textLabelErrors: TextLabelParseError[];

  setDesignName: (name: string | null) => void;
  setAppearance: (patch: Partial<AppearanceSettings>) => void;
  resetAppearance: () => void;
  setBox: (patch: Partial<BoxParams>) => void;
  resetBox: () => void;
  setLid: (patch: Partial<LidParams>) => void;
  resetLid: () => void;
  setSnap: (patch: Partial<SnapFitParams>) => void;
  resetSnap: () => void;
  setStandoffsText: (text: string) => void;
  setCutoutsText: (text: string) => void;
  setTextLabelsText: (text: string) => void;
  /**
   * Replace all design state in one shot (used by Load Design / URL share /
   * localStorage restore). Skips the per-setter isDirty machinery and marks
   * the design clean since the loaded state IS the current state.
   */
  loadDesign: (design: import('./persistence').DesignFile) => void;
  /** Reset every design field to its factory default + clear the design name. */
  newDesign: () => void;
  markClean: () => void;
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  boxColor: '#3030ff',
  lidColor: '#6d9fff',
  showRulers: false,
  view: 'assembled',
};

export const DEFAULT_BOX: BoxParams = {
  mode: 'exterior',
  length: 100,
  width: 70,
  height: 40,
  wallThickness: 2,
  floorThickness: 2,
  outerCornerRadius: 2,
  innerCornerRadius: 2,
};

export const DEFAULT_LID: LidParams = {
  coverThicknessAtEdge: 2,
  coverThicknessAtCenter: 2,
  coverShoulderWallThickness: 4,
  coverShoulderDepth: 3,
  boxGap: 0.2,
};

export const DEFAULT_STANDOFFS_TEXT = '';
export const DEFAULT_CUTOUTS_TEXT = '';
export const DEFAULT_TEXT_LABELS_TEXT = '';

export const DEFAULT_SNAP: SnapFitParams = {
  snapFront: true,
  snapBack: true,
  snapLeft: true,
  snapRight: true,
  nubHeight: 3,                 // mm — wall-side length; apex depth = 3/2 = 1.5
  nubChamferAmountOnCover: 1.0, // mm — lid lead-in chamfer
  nubWidthRatio: 20,            // 20% of interior wall length
  nubWidthMin: 10,
  nubWidthMax: 30,
  nubBoxShrink: 2,
};

export const useDesign = create<DesignState>((set) => ({
  designName: null,
  isDirty: false,
  appearance: { ...DEFAULT_APPEARANCE },
  box: { ...DEFAULT_BOX },
  lid: { ...DEFAULT_LID },
  snap: { ...DEFAULT_SNAP },
  standoffsText: DEFAULT_STANDOFFS_TEXT,
  standoffs: [],
  standoffErrors: [],
  cutoutsText: DEFAULT_CUTOUTS_TEXT,
  cutouts: [],
  cutoutErrors: [],
  textLabelsText: DEFAULT_TEXT_LABELS_TEXT,
  textLabels: [],
  textLabelErrors: [],

  setDesignName: (name) => set({ designName: name }),
  setAppearance: (patch) =>
    set((s) => ({ appearance: { ...s.appearance, ...patch } })),
  resetAppearance: () => set({ appearance: { ...DEFAULT_APPEARANCE } }),
  setBox: (patch) => set((s) => ({ box: { ...s.box, ...patch }, isDirty: true })),
  resetBox: () => set({ box: { ...DEFAULT_BOX }, isDirty: true }),
  setLid: (patch) => set((s) => ({ lid: { ...s.lid, ...patch }, isDirty: true })),
  resetLid: () => set({ lid: { ...DEFAULT_LID }, isDirty: true }),
  setSnap: (patch) => set((s) => ({ snap: { ...s.snap, ...patch }, isDirty: true })),
  resetSnap: () => set({ snap: { ...DEFAULT_SNAP }, isDirty: true }),
  setStandoffsText: (text) => {
    const { standoffs, errors } = parseStandoffsText(text);
    set({ standoffsText: text, standoffs, standoffErrors: errors, isDirty: true });
  },
  setCutoutsText: (text) => {
    const { cutouts, errors } = parseCutoutsText(text);
    set({ cutoutsText: text, cutouts, cutoutErrors: errors, isDirty: true });
  },
  setTextLabelsText: (text) => {
    const { labels, errors } = parseTextLabelsText(text);
    set({ textLabelsText: text, textLabels: labels, textLabelErrors: errors, isDirty: true });
  },
  newDesign: () =>
    set({
      designName: null,
      appearance: { ...DEFAULT_APPEARANCE },
      box: { ...DEFAULT_BOX },
      lid: { ...DEFAULT_LID },
      snap: { ...DEFAULT_SNAP },
      standoffsText: DEFAULT_STANDOFFS_TEXT,
      standoffs: [],
      standoffErrors: [],
      cutoutsText: DEFAULT_CUTOUTS_TEXT,
      cutouts: [],
      cutoutErrors: [],
      textLabelsText: DEFAULT_TEXT_LABELS_TEXT,
      textLabels: [],
      textLabelErrors: [],
      isDirty: false,
    }),
  loadDesign: (design) => {
    const standoffsParse = parseStandoffsText(design.standoffsText);
    const cutoutsParse = parseCutoutsText(design.cutoutsText);
    const textLabelsParse = parseTextLabelsText(design.textLabelsText);
    set({
      designName: design.designName,
      appearance: { ...design.appearance },
      box: { ...design.box },
      lid: { ...design.lid },
      snap: { ...design.snap },
      standoffsText: design.standoffsText,
      standoffs: standoffsParse.standoffs,
      standoffErrors: standoffsParse.errors,
      cutoutsText: design.cutoutsText,
      cutouts: cutoutsParse.cutouts,
      cutoutErrors: cutoutsParse.errors,
      textLabelsText: design.textLabelsText,
      textLabels: textLabelsParse.labels,
      textLabelErrors: textLabelsParse.errors,
      isDirty: false,
    });
  },
  markClean: () => set({ isDirty: false }),
}));

/** Box's exterior L/W/H — same as the stored values. */
export function exteriorDimensions(box: BoxParams): {
  length: number;
  width: number;
  height: number;
} {
  return { length: box.length, width: box.width, height: box.height };
}

/** Box's interior cavity L/W/H, derived from exterior + wall/floor. */
export function interiorDimensions(box: BoxParams): {
  length: number;
  width: number;
  height: number;
} {
  return {
    length: box.length - 2 * box.wallThickness,
    width: box.width - 2 * box.wallThickness,
    height: box.height - box.floorThickness,
  };
}

/**
 * Convert an interior-dimension number back to exterior, given current
 * wall/floor. Used when the user edits a field while in interior mode.
 */
export function interiorToExterior(
  interior: { length?: number; width?: number; height?: number },
  box: BoxParams
): { length?: number; width?: number; height?: number } {
  const out: { length?: number; width?: number; height?: number } = {};
  if (interior.length !== undefined) out.length = interior.length + 2 * box.wallThickness;
  if (interior.width !== undefined)  out.width  = interior.width  + 2 * box.wallThickness;
  if (interior.height !== undefined) out.height = interior.height + box.floorThickness;
  return out;
}
