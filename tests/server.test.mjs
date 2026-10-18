import test from "node:test";
import assert from "node:assert/strict";
let server;
try {
  server = await import("../server/app.mjs");
} catch {}
const origin = "https://daisy.example";
const env = { SESSION_SECRET: "ab".repeat(32) };
async function sessionCookie(value) {
  const sid = value.sid || "test-session";
  return (
    "daisy_session=" +
    (await server.seal(
      { ...value, sid },
      env.SESSION_SECRET,
      origin,
      "session",
    )) +
    "; daisy_active=" +
    (await server.seal(
      { sid, exp: value.exp },
      env.SESSION_SECRET,
      origin,
      "active",
    ))
  );
}
const makeRequest = (path, body, cookie = "") =>
  new Request(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      Cookie: cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
test("sessions are encrypted, expire, and reject tampering and other origins", async () => {
  assert.equal(
    typeof server?.seal,
    "function",
    "encrypted session helper exists",
  );
  const value = {
    access_token: "private-access",
    refresh_token: "private-refresh",
    exp: Date.now() + 60000,
  };
  const sealed = await server.seal(
    value,
    env.SESSION_SECRET,
    origin,
    "session",
  );
  assert.ok(!sealed.includes("private"));
  assert.deepEqual(
    await server.unseal(sealed, env.SESSION_SECRET, origin, "session"),
    value,
  );
  await assert.rejects(
    server.unseal(sealed + "x", env.SESSION_SECRET, origin, "session"),
  );
  await assert.rejects(
    server.unseal(
      sealed,
      env.SESSION_SECRET,
      "https://foreign.example",
      "session",
    ),
  );
  await assert.rejects(
    server.unseal(
      await server.seal({ exp: 1 }, env.SESSION_SECRET, origin, "session"),
      env.SESSION_SECRET,
      origin,
      "session",
    ),
  );
});

test("logout stays disconnected after an in-flight refresh finishes late", async () => {
  let release, started;
  const ready = new Promise((resolve) => (started = resolve));
  const handler = server.createHandler({
    fetcher: async (url) => {
      if (url.includes("/api/token")) {
        started();
        await new Promise((resolve) => (release = resolve));
        return Response.json({ access_token: "late-access", expires_in: 3600 });
      }
      return Response.json({ display_name: "Old account" });
    },
  });
  const cookie = await sessionCookie({
    sid: "old-session",
    access_token: "old",
    refresh_token: "refresh-race",
    clientId: "a".repeat(32),
    expires_at: 1,
    exp: Date.now() + 999999,
  });
  const jar = new Map(cookie.split("; ").map((x) => x.split("=")));
  const apply = (response) => {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const [name, value] = pair.split("=");
      if (cookie.includes("Max-Age=0")) jar.delete(name);
      else jar.set(name, value);
    }
  };
  const pending = handler(
    makeRequest("/api/spotify", { path: "/me", method: "GET" }, cookie),
    env,
  );
  await ready;
  apply(await handler(makeRequest("/api/auth/logout", {}, cookie), env));
  release();
  apply(await pending);
  const remaining = [...jar].map(([k, v]) => k + "=" + v).join("; ");
  const status = await handler(
    makeRequest("/api/auth/status", null, remaining),
    env,
  );
  assert.equal((await status.json()).connected, false);
});
test("OAuth uses PKCE and state, exposes no token, and consumes pending state", async () => {
  assert.equal(typeof server?.createHandler, "function");
  let exchange;
  const handler = server.createHandler({
    fetcher: async (url, options) => {
      exchange = { url, options };
      return Response.json({
        access_token: "private-access",
        refresh_token: "private-refresh",
        expires_in: 3600,
      });
    },
  });
  const start = await handler(
    makeRequest("/api/auth/login", { clientId: "a".repeat(32) }),
    env,
  );
  assert.equal(start.status, 200);
  const { url } = await start.json();
  const auth = new URL(url);
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    auth.searchParams.get("redirect_uri"),
    origin + "/auth/spotify/callback",
  );
  const pending = start.headers.get("set-cookie").split(";")[0];
  const bad = await handler(
    makeRequest("/auth/spotify/callback?code=x&state=wrong", null, pending),
    env,
  );
  assert.equal(bad.status, 400);
  assert.equal(exchange, undefined);
  const callback = await handler(
    makeRequest(
      "/auth/spotify/callback?code=x&state=" + auth.searchParams.get("state"),
      null,
      pending,
    ),
    env,
  );
  assert.equal(callback.status, 303);
  const cookies = callback.headers.get("set-cookie");
  assert.match(cookies, /HttpOnly/);
  assert.match(cookies, /Secure/);
  assert.doesNotMatch(cookies, /private-access|private-refresh/);
  assert.ok(new URLSearchParams(exchange.options.body).get("code_verifier"));
  assert.match(cookies, /daisy_pending=;.*Max-Age=0/);
});
test("foreign origins, anonymous API calls and unsupported endpoints are blocked", async () => {
  assert.equal(typeof server?.createHandler, "function");
  const handler = server.createHandler({
    fetcher: async () => {
      throw Error("must not fetch");
    },
  });
  const foreign = new Request(origin + "/api/auth/login", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ clientId: "a".repeat(32) }),
  });
  assert.equal((await handler(foreign, env)).status, 403);
  assert.equal(
    (
      await handler(
        makeRequest("/api/spotify", { path: "/me", method: "GET" }),
        env,
      )
    ).status,
    401,
  );
  const cookie = await sessionCookie({
    access_token: "private-access",
    expires_at: Date.now() + 999999,
    exp: Date.now() + 999999,
  });
  for (const path of [
    "https://evil.example/me",
    "//evil.example",
    "/me/../evil",
    "/users/other",
    "/search?next=https://evil.example",
  ]) {
    assert.equal(
      (
        await handler(
          makeRequest("/api/spotify", { path, method: "GET" }, cookie),
          env,
        )
      ).status,
      400,
      path,
    );
  }
});
test("commands accept opaque success, data rejects malformed JSON safely and API errors stay failures", async () => {
  assert.equal(typeof server?.createHandler, "function");
  let calls = 0;
  const cookie = await sessionCookie({
    access_token: "private-access",
    expires_at: Date.now() + 999999,
    exp: Date.now() + 999999,
  });
  const handler = server.createHandler({
    fetcher: async () => {
      calls++;
      return new Response("V-private-ack");
    },
  });
  const command = await handler(
    makeRequest(
      "/api/spotify",
      { path: "/me/player/next", method: "POST" },
      cookie,
    ),
    env,
  );
  assert.equal(command.status, 200);
  assert.equal(calls, 1);
  assert.doesNotMatch(await command.text(), /V-private|private-access/);
  const data = await handler(
    makeRequest("/api/spotify", { path: "/me/player", method: "GET" }, cookie),
    env,
  );
  assert.equal(data.status, 502);
  assert.doesNotMatch(await data.text(), /V-private|Unexpected token/);
  const denied = server.createHandler({
    fetcher: async () => new Response("V-private", { status: 403 }),
  });
  assert.equal(
    (
      await denied(
        makeRequest(
          "/api/spotify",
          { path: "/me/player/next", method: "POST" },
          cookie,
        ),
        env,
      )
    ).status,
    403,
  );
});
test("expired sessions refresh once concurrently and revoked refresh clears credentials", async () => {
  assert.equal(typeof server?.createHandler, "function");
  const cookie = await sessionCookie({
    access_token: "old",
    refresh_token: "private-refresh",
    clientId: "a".repeat(32),
    expires_at: 1,
    exp: Date.now() + 999999,
  });
  let refreshes = 0;
  const handler = server.createHandler({
    fetcher: async (url, options) => {
      if (url.includes("/api/token")) {
        refreshes++;
        await new Promise((r) => setTimeout(r, 10));
        return Response.json({ access_token: "new", expires_in: 3600 });
      }
      assert.equal(options.headers.Authorization, "Bearer new");
      return Response.json({ display_name: "Daisy" });
    },
  });
  const results = await Promise.all([
    handler(
      makeRequest("/api/spotify", { path: "/me", method: "GET" }, cookie),
      env,
    ),
    handler(
      makeRequest("/api/spotify", { path: "/me", method: "GET" }, cookie),
      env,
    ),
  ]);
  assert.equal(refreshes, 1);
  assert.ok(
    results.every(
      (r) =>
        r.status === 200 && r.headers.get("set-cookie")?.includes("HttpOnly"),
    ),
  );
  const revoked = server.createHandler({
    fetcher: async () => new Response("", { status: 400 }),
  });
  const response = await revoked(
    makeRequest("/api/spotify", { path: "/me", method: "GET" }, cookie),
    env,
  );
  assert.equal(response.status, 401);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
});
test("search and playlist requests follow current contracts and rate limits do not replay writes", async () => {
  assert.equal(typeof server?.createHandler, "function");
  assert.throws(
    () =>
      server.validateOperation({
        path: "/search?q=hello&type=track&limit=50",
        method: "GET",
      }),
    /limit/i,
  );
  assert.throws(() =>
    server.validateOperation({
      path: "/playlists/abc/tracks",
      method: "POST",
      body: { uris: ["spotify:track:abc"] },
    }),
  );
  assert.doesNotThrow(() =>
    server.validateOperation({
      path: "/playlists/abc/items",
      method: "POST",
      body: { uris: ["spotify:track:abc"] },
    }),
  );
  assert.doesNotThrow(() =>
    server.validateOperation({
      path: "/me/playlists",
      method: "POST",
      body: { name: "Moonlight", public: false },
    }),
  );
  const cookie = await sessionCookie({
    access_token: "test",
    expires_at: Date.now() + 999999,
    exp: Date.now() + 999999,
  });
  let calls = 0;
  const handler = server.createHandler({
    fetcher: async () => {
      calls++;
      return new Response("", { status: 429, headers: { "Retry-After": "3" } });
    },
  });
  const response = await handler(
    makeRequest(
      "/api/spotify",
      { path: "/me/player/next", method: "POST" },
      cookie,
    ),
    env,
  );
  assert.equal(response.status, 429);
  assert.equal((await response.json()).retryAfter, 3);
  assert.equal(calls, 1);
});
