/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // GitHub Pages serves the site from /prompt-colosseum/ (set by the Pages workflow).
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@colosseum/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)) },
  },
  server: { port: 5173, fs: { allow: ["../.."] } },
  build: { chunkSizeWarningLimit: 900 },
});
