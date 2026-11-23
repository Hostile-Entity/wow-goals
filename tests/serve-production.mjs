// Test-only static server: serves the exact dist bytes, with an in-memory worker
// version switch so update behavior can be tested without editing app files.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(process.env.TEST_DIST ?? "dist");
let workerVersion;
let outage = false;
let corruptEntry = false;
let servedBytes = 0;
const indexPath = resolve(root, "index.html");
const integrity = (bytes) => `sha256-${createHash("sha256").update(bytes).digest("base64")}`;

async function syntheticRelease(version) {
  const html = await readFile(indexPath, "utf8");
  const entry = html.match(/src="\/wow-goals\/(assets\/[^"]+\.js)"/)?.[1];
  if (!entry) throw new Error("Missing production entry");
  const alias = entry.replace(/\.js$/, `-test${version}.js`);
  return {
    entry, alias,
    html: html.replace(entry, alias),
    js: Buffer.concat([await readFile(resolve(root, entry)), Buffer.from(`\n// synthetic release ${version}\n`)]),
  };
}
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
  if (request.method === "GET" && url.pathname === "/__test/bytes") {
    response.end(String(servedBytes));
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/synthetic") {
    workerVersion = 31;
    response.end("ok");
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/outage") {
    outage = true;
    response.end("ok");
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/update") {
    workerVersion = (workerVersion ?? 31) + 1;
    corruptEntry = url.searchParams.has("corrupt");
    response.end(String(workerVersion));
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/reset") {
    workerVersion = undefined;
    outage = false;
    corruptEntry = false;
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
  if (outage) {
    response.writeHead(503);
    response.end("Hosting temporarily unavailable");
    return;
  }
  try {
    let bytes;
    if (workerVersion !== undefined) {
      const version = workerVersion;
      const release = await syntheticRelease(version);
      if (!relative || relative === "index.html") bytes = release.html;
      else if (relative === release.alias) bytes = corruptEntry ? Buffer.from("mismatched deployed asset") : release.js;
      else if (relative === "sw.js") {
        const worker = await readFile(file, "utf8");
        bytes = worker.replace(/const RELEASE = "[^"]+";/, `const RELEASE = "v${version}";`)
          .replace(/const APP_VERSION = "[^"]+";/, "const APP_VERSION = null;")
          .replace(/const PRECACHE = (.+);/, (_, manifest) => {
            const assets = JSON.parse(manifest).map(([path, hash]) => {
              if (path === "index.html") return [path, integrity(release.html)];
              if (path === release.entry) return [release.alias, integrity(release.js)];
              return [path, hash];
            });
            return `const PRECACHE = ${JSON.stringify(assets)};`;
          });
      }
    }
    bytes ??= await readFile(file);
    response.setHeader(
      "Content-Type",
      mime[extname(file)] ?? "application/octet-stream",
    );
    response.setHeader("Cache-Control", "no-store");
    servedBytes += Buffer.byteLength(bytes);
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end();
  }
}).listen(Number(process.env.PORT ?? 4173), "127.0.0.1");
