import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Dedicated Vite config for the GitHub Pages build.
// Does NOT use @tanstack/react-start (no SSR), Cloudflare, or Lovable plugins.
// Outputs a pure static SPA into ./dist-gh that can be served from any subpath.
//
// Supabase credentials baked in as defaults so the build works on GitHub Pages
// even when the repo has no Actions Secrets configured. These are PUBLISHABLE
// (anon) keys — same ones already shipped to every browser via the Lovable
// preview — and are safe in client bundles. Row-Level Security in the
// database enforces real access control.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "https://iedxctmjnrfrkytoljyd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZHhjdG1qbnJmcmt5dG9sanlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NDE5OTYsImV4cCI6MjA5NDQxNzk5Nn0.E_YR4iUwuHpA6oyKDO_xykf0qdW7nROJq50uSmzvxBI";
const SUPABASE_PROJECT_ID = process.env.VITE_SUPABASE_PROJECT_ID ?? "iedxctmjnrfrkytoljyd";

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
  // Inline values at build time so they exist even if Vite's .env loader
  // can't find them on the CI runner. Also stub `process.env.*` in the
  // browser bundle so client.ts's SSR fallback doesn't crash with
  // "process is not defined" on GitHub Pages.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(SUPABASE_URL),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(SUPABASE_PROJECT_ID),
    "process.env.SUPABASE_URL": JSON.stringify(SUPABASE_URL),
    "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
  },
  build: {
    outDir: "dist-gh",
    emptyOutDir: true,
    sourcemap: false,
  },
});