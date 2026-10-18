import "./build.mjs";
import fs from "node:fs/promises";
import { build } from "esbuild";
// Vercel Build Output API: one self-contained Node function, no file tracing.
const output = ".vercel/output";
await fs.mkdir(`${output}/functions/loopie.func`, { recursive: true });
await build({
  entryPoints: ["server/vercel.mjs"],
  outfile: `${output}/functions/loopie.func/index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
});
await fs.writeFile(`${output}/functions/loopie.func/.vc-config.json`, JSON.stringify({
  runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", maxDuration: 60,
}, null, 2));
await fs.writeFile(`${output}/config.json`, JSON.stringify({
  version: 3,
  routes: [{ src: "/(.*)", dest: "/loopie" }],
}, null, 2));
console.log("Built Loopie for Vercel (Node.js function, API/auth and PWA assets).");
