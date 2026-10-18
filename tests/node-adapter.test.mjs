import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createNodeHandler } from "../server/node-adapter.mjs";
import { createHandler } from "../server/app.mjs";
import { createFixture } from "./fixture.mjs";

test("Vercel Node adapter preserves OAuth callbacks, cookies, origins and command bodies", async () => {
  const fixture = createFixture();
  const handler = createNodeHandler({ fetch: createHandler({ fetcher: fixture.fetcher }) }, () => ({ SESSION_SECRET: "ab".repeat(32) }));
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-forwarded-proto": "http", Origin: origin, "Content-Type": "application/json" };
  try {
    const status = await fetch(origin + "/api/auth/status", { headers });
    assert.equal((await status.json()).redirectUri, origin + "/auth/spotify/callback");
    const login = await fetch(origin + "/api/auth/login", { method: "POST", headers, body: JSON.stringify({ clientId: "a".repeat(32) }) });
    assert.equal(login.status, 200);
    const data = await login.json();
    const authorize = new URL(data.url);
    const pending = login.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    const callback = await fetch(origin + "/auth/spotify/callback?code=fixture&state=" + authorize.searchParams.get("state"), { headers: { ...headers, Cookie: pending }, redirect: "manual" });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.getSetCookie().length, 3);
    assert.ok(callback.headers.getSetCookie().every(c => c.includes("HttpOnly")));
    const cookies = callback.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    const result = await fetch(origin + "/api/spotify", { method: "POST", headers: { ...headers, Cookie: cookies }, body: JSON.stringify({ path: "/me/player/pause", method: "PUT" }) });
    assert.equal(result.status, 200);
    assert.equal(fixture.state.playing, false);
    assert.equal(result.headers.get("cache-control"), "no-store");
    const foreign = await fetch(origin + "/api/auth/logout", { method: "POST", headers: { ...headers, Origin: "https://other.example", Cookie: cookies }, body: "{}" });
    assert.equal(foreign.status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
