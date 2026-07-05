'use client';

import { useMemo } from 'react';
import { useDesign } from '@/store/useDesign';
import { lidAssembledOffset } from '@/geometry/lid';
import { collectGhosts, type WarningGhost } from '@/validation/checks';

/**
 * Translucent red "ghost" overlays for validation warnings that have a
 * location (off-surface standoffs/cutouts, standoff-hits-lid, deboss-through).
 * No visibility toggle: a ghost only exists while its warning does, so fixing
 * the parameter is what dismisses it.
 *
 * Ghosts are indicator geometry layered over the merged manifold mesh -- same
 * pattern as OriginMarkers. By the time the box reaches the viewport,
 * features are boolean-merged, so per-feature tinting of the real mesh isn't
 * possible; instead each ghost is the feature's own shape, slightly inflated
 * so it wraps the surface without z-fighting.
 *
 * Frames: 'box' ghosts are world coords; 'lid' ghosts are lid-local and get
 * the same z-offset the LidMesh gets (floating in Assembled view, on the
 * grid in Lid view). Each frame's ghosts hide with their host mesh.
 */

const GHOST_COLOR = '#ff2222';
const GHOST_OPACITY = 0.5;

function cylinderRotation(axis: 'x' | 'y' | 'z'): [number, number, number] {
  // three.js cylinders are Y-axis aligned.
  if (axis === 'x') return [0, 0, Math.PI / 2];
  if (axis === 'z') return [Math.PI / 2, 0, 0];
  return [0, 0, 0];
}

function GhostMesh({ ghost, lidZ }: { ghost: WarningGhost; lidZ: number }) {
  const pos: [number, number, number] =
    ghost.frame === 'lid'
      ? [ghost.pos[0], ghost.pos[1], ghost.pos[2] + lidZ]
      : ghost.pos;

  const material = (
    <meshBasicMaterial
      color={GHOST_COLOR}
      transparent
      opacity={GHOST_OPACITY}
      depthWrite={false}
    />
  );

  if (ghost.kind === 'cylinder') {
    return (
      <mesh position={pos} rotation={cylinderRotation(ghost.axis)}>
        <cylinderGeometry args={[ghost.radius, ghost.radius, ghost.length, 24]} />
        {material}
      </mesh>
    );
  }
  if (ghost.kind === 'box') {
    return (
      <mesh position={pos}>
        <boxGeometry args={ghost.size} />
        {material}
      </mesh>
    );
  }
  return (
    <mesh position={pos}>
      <sphereGeometry args={[ghost.radius, 24, 16]} />
      {material}
    </mesh>
  );
}

export function WarningMarkers() {
  const box = useDesign((s) => s.box);
  const lid = useDesign((s) => s.lid);
  const standoffs = useDesign((s) => s.standoffs);
  const cutouts = useDesign((s) => s.cutouts);
  const textLabels = useDesign((s) => s.textLabels);
  const view = useDesign((s) => s.appearance.view);

  const ghosts = useMemo(
    () => collectGhosts(box, lid, standoffs, cutouts, textLabels),
    [box, lid, standoffs, cutouts, textLabels]
  );

  if (ghosts.length === 0) return null;

  const lidZ = view === 'assembled' ? lidAssembledOffset(box) : 0;
  const visible = ghosts.filter((g) =>
    g.frame === 'lid' ? view !== 'box' : view !== 'lid'
  );

  return (
    <group>
      {visible.map((g, i) => (
        <GhostMesh key={i} ghost={g} lidZ={lidZ} />
      ))}
    </group>
  );
}
