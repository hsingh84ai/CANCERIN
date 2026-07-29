import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Relative base so the built site can be served from any path — a file://
// directory, GitHub Pages, or a subfolder — with no configuration.
export default defineConfig({
  base: "./",
  plugins: [svelte()],
  build: { target: "es2020", chunkSizeWarningLimit: 1200 },
});
