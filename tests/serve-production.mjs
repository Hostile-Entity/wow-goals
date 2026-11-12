// Test-only static server: serves the exact dist bytes, with an in-memory worker
// version switch so update behavior can be tested without editing app files.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve("dist");
let workerVersion = 31;
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ogg": "audio/ogg",
  ".webmanifest": "application/manifest+json",
};
createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (request.method === "POST" && url.pathname === "/__test/update") {
    workerVersion += 1;
    response.end(String(workerVersion));
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/reset") {
    workerVersion = 31;
    response.end("ok");
    return;
  }
  const relative = decodeURIComponent(url.pathname).replace(
    /^\/wow-goals\//,
    "",
  );
  const file = resolve(root, relative || "index.html");
  if (!file.startsWith(root + "/") || !url.pathname.startsWith("/wow-goals/")) {
    response.writeHead(404);
    response.end();
    return;
  }
  try {
    let bytes = await readFile(file);
    if (relative === "sw.js")
      bytes = Buffer.from(
        bytes
          .toString()
          .replace("wow-goals-v31", `wow-goals-v${workerVersion}`),
      );
    response.setHeader(
      "Content-Type",
      mime[extname(file)] ?? "application/octet-stream",
    );
    response.setHeader("Cache-Control", "no-store");
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
}).listen(4173, "127.0.0.1");
