import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

mkdirSync(join(dist, "renderer"), { recursive: true });

const shared = {
  bundle: true,
  sourcemap: true,
  target: "es2022",
  logLevel: "info",
};

await Promise.all([
  esbuild.build({
    ...shared,
    entryPoints: [join(root, "src/main/index.ts")],
    outfile: join(dist, "main/index.js"),
    platform: "node",
    format: "cjs",
    external: ["electron", "cheerio", "dotenv", "@elevenlabs/elevenlabs-js"],
  }),
  esbuild.build({
    ...shared,
    entryPoints: [join(root, "src/preload/index.ts")],
    outfile: join(dist, "preload/index.js"),
    platform: "node",
    format: "cjs",
    external: ["electron"],
  }),
  esbuild.build({
    ...shared,
    entryPoints: [join(root, "src/renderer/renderer.ts")],
    outfile: join(dist, "renderer/renderer.js"),
    platform: "browser",
    format: "iife",
  }),
]);

cpSync(join(root, "src/renderer/index.html"), join(dist, "renderer/index.html"));
cpSync(join(root, "src/renderer/styles.css"), join(dist, "renderer/styles.css"));
