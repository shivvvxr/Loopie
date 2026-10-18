import { createHandler } from "./app.mjs";
import { assets } from "../.generated/assets.mjs";
const api = createHandler();
const security = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://*.scdn.co https://*.spotifycdn.com https://*.spotifycdn.net data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
};
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
      const response = await api(request, env);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(security))
        headers.set(key, value);
      return new Response(response.body, { status: response.status, headers });
    }
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405 });
    const asset = assets[url.pathname === "/" ? "/index.html" : url.pathname];
    if (!asset)
      return new Response("Not found", { status: 404, headers: security });
    return new Response(
      request.method === "HEAD"
        ? null
        : Uint8Array.from(atob(asset[0]), (c) => c.charCodeAt(0)),
      {
        headers: {
          ...security,
          "Content-Type": asset[1],
          "Cache-Control": url.pathname.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : url.pathname === "/sw.js"
              ? "no-cache"
              : "public, max-age=0, must-revalidate",
          ...(url.pathname === "/sw.js"
            ? { "Service-Worker-Allowed": "/" }
            : {}),
        },
      },
    );
  },
};
