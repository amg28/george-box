import { build } from "esbuild";

await build({
  entryPoints: ["src/server/main.ts"],
  outfile: "dist/server/main.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: ["node24"],
  sourcemap: true,
  minify: false,
  logLevel: "info"
});
