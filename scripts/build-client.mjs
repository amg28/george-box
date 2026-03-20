import { build } from "esbuild";

const common = {
  bundle: true,
  minify: false,
  sourcemap: true,
  target: ["es2022"],
  logLevel: "info"
};

await Promise.all([
  build({
    ...common,
    platform: "browser",
    format: "iife",
    entryPoints: ["src/client/host/main.ts"],
    outfile: "public/host.js"
  }),
  build({
    ...common,
    platform: "browser",
    format: "iife",
    entryPoints: ["src/client/player/main.ts"],
    outfile: "public/player.js"
  })
]);
