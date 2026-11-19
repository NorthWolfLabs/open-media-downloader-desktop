import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { readFile } from "node:fs/promises";
import { frontendNotices } from "./scripts/frontend-notices.mjs";
import { frontendCssOrder } from "./scripts/frontend-css-order.mjs";
export default defineConfig({
  plugins: [
    svelte(),
    frontendNotices(),
    frontendCssOrder(),
    {
      name: "omd-v2-development-connection",
      configureServer(server) {
        server.middlewares.use("/omd-development-connection", async (_req, res) => {
          if (!process.env.OMD_V2_INSTANCE) {
            res.statusCode = 404;
            res.end();
            return;
          }
          try {
            const instance = await readFile(process.env.OMD_V2_INSTANCE, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(instance);
          } catch {
            res.statusCode = 503;
            res.end();
          }
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 1422, strictPort: true },
  // One stylesheet, linked from the HTML head: it blocks the first paint as before the app
  // chunk was split out, and keeps component rules before the global sheets (boot.ts).
  build: { outDir: "dist-v2", cssCodeSplit: false, rollupOptions: { input: ["index.html", "v2.html"] } },
});
