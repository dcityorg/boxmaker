'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

const GRID = {
  minorColor: '#282828',
  majorColor: '#3a3a3a',
};

const AXIS_COLORS = {
  x: '#ff4444',
  y: '#44ff44',
  z: '#4488ff',
};

/** Pick a "nice" round number for tick/grid spacing. */
function niceSpacing(extent: number, targetCount: number): number {
  const rough = extent / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  let nice: number;
  if (normalized < 1.5) nice = 1;
  else if (normalized < 3.5) nice = 2;
  else if (normalized < 7.5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

/** Ground grid on the XY plane at Z=0. Size adapts to model extent. */
export function GroundGrid({ extent = 200 }: { extent?: number }) {
  const { minor, major } = useMemo(() => {
    const rawSize = Math.max(extent * 1.5, 100);
    const cellSize = niceSpacing(rawSize, 20);
    const sectionSize = cellSize * 5;
    const gridHalf = Math.ceil(rawSize / sectionSize) * sectionSize;

    const minorPos: number[] = [];
    const majorPos: number[] = [];

    for (let v = -gridHalf; v <= gridHalf + 0.001; v += cellSize) {
      const isMajor =
        Math.abs(v % sectionSize) < 0.001 ||
        Math.abs((v % sectionSize) - sectionSize) < 0.001;
      const arr = isMajor ? majorPos : minorPos;
      arr.push(-gridHalf, v, 0, gridHalf, v, 0);
      arr.push(v, -gridHalf, 0, v, gridHalf, 0);
    }

    const minorGeo = new THREE.BufferGeometry();
    minorGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorPos, 3));
    const majorGeo = new THREE.BufferGeometry();
    majorGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorPos, 3));
    return { minor: minorGeo, major: majorGeo };
  }, [extent]);

  return (
    <group>
      <lineSegments geometry={minor}>
        <lineBasicMaterial color={GRID.minorColor} />
      </lineSegments>
      <lineSegments geometry={major}>
        <lineBasicMaterial color={GRID.majorColor} />
      </lineSegments>
    </group>
  );
}

/** X / Y / Z axis rulers with tick marks. */
export function AxisRulers({ extent = 200 }: { extent?: number }) {
  const axes = useMemo(() => {
    const tickSpacing = niceSpacing(extent, 20);
    const majorTickEvery = tickSpacing * 5;
    const half = Math.ceil((extent * 0.7) / majorTickEvery) * majorTickEvery;
    const zEnd = Math.ceil((extent * 0.6) / majorTickEvery) * majorTickEvery;

    const tickSize = 1;
    const majorMult = 2;

    const result: { geometry: THREE.BufferGeometry; color: string }[] = [];

    const configs: { axis: 'x' | 'y' | 'z'; color: string }[] = [
      { axis: 'x', color: AXIS_COLORS.x },
      { axis: 'y', color: AXIS_COLORS.y },
      { axis: 'z', color: AXIS_COLORS.z },
    ];

    for (const { axis, color } of configs) {
      const positions: number[] = [];
      const start = axis === 'z' ? 0 : -half;
      const end = axis === 'z' ? zEnd : half;

      if (axis === 'x') positions.push(start, 0, 0, end, 0, 0);
      else if (axis === 'y') positions.push(0, start, 0, 0, end, 0);
      else positions.push(0, 0, start, 0, 0, end);

      for (let v = start; v <= end + 0.001; v += tickSpacing) {
        if (Math.abs(v) < 0.001) continue;
        const isMajor =
          Math.abs(v % majorTickEvery) < 0.001 ||
          Math.abs((v % majorTickEvery) - majorTickEvery) < 0.001;
        const sz = isMajor ? tickSize * majorMult : tickSize;

        if (axis === 'x') positions.push(v, 0, -sz, v, 0, sz);
        else if (axis === 'y') positions.push(0, v, -sz, 0, v, sz);
        else positions.push(-sz, 0, v, sz, 0, v);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      result.push({ geometry: geo, color });
    }

    return result;
  }, [extent]);

  return (
    <group>
      {axes.map(({ geometry, color }, i) => (
        <lineSegments key={i} geometry={geometry}>
          <lineBasicMaterial color={color} transparent opacity={0.6} />
        </lineSegments>
      ))}
    </group>
  );
}
