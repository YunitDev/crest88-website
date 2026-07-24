import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const requiredExclusions = [
  ".github",
  ".gitignore",
  "CLAUDE.md",
  "README.md",
  "node_modules",
  "package-lock.json",
  "package.json",
  "scripts",
  "tests",
];

function exclusionsFrom(config) {
  const exclusions = [];
  let inExcludeBlock = false;

  for (const line of config.split(/\r?\n/)) {
    if (/^exclude:\s*$/.test(line)) {
      inExcludeBlock = true;
      continue;
    }
    if (inExcludeBlock && /^\S/.test(line)) break;
    const match = inExcludeBlock ? line.match(/^\s+-\s+["']?([^"']+?)["']?\s*$/) : null;
    if (match) exclusions.push(match[1]);
  }

  return exclusions;
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Local server did not start.")), 5_000);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Local server exited before startup with code ${code}.`));
    });
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Crest88 site:")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

test("local preview exposes the same safe surface as GitHub Pages", async (context) => {
  const config = await readFile(path.join(root, "_config.yml"), "utf8");
  const configuredExclusions = exclusionsFrom(config);
  for (const entry of requiredExclusions) {
    assert.ok(configuredExclusions.includes(entry), `${entry} must be excluded from Pages`);
  }

  const port = 42_000 + (process.pid % 1_000);
  const child = spawn(process.execPath, ["scripts/serve.mjs", "--port", String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(() => child.kill("SIGTERM"));
  await waitForServer(child);

  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  for (const pathname of [
    "/.github/workflows/site-checks.yml",
    "/.gitignore",
    "/_config.yml",
    "/CLAUDE.md",
    "/README.md",
    "/node_modules/example.js",
    "/package-lock.json",
    "/package.json",
    "/scripts/check-site.mjs",
    "/tests/site-audit.test.mjs",
  ]) {
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}${pathname}`)).status,
      404,
      `${pathname} should not be public`,
    );
  }
});
