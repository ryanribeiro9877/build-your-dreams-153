import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // three.js minificado costuma ficar ~600–700 kB; já isolado em vendor-three.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const norm = id.replace(/\\/g, "/");
          // Three.js: separar drei / fiber / core para evitar um único chunk >500 kB
          if (norm.includes("@react-three/drei")) return "vendor-drei";
          if (norm.includes("@react-three/fiber")) return "vendor-r3f";
          if (norm.includes("node_modules/three/")) return "vendor-three";
          if (norm.includes("recharts")) return "vendor-recharts";
          if (norm.includes("@supabase")) return "vendor-supabase";
          if (norm.includes("@tanstack")) return "vendor-query";
          if (norm.includes("@stripe")) return "vendor-stripe";
          if (norm.includes("@hello-pangea")) return "vendor-dnd";
          if (norm.includes("@radix-ui")) return "vendor-radix";
          if (norm.includes("lucide-react")) return "vendor-lucide";
          if (norm.includes("react-router")) return "vendor-router";
          if (
            norm.includes("node_modules/react-dom/")
            || norm.includes("node_modules/react/")
            || norm.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }
        },
      },
    },
  },
}));
