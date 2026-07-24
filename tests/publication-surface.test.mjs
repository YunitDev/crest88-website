import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
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
  const outsideDirectory = await mkdtemp(
    path.join(tmpdir(), "crest88-server-outside-"),
  );
  const outsideFile = path.join(outsideDirectory, "outside.txt");
  const linkedPath = path.join(root, `server-leak-${process.pid}.txt`);
  const privateAliasPath = path.join(root, "public-alias.json");
  const nodeModulesPath = path.join(root, "node_modules");
  const nodeModulesProbe = path.join(
    nodeModulesPath,
    `private-probe-${process.pid}.txt`,
  );
  let createdNodeModules = false;
  try {
    await stat(nodeModulesPath);
  } catch {
    await mkdir(nodeModulesPath);
    createdNodeModules = true;
  }
  await writeFile(outsideFile, "This file is outside the publishable site root.");
  await writeFile(nodeModulesProbe, "Repository-only dependency content.");
  await symlink(outsideFile, linkedPath);
  await symlink(path.join(root, "package.json"), privateAliasPath);

  const privateAliasProbes = [
    { entry: ".git", suffix: "" },
    { entry: ".github", suffix: "/workflows/site-checks.yml" },
    { entry: ".gitignore", suffix: "" },
    { entry: "_config.yml", suffix: "" },
    { entry: "CLAUDE.md", suffix: "" },
    { entry: "README.md", suffix: "" },
    { entry: "node_modules", suffix: `/${path.basename(nodeModulesProbe)}` },
    { entry: "package-lock.json", suffix: "" },
    { entry: "scripts", suffix: "/check-site.mjs" },
    { entry: "tests", suffix: "/site-audit.test.mjs" },
  ].map((probe, index) => ({
    ...probe,
    alias: `private-alias-${index}-${process.pid}`,
  }));
  for (const probe of privateAliasProbes) {
    await symlink(
      path.join(root, probe.entry),
      path.join(root, probe.alias),
    );
  }

  const child = spawn(process.execPath, ["scripts/serve.mjs", "--port", String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(async () => {
    child.kill("SIGTERM");
    await rm(linkedPath, { force: true });
    await rm(privateAliasPath, { force: true });
    await Promise.all(
      privateAliasProbes.map((probe) =>
        rm(path.join(root, probe.alias), { force: true, recursive: true }),
      ),
    );
    await rm(nodeModulesProbe, { force: true });
    if (createdNodeModules) {
      await rm(nodeModulesPath, { force: true, recursive: true });
    }
    await rm(outsideDirectory, { force: true, recursive: true });
  });
  await waitForServer(child);

  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  for (const pathname of [
    "/favicon.svg",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/crest88-mark.png",
    "/og.png",
  ]) {
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}${pathname}`)).status,
      200,
      `${pathname} should be publicly available`,
    );
  }
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
  assert.equal(
    (await fetch(`http://127.0.0.1:${port}/${path.basename(linkedPath)}`)).status,
    404,
    "a symlink must not expose a file outside the site root",
  );
  assert.equal(
    (await fetch(`http://127.0.0.1:${port}/public-alias.json`)).status,
    404,
    "a public symlink must not alias a private in-root file",
  );
  for (const probe of privateAliasProbes) {
    assert.equal(
      (
        await fetch(
          `http://127.0.0.1:${port}/${probe.alias}${probe.suffix}`,
        )
      ).status,
      404,
      `a public symlink must not alias private root entry ${probe.entry}`,
    );
  }
});

test("identity assets keep their approved formats and dimensions", async () => {
  function pngDimensions(buffer) {
    assert.equal(
      buffer.subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
      "asset must use the PNG signature",
    );
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  assert.deepEqual(
    pngDimensions(await readFile(path.join(root, "apple-touch-icon.png"))),
    { width: 180, height: 180 },
  );
  assert.deepEqual(
    pngDimensions(await readFile(path.join(root, "crest88-mark.png"))),
    { width: 88, height: 88 },
  );
  assert.deepEqual(
    pngDimensions(await readFile(path.join(root, "og.png"))),
    { width: 1200, height: 630 },
  );

  const favicon = await readFile(path.join(root, "favicon.ico"));
  assert.equal(favicon.readUInt16LE(0), 0, "ICO reserved field must be zero");
  assert.equal(favicon.readUInt16LE(2), 1, "ICO must identify as an icon");
  assert.equal(favicon.readUInt16LE(4), 3, "ICO must contain three sizes");
  const faviconSizes = Array.from({ length: 3 }, (_, index) => {
    const width = favicon[6 + index * 16];
    return width === 0 ? 256 : width;
  });
  assert.deepEqual(faviconSizes, [16, 32, 48]);

  const faviconSvg = await readFile(path.join(root, "favicon.svg"), "utf8");
  assert.match(faviconSvg, /viewBox="0 0 32 32"/);
  assert.match(faviconSvg, /prefers-color-scheme:\s*dark/);
  assert.doesNotMatch(faviconSvg, /<rect\b/, "favicon should remain transparent");
});
