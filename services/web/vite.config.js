import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  worker: {
    format: "es",
  },
  build: {
    assetsDir: "course-assets",
    outDir: "dist",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/inspector": "http://127.0.0.1:8080",
      "/inspector-boot.js": "http://127.0.0.1:8080",
      "/cloud-explorer": "http://127.0.0.1:8080",
      "/console": "http://127.0.0.1:8080",
      "/dashboard": "http://127.0.0.1:8080",
      "/settings": "http://127.0.0.1:8080",
      "/secretsmanager": "http://127.0.0.1:8080",
      "/assets": "http://127.0.0.1:8080",
      "/api/clouds": "http://127.0.0.1:8080",
      "/favicon.ico": "http://127.0.0.1:8080",
      "/term": { target: "ws://127.0.0.1:8080", ws: true },
      "/lsp": { target: "ws://127.0.0.1:8080", ws: true },
    },
  },
});
