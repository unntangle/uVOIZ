import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Resolve this config file's own directory in a way that works in both
// CommonJS and ESM contexts (Next sometimes loads next.config.ts as ESM).
const __filenameLocal =
  typeof __filename !== "undefined"
    ? __filename
    : fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filenameLocal);

const nextConfig: NextConfig = {
  // Allow dev server to be accessed from LAN IPs (e.g. 192.168.0.3)
  // and silence "Cross origin request detected" warnings so HMR works
  // when the page is loaded from a non-localhost host.
  allowedDevOrigins: [
    "192.168.0.3",
    "192.168.0.*",
    "192.168.1.*",
    "10.0.0.*",
    "localhost",
  ],

  // Pin Turbopack's workspace root to THIS folder so it doesn't walk up
  // and pick the parent D:\unntangle\uVOIZ\ which has its own package-lock.json.
  turbopack: {
    root: __dirnameLocal,
  },

  // Same idea but for Next's file tracing during `next build`.
  outputFileTracingRoot: __dirnameLocal,

  reactStrictMode: true,
};

export default nextConfig;
