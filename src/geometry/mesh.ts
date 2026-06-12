'use client';

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

  // Manifold's mesh output duplicates vertices at sharp seams. That breaks
  // drei's <Edges> component, which detects dihedral edges via shared vertex
  // indices -- duplicated vertices mean adjacent triangles look unconnected,
  // and the dark outline disappears. Welding by position restores adjacency.
  // Tolerance bumped to 1e-3 mm because Manifold can accumulate small float
  // drift across CSG operations -- 1e-4 (the default) was too tight.
  // No visual change to the main mesh (it uses flatShading, which derives face
  // normals from triangle vertices regardless of vertex normals).
  const welded = mergeVertices(geometry, 1e-3);
  welded.computeVertexNormals();
  return welded;
}
