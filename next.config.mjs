/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // manifold-3d's bundled JS branches on `ENVIRONMENT_IS_NODE` and dynamically
      // imports `node:module` in the Node path. The browser never executes that
      // branch, but webpack still tries to resolve the static import. Strip the
      // `node:` scheme so the resolver falls through to the empty-module fallback.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        })
      );
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        module: false,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
