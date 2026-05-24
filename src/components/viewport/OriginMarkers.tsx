'use client';

import { Html, Line } from '@react-three/drei';
import { useDesign, type BoxParams, type LidParams, type ViewMode } from '@/store/useDesign';
import { lidAssembledOffset } from '@/geometry/lid';

const MARKER_COLOR = '#ff3333';
const CYLINDER_RADIUS_MM = 0.5; // -> 1 mm diameter
const OFFSET_MM = 3; // user-coord (3,3) so we clear inner corner radius
const PROTRUDE_MM = 1; // cylinder pokes this far past each face
const EPS = 0.05; // anti z-fight
const AXIS_LENGTH_MM = 6;
const LABEL_OFFSET_MM = 1.6;
const LINE_WIDTH = 2;

type MarkerAxis = 'x' | 'y' | 'z';
type Vec3 = [number, number, number];

interface AxisOrigin {
  key: string;
  pos: Vec3;
}

interface MarkerEntry {
  key: string;
  cylinder: { pos: Vec3; axis: MarkerAxis; length: number };
  userX: Vec3;
  userY: Vec3;
  /** One origin per face of the surface (inside + outside) where axis arrows
   *  and labels render. Both faces use the SAME user +X / +Y world vectors
   *  -- the coord frame is geometric, not view-dependent. */
  origins: AxisOrigin[];
}

/**
 * Per-surface origin markers. Frames mirror src/geometry/cutouts.ts.
 * Each marker has one cylinder (passing through both faces) plus an axis-arrow
 * set on each face so the indicator is visible from inside AND outside the box.
 */
function originMarkers(box: BoxParams, lid: LidParams, view: ViewMode): MarkerEntry[] {
  const wallT = box.wallThickness;
  const floorT = box.floorThickness;
  const halfL = box.length / 2;
  const halfW = box.width / 2;
  const inset = wallT + lid.boxGap + lid.coverShoulderWallThickness;
  const plateT = lid.coverThicknessAtEdge;

  const entries: MarkerEntry[] = [];

  if (view === 'box' || view === 'assembled') {
    entries.push({
      key: 'floor',
      cylinder: {
        pos: [-halfL + wallT + OFFSET_MM, -halfW + wallT + OFFSET_MM, floorT / 2],
        axis: 'z',
        length: floorT + 2 * PROTRUDE_MM,
      },
      userX: [1, 0, 0],
      userY: [0, 1, 0],
      origins: [
        { key: 'top', pos: [-halfL + wallT + OFFSET_MM, -halfW + wallT + OFFSET_MM, floorT + EPS] },
        { key: 'bot', pos: [-halfL + wallT + OFFSET_MM, -halfW + wallT + OFFSET_MM, -EPS] },
      ],
    });

    entries.push({
      key: 'front',
      cylinder: {
        pos: [+halfL - wallT - OFFSET_MM, -halfW + wallT / 2, floorT + OFFSET_MM],
        axis: 'y',
        length: wallT + 2 * PROTRUDE_MM,
      },
      userX: [-1, 0, 0],
      userY: [0, 0, 1],
      origins: [
        { key: 'inner', pos: [+halfL - wallT - OFFSET_MM, -halfW + wallT + EPS, floorT + OFFSET_MM] },
        { key: 'outer', pos: [+halfL - wallT - OFFSET_MM, -halfW - EPS,         floorT + OFFSET_MM] },
      ],
    });

    entries.push({
      key: 'back',
      cylinder: {
        pos: [-halfL + wallT + OFFSET_MM, +halfW - wallT / 2, floorT + OFFSET_MM],
        axis: 'y',
        length: wallT + 2 * PROTRUDE_MM,
      },
      userX: [1, 0, 0],
      userY: [0, 0, 1],
      origins: [
        { key: 'inner', pos: [-halfL + wallT + OFFSET_MM, +halfW - wallT - EPS, floorT + OFFSET_MM] },
        { key: 'outer', pos: [-halfL + wallT + OFFSET_MM, +halfW + EPS,         floorT + OFFSET_MM] },
      ],
    });

    entries.push({
      key: 'left',
      cylinder: {
        pos: [-halfL + wallT / 2, -halfW + wallT + OFFSET_MM, floorT + OFFSET_MM],
        axis: 'x',
        length: wallT + 2 * PROTRUDE_MM,
      },
      userX: [0, 1, 0],
      userY: [0, 0, 1],
      origins: [
        { key: 'inner', pos: [-halfL + wallT + EPS, -halfW + wallT + OFFSET_MM, floorT + OFFSET_MM] },
        { key: 'outer', pos: [-halfL - EPS,         -halfW + wallT + OFFSET_MM, floorT + OFFSET_MM] },
      ],
    });

    entries.push({
      key: 'right',
      cylinder: {
        pos: [+halfL - wallT / 2, +halfW - wallT - OFFSET_MM, floorT + OFFSET_MM],
        axis: 'x',
        length: wallT + 2 * PROTRUDE_MM,
      },
      userX: [0, -1, 0],
      userY: [0, 0, 1],
      origins: [
        { key: 'inner', pos: [+halfL - wallT - EPS, +halfW - wallT - OFFSET_MM, floorT + OFFSET_MM] },
        { key: 'outer', pos: [+halfL + EPS,         +halfW - wallT - OFFSET_MM, floorT + OFFSET_MM] },
      ],
    });
  }

  if (view === 'lid' || view === 'assembled') {
    const lidZOffset = view === 'assembled' ? lidAssembledOffset(box) : 0;
    const lidPlateMidZ = lid.coverShoulderDepth + plateT / 2;
    const lidPlateTopZ = lid.coverShoulderDepth + plateT;
    const lidPlateBotZ = lid.coverShoulderDepth;
    entries.push({
      key: 'lid',
      cylinder: {
        pos: [+halfL - inset - OFFSET_MM, -halfW + inset + OFFSET_MM, lidZOffset + lidPlateMidZ],
        axis: 'z',
        length: plateT + 2 * PROTRUDE_MM,
      },
      userX: [-1, 0, 0],
      userY: [0, 1, 0],
      origins: [
        { key: 'top', pos: [+halfL - inset - OFFSET_MM, -halfW + inset + OFFSET_MM, lidZOffset + lidPlateTopZ + EPS] },
        { key: 'bot', pos: [+halfL - inset - OFFSET_MM, -halfW + inset + OFFSET_MM, lidZOffset + lidPlateBotZ - EPS] },
      ],
    });
  }

  return entries;
}

