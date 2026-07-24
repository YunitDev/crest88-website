#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const portArgument = process.argv.indexOf("--port");
const requestedPort =
  portArgument >= 0 ? process.argv[portArgument + 1] : process.env.PORT || "4173";
const port = Number.parseInt(requestedPort, 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error(`Invalid port: ${requestedPort}`);
  process.exit(1);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
]);
const privateRootEntries = new Set([
  ".git",
  ".github",
  ".gitignore",
  "CLAUDE.md",
  "README.md",
  "node_modules",
  "package-lock.json",
  "package.json",
  "scripts",
  "tests",
]);

async function fileForRequest(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  } catch {
    return null;
  }
  const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (privateRootEntries.has(requestedPath.split("/")[0])) return null;
  let absolutePath = path.resolve(root, requestedPath);

  const relativePath = path.relative(root, absolutePath);
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`)) return null;

  try {
    const details = await stat(absolutePath);
    if (details.isDirectory()) absolutePath = path.join(absolutePath, "index.html");
  } catch {
    if (!path.extname(absolutePath)) absolutePath = `${absolutePath}.html`;
  }

  try {
    await access(absolutePath);
    return (await stat(absolutePath)).isFile() ? absolutePath : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, {
      allow: "GET, HEAD",
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("Method not allowed\n");
    return;
  }

  const absolutePath = await fileForRequest(request.url || "/");
  if (!absolutePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": contentTypes.get(path.extname(absolutePath).toLowerCase()) || "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(absolutePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Crest88 site: http://localhost:${port}`);
});
