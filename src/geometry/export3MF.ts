'use client';

import type { Manifold } from 'manifold-3d';
import { buildZip } from './zip';

/**
 * Build a minimal 3MF file from one or more Manifold parts. Each Manifold
 * becomes its own <object> in the model; each object is added to <build> so
 * slicers (Bambu Studio, PrusaSlicer, OrcaSlicer) load them as distinct
 * objects -- ready for per-object filament assignment.
 *
 * Spec reference: 3MF Core spec (https://github.com/3MFConsortium/spec_core).
 * This emits the Core schema only -- no materials, no extensions. That's
 * sufficient for "load this as multiple objects" semantics.
 *
 * Each `part` is expected to be already positioned in world coordinates;
 * caller is responsible for delete()'ing the Manifolds AFTER export.
 */
export function build3MF(parts: Array<{ name: string; manifold: Manifold }>): ArrayBuffer {
  const objectsXml: string[] = [];
  const buildItemsXml: string[] = [];

  let nextId = 1;
  for (const part of parts) {
    const id = nextId++;
    const mesh = part.manifold.getMesh();
    const numProp = mesh.numProp;
    const verts = mesh.vertProperties;
    const tris = mesh.triVerts;
    const vertCount = verts.length / numProp;
    const triCount = tris.length / 3;

    const vertexLines: string[] = [];
    for (let i = 0; i < vertCount; i++) {
      const x = verts[i * numProp + 0];
      const y = verts[i * numProp + 1];
      const z = verts[i * numProp + 2];
      vertexLines.push(`<vertex x="${x}" y="${y}" z="${z}" />`);
    }

    const triangleLines: string[] = [];
    for (let t = 0; t < triCount; t++) {
      const v1 = tris[t * 3 + 0];
      const v2 = tris[t * 3 + 1];
      const v3 = tris[t * 3 + 2];
      triangleLines.push(`<triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
    }

    objectsXml.push(
      `<object id="${id}" type="model" name="${escapeXml(part.name)}">` +
        `<mesh>` +
          `<vertices>${vertexLines.join('')}</vertices>` +
          `<triangles>${triangleLines.join('')}</triangles>` +
        `</mesh>` +
      `</object>`
    );
    buildItemsXml.push(`<item objectid="${id}" />`);
  }

  const modelXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<model unit="millimeter" xml:lang="en-US" ' +
    'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">' +
    `<resources>${objectsXml.join('')}</resources>` +
    `<build>${buildItemsXml.join('')}</build>` +
    '</model>';

  const contentTypesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />' +
      '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />' +
    '</Types>';

  const relsXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" ' +
      'Target="/3D/3dmodel.model" Id="rel0" />' +
    '</Relationships>';

  const enc = new TextEncoder();
  return buildZip([
    { name: '[Content_Types].xml', data: enc.encode(contentTypesXml).buffer as ArrayBuffer },
    { name: '_rels/.rels', data: enc.encode(relsXml).buffer as ArrayBuffer },
    { name: '3D/3dmodel.model', data: enc.encode(modelXml).buffer as ArrayBuffer },
  ]);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
