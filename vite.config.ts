import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The local engine (Bun + SQLite) runs on API_PORT; Vite proxies /api to it so
// the whole system is a single origin and stays fully local.
const API_PORT = process.env.API_PORT ?? "8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    hmr: false,
    port: Number(process.env.PORT) || 5173,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
