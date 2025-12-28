import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  platform: "node",
  target: "es2022",
  clean: true,
  sourcemap: true,
  splitting: false,
  dts: false,
  // IMPORTANT for Render: bundle workspace deps so runtime does not depend on
  // @snapsearch/* packages having prebuilt dist/ outputs.
  skipNodeModulesBundle: false,
});
