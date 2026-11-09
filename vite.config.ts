import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./scripts/vite/sites-vite-plugin";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";

// The existing Next.js app is bundled as a Worker for the independent PF Site.
export default defineConfig(async () => {
  configureToolEnvironment(process.cwd());
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    plugins: [
      vinext(),
      sites({ mockAuth: false }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          name: "earth-groove-pf",
          main: "vinext/server/fetch-handler",
          compatibility_date: "2026-05-15",
          compatibility_flags: ["nodejs_compat"],
        },
      }),
    ],
  };
});
