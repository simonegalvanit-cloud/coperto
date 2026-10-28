import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WebAssembly that must be loaded from node_modules, not bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // Keep pages in the browser for a while, so switching between Prenotazioni, Sala and back is instant.
    // Fully prefetched pages (the menu links) last 60 s; pages just visited 30 s. Live data still refreshes
    // in the background (see LiveSync).
    staleTimes: { dynamic: 30, static: 60 },
  },
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
