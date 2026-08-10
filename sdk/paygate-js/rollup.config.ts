import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import type { RollupOptions } from "rollup";

const config: RollupOptions[] = [
  // ESM build
  {
    input: "src/index.ts",
    output: {
      file: "dist/paygate.esm.js",
      format: "esm",
      sourcemap: true,
    },
    plugins: [resolve(), typescript({ tsconfig: "./tsconfig.json" })],
  },
  // CJS build
  {
    input: "src/index.ts",
    output: {
      file: "dist/paygate.cjs.js",
      format: "cjs",
      sourcemap: true,
      exports: "named",
    },
    plugins: [resolve(), typescript({ tsconfig: "./tsconfig.json" })],
  },
  // UMD build (browser global PaygateSDK)
  {
    input: "src/index.ts",
    output: {
      file: "dist/paygate.umd.js",
      format: "umd",
      name: "PaygateSDK",
      sourcemap: true,
      exports: "named",
    },
    plugins: [resolve(), typescript({ tsconfig: "./tsconfig.json" })],
  },
];

export default config;
