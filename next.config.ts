import type { NextConfig } from "next";

// Client-only static export (ADR 0001): no API routes, no server at runtime.
// NEXT_PUBLIC_BASE_PATH lets the same build deploy under a subpath
// (e.g. GitHub Pages project sites serve from /<repo>).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // Directory-style URLs (scripts/tb/index.html) load correctly on any
  // static host without extensionless-path rewrite rules.
  trailingSlash: true,
  images: {
    // Static export has no image optimization server.
    unoptimized: true,
  },
};

export default nextConfig;
