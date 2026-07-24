import assert from "node:assert/strict";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { auditSite } from "../scripts/lib/site-audit.mjs";

const VALID_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="A useful description.">
    <link rel="canonical" href="https://crest88.com/">
    <link rel="icon" href="favicon.svg">
    <meta property="og:title" content="Crest88">
    <meta property="og:description" content="A useful description.">
    <meta property="og:image" content="https://crest88.com/og.png">
    <meta name="twitter:card" content="summary_large_image">
    <title>Crest88</title>
  </head>
  <body>
    <main id="content"><a href="privacy.html">Privacy</a></main>
  </body>
</html>`;

async function makeSite(indexHtml = VALID_PAGE) {
  const root = await mkdtemp(path.join(tmpdir(), "crest88-site-audit-"));
  await Promise.all([
    writeFile(path.join(root, "index.html"), indexHtml),
    writeFile(
      path.join(root, "privacy.html"),
      VALID_PAGE.replace("<title>Crest88</title>", "<title>Privacy · Crest88</title>"),
    ),
    writeFile(path.join(root, "favicon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"),
    writeFile(path.join(root, "og.png"), ""),
  ]);
  return root;
}

test("accepts a valid static site", async () => {
  const root = await makeSite();
  assert.deepEqual(await auditSite(root), []);
});

test("reports a broken internal link", async () => {
  const root = await makeSite(VALID_PAGE.replace("privacy.html", "missing.html"));
  const findings = await auditSite(root);

  assert.ok(
    findings.some(
      (finding) =>
        finding.code === "broken-internal-link" && finding.reference === "missing.html",
    ),
  );
});

test("reports missing required metadata", async () => {
  const root = await makeSite(
    VALID_PAGE.replace('    <meta name="description" content="A useful description.">\n', ""),
  );
  const findings = await auditSite(root);

  assert.ok(
    findings.some(
      (finding) =>
        finding.code === "missing-metadata" && finding.reference === "description",
    ),
  );
});

test("validates fragments after a query string", async () => {
  const validRoot = await makeSite(
    VALID_PAGE.replace("privacy.html", "privacy.html?source=footer#content"),
  );
  assert.deepEqual(await auditSite(validRoot), []);

  const invalidReference = "privacy.html?source=footer#missing-section";
  const invalidRoot = await makeSite(VALID_PAGE.replace("privacy.html", invalidReference));
  const findings = await auditSite(invalidRoot);

  assert.ok(
    findings.some(
      (finding) =>
        finding.code === "broken-fragment" && finding.reference === invalidReference,
    ),
  );
});

test("rejects encoded paths that traverse outside the site root", async () => {
  const root = await makeSite();
  const outsideFile = path.join(
    path.dirname(root),
    `${path.basename(root)}-outside.txt`,
  );
  await writeFile(outsideFile, "This sibling must never be accepted as a site asset.");
  const encodedTraversal = `/%2e%2e%2f${path.basename(outsideFile)}`;
  await writeFile(
    path.join(root, "index.html"),
    VALID_PAGE.replace("privacy.html", encodedTraversal),
  );

  const findings = await auditSite(root);
  assert.ok(
    findings.some(
      (finding) =>
        finding.code === "broken-internal-link" &&
        finding.reference === encodedTraversal,
    ),
  );
});

test("rejects symlinks that resolve outside the site root", async () => {
  const root = await makeSite();
  const outsideFile = path.join(
    path.dirname(root),
    `${path.basename(root)}-symlink-target.txt`,
  );
  await writeFile(outsideFile, "This external target must not join the public site.");
  await symlink(outsideFile, path.join(root, "external-link.txt"));
  await writeFile(
    path.join(root, "index.html"),
    VALID_PAGE.replace("privacy.html", "external-link.txt"),
  );

  const findings = await auditSite(root);
  assert.ok(
    findings.some(
      (finding) =>
        finding.code === "broken-internal-link" &&
        finding.reference === "external-link.txt",
    ),
  );
});

test("accepts symlinks that remain inside the site root", async () => {
  const root = await makeSite();
  await writeFile(path.join(root, "real-asset.txt"), "A public in-root asset.");
  await symlink(
    path.join(root, "real-asset.txt"),
    path.join(root, "linked-asset.txt"),
  );
  await writeFile(
    path.join(root, "index.html"),
    VALID_PAGE.replace("privacy.html", "linked-asset.txt"),
  );

  assert.deepEqual(await auditSite(root), []);
});

test("ignores markup-like content inside HTML comments", async () => {
  const commentedNoise = `<!--
    <a href="missing-from-comment.html">Not a real link</a>
    <img src="missing-from-comment.png">
    <div id="content"></div>
    <input id="commented-input">
    <script type="module">export const = 1;</script>
    <style>body {</style>
  -->`;
  const root = await makeSite(VALID_PAGE.replace("<body>", `<body>${commentedNoise}`));

  assert.deepEqual(await auditSite(root), []);
});

test("does not accept required metadata from an HTML comment", async () => {
  const root = await makeSite(
    VALID_PAGE.replace(
      '    <meta name="description" content="A useful description.">',
      '    <!-- <meta name="description" content="Commented descriptions do not count."> -->',
    ),
  );
  const findings = await auditSite(root);

  assert.ok(
    findings.some(
      (finding) =>
        finding.code === "missing-metadata" && finding.reference === "description",
    ),
  );
});

test("parses inline module scripts as ECMAScript modules", async () => {
  const validModule = `<script type="module">
    import value from "./module-that-is-resolved-by-the-browser.js";
    await Promise.resolve(value);
    export { value };
  </script>`;
  const root = await makeSite(VALID_PAGE.replace("</body>", `${validModule}</body>`));

  assert.ok(
    !(await auditSite(root)).some((finding) => finding.code === "invalid-javascript"),
  );
});

test("still reports invalid inline module syntax", async () => {
  const invalidModule = '<script type="module">export const = 1;</script>';
  const root = await makeSite(VALID_PAGE.replace("</body>", `${invalidModule}</body>`));

  assert.ok(
    (await auditSite(root)).some((finding) => finding.code === "invalid-javascript"),
  );
});

test("does not parse non-JavaScript data blocks as classic scripts", async () => {
  const structuredData =
    '<script type="application/ld+json">{"@context":"https://schema.org"}</script>';
  const root = await makeSite(VALID_PAGE.replace("</body>", `${structuredData}</body>`));

  assert.ok(
    !(await auditSite(root)).some((finding) => finding.code === "invalid-javascript"),
  );
});
