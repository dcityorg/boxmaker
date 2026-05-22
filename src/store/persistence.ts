'use client';

import type {
  AppearanceSettings,
  BoxParams,
  LidParams,
  SnapFitParams,
} from './useDesign';

/**
 * Persisted design file format. Bump VERSION + handle the old shape in
 * deserialize when the schema changes.
 *
 * Custom font (if loaded) is embedded as base64 so a friend who receives
 * the JSON can render the labels without locating the font themselves.
 * Bundled fonts are NOT embedded -- they ship with the webapp.
 */
export const DESIGN_FILE_VERSION = 1 as const;

export interface DesignFile {
  version: typeof DESIGN_FILE_VERSION;
  designName: string | null;
  appearance: AppearanceSettings;
  box: BoxParams;
  lid: LidParams;
  snap: SnapFitParams;
  standoffsText: string;
  cutoutsText: string;
  textLabelsText: string;
  customFont?: {
    name: string;
    /** Base64-encoded TTF/OTF bytes. */
    base64: string;
  };
}

/** Minimum fields any version of a design file should have. */
function isDesignFileShape(x: unknown): x is { version: number } {
  return (
    typeof x === 'object' &&
    x !== null &&
    'version' in x &&
    typeof (x as { version: unknown }).version === 'number'
  );
}

/* -------------------------------------------------------------------------- */
/*  base64 helpers (browser-only)                                              */
/* -------------------------------------------------------------------------- */

export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  // String.fromCharCode in chunks to avoid the 64K argument-count limit.
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

export function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/* -------------------------------------------------------------------------- */
/*  Serialize                                                                  */
/* -------------------------------------------------------------------------- */

/** Build a DesignFile from current store state + optional custom font bytes. */
export function buildDesignFile(args: {
  designName: string | null;
  appearance: AppearanceSettings;
  box: BoxParams;
  lid: LidParams;
  snap: SnapFitParams;
  standoffsText: string;
  cutoutsText: string;
  textLabelsText: string;
  customFont?: { name: string; buffer: ArrayBuffer } | null;
}): DesignFile {
  const file: DesignFile = {
    version: DESIGN_FILE_VERSION,
    designName: args.designName,
    appearance: args.appearance,
    box: args.box,
    lid: args.lid,
    snap: args.snap,
    standoffsText: args.standoffsText,
    cutoutsText: args.cutoutsText,
    textLabelsText: args.textLabelsText,
  };
  if (args.customFont) {
    file.customFont = {
      name: args.customFont.name,
      base64: bufferToBase64(args.customFont.buffer),
    };
  }
  return file;
}

/* -------------------------------------------------------------------------- */
/*  Deserialize                                                                */
/* -------------------------------------------------------------------------- */

export class DesignFileError extends Error {}

export function parseDesignFile(json: string): DesignFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new DesignFileError(`Invalid JSON: ${(err as Error).message}`);
  }
  if (!isDesignFileShape(parsed)) {
    throw new DesignFileError('Missing or invalid "version" field');
  }
  if (parsed.version !== DESIGN_FILE_VERSION) {
    throw new DesignFileError(
      `Unsupported design file version ${parsed.version} (expected ${DESIGN_FILE_VERSION})`
    );
  }
  // Trust the structural fields once version matches -- if they're missing or
  // mistyped the geometry layer will surface useful errors downstream.
  return parsed as DesignFile;
}

/**
 * URL-safe encoding: base64 of the JSON, with `+/=` swapped to `-_~`.
 * Used by the share-via-URL feature. Custom fonts are STRIPPED from
 * URL-shared designs (size constraint) -- the recipient sees an error if
 * any label references the now-missing font.
 */
export function designToUrlHash(file: DesignFile): string {
  const lean: DesignFile = { ...file };
  delete lean.customFont;
  const json = JSON.stringify(lean);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '~');
}

export function designFromUrlHash(hash: string): DesignFile {
  const b64 = hash.replace(/-/g, '+').replace(/_/g, '/').replace(/~/g, '=');
  const json = atob(b64);
  return parseDesignFile(json);
}
