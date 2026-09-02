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

/**
 * Which edge of the board a connector sits on, in BOARD-LOCAL terms:
 * `x+` is the edge at maximum board X, `y-` the edge at Y = 0, and so on.
 * Which box wall that edge ends up facing is resolved at placement time.
 */
export type BoardEdge = 'x+' | 'x-' | 'y+' | 'y-';

/**
 * A connector cutout through a side wall: USB, barrel jack, header.
 *
 *   pos   -- along the named edge, in board coordinates. Board Y for an x+/x-
 *            edge, board X for a y+/y- edge.
 *   z     -- the cutout centre's height above the board's NON-COMPONENT face,
 *            i.e. above board Z = 0 (section 3.1). For a connector on the
 *            component side, that is the board thickness plus whatever the
 *            datasheet gives above the board surface: a USB-C jack whose centre
 *            is 1.5 mm above a 1.6 mm board is z = 3.1.
 *   sizeAlong / sizeZ -- opening size along the edge and vertically.
 */
export interface BoardEdgeCutout {
  line?: number;
  edge: BoardEdge;
  pos: number;
  z: number;
  sizeAlong: number;
  sizeZ: number;
  cornerRadius: number;
  clearance: number;
}

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
  edges: BoardEdgeCutout[];
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
  /**
   * Degrees CCW about the board origin, in the mounting surface's frame.
   * Restricted to multiples of 90 -- see BOARD-MOUNTING.md section 3.3.
   */
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
