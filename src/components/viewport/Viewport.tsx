'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { Home } from 'lucide-react';
import { GroundGrid, AxisRulers } from './SceneHelpers';
import { BoxMesh } from './BoxMesh';
import { LidMesh } from './LidMesh';
import { ViewCube, type ViewDirection } from './ViewCube';
import { useDesign, exteriorDimensions, type BoxParams, type LidParams } from '@/store/useDesign';
import { lidAssembledOffset } from '@/geometry/lid';

/**
 * "Headlight" -- a directional light that follows the camera, always
 * shining toward the orbit target. This guarantees that whatever face you
 * orbit to is lit; the fixed directional lights below keep providing
 * directional shading so the box still looks 3D rather than flat.
 */
function CameraHeadlight({ intensity = 0.55 }: { intensity?: number }) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  useFrame(({ camera }) => {
    if (lightRef.current) {
      lightRef.current.position.copy(camera.position);
    }
  });
  return <directionalLight ref={lightRef} intensity={intensity} />;
}

/**
 * 3/4 isometric framing that covers the assembled box+lid extent.
 *
 * Camera placed in the -X, -Y, +Z octant so the box's FRONT face (-Y outer
 * wall, where `front,...` cutouts and labels land) is the most visible side
 * to the user. The back wall is hidden behind the box from this angle --
 * matches user intuition for "front == what you see first."
 *
 * The directional lights below mirror this orientation: keep the main
 * light's relationship to the camera the same as the original (Gary preferred
 * the original lighting balance) -- we just rotated everything 180 deg around
 * the Z axis so the well-lit faces are the ones the camera now points at.
 */
function computeHomeView(box: BoxParams, lid: LidParams) {
  const ext = exteriorDimensions(box);
  const maxXY = Math.max(ext.length, ext.width);
  const totalHeight =
    lidAssembledOffset(box) + lid.coverShoulderDepth + lid.coverThicknessAtEdge;
  const extent = Math.max(maxXY, totalHeight) * 1.5;
  const dist = extent * 1.1;
  return {
    extent,
    cameraPos: [-dist, -dist, dist * 0.9] as [number, number, number],
    target: [0, 0, totalHeight / 2] as [number, number, number],
  };
}

/**
 * Six orthographic view directions, each computed from the box+lid extent.
 *
 * The distance is taken from `computeHomeView`'s extent so any view re-frames
 * to fit the current box. Camera.up flips to +Y for top/bottom because the
 * default +Z up would be collinear with the view direction (degenerate).
 *
 * Returns: cameraPos, target (orbit center), up (vector to install on the
 * camera).
 */
function computeOrthoView(
  box: BoxParams,
  lid: LidParams,
  direction: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
) {
  const home = computeHomeView(box, lid);
  // Pull the home cameraPos's magnitude as the "fits the box" distance.
  const [hx, hy, hz] = home.cameraPos;
  const dist = Math.hypot(hx, hy, hz);
  const [, , cz] = home.target;
  const Z_UP: [number, number, number] = [0, 0, 1];
  const Y_UP: [number, number, number] = [0, 1, 0];

  switch (direction) {
    case 'front':  return { cameraPos: [0, -dist, cz] as [number, number, number], target: home.target, up: Z_UP };
    case 'back':   return { cameraPos: [0, +dist, cz] as [number, number, number], target: home.target, up: Z_UP };
    case 'right':  return { cameraPos: [+dist, 0, cz] as [number, number, number], target: home.target, up: Z_UP };
    case 'left':   return { cameraPos: [-dist, 0, cz] as [number, number, number], target: home.target, up: Z_UP };
    case 'top':    return { cameraPos: [0, 0, cz + dist] as [number, number, number], target: home.target, up: Y_UP };
    case 'bottom': return { cameraPos: [0, 0, cz - dist] as [number, number, number], target: home.target, up: Y_UP };
  }
}

const TWEEN_MS = 300;
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface TweenState {
  start: number;
  duration: number;
  fromPos: THREE.Vector3;
  fromQuat: THREE.Quaternion;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toQuat: THREE.Quaternion;
  toTarget: THREE.Vector3;
  toUp: THREE.Vector3;
  controls: OrbitControlsImpl;
}

/**
 * Step an in-flight camera tween each frame. OrbitControls is disabled for
 * the duration so its own damping doesn't fight the interpolation; we
 * re-enable it when the tween finishes.
 */
function TweenRunner({ tweenRef }: { tweenRef: React.MutableRefObject<TweenState | null> }) {
  useFrame(() => {
    const t = tweenRef.current;
    if (!t) return;
    const elapsed = (performance.now() - t.start) / t.duration;
    const k = easeInOutCubic(Math.min(1, Math.max(0, elapsed)));
    t.controls.object.position.lerpVectors(t.fromPos, t.toPos, k);
    t.controls.object.quaternion.slerpQuaternions(t.fromQuat, t.toQuat, k);
    t.controls.target.lerpVectors(t.fromTarget, t.toTarget, k);
    if (elapsed >= 1) {
      t.controls.object.position.copy(t.toPos);
      t.controls.object.quaternion.copy(t.toQuat);
      t.controls.object.up.copy(t.toUp);
      t.controls.target.copy(t.toTarget);
      t.controls.enabled = true;
      t.controls.update();
      tweenRef.current = null;
    }
  });
  return null;
}

