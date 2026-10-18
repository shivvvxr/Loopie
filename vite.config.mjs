import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: { outDir: ".client", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:8788",
      "/auth": "http://127.0.0.1:8788",
    },
  },
});
