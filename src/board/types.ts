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
 * Shaped like a [cutouts] entry, so the two sections read the same way:
 *   Edge, Round, Pos, Z, Diameter, Clearance
 *   Edge, Rect,  Pos, Z, Width, Height, CornerRadius, Clearance
 *
 *   pos   -- along the named edge, in board coordinates. Board Y for an x+/x-
 *            edge, board X for a y+/y- edge.
 *   z     -- the opening's centre height above the board's NON-COMPONENT face,
 *            i.e. above board Z = 0 (section 3.1). For a connector on the
 *            component side that is the board thickness plus whatever the
 *            datasheet gives above the board surface: a USB-C jack whose centre
 *            is 1.5 mm above a 1.6 mm board is z = 3.1.
 *   width  -- rect only: the opening ALONG the edge.
 *   height -- rect only: the opening vertically.
 */
export type BoardEdgeCutout = {
  line?: number;
  edge: BoardEdge;
  pos: number;
  z: number;
  clearance: number;
} & (
  | { kind: 'round'; diameter: number }
  | { kind: 'rect'; width: number; height: number; cornerRadius: number }
);

/**
 * A "nothing else here" volume: a tall component, a connector, a header.
 * x, y is the CENTRE, matching BoardCutout rather than a corner.
 */
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
  /**
   * Total height of the assembly above board Z = 0, i.e. above the
   * NON-component face. Includes the board thickness and everything standing on
   * it, so a carrier with two boards stacked on it reports the whole stack. Used
   * for the clearance ghost and interference checks; 0 means "not measured", and
   * the board is treated as a bare PCB of `thickness`.
   */
  height: number;
  /**
   * How far anything protrudes BELOW board Z = 0 -- through-hole leads, a
   * connector on the solder side. This is what hits the mounting surface when
   * the standoffs are too short. Default 0.
   */
  heightBelow: number;
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

/** The six box surfaces, in the same order the cutout parser accepts them. */
export type BoxSurface = 'front' | 'back' | 'left' | 'right' | 'floor' | 'lid';

/**
 * A face of an object, in OBJECT-LOCAL terms.
 *
 * `base` is the face against the surface it is stuck to; `top` is the opposite
 * face, pointing into the box. `x+` is the face at maximum object X, and so on.
 * Which box surface each one exits through is derived at placement time.
 */
export type ObjectFace = 'base' | 'top' | 'x+' | 'x-' | 'y+' | 'y-';

/**
 * A hole an object needs through the enclosure -- a potentiometer shaft, an LED
 * lens, a switch actuator.
 *
 * The position is the feature's centre in object coordinates, all three axes.
 * The coordinate perpendicular to the named face is IGNORED, because the cutout
 * is an orthographic projection along that face's normal: for a `base` feature
 * only X and Y matter, for an `x-` feature only Y and Z. Writing the third
 * anyway keeps every line the same shape.
 *
 * For a Rect, Width and Height run along the face's two free axes in X, Y, Z
 * order -- so base/top are (X, Y), x+/x- are (Y, Z), y+/y- are (X, Z).
 */
export type ObjectCutout = {
  line?: number;
  face: ObjectFace;
  x: number;
  y: number;
  z: number;
  clearance: number;
} & (
  | { kind: 'round'; diameter: number }
  | { kind: 'rect'; width: number; height: number; cornerRadius: number }
);

/**
 * A parsed *.object.txt file: a non-printed thing that lives in the box.
 *
 * OBJECT-LOCAL FRAME: 0,0,0 at a corner of the face that sits against the
 * mounting surface. X and Y run across that face; +Z runs AWAY from the surface,
 * into the box. There is no component side and no flip -- an object is just a
 * box, which is what makes this simpler than a board.
 */
export interface ObjectDefinition {
  name: string;
  sizeX: number;
  sizeY: number;
  /** Depth away from the mounting surface (mm). */
  sizeZ: number;
  cutouts: ObjectCutout[];
}

export interface ObjectParseError {
  line: number;
  reason: string;
}

/**
 * One placed object, parsed from the design's objects textarea:
 *   Surface,X,Y,Rotation,Offset,ObjectName
 *
 * Objects are ADVISORY for clearance but DO cut geometry through their
 * [cutouts] -- a potentiometer shaft needs a real hole. The body itself is
 * never printed and never exported; only its cutouts reach the model.
 */
export interface ObjectPlacement {
  line?: number;
  surface: BoxSurface;
  /** Where the object's 0,0 corner lands in that surface's user frame (mm). */
  x: number;
  y: number;
  /** Degrees CCW about the object origin, in the surface frame. Quarter turns. */
  rotation: number;
  /** Gap between the surface and the object's base face (mm). */
  offset: number;
  objectName: string;
}

export interface ObjectPlacementParseError {
  line: number;
  reason: string;
}
