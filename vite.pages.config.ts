import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
export default defineConfig({
  root: `${root}github-pages`,
  publicDir: `${root}public`,
  base: "/EG_ver./",
  plugins: [react()],
  resolve: { alias: { "@": root } },
  define: {
    "process.env.NEXT_PUBLIC_EG_BASE_PATH": JSON.stringify("/EG_ver."),
    "process.env.NEXT_PUBLIC_EG_API_ORIGIN": JSON.stringify(process.env.EG_PAGES_API_ORIGIN ?? "https://earth-groove-pf.sorriso-2870.chatgpt.site"),
  },
  build: {
    outDir: `${root}dist-pages`,
    emptyOutDir: true,
    rolldownOptions: {
      input: { live: `${root}github-pages/index.html`, local: `${root}github-pages/local/index.html` },
    },
  },
});
