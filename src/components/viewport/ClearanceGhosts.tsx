'use client';

import { useDesign } from '@/store/useDesign';
import { lidAssembledOffset } from '@/geometry/lid';
import { envelopesOverlap, type Envelope } from '@/board/envelopes';
import { useEnvelopes } from '@/board/useEnvelopes';

/**
 * Translucent boxes showing the space each board and object takes up.
 *
 * Distinct from WarningMarkers in both purpose and colour. A warning ghost is
 * red and appears only while something is wrong; these are always-on furniture
 * showing what is in the box, so they are cool-toned and quieter -- teal for a
 * board, matching the Boards sidebar group, and slate for an object. Anything
 * actually intersecting something else turns red, which is the whole point of
 * drawing them: you see the collision rather than reading about it.
 *
 * Nothing here touches geometry or exports. Toggled from Settings.
 */

const BOARD_COLOR = '#6FB0B8';
const OBJECT_COLOR = '#8f9bb3';
const CLASH_COLOR = '#ff2222';
const OPACITY = 0.28;
const CLASH_OPACITY = 0.45;

function EnvelopeMesh({
  env,
  lidZ,
  clashing,
}: {
  env: Envelope;
  lidZ: number;
  clashing: boolean;
}) {
  const size: [number, number, number] = [
    Math.max(0.01, env.max[0] - env.min[0]),
    Math.max(0.01, env.max[1] - env.min[1]),
    Math.max(0.01, env.max[2] - env.min[2]),
  ];
  const z = (env.min[2] + env.max[2]) / 2 + (env.frame === 'lid' ? lidZ : 0);
  const pos: [number, number, number] = [
    (env.min[0] + env.max[0]) / 2,
    (env.min[1] + env.max[1]) / 2,
    z,
  ];
  const color = clashing ? CLASH_COLOR : env.kind === 'board' ? BOARD_COLOR : OBJECT_COLOR;

  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      {/*
        depthWrite off so overlapping ghosts blend instead of fighting, the same
        reason WarningMarkers does it.

        depthTest off as well, which WarningMarkers does NOT do: these live
        inside a solid box and would otherwise be hidden by its own walls, which
        defeats the entire point. Drawing them over the top gives an x-ray view,
        so you can see what is in the box without exploding it.
      */}
      <meshBasicMaterial
        color={color}
        transparent
        opacity={clashing ? CLASH_OPACITY : OPACITY}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

export function ClearanceGhosts() {
  const box = useDesign((s) => s.box);
  const lid = useDesign((s) => s.lid);
  const view = useDesign((s) => s.appearance.view);
  const show = useDesign((s) => s.appearance.showClearance);
  const envelopes = useEnvelopes();

  if (!show) return null;

  // Belt and braces: a single non-finite coordinate reaching a BoxGeometry
  // makes three.js compute a NaN bounding sphere and spam the console, and the
  // cause is never obvious from the message. Drop such an envelope rather than
  // hand it over. Nothing should produce one -- normalizeBoardDefinition covers
  // the case that did -- so this is a net, not a fix.
  const finite = envelopes.filter((e) =>
    [...e.min, ...e.max].every((v) => Number.isFinite(v))
  );
  if (finite.length === 0) return null;

  // Compare in assembled coordinates: a lid-mounted board and a floor object
  // can certainly collide, and each is stored in its own frame.
  const dz = box.height - lid.coverShoulderDepth;
  const world = finite.map((e) =>
    e.frame === 'lid'
      ? { ...e, min: [e.min[0], e.min[1], e.min[2] + dz], max: [e.max[0], e.max[1], e.max[2] + dz] }
      : e
  ) as Envelope[];

  const clash = world.map((a, i) => world.some((b, j) => i !== j && envelopesOverlap(a, b)));

  const lidZ = view === 'assembled' ? lidAssembledOffset(box) : 0;

  return (
    <group>
      {finite.map((e, i) =>
        (e.frame === 'lid' ? view === 'box' : view === 'lid') ? null : (
          <EnvelopeMesh key={i} env={e} lidZ={lidZ} clashing={clash[i]} />
        )
      )}
    </group>
  );
}