/**
 * 3D viewport — Z-up, ground grid on the XY plane, orbit controls.
 * Camera and grid auto-size to the box on first mount. The Home button
 * recomputes the home view from current box/lid state, so resizing the
 * box and then clicking Home re-frames to fit.
 *
 * Keyboard shortcuts (when a textarea/input is not focused):
 *   1 / Ctrl+1: front / back
 *   3 / Ctrl+3: right / left
 *   7 / Ctrl+7: top / bottom
 *   . :        frame the box (same as the Home button)
 */
export function Viewport() {
  const showRulers = useDesign((s) => s.appearance.showRulers);
  const box = useDesign((s) => s.box);
  const lid = useDesign((s) => s.lid);

  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const tweenRef = useRef<TweenState | null>(null);

  // Note: initial values only — OrbitControls owns the camera after mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => computeHomeView(box, lid), []);
  const { extent, cameraPos, target } = initial;

  // Build the target Quaternion implied by (position, target, up). Mirrors
  // what camera.lookAt(target) would do internally.
  const orientationQuat = useCallback(
    (pos: THREE.Vector3, lookTarget: THREE.Vector3, up: THREE.Vector3) => {
      const m = new THREE.Matrix4().lookAt(pos, lookTarget, up);
      return new THREE.Quaternion().setFromRotationMatrix(m);
    },
    []
  );

  // Launch a 300ms tween toward (toPos, toTarget, toUp). Disables OrbitControls
  // for the duration so damping doesn't fight us.
  const startTween = useCallback(
    (toPos: THREE.Vector3, toTarget: THREE.Vector3, toUp: THREE.Vector3) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const cam = controls.object;
      controls.enabled = false;
      tweenRef.current = {
        start: performance.now(),
        duration: TWEEN_MS,
        fromPos: cam.position.clone(),
        fromQuat: cam.quaternion.clone(),
        fromTarget: controls.target.clone(),
        toPos,
        toQuat: orientationQuat(toPos, toTarget, toUp),
        toTarget,
        toUp,
        controls,
      };
    },
    [orientationQuat]
  );

  const goHome = useCallback(() => {
    if (!controlsRef.current) return;
    const home = computeHomeView(box, lid);
    startTween(
      new THREE.Vector3(...home.cameraPos),
      new THREE.Vector3(...home.target),
      new THREE.Vector3(0, 0, 1)
    );
  }, [box, lid, startTween]);

  const setOrthoView = useCallback(
    (direction: ViewDirection) => {
      if (!controlsRef.current) return;
      const v = computeOrthoView(box, lid, direction);
      startTween(
        new THREE.Vector3(...v.cameraPos),
        new THREE.Vector3(...v.target),
        new THREE.Vector3(...v.up)
      );
    },
    [box, lid, startTween]
  );

  useEffect(() => {
    // Skip when the user is typing -- 1/3/7/. are common characters in
    // textareas and we shouldn't hijack them there.
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return; // don't fight Cmd/Option shortcuts
      if (isEditable(e.target)) return;

      // Match by `code` so the bindings still hit the right keys when the
      // user has a non-US keyboard layout (where e.key for "Digit1" might be
      // a different glyph).
      const code = e.code;
      let direction: Parameters<typeof setOrthoView>[0] | null = null;
      if (code === 'Digit1' || code === 'Numpad1') direction = e.ctrlKey ? 'back' : 'front';
      else if (code === 'Digit3' || code === 'Numpad3') direction = e.ctrlKey ? 'left' : 'right';
      else if (code === 'Digit7' || code === 'Numpad7') direction = e.ctrlKey ? 'bottom' : 'top';

      if (direction) {
        e.preventDefault();
        setOrthoView(direction);
        return;
      }

      if (code === 'Period' || code === 'NumpadDecimal') {
        if (e.ctrlKey) return;
        e.preventDefault();
        goHome();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOrthoView, goHome]);

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: cameraPos, fov: 50, near: 0.1, far: 5000 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
        onCreated={({ camera, scene }) => {
          camera.up.set(0, 0, 1);
          scene.up.set(0, 0, 1);
          camera.lookAt(...target);
        }}
      >
        <ambientLight intensity={0.3} />
        {/* Soft sky/ground fill -- keeps shadows from going pitch black at
            steep camera angles without flattening the scene. */}
        <hemisphereLight args={['#ffffff', '#404048', 0.3]} />
        {/* Camera-following headlight: whatever face you orbit to is lit. */}
        <CameraHeadlight intensity={0.55} />
        {/* Fixed directionals: keep the directional shading so the box
            still reads as 3D rather than uniformly lit. Intensities reduced
            now that the headlight handles primary visibility. */}
        <directionalLight position={[-100, -150, 100]} intensity={0.6} />
        <directionalLight position={[50, -80, -50]} intensity={0.2} />
        <directionalLight position={[80, 120, 80]} intensity={0.35} />

        <GroundGrid extent={extent} />
        {showRulers && <AxisRulers extent={extent} />}

        <BoxMesh />
        <LidMesh />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.1}
          target={target}
          minDistance={10}
          maxDistance={5000}
        />

        <TweenRunner tweenRef={tweenRef} />
      </Canvas>

      <ViewCube controlsRef={controlsRef} onPick={setOrthoView} />

      <button
        onClick={goHome}
        title="Frame the box (.) -- also 1/3/7 for front/right/top, Ctrl+ for opposite"
        className="absolute top-[86px] right-3 w-8 h-8 flex items-center justify-center rounded bg-[var(--bg-panel)]/85 border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)] transition-colors shadow-sm"
      >
        <Home size={16} />
      </button>
    </div>
  );
}
