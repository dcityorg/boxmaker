'use client';

/**
 * Types for the board-mounting feature. See BOARD-MOUNTING.md for the design.
 *
 * A BOARD DEFINITION describes a PC board once, in its own reusable file, in
 * coordinates that belong to the board. A BOARD PLACEMENT says where one goes
 * in a particular box. Definitions are portable between boxes; placements are
 * not.
 *
 * BOARD-LOCAL FRAME (definition side):
 *   0,0 at a corner the user picks, VIEWED FROM THE COMPONENT SIDE.
 *   +X right, +Y up -- as a mechanical drawing reads, so transcribing from a
 *   datasheet is mechanical.
 *   Z = 0 at the board's non-component face; +Z toward the components.
 *
 * Feature sides are board-local and never box-local: a display is on the top
 * of the board in every box, forever. Which box surface actually gets cut is
 * resolved at placement time by compileBoard().
 */

/** Which face of the board a feature lives on. Board-local, not box-local. */
export type BoardFeatureSide = 'top' | 'bottom';

/** Which way the component side points once the board is in the box, world Z. */
export type ComponentsFacing = 'up' | 'down';

/** A mounting hole in the board. Becomes a standoff under it. */
export interface BoardMount {
  /** 1-based source line in the board file. */
  line?: number;
  x: number;
  y: number;
  /** The board's own hole diameter (mm). Used by validation, not by geometry. */
  holeDia: number;
}

/**
 * A cutout the board's components need through the enclosure.
 * `clearance` grows the hole on every side (mm).
 */
export type BoardCutout =
  | {
      line?: number;
      side: BoardFeatureSide;
      kind: 'round';
      x: number;
      y: number;
      diameter: number;
      clearance: number;
    }
  | {
      line?: number;
      side: BoardFeatureSide;
      kind: 'rect';
      x: number;
      y: number;
      sizeX: number;
      sizeY: number;
      cornerRadius: number;
      clearance: number;
    };

/** A "nothing else here" volume: a tall component, a connector, a header. */
export interface BoardKeepout {
  line?: number;
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
  /** Height above the board face named by `side` (mm). */
  height: number;
  side: BoardFeatureSide;
}

/** A parsed *.board.txt file. */
export interface BoardDefinition {
  name: string;
  sizeX: number;
  sizeY: number;
  thickness: number;
  cornerRadius: number;
  mounts: BoardMount[];
  cutouts: BoardCutout[];
  keepouts: BoardKeepout[];
}

export interface BoardParseError {
  line: number;
  reason: string;
}

/**
 * One placed board, parsed from the boxmaker design's boards textarea.
 * Format (11 fields), BoardName is free text taken past the 10th comma:
 *   Surface,X,Y,Rotation,Components,StandoffHeight,StandoffOD,
 *   StandoffHoleDia,HoleDepth,BaseFillet,BoardName
 */
export interface BoardPlacement {
  /** 1-based line in the boards textarea. */
  line?: number;
  surface: 'floor' | 'lid';
  /** Where the board's 0,0 lands, in the mounting surface's user frame (mm). */
  x: number;
  y: number;
  /** Degrees CCW about the board origin, in the mounting surface's frame. */
  rotation: number;
  components: ComponentsFacing;
  standoffHeight: number;
  standoffOd: number;
  standoffHoleDia: number;
  standoffHoleDepth: number;
  baseFillet: number;
  boardName: string;
}

export interface BoardPlacementParseError {
  line: number;
  reason: string;
}
