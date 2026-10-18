import http from "node:http";
import { randomBytes } from "node:crypto";
import worker from "../dist/server/index.js";
const env = {
  SESSION_SECRET: process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
};
const port = Number(process.env.PORT) || 8788;
http
  .createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers,
        ...(["GET", "HEAD"].includes(req.method)
          ? {}
          : { body: Buffer.concat(chunks) }),
      });
      const response = await worker.fetch(request, env, {});
      res.statusCode = response.status;
      for (const [k, v] of response.headers)
        if (k !== "set-cookie") res.setHeader(k, v);
      if (response.headers.getSetCookie().length)
        res.setHeader("Set-Cookie", response.headers.getSetCookie());
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 500;
      res.end("Local server error");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Loopie: http://127.0.0.1:${port}`),
  );
