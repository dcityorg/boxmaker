'use client';

/**
 * Minimal ZIP writer (stored / no compression).
 * Good enough for bundling a few STL files together — well under any practical
 * size limit for a 3D-printable enclosure. Used because compression libraries
 * (pako, fflate) would add ~30 KB to the bundle for a feature we use sparingly.
 *
 * Spec reference: APPNOTE.TXT § 4.3 (local file header, central directory,
 * end-of-central-directory record).
 */

interface ZipEntry {
  name: string;
  data: Uint8Array;
  crc32: number;
  offset: number;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function buildZip(files: { name: string; data: ArrayBuffer }[]): ArrayBuffer {
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [];
  const parts: Uint8Array[] = [];
  let offset = 0;

  // Local file headers + data
  for (const f of files) {
    const data = new Uint8Array(f.data);
    const name = enc.encode(f.name);
    const crc = crc32(data);
    entries.push({ name: f.name, data, crc32: crc, offset });

    const header = new ArrayBuffer(30 + name.length);
    const v = new DataView(header);
    v.setUint32(0, 0x04034b50, true);        // signature
    v.setUint16(4, 20, true);                 // version needed
    v.setUint16(6, 0, true);                  // flags
    v.setUint16(8, 0, true);                  // method (0 = stored)
    v.setUint16(10, 0, true);                 // mod time
    v.setUint16(12, 0, true);                 // mod date
    v.setUint32(14, crc, true);               // crc-32
    v.setUint32(18, data.length, true);       // compressed size
    v.setUint32(22, data.length, true);       // uncompressed size
    v.setUint16(26, name.length, true);       // filename length
    v.setUint16(28, 0, true);                 // extra length
    new Uint8Array(header, 30).set(name);

    parts.push(new Uint8Array(header));
    parts.push(data);
    offset += header.byteLength + data.length;
  }

  // Central directory
  const cdStart = offset;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const cd = new ArrayBuffer(46 + name.length);
    const v = new DataView(cd);
    v.setUint32(0, 0x02014b50, true);         // signature
    v.setUint16(4, 20, true);                  // version made by
    v.setUint16(6, 20, true);                  // version needed
    v.setUint16(8, 0, true);                   // flags
    v.setUint16(10, 0, true);                  // method
    v.setUint16(12, 0, true);                  // mod time
    v.setUint16(14, 0, true);                  // mod date
    v.setUint32(16, e.crc32, true);            // crc-32
    v.setUint32(20, e.data.length, true);      // compressed size
    v.setUint32(24, e.data.length, true);      // uncompressed size
    v.setUint16(28, name.length, true);        // filename length
    v.setUint16(30, 0, true);                  // extra length
    v.setUint16(32, 0, true);                  // comment length
    v.setUint16(34, 0, true);                  // disk number start
    v.setUint16(36, 0, true);                  // internal attrs
    v.setUint32(38, 0, true);                  // external attrs
    v.setUint32(42, e.offset, true);           // local header offset
    new Uint8Array(cd, 46).set(name);
    parts.push(new Uint8Array(cd));
    offset += cd.byteLength;
  }
  const cdSize = offset - cdStart;

  // End of central directory
  const eocd = new ArrayBuffer(22);
  const v = new DataView(eocd);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(4, 0, true);                     // disk number
  v.setUint16(6, 0, true);                     // disk with cd start
  v.setUint16(8, entries.length, true);        // entries on this disk
  v.setUint16(10, entries.length, true);       // total entries
  v.setUint32(12, cdSize, true);               // cd size
  v.setUint32(16, cdStart, true);              // cd offset
  v.setUint16(20, 0, true);                    // comment length
  parts.push(new Uint8Array(eocd));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out.buffer;
}
