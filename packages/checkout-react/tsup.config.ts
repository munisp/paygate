import { defineConfig } from "tsup";

export default defineConfig([
  // ESM + CJS + types for npm consumers
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ["react", "react-dom"],
    outDir: "dist",
    treeshake: true,
    minify: false,
    esbuildOptions(opts) {
      opts.jsx = "automatic";
    },
  },
  // IIFE CDN bundle — exposes window.PayGate
  {
    entry: { "checkout.global": "src/cdn.ts" },
    format: ["iife"],
    globalName: "PayGate",
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    outDir: "dist",
    minify: true,
    esbuildOptions(opts) {
      opts.jsx = "automatic";
    },
  },
]);
