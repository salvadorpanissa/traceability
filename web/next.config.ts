import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework in responses.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // pdfjs-dist (lib/activities/pdf-text-extraction.ts) polyfills DOMMatrix
  // via a dynamically-constructed require() (process.getBuiltinModule
  // ("module").createRequire(...)), which Vercel's output file tracer
  // (@vercel/nft) can't follow statically — see Next's own docs on
  // outputFileTracingIncludes, which cite this exact pattern (sharp is
  // their example). Without this, @napi-rs/canvas is missing from the
  // deployed function, DOMMatrix stays undefined, and every server action
  // in any route that imports pdf-text-extraction.ts crashes at module
  // load, not just the PDF-parsing one.
  outputFileTracingIncludes: {
    "/*": ["node_modules/@napi-rs/canvas/**/*", "node_modules/@napi-rs/canvas-linux-x64-gnu/**/*"],
  },
  // Default is 1MB, which leaves no margin for the bulk animal-import
  // workbook uploaded as FormData through parseImportFileAction (a
  // ~3750-row .xlsx can run several hundred KB).
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
