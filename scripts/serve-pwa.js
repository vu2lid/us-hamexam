#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "../dist/pwa");
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

http.createServer((request, response) => {
  var relative;
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  } catch (error) {
    response.writeHead(400).end("Bad request");
    return;
  }
  const file = path.resolve(ROOT, relative);

  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
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
  console.log(`PWA test server listening on http://127.0.0.1:${PORT}`);
});
