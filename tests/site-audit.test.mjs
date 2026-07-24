import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
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
