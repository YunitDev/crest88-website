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
