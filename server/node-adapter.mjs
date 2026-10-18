/** Adapt a Web Request handler to Vercel's Node.js request/response interface. */
export function createNodeHandler(worker, getEnv = () => process.env) {
  return async function handler(req, res) {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) value.forEach(v => headers.append(key, v));
        else if (value !== undefined) headers.set(key, value);
      }
      // Vercel terminates HTTPS. Local Node tests pass their explicit protocol.
      const protocol = headers.get("x-forwarded-proto") === "http" ? "http" : "https";
      const host = headers.get("host");
      if (!host || !req.url?.startsWith("/") || req.url.startsWith("//")) {
        res.statusCode = 400;
        res.end("Invalid request");
        return;
      }
      const chunks = [];
      let size = 0;
      if (!["GET", "HEAD"].includes(req.method)) {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 65536) {
            res.statusCode = 413;
            res.end("Request too large");
            return;
          }
          chunks.push(chunk);
        }
      }
      const request = new Request(`${protocol}://${host}${req.url}`, {
        method: req.method,
        headers,
        ...(!["GET", "HEAD"].includes(req.method) ? { body: Buffer.concat(chunks) } : {}),
      });
      const response = await worker.fetch(request, getEnv(), {});
      res.statusCode = response.status;
      for (const [key, value] of response.headers)
        if (key !== "set-cookie") res.setHeader(key, value);
      // Keep OAuth's multiple cookies separate, including on the 302 callback.
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader("Set-Cookie", cookies);
      res.end(req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 500;
      res.setHeader("Cache-Control", "no-store");
      res.end("Loopie could not complete this request.");
    }
  };
}
