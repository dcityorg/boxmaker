'use client';

import * as THREE from 'three';
import type { Manifold } from 'manifold-3d';

/**
 * Convert a manifold-3d Manifold into a THREE.BufferGeometry.
 * The returned geometry already has computed normals.
 */
export function manifoldToThree(manifold: Manifold): THREE.BufferGeometry {
  const mesh = manifold.getMesh();

  // mesh.vertProperties is interleaved [x, y, z, ...extras] per vertex.
  // numProp is at least 3 — strip out just the positions.
  const numProp = mesh.numProp;
  const vertCount = mesh.vertProperties.length / numProp;
  const positions = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    positions[i * 3 + 0] = mesh.vertProperties[i * numProp + 0];
    positions[i * 3 + 1] = mesh.vertProperties[i * numProp + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * numProp + 2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1));
  geometry.computeVertexNormals();
  return geometry;
}
