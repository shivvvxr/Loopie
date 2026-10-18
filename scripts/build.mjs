import { build } from "vite";
import { build as bundle } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("..", import.meta.url));
process.chdir(root);
await fs.mkdir("public/icons", { recursive: true });
// Original desktop artwork, retained inside this standalone repository.
const desktopIcon = PNG.sync.read(await fs.readFile("branding/desktop-icon.png"));
for (const [filename, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
]) {
  const png = new PNG({ width: size, height: size });
  // The maskable variant adds a safe margin for Android's circular crops.
  const inset = maskable ? Math.round(size * .18) : 0;
  const artworkSize = size - inset * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const target = (y * size + x) * 4;
    png.data.set([217, 245, 255, 255], target);
    if (x < inset || y < inset || x >= size - inset || y >= size - inset) continue;
    const sx = Math.floor((x - inset) / artworkSize * desktopIcon.width);
    const sy = Math.floor((y - inset) / artworkSize * desktopIcon.height);
    const source = (sy * desktopIcon.width + sx) * 4;
    const alpha = desktopIcon.data[source + 3] / 255;
    for (let c = 0; c < 3; c++)
      png.data[target + c] = Math.round(desktopIcon.data[source + c] * alpha + png.data[target + c] * (1 - alpha));
  }
  await fs.writeFile("public/icons/" + filename, PNG.sync.write(png));
}
await build();
const assets = {};
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
};
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else
      assets["/" + path.relative(".client", full).replaceAll("\\", "/")] = [
        (await fs.readFile(full)).toString("base64"),
        mime[path.extname(full)] || "application/octet-stream",
      ];
  }
}
await walk(".client");
const version = createHash("sha256")
  .update(JSON.stringify(assets))
  .digest("hex")
  .slice(0, 12);
const shellAssets = [
  "/",
  ...Object.keys(assets).filter(
    (path) => path !== "/index.html" && path !== "/sw.js",
  ),
];
const sw = Buffer.from(assets["/sw.js"][0], "base64")
  .toString()
  .replace("__DAISY_VERSION__", version)
  .replace("/*__DAISY_ASSETS__*/ []", JSON.stringify(shellAssets));
assets["/sw.js"][0] = Buffer.from(sw).toString("base64");
await fs.mkdir(".generated", { recursive: true });
await fs.writeFile(
  ".generated/assets.mjs",
  "export const assets=" + JSON.stringify(assets) + ";",
);
await fs.mkdir("dist/server", { recursive: true });
await fs.mkdir("dist/.openai", { recursive: true });
await bundle({
  entryPoints: ["server/worker.mjs"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
try {
  await fs.copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
} catch (error) {
  // The standalone GitHub/Vercel download has no Sites project identity.
  if (error.code !== "ENOENT") throw error;
}
console.log(
  "Built React client and standalone Worker with embedded public assets.",
);

