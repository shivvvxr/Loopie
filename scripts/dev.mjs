import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const child = spawn(process.execPath, ["scripts/serve.mjs"], {
  cwd: root,
  stdio: "inherit",
});
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  cwd: root,
  stdio: "inherit",
});
process.on("SIGINT", () => {
  child.kill();
  vite.kill();
  process.exit();
});