function cylinderRotation(axis: MarkerAxis): Vec3 {
  if (axis === 'x') return [0, 0, Math.PI / 2];
  if (axis === 'z') return [Math.PI / 2, 0, 0];
  return [0, 0, 0];
}

function add(p: Vec3, v: Vec3, scale: number): Vec3 {
  return [p[0] + v[0] * scale, p[1] + v[1] * scale, p[2] + v[2] * scale];
}

/**
 * Render axis labels as HTML overlays (drei `<Html>`) rather than 3D Text.
 * HTML elements live in screen space on top of the canvas, so they are always
 * crisp and never sliced by wall geometry at oblique camera angles -- which
 * is the problem 3D Text + Billboard kept hitting. `occlude` makes drei do a
 * per-frame raycast from the camera to the label position; if any geometry
 * sits between, the label hides. So labels on the back wall correctly
 * disappear when viewed from the front (no X-ray clutter).
 *
 * `pointerEvents: none` so labels don't intercept orbit-control drags.
 */
function AxisLabel({ position, text }: { position: Vec3; text: string }) {
  return (
    <Html
      position={position}
      center
      occlude
      style={{
        color: MARKER_COLOR,
        fontFamily: 'sans-serif',
        fontSize: '12px',
        fontWeight: 'bold',
        WebkitTextStroke: '0.75px #000',
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </Html>
  );
}

export function OriginMarkers() {
  const showOrigins = useDesign((s) => s.appearance.showOrigins);
  const view = useDesign((s) => s.appearance.view);
  const box = useDesign((s) => s.box);
  const lid = useDesign((s) => s.lid);

  if (!showOrigins) return null;

  const markers = originMarkers(box, lid, view);

  return (
    <group>
      {markers.map((m) => (
        <group key={m.key}>
          <mesh position={m.cylinder.pos} rotation={cylinderRotation(m.cylinder.axis)}>
            <cylinderGeometry
              args={[CYLINDER_RADIUS_MM, CYLINDER_RADIUS_MM, m.cylinder.length, 16]}
            />
            <meshBasicMaterial color={MARKER_COLOR} />
          </mesh>
          {m.origins.map((o) => {
            const xEnd = add(o.pos, m.userX, AXIS_LENGTH_MM);
            const yEnd = add(o.pos, m.userY, AXIS_LENGTH_MM);
            const xLabel = add(o.pos, m.userX, AXIS_LENGTH_MM + LABEL_OFFSET_MM);
            const yLabel = add(o.pos, m.userY, AXIS_LENGTH_MM + LABEL_OFFSET_MM);
            return (
              <group key={o.key}>
                <Line points={[o.pos, xEnd]} color={MARKER_COLOR} lineWidth={LINE_WIDTH} />
                <Line points={[o.pos, yEnd]} color={MARKER_COLOR} lineWidth={LINE_WIDTH} />
                <AxisLabel position={xLabel} text="+X" />
                <AxisLabel position={yLabel} text="+Y" />
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
}
