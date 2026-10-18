import http from "node:http";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import handler from "../.vercel/output/functions/loopie.func/index.mjs";

// Test only the compiled deployment, without connecting to Spotify.
process.env.SESSION_SECRET = randomBytes(32).toString("hex");
const config = JSON.parse(await fs.readFile(".vercel/output/config.json", "utf8"));
assert.equal(config.version, 3);
assert.equal(config.routes[0].dest, "/loopie");
const server = http.createServer(handler);
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const local = `http://127.0.0.1:${server.address().port}`;
const canonical = local.replace("http:", "https:");
try {
  const index = await fetch(local);
  assert.equal(index.status, 200);
  assert.ok((await index.text()).includes("<title>Loopie</title>"));
  assert.ok(index.headers.get("content-security-policy").includes("script-src 'self'"));
  const manifest = await (await fetch(local + "/manifest.webmanifest")).json();
  assert.equal(manifest.name, "Loopie");
  assert.equal(manifest.short_name, "Loopie");
  for (const icon of manifest.icons) {
    const response = await fetch(local + icon.src);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.ok((await response.arrayBuffer()).byteLength > 100);
  }
  const sw = await (await fetch(local + "/sw.js")).text();
  assert.ok(!sw.includes("__DAISY_VERSION__"));
  const status = await (await fetch(local + "/api/auth/status")).json();
  assert.equal(status.connected, false);
  assert.equal(status.redirectUri, canonical + "/auth/spotify/callback");
  const login = await fetch(local + "/api/auth/login", {
    method: "POST", headers: { Origin: canonical, "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: "a".repeat(32) }),
  });
  assert.equal(login.status, 200);
  const authorize = new URL((await login.json()).url);
  assert.equal(authorize.searchParams.get("redirect_uri"), status.redirectUri);
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.ok(login.headers.getSetCookie()[0].includes("Secure"));
  assert.ok(login.headers.getSetCookie()[0].includes("HttpOnly"));
  const unauthorized = await fetch(local + "/api/spotify", {
    method: "POST", headers: { Origin: canonical, "Content-Type": "application/json" }, body: JSON.stringify({ path: "/me" }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(local + "/.env")).status, 404);
  assert.equal((await fetch(local + "/server/app.mjs")).status, 404);
  console.log("PASS: Compiled Vercel function serves Loopie/PWA/icons, keeps HTTPS OAuth and secure cookies, rejects unauthorized API calls and hides source.");
} finally { await new Promise(resolve => server.close(resolve)); }
