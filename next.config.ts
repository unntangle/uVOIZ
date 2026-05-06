import type { NextConfig } from "next";
import path from "path";

// Pin the workspace root to the directory `next dev`/`next build` was
// invoked from. We use process.cwd() (and not fileURLToPath(import.meta.url))
// because on Windows, URL-derived paths can produce a form Turbopack's
// internal path matcher rejects, which surfaces as a panic:
//   "Failed to write app endpoint /t/<route>/page
//    Caused by: Next.js package not found
//    ...get_next_server_import_map..."
// process.cwd() is normalized by Node and is always the project root
// when scripts are run via `npm run dev` from this folder.
const projectRoot = path.resolve(process.cwd());

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

  // Pin Turbopack's workspace root so it doesn't walk up the filesystem
  // looking for a lockfile and end up with a root where `next` can't be
  // resolved. (There is no parent package-lock.json today, but keeping
  // this explicit prevents future breakage if one ever appears.)
  turbopack: {
    root: projectRoot,
  },

  // Same idea but for Next's file tracing during `next build`.
  outputFileTracingRoot: projectRoot,

  reactStrictMode: true,
};

export default nextConfig;
