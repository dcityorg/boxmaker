'use client';

import Module, { type ManifoldToplevel } from 'manifold-3d';

let cached: Promise<ManifoldToplevel> | null = null;

/**
 * Load manifold-3d's WASM and resolve to the toplevel module.
 * The WASM is served as a static asset from /public/manifold.wasm so the
 * browser fetches it directly without going through webpack.
 * Cached after first call so live regen doesn't reload the WASM.
 */
export function getManifold(): Promise<ManifoldToplevel> {
  if (cached) return cached;
  cached = (async () => {
    const mod = await Module({ locateFile: () => '/manifold.wasm' });
    mod.setup();
    return mod;
  })();
  return cached;
}
