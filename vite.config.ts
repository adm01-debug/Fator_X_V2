import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";
import pkg from "./package.json";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "production" && visualizer({
      filename: "dist/bundle-report.html",
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  build: {
    // Sourcemaps só em dev (produção mantém apenas via Sentry upload no CI).
    sourcemap: mode !== "production",
    target: "es2020",
    cssCodeSplit: true,
    // Aumenta o limite pois hoje separamos bundles grandes intencionalmente (ex: reactflow, tiptap).
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Estratégia de chunking granular — reduz o bundle inicial (LCP/TTI):
        //   • React/Router/Query/Supabase carregam em toda rota → chunks fixos.
        //   • Bibliotecas pesadas de rotas específicas (reactflow, tiptap, recharts,
        //     dagre, jspdf, react-day-picker) vão em chunks próprios e só chegam ao
        //     cliente quando a página que as usa é acessada.
        //   • Todo o restante dos @radix-ui agrupa em `vendor-radix` para maximizar
        //     hit-rate de cache entre releases (evita chunks minúsculos).
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          if (id.includes("react-router")) return "vendor-router";
          if (id.match(/node_modules\/(react|react-dom|scheduler)\//)) return "vendor-react";
          if (id.includes("@tanstack/react-query")) return "vendor-query";
          if (id.includes("@supabase/") || id.includes("@lovable.dev/cloud-auth-js"))
            return "vendor-supabase";

          if (id.includes("reactflow") || id.includes("@reactflow") || id.includes("/dagre/"))
            return "vendor-flow";
          if (id.includes("@tiptap") || id.includes("/lowlight/") || id.includes("/highlight.js/"))
            return "vendor-editor";
          if (id.includes("/recharts/") || id.includes("/d3-")) return "vendor-charts";
          if (id.includes("jspdf")) return "vendor-pdf";
          if (id.includes("react-day-picker") || id.includes("date-fns")) return "vendor-date";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("@sentry")) return "vendor-sentry";

          return "vendor";
        },
      },
    },
  },
}));
