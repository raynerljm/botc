import type { MetadataRoute } from "next";

// Same basePath the app deploys under (ADR 0001 static export can serve from a
// subpath, e.g. a GitHub Pages project site). The manifest link tag is
// basePath-prefixed by Next automatically, but icon `src` values are plain
// strings we must prefix ourselves so they resolve under the subpath too.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Prerender the manifest at build time; the static export (ADR 0001) has no
// runtime server to generate metadata routes on demand.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BotC Grimoire",
    short_name: "Grimoire",
    description:
      "A storyteller's digital grimoire for in-person Blood on the Clocktower games.",
    start_url: `${basePath}/`,
    display: "standalone",
    background_color: "#120f19",
    theme_color: "#120f19",
    icons: [
      {
        src: `${basePath}/android-chrome-192x192.png`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `${basePath}/android-chrome-512x512.png`,
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
