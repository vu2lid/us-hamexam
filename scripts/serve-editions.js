#!/usr/bin/env node
"use strict";

// Stage 8A2 test server: serves the US PWA build and the synthetic edition's
// PWA build under two different PATHS on the SAME origin
// (http://127.0.0.1:PORT/), so Playwright can prove same-origin isolation
// (storage keys, cache names/prefixes, service-worker scope) rather than
// relying on browsers' origin partitioning to do that work for it. Reuses
// scripts/serve-pwa.js's exact file-serving logic, parameterized over a
// path-prefix -> root-directory mapping instead of one hardcoded root.
//
// Mounts:
//   /                    -> dist/pwa            (the US edition, unchanged)
//   /editions/synthetic/ -> dist-editions/synthetic/pwa

const fs = require("fs");
const http = require("http");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 4174);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

// Longest-prefix-matching mount table, most specific first -- mirrors how a
// real static host would route these two paths; order doesn't actually
// matter here since the two prefixes never overlap, but sorting by length
// keeps this correct if a future edition's mount path were ever a prefix of
// another's.
const MOUNTS = [
  { prefix: "/editions/synthetic/", root: path.join(REPO_ROOT, "dist-editions/synthetic/pwa") },
  { prefix: "/", root: path.join(REPO_ROOT, "dist/pwa") }
].sort((a, b) => b.prefix.length - a.prefix.length);

http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  } catch (error) {
    response.writeHead(400).end("Bad request");
    return;
  }

  const mount = MOUNTS.find((m) => pathname.startsWith(m.prefix));
  if (!mount) {
    response.writeHead(404).end("Not found");
    return;
  }
  const relative = pathname.slice(mount.prefix.length) || "index.html";
  const root = mount.root;
  const file = path.resolve(root, relative);

  if (file !== root && !file.startsWith(root + path.sep)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": path.basename(file) === "sw.js" ? "no-cache" : "public, max-age=300",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    });
    fs.createReadStream(file).pipe(response);
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Editions test server listening on http://127.0.0.1:${PORT}`);
  console.log(`  /                    -> dist/pwa`);
  console.log(`  /editions/synthetic/ -> dist-editions/synthetic/pwa`);
});
