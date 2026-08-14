import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `npm run dev`, the React dev server runs on its own port
// (default 5173). Any request to /api/... or /health is forwarded to the
// Express backend so the frontend can keep using plain relative fetch()
// calls, exactly like the original vanilla-JS version did.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
