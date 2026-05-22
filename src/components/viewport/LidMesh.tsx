'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { useDesign } from '@/store/useDesign';
import { buildLid, lidAssembledOffset } from '@/geometry/lid';
import { buildLidSeparateText } from '@/geometry/text';
import { manifoldToThree } from '@/geometry/mesh';

const TEXT_BODY_COLOR = '#ffea4b';

/**
 * Lid mesh — regenerates whenever box or lid params change.
 * Positioned per the current View mode:
 *   - 'box'       → hidden
 *   - 'lid'       → sits on the grid (its underside at z=0)
 *   - 'assembled' → floats above the box with a small gap
 */
export function LidMesh() {
  const box = useDesign((s) => s.box);
  const lid = useDesign((s) => s.lid);
  const snap = useDesign((s) => s.snap);
  const standoffs = useDesign((s) => s.standoffs);
  const cutouts = useDesign((s) => s.cutouts);
  const textLabels = useDesign((s) => s.textLabels);
  const color = useDesign((s) => s.appearance.lidColor);
  const view = useDesign((s) => s.appearance.view);

  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [textGeometry, setTextGeometry] = useState<THREE.BufferGeometry | null>(null);
  const generationRef = useRef(0);
  const lastGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const lastTextGeoRef = useRef<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    const gen = ++generationRef.current;
    let cancelled = false;
    (async () => {
      try {
        const manifold = await buildLid(box, lid, snap, standoffs, cutouts, textLabels);
        if (cancelled || gen !== generationRef.current) {
          manifold.delete();
          return;
        }
        const geo = manifoldToThree(manifold);
        manifold.delete();
        if (lastGeoRef.current) lastGeoRef.current.dispose();
        lastGeoRef.current = geo;
        setGeometry(geo);

        const sep = await buildLidSeparateText(box, lid, textLabels);
        if (cancelled || gen !== generationRef.current) {
          sep?.delete();
          return;
        }
        if (sep) {
          const sepGeo = manifoldToThree(sep);
          sep.delete();
          if (lastTextGeoRef.current) lastTextGeoRef.current.dispose();
          lastTextGeoRef.current = sepGeo;
          setTextGeometry(sepGeo);
        } else {
          if (lastTextGeoRef.current) lastTextGeoRef.current.dispose();
          lastTextGeoRef.current = null;
          setTextGeometry(null);
        }
      } catch (err) {
        console.error('[BoxMaker] lid geometry build failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [box, lid, snap, standoffs, cutouts, textLabels]);

  useEffect(
    () => () => {
      if (lastGeoRef.current) {
        lastGeoRef.current.dispose();
        lastGeoRef.current = null;
      }
      if (lastTextGeoRef.current) {
        lastTextGeoRef.current.dispose();
        lastTextGeoRef.current = null;
      }
    },
    []
  );

  if (!geometry) return null;
  if (view === 'box') return null;

  const zOffset = view === 'assembled' ? lidAssembledOffset(box) : 0;

  return (
    <group position={[0, 0, zOffset]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.05} flatShading />
        <Edges threshold={20} color="#1f1f1f" />
      </mesh>
      {textGeometry && (
        <mesh geometry={textGeometry} castShadow receiveShadow>
          <meshStandardMaterial color={TEXT_BODY_COLOR} roughness={0.5} metalness={0.05} flatShading />
        </mesh>
      )}
    </group>
  );
}
