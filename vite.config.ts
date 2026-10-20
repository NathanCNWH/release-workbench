import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  esbuild: { jsx: "automatic" },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:4175", changeOrigin: true } },
  },
});
