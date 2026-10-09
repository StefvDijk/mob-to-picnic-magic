import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { rm } from "node:fs/promises";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), {
    name: "exclude-unlicensed-reference-photo",
    apply: "build",
    async closeBundle() {
      // Keep the local design reference, but do not publish third-party photography.
      await rm(path.resolve(__dirname, "dist/images/picnic-cooking-hero.webp"), { force: true });
    },
  }],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
