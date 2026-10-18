const encoder = new TextEncoder();
const SCOPES =
  "user-read-private user-read-playback-state user-read-currently-playing user-read-playback-position user-modify-playback-state user-library-read user-library-modify playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-follow-read user-follow-modify user-top-read user-read-recently-played";
const lifetime = 7 * 86400;
const b64 = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const bytes = (text) =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
async function key(secret) {
  if (!/^[a-f0-9]{64}$/i.test(secret || ""))
    throw new Error("Server session encryption is not configured.");
  return crypto.subtle.importKey(
    "raw",
    Uint8Array.from(secret.match(/../g), (h) => parseInt(h, 16)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(value, secret, origin, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(origin + "|" + purpose),
    },
    await key(secret),
    encoder.encode(JSON.stringify(value)),
  );
  return b64(iv) + "." + b64(cipher);
}
export async function unseal(value, secret, origin, purpose) {
  const [iv, cipher, ...extra] = String(value || "").split(".");
  if (!iv || !cipher || extra.length) throw new Error("Invalid session.");
  const data = JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytes(iv),
          additionalData: encoder.encode(origin + "|" + purpose),
        },
        await key(secret),
        bytes(cipher),
      ),
    ),
  );
  if (!Number.isFinite(data.exp) || data.exp <= Date.now())
    throw new Error("Session expired.");
  return data;
}
function cookie(name, value, origin, maxAge = lifetime) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith("https:") ? "; Secure" : ""}`;
}
function getCookies(request) {
  return Object.fromEntries(
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((x) => x.trim().split("=")),
  );
}
const error = (message, status = 400, retryAfter) =>
  Object.assign(new Error(message), { status, retryAfter });
function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
const id = "[A-Za-z0-9]+";
const uriPattern =
  /^spotify:(track|episode|album|artist|playlist|show):[A-Za-z0-9]+$/;
export function validateOperation(input) {
  const { path, method = "GET", body } = input || {};
  if (
    typeof path !== "string" ||
    path.length > 6000 ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("..") ||
    path.includes("://") ||
    /[\\#\x00-\x20]/.test(path)
  )
    throw error("Unsupported Spotify request.");
  const url = new URL(path, "https://api.spotify.com");
  const p = url.pathname;
  const gets = [
    /^\/me$/,
    /^\/me\/player(?:\/(devices|queue|recently-played))?$/,
    /^\/me\/(tracks|albums|shows|episodes|playlists|following)$/,
    /^\/me\/top\/(tracks|artists)$/,
    /^\/me\/library\/contains$/,
    /^\/search$/,
    new RegExp(`^/(albums|artists|tracks|shows|episodes|playlists)/${id}$`),
    new RegExp(
      `^/(albums/${id}/tracks|artists/${id}/albums|shows/${id}/episodes|playlists/${id}/items)$`,
    ),
  ];
  const writes = [
    ["PUT", /^\/me\/player(?:\/(play|pause|seek|volume|shuffle|repeat))?$/],
    ["POST", /^\/me\/player\/(next|previous|queue)$/],
    ["PUT", /^\/me\/library$/],
    ["DELETE", /^\/me\/library$/],
    ["POST", /^\/me\/playlists$/],
    ["PUT", new RegExp(`^/playlists/${id}$`)],
    ...["POST", "PUT", "DELETE"].map((m) => [
      m,
      new RegExp(`^/playlists/${id}/items$`),
    ]),
  ];
  if (
    method === "GET"
      ? !gets.some((r) => r.test(p))
      : !writes.some(([m, r]) => m === method && r.test(p))
  )
    throw error("Unsupported Spotify endpoint or action.");
  const allowed = new Set([
    "q",
    "type",
    "limit",
    "offset",
    "market",
    "include_groups",
    "time_range",
    "after",
    "before",
    "additional_types",
    "uris",
    "uri",
    "position_ms",
    "volume_percent",
    "state",
    "device_id",
  ]);
  for (const [name, value] of url.searchParams)
    if (!allowed.has(name) || value.length > 1200)
      throw error("Unsupported Spotify query.");
  const limit = url.searchParams.get("limit");
  if (
    limit &&
    (!/^\d+$/.test(limit) ||
      Number(limit) < 1 ||
      Number(limit) > (p === "/search" || p.includes("/artists/") ? 10 : 50))
  )
    throw error("Spotify result limit is outside the supported range.");
  for (const name of ["offset", "position_ms", "volume_percent"]) {
    const value = url.searchParams.get(name);
    if (
      value !== null &&
      (!/^\d+$/.test(value) ||
        Number(value) > (name === "volume_percent" ? 100 : 86400000))
    )
      throw error("Invalid numeric Spotify option.");
  }
  for (const name of ["uri", "uris"]) {
    const value = url.searchParams.get(name);
    if (value && !value.split(",").every((x) => uriPattern.test(x)))
      throw error("Invalid Spotify item.");
  }
  if (
    body !== undefined &&
    (!body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      JSON.stringify(body).length > 24000)
  )
    throw error("Invalid Spotify action data.");
  if (
    body?.uris &&
    (!Array.isArray(body.uris) ||
      !body.uris.length ||
      body.uris.length > 100 ||
      !body.uris.every((x) => uriPattern.test(x)))
  )
    throw error("Invalid Spotify items.");
  if (
    p === "/me/playlists" &&
    method === "POST" &&
    (typeof body?.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 100)
  )
    throw error("A playlist name of 1–100 characters is required.");
  return {
    path: url.pathname + url.search,
    method,
    body,
    expects:
      method === "GET" || (p === "/me/playlists" && method === "POST")
        ? "json"
        : "none",
  };
}
export function createHandler({ fetcher = globalThis.fetch } = {}) {
  const refreshing = new Map(),
    consumedStates = new Map();
  async function tokenRequest(body) {
    let response;
    try {
      response = await fetcher("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw error(
        "Cannot reach Spotify. Check your connection and retry.",
        502,
      );
    }
    if (!response.ok)
      throw error(
        response.status === 400 || response.status === 401
          ? "Spotify session expired. Please connect again."
          : "Spotify login is temporarily unavailable. Please retry.",
        response.status === 400 || response.status === 401 ? 401 : 502,
      );
    let data;
    try {
      data = await response.json();
    } catch {
      throw error("Spotify returned invalid login data. Please retry.", 502);
    }
    if (!data?.access_token || !Number.isFinite(data.expires_in))
      throw error("Spotify returned invalid login data. Please retry.", 502);
    return data;
  }
  async function access(session, force = false) {
    if (!force && session.expires_at > Date.now() + 60000) return session;
    const identity = session.refresh_token;
    if (!identity) throw error("Connect to Spotify again.", 401);
    if (!refreshing.has(identity)) {
      const task = tokenRequest({
        grant_type: "refresh_token",
        refresh_token: identity,
        client_id: session.clientId,
      }).then((t) => ({
        ...session,
        ...t,
        refresh_token: t.refresh_token || identity,
        expires_at: Date.now() + t.expires_in * 1000,
      }));
      refreshing.set(identity, task);
      // A brief grace period also handles requests carrying the old cookie while
      // the refreshed Set-Cookie is still travelling back to the phone.
      task
        .finally(() => setTimeout(() => refreshing.delete(identity), 5000))
        .catch(() => {});
    }
    return refreshing.get(identity);
  }
  return async function handle(request, env = {}) {
    const url = new URL(request.url),
      origin = url.origin,
      cookies = getCookies(request);
    let clearSession = false;
    try {
      if (request.method === "POST" && request.headers.get("Origin") !== origin)
        throw error("This action must come from Loopie.", 403);
      if (
        request.method === "POST" &&
        !(request.headers.get("Content-Type") || "").startsWith(
          "application/json",
        )
      )
        throw error("JSON action data is required.");
      let session;
      const readSession = async () => {
        try {
          const session = await unseal(
            cookies.daisy_session,
            env.SESSION_SECRET,
            origin,
            "session",
          );
          const active = await unseal(
            cookies.daisy_active,
            env.SESSION_SECRET,
            origin,
            "active",
          );
          return session.sid && active.sid === session.sid ? session : null;
        } catch {
          return null;
        }
      };
      if (url.pathname === "/api/auth/status" && request.method === "GET") {
        session = await readSession();
        return json({
          connected: !!session,
          redirectUri: origin + "/auth/spotify/callback",
        });
      }
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        const { clientId } = await request.json();
        if (!/^[a-f0-9]{32}$/i.test(clientId || ""))
          throw error(
            "Enter your 32-character Spotify Client ID, not a client secret.",
          );
        const state = random(),
          verifier = random();
        const challenge = b64(
          await crypto.subtle.digest("SHA-256", encoder.encode(verifier)),
        );
        const auth = new URL("https://accounts.spotify.com/authorize");
        auth.search = new URLSearchParams({
          client_id: clientId,
          response_type: "code",
          redirect_uri: origin + "/auth/spotify/callback",
          code_challenge_method: "S256",
          code_challenge: challenge,
          state,
          scope: SCOPES,
        }).toString();
        const pending = await seal(
          { clientId, verifier, state, exp: Date.now() + 600000 },
          env.SESSION_SECRET,
          origin,
          "pending",
        );
        return json({ url: auth.href }, 200, {
          "Set-Cookie": cookie("daisy_pending", pending, origin, 600),
        });
      }
      if (
        url.pathname === "/auth/spotify/callback" &&
        request.method === "GET"
      ) {
        let pending;
        try {
          pending = await unseal(
            cookies.daisy_pending,
            env.SESSION_SECRET,
            origin,
            "pending",
          );
        } catch {
          throw error("Login expired. Return to the app and connect again.");
        }
        for (const [state, expires] of consumedStates)
          if (expires < Date.now()) consumedStates.delete(state);
        if (
          url.searchParams.get("state") !== pending.state ||
          consumedStates.has(pending.state)
        )
          throw error("Login state mismatch. Return to the app and retry.");
        consumedStates.set(pending.state, pending.exp);
        if (url.searchParams.get("error"))
          throw error(
            "Spotify login was declined. Return to the app to retry.",
          );
        const code = url.searchParams.get("code");
        if (!code) throw error("Spotify login code was missing.");
        const data = await tokenRequest({
          grant_type: "authorization_code",
          client_id: pending.clientId,
          code,
          redirect_uri: origin + "/auth/spotify/callback",
          code_verifier: pending.verifier,
        });
        const sid = random(),
          exp = Date.now() + lifetime * 1000;
        const encrypted = await seal(
          {
            ...data,
            clientId: pending.clientId,
            sid,
            expires_at: Date.now() + data.expires_in * 1000,
            exp,
          },
          env.SESSION_SECRET,
          origin,
          "session",
        );
        const headers = new Headers({
          Location: "/",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        });
        headers.append(
          "Set-Cookie",
          cookie("daisy_session", encrypted, origin),
        );
        // Only a fresh OAuth callback can mint the active marker. A delayed
        // refresh must not be able to undo logout by restoring a cookie.
        headers.append(
          "Set-Cookie",
          cookie(
            "daisy_active",
            await seal({ sid, exp }, env.SESSION_SECRET, origin, "active"),
            origin,
          ),
        );
        headers.append("Set-Cookie", cookie("daisy_pending", "", origin, 0));
        return new Response(null, { status: 303, headers });
      }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        const headers = new Headers({
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        });
        headers.append("Set-Cookie", cookie("daisy_session", "", origin, 0));
        headers.append("Set-Cookie", cookie("daisy_active", "", origin, 0));
        headers.append("Set-Cookie", cookie("daisy_pending", "", origin, 0));
        return new Response('{"ok":true}', { headers });
      }
      if (url.pathname === "/api/spotify" && request.method === "POST") {
        session = await readSession();
        if (!session) throw error("Connect Spotify to continue.", 401);
        const operation = validateOperation(await request.json());
        let current = await access(session);
        const send = () =>
          fetcher("https://api.spotify.com/v1" + operation.path, {
            method: operation.method,
            headers: {
              Authorization: "Bearer " + current.access_token,
              ...(operation.body ? { "Content-Type": "application/json" } : {}),
            },
            ...(operation.body ? { body: JSON.stringify(operation.body) } : {}),
            signal: AbortSignal.timeout(15000),
          });
        let response;
        try {
          response = await send();
        } catch {
          throw error(
            "Cannot reach Spotify. Check your connection and retry.",
            502,
          );
        }
        if (response.status === 401) {
          current = await access(current, true);
          response = await send();
        }
        if (response.status === 429)
          throw error(
            "Spotify is taking a short break. Please wait before retrying.",
            429,
            Math.max(1, Number(response.headers.get("Retry-After")) || 5),
          );
        if (response.status === 401)
          throw error("Spotify session expired. Please connect again.", 401);
        if (response.status === 404)
          throw error(
            "No active Spotify device or this item is unavailable. Open Spotify, start a song and refresh devices.",
            404,
          );
        if (response.status === 403)
          throw error(
            operation.path.startsWith("/playlists/") &&
              operation.method === "GET"
              ? "Spotify limits playlist tracks to playlists you own or collaborate on. Open this playlist in Spotify."
              : "Spotify denied this action. Check Premium, app access, permissions and device restrictions.",
            403,
          );
        if (!response.ok)
          throw error(
            `Spotify could not complete this action (${response.status}). Please retry.`,
            response.status,
          );
        let data = null;
        if (operation.expects === "json" && response.status !== 204) {
          try {
            data = await response.json();
          } catch {
            throw error(
              "Spotify returned invalid music data. Please retry.",
              502,
            );
          }
        }
        const headers = {};
        if (current !== session)
          headers["Set-Cookie"] = cookie(
            "daisy_session",
            await seal(current, env.SESSION_SECRET, origin, "session"),
            origin,
          );
        return json({ data }, 200, headers);
      }
      throw error("Not found.", 404);
    } catch (cause) {
      clearSession = cause.status === 401;
      return json(
        {
          error: cause.status
            ? cause.message
            : "Could not complete the request. Please retry.",
          ...(cause.retryAfter ? { retryAfter: cause.retryAfter } : {}),
        },
        cause.status || 500,
        clearSession
          ? { "Set-Cookie": cookie("daisy_session", "", origin, 0) }
          : {},
      );
    }
  };
}
