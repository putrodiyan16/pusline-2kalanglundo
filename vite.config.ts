import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const SUPABASE_URL = "https://plwythqedzgmsfnjqznp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsd3l0aHFlZHpnbXNmbmpxem5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTg5OTksImV4cCI6MjA5NDczNDk5OX0.nNjCAKZpRVSA-vyiJtrwSf1dMhxMww_4qkhC_JY-0yQ";
const SUPABASE_PROJECT_ID = "plwythqedzgmsfnjqznp";

// Standard Vite SPA config — works on Vercel (zero-config) and any static host.
// Output goes to ./dist with the standard SPA layout.
export default defineConfig({
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
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(SUPABASE_URL),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(SUPABASE_PROJECT_ID),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
    "process.env.SUPABASE_URL": JSON.stringify(SUPABASE_URL),
    "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
    // Prevent "process is not defined" when libraries reference process.env in browser code.
    "process.env": "{}",
  },
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
