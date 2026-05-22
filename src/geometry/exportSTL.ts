'use client';

import type { Manifold } from 'manifold-3d';

/**
 * Build a binary STL file as an ArrayBuffer from a manifold-3d Manifold.
 *
 * Format reference:
 *   header        : 80 bytes (arbitrary)
 *   triangle count: uint32 LE
 *   per triangle  : 12 floats (normal xyz, v0 xyz, v1 xyz, v2 xyz)
 *                 + 2 bytes attribute count (zero)
 */
export function manifoldToBinarySTL(manifold: Manifold): ArrayBuffer {
  const mesh = manifold.getMesh();
  const numProp = mesh.numProp;
  const verts = mesh.vertProperties;
  const tris = mesh.triVerts;
  const triCount = tris.length / 3;

  const bytesPerTri = 50;
  const buf = new ArrayBuffer(80 + 4 + triCount * bytesPerTri);
  const view = new DataView(buf);

  // Header (any 80 bytes — STL spec says don't start with "solid" for binary)
  const header = new TextEncoder().encode(
    'BoxMaker binary STL'.padEnd(80, ' ')
  );
  new Uint8Array(buf, 0, 80).set(header.slice(0, 80));

  view.setUint32(80, triCount, true);

  let off = 84;
  const ax = new Float32Array(3);
  const bx = new Float32Array(3);
  const cx = new Float32Array(3);
  const u = new Float32Array(3);
  const v = new Float32Array(3);
  const n = new Float32Array(3);

  for (let t = 0; t < triCount; t++) {
    const ia = tris[t * 3 + 0];
    const ib = tris[t * 3 + 1];
    const ic = tris[t * 3 + 2];

    ax[0] = verts[ia * numProp + 0]; ax[1] = verts[ia * numProp + 1]; ax[2] = verts[ia * numProp + 2];
    bx[0] = verts[ib * numProp + 0]; bx[1] = verts[ib * numProp + 1]; bx[2] = verts[ib * numProp + 2];
    cx[0] = verts[ic * numProp + 0]; cx[1] = verts[ic * numProp + 1]; cx[2] = verts[ic * numProp + 2];

    u[0] = bx[0] - ax[0]; u[1] = bx[1] - ax[1]; u[2] = bx[2] - ax[2];
    v[0] = cx[0] - ax[0]; v[1] = cx[1] - ax[1]; v[2] = cx[2] - ax[2];
    n[0] = u[1] * v[2] - u[2] * v[1];
    n[1] = u[2] * v[0] - u[0] * v[2];
    n[2] = u[0] * v[1] - u[1] * v[0];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n[0] /= len; n[1] /= len; n[2] /= len;

    view.setFloat32(off + 0,  n[0],  true);
    view.setFloat32(off + 4,  n[1],  true);
    view.setFloat32(off + 8,  n[2],  true);
    view.setFloat32(off + 12, ax[0], true);
    view.setFloat32(off + 16, ax[1], true);
    view.setFloat32(off + 20, ax[2], true);
    view.setFloat32(off + 24, bx[0], true);
    view.setFloat32(off + 28, bx[1], true);
    view.setFloat32(off + 32, bx[2], true);
    view.setFloat32(off + 36, cx[0], true);
    view.setFloat32(off + 40, cx[1], true);
    view.setFloat32(off + 44, cx[2], true);
    view.setUint16(off + 48, 0, true);
    off += bytesPerTri;
  }

  return buf;
}

/** Trigger a browser download for the given ArrayBuffer as `filename`. */
export function downloadBinary(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
