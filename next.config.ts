import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly that must be loaded from node_modules, not bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  async rewrites() {
    return {
      // The marketing page is a static file; the app lives under /app.
      beforeFiles: [{ source: "/", destination: "/landing.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
