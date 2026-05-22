'use client';

import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export type ViewDirection = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/**
 * Material index in BoxGeometry maps to a +/- axis face. In our Z-up world
 * the box's FRONT is the -Y face (camera at -Y looks toward +Y, sees -Y).
 * Order matches BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
 */
const FACE_DIRECTIONS: ViewDirection[] = ['right', 'left', 'back', 'front', 'top', 'bottom'];
const FACE_LABELS: Record<ViewDirection, string> = {
  front: 'FRONT',
  back: 'BACK',
  left: 'LEFT',
  right: 'RIGHT',
  top: 'TOP',
  bottom: 'BOT',
};

function makeFaceTexture(label: string, hovered: boolean): THREE.CanvasTexture {
  const SIZE = 128;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d')!;
  // Fill
  ctx.fillStyle = hovered ? '#5a9fd4' : '#d8dade';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Border
  ctx.strokeStyle = hovered ? '#3a7ab4' : '#6a6e76';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, SIZE - 4, SIZE - 4);
  // Label
  ctx.fillStyle = hovered ? '#ffffff' : '#2a2c30';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, SIZE / 2, SIZE / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/**
 * Sync the mini-canvas camera to mirror the main scene camera's direction.
 * The cube itself stays at origin axis-aligned, so as the main camera orbits
 * the cube appears to rotate -- showing which face of the box is toward you.
 */
function CameraSync({ controlsRef }: { controlsRef: React.MutableRefObject<OrbitControlsImpl | null> }) {
  const tmp = useRef(new THREE.Vector3());
  useFrame(({ camera: miniCamera }) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const main = controls.object;
    // Position the mini camera on the same direction from origin as the main
    // camera (relative to its orbit target). Length normalized; distance set
    // so the cube is comfortably framed.
    tmp.current.copy(main.position).sub(controls.target);
    if (tmp.current.lengthSq() < 1e-6) return;
    tmp.current.normalize().multiplyScalar(2.8);
    miniCamera.position.copy(tmp.current);
    miniCamera.up.copy(main.up);
    miniCamera.lookAt(0, 0, 0);
  });
  return null;
}

function CubeMesh({ onPick }: { onPick: (dir: ViewDirection) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);

  // Rebuild materials when hover state changes so the hovered face highlights.
  const materials = useMemo(() => {
    return FACE_DIRECTIONS.map((dir, i) => {
      const tex = makeFaceTexture(FACE_LABELS[dir], hovered === i);
      return new THREE.MeshBasicMaterial({ map: tex });
    });
    // Dispose old textures on next change to avoid GPU leak
  }, [hovered]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const idx = e.face?.materialIndex;
    if (idx == null) return;
    const dir = FACE_DIRECTIONS[idx];
    if (dir) onPick(dir);
  };

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    const idx = e.face?.materialIndex ?? null;
    setHovered(idx);
  };

  return (
    <mesh
      onClick={handleClick}
      onPointerMove={handleMove}
      onPointerOut={() => setHovered(null)}
      material={materials}
    >
      <boxGeometry args={[1.5, 1.5, 1.5]} />
    </mesh>
  );
}

export function ViewCube({
  controlsRef,
  onPick,
}: {
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  onPick: (dir: ViewDirection) => void;
}) {
  return (
    <div
      className="absolute top-3 right-3 w-[66px] h-[66px]"
      title="Click a face to snap the view -- FRONT / BACK / LEFT / RIGHT / TOP / BOT"
    >
      <Canvas
        camera={{ position: [2, 2, 2], fov: 35, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
        onCreated={({ camera, scene }) => {
          camera.up.set(0, 0, 1);
          scene.up.set(0, 0, 1);
        }}
      >
        <ambientLight intensity={1} />
        <CameraSync controlsRef={controlsRef} />
        <CubeMesh onPick={onPick} />
      </Canvas>
    </div>
  );
}
