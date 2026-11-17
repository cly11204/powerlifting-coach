/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api requests are proxied to the FastAPI server, so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 127.0.0.1 (not "localhost") avoids IPv6/IPv4 mix-ups on some machines.
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  test: { environment: "node" },
});
