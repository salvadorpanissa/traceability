import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone/server.js, a minimal self-contained server —
  // useful for container-based hosting (e.g. Railway/Docker) that doesn't
  // run `next start` directly against the full node_modules tree.
  output: "standalone",
};

export default nextConfig;
