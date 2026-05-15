import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: "..",
  plugins: [react()],
  base:
    process.env.GITHUB_REPOSITORY != null
      ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
      : "/",
  server: {
    port: 5173,
    // vLLM uses port 8000; FastAPI UI backend uses 8001 (see .env PORT)
    proxy: {
      "/api": { target: "http://127.0.0.1:8001", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8001", changeOrigin: true },
    },
  },
});
