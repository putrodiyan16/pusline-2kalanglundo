import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Dedicated Vite config for the GitHub Pages build.
// Does NOT use @tanstack/react-start (no SSR), Cloudflare, or Lovable plugins.
// Outputs a pure static SPA into ./dist-gh that can be served from any subpath.
export default defineConfig({
  base: "./",
  plugins: [
    TanStackRouterVite({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist-gh",
    emptyOutDir: true,
    sourcemap: false,
  },
});