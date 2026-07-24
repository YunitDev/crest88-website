import { spawnSync } from "node:child_process";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);
const CLASSIC_SCRIPT_TYPES = new Set([
  "",
  "application/ecmascript",
  "application/javascript",
  "text/ecmascript",
  "text/javascript",
]);
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function finding(file, code, message, reference) {
  return { file, code, message, ...(reference ? { reference } : {}) };
}

function parseAttributes(tag) {
  const attributes = new Map();
  const attributePattern =
    /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of tag.matchAll(attributePattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }

  return attributes;
}

function stripMarkup(value) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function markupWithoutInlineCode(html) {
  return stripHtmlComments(html).replace(
    /<(script|style)\b([^>]*)>[\s\S]*?<\/\1>/gi,
    (_block, element, attributes) => `<${element}${attributes}></${element}>`,
  );
}

function hasAccessibleName(attributes, contents = "") {
  return Boolean(
    attributes.get("aria-label") ||
      attributes.get("aria-labelledby") ||
      attributes.get("title") ||
      stripMarkup(contents),
  );
}

function metadataMap(html) {
  const metadata = new Map();

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const key = attributes.get("name") || attributes.get("property");
    if (key) metadata.set(key.toLowerCase(), attributes.get("content") || "");
    if (attributes.has("charset")) metadata.set("charset", attributes.get("charset") || "");
  }

  return metadata;
}

function linkRelations(html) {
  const relations = new Map();

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    for (const relation of (attributes.get("rel") || "").toLowerCase().split(/\s+/)) {
      if (relation) relations.set(relation, attributes.get("href") || "");
    }
  }

  return relations;
}

function idsIn(html) {
  const ids = [];

  for (const match of html.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    ids.push(match[1] ?? match[2]);
  }

  return ids;
}

function isExternalReference(reference) {
  return (
    reference.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(reference) ||
    reference.startsWith("data:")
  );
}

function referencesInHtml(html) {
  const references = [];
  const tagPattern = /<(a|img|link|script|source|video)\b[^>]*>/gi;

  for (const match of html.matchAll(tagPattern)) {
    const tagName = match[1].toLowerCase();
    const attributes = parseAttributes(match[0]);
    const attributeNames =
      tagName === "a" || tagName === "link"
        ? ["href"]
        : tagName === "video"
          ? ["src", "poster"]
          : ["src"];

    for (const attributeName of attributeNames) {
      const reference = attributes.get(attributeName);
      if (reference) references.push(reference);
    }

    const srcset = attributes.get("srcset");
    if (srcset) {
      for (const candidate of srcset.split(",")) {
        const reference = candidate.trim().split(/\s+/)[0];
        if (reference) references.push(reference);
      }
    }
  }

  return references;
}

function referencesInCss(css) {
  const references = [];
  for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]+))\s*\)/gi)) {
    const reference = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (reference) references.push(reference);
  }
  return references;
}

function stripCommentsAndStrings(source) {
  let output = "";
  let quote = "";
  let inComment = false;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        output += "  ";
        index += 1;
      } else {
        output += character === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      output += character === "\n" ? "\n" : " ";
      continue;
    }

    if (character === "/" && next === "*") {
      inComment = true;
      output += "  ";
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
      output += " ";
    } else {
      output += character;
    }
  }

  return output;
}

function delimiterError(source, pairs) {
  const cleaned = stripCommentsAndStrings(source);
  const openers = new Set(Object.keys(pairs));
  const closers = new Map(Object.entries(pairs).map(([open, close]) => [close, open]));
  const stack = [];

  for (const character of cleaned) {
    if (openers.has(character)) {
      stack.push(character);
    } else if (closers.has(character)) {
      if (stack.pop() !== closers.get(character)) return `Unexpected "${character}"`;
    }
  }

  return stack.length > 0 ? `Unclosed "${stack.at(-1)}"` : "";
}

function htmlTagError(html) {
  const stack = [];
  const markup = markupWithoutInlineCode(html);

  for (const match of markup.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/gi)) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    if (fullTag.startsWith("</")) {
      const opener = stack.pop();
      if (opener !== tagName) {
        return `Closing </${tagName}> does not match ${opener ? `<${opener}>` : "an opening tag"}.`;
      }
    } else if (!VOID_ELEMENTS.has(tagName) && !/\/>$/.test(fullTag)) {
      stack.push(tagName);
    }
  }

  return stack.length > 0 ? `Opening <${stack.at(-1)}> is not closed.` : "";
}

async function listFiles(root) {
  const files = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  }

  await visit(root);
  return files;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveSiteTarget(root, sourceFile, reference) {
  const sourcePath = path.relative(root, sourceFile).split(path.sep).join("/");
  const baseUrl = new URL(sourcePath, "https://crest88.test/");
  let referenceUrl;
  try {
    referenceUrl = new URL(reference, baseUrl);
  } catch {
    return { exists: false };
  }

  if (referenceUrl.origin !== baseUrl.origin) {
    return { exists: false };
  }

  let pathReference;
  let fragment;
  try {
    pathReference = decodeURIComponent(referenceUrl.pathname);
    fragment = decodeURIComponent(referenceUrl.hash.slice(1));
  } catch {
    return { exists: false };
  }

  let target = path.join(root, pathReference.replace(/^\/+/, ""));
  if (await exists(target)) {
    const targetStats = await stat(target);
    if (targetStats.isDirectory()) target = path.join(target, "index.html");
  } else if (!path.extname(target) && (await exists(`${target}.html`))) {
    target = `${target}.html`;
  }

  if (!(await exists(target))) return { exists: false };
  if (!fragment || path.extname(target).toLowerCase() !== ".html") return { exists: true };

  const targetHtml = markupWithoutInlineCode(await readFile(target, "utf8"));
  return { exists: true, fragmentExists: new Set(idsIn(targetHtml)).has(fragment) };
}

function auditHtmlStructure(relativeFile, html) {
  const findings = [];
  const uncommentedHtml = stripHtmlComments(html);
  const markup = markupWithoutInlineCode(uncommentedHtml);
  const metadata = metadataMap(markup);
  const relations = linkRelations(markup);
  const title = markup.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const requiredMetadata = ["charset", "viewport", "description"];

  if (!/^\s*<!doctype html>/i.test(uncommentedHtml)) {
    findings.push(finding(relativeFile, "invalid-html", "Document must start with an HTML doctype."));
  }
  const tagError = htmlTagError(html);
  if (tagError) findings.push(finding(relativeFile, "invalid-html", tagError));
  for (const element of ["html", "head", "body"]) {
    if (!new RegExp(`<${element}\\b`, "i").test(markup)) {
      findings.push(
        finding(relativeFile, "invalid-html", `Document is missing its <${element}> element.`),
      );
    }
  }
  if (!title || !stripMarkup(title)) {
    findings.push(finding(relativeFile, "missing-metadata", "Document needs a title.", "title"));
  }
  for (const name of requiredMetadata) {
    if (!metadata.get(name)) {
      findings.push(
        finding(relativeFile, "missing-metadata", `Document needs ${name} metadata.`, name),
      );
    }
  }
  if (!relations.get("icon")) {
    findings.push(
      finding(relativeFile, "missing-metadata", "Document needs an icon link.", "icon"),
    );
  }

  if (relativeFile === "index.html") {
    const homepageMetadata = [
      ["og:title", metadata.get("og:title")],
      ["og:description", metadata.get("og:description")],
      ["og:image", metadata.get("og:image")],
      ["twitter:card", metadata.get("twitter:card")],
      ["canonical", relations.get("canonical")],
    ];
    for (const [name, value] of homepageMetadata) {
      if (!value) {
        findings.push(
          finding(relativeFile, "missing-metadata", `Homepage needs ${name} metadata.`, name),
        );
      }
    }
  }

  const htmlTag = markup.match(/<html\b[^>]*>/i)?.[0] || "";
  if (!parseAttributes(htmlTag).get("lang")) {
    findings.push(
      finding(relativeFile, "accessibility", "The <html> element needs a language.", "lang"),
    );
  }
  if (!/<main\b/i.test(markup)) {
    findings.push(finding(relativeFile, "accessibility", "Document needs a <main> landmark."));
  }

  const seenIds = new Set();
  for (const id of idsIn(markup)) {
    if (seenIds.has(id)) {
      findings.push(finding(relativeFile, "duplicate-id", `Duplicate id "${id}".`, id));
    }
    seenIds.add(id);
  }

  for (const match of markup.matchAll(/<img\b[^>]*>/gi)) {
    if (!parseAttributes(match[0]).has("alt")) {
      findings.push(
        finding(relativeFile, "accessibility", "Every image needs an alt attribute.", "img"),
      );
    }
  }

  for (const match of markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    if (!hasAccessibleName(parseAttributes(match[0]), match[2])) {
      findings.push(
        finding(relativeFile, "accessibility", "Every button needs an accessible name.", "button"),
      );
    }
  }

  const labels = new Set();
  for (const match of markup.matchAll(/<label\b[^>]*>/gi)) {
    const labelFor = parseAttributes(match[0]).get("for");
    if (labelFor) labels.add(labelFor);
  }
  for (const match of markup.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    if ((attributes.get("type") || "").toLowerCase() === "hidden") continue;
    const id = attributes.get("id");
    if (
      !attributes.get("aria-label") &&
      !attributes.get("aria-labelledby") &&
      !attributes.get("title") &&
      !(id && labels.has(id))
    ) {
      findings.push(
        finding(
          relativeFile,
          "accessibility",
          `Every ${match[1].toLowerCase()} needs an associated label.`,
          id || match[1].toLowerCase(),
        ),
      );
    }
  }

  for (const match of markup.matchAll(/<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gi)) {
    const rel = (parseAttributes(match[0]).get("rel") || "").toLowerCase().split(/\s+/);
    if (!rel.includes("noopener")) {
      findings.push(
        finding(
          relativeFile,
          "unsafe-external-link",
          'Links with target="_blank" must include rel="noopener".',
        ),
      );
    }
  }

  const styleBlocks = [
    ...uncommentedHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi),
  ];
  for (const [index, match] of styleBlocks.entries()) {
    const error = delimiterError(match[1], { "{": "}", "(": ")", "[": "]" });
    if (error) {
      findings.push(
        finding(relativeFile, "invalid-css", `${error} in inline style block ${index + 1}.`),
      );
    }
  }

  const scriptBlocks = [
    ...uncommentedHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
  ];
  for (const [index, match] of scriptBlocks.entries()) {
    const attributes = parseAttributes(`<script ${match[1]}>`);
    if (attributes.get("src")) continue;
    const scriptType = (attributes.get("type") || "")
      .trim()
      .toLowerCase()
      .split(";", 1)[0];
    const scriptLabel = `Inline script ${index + 1}`;

    if (scriptType === "module") {
      const result = spawnSync(process.execPath, ["--check", "--input-type=module"], {
        encoding: "utf8",
        input: match[2],
      });
      if (result.status !== 0) {
        findings.push(
          finding(
            relativeFile,
            "invalid-javascript",
            `${scriptLabel} does not parse: ${(result.stderr || result.stdout).trim()}`,
          ),
        );
      }
      continue;
    }

    if (!CLASSIC_SCRIPT_TYPES.has(scriptType)) continue;

    try {
      new vm.Script(match[2], { filename: `${relativeFile}:script-${index + 1}` });
    } catch (error) {
      findings.push(
        finding(
          relativeFile,
          "invalid-javascript",
          `${scriptLabel} does not parse: ${error.message}`,
        ),
      );
    }
  }

  return findings;
}

export async function auditSite(root = process.cwd()) {
  const absoluteRoot = path.resolve(root);
  const files = await listFiles(absoluteRoot);
  const findings = [];

  for (const absoluteFile of files) {
    const relativeFile = path.relative(absoluteRoot, absoluteFile);
    const extension = path.extname(absoluteFile).toLowerCase();

    if (extension === ".html") {
      const html = await readFile(absoluteFile, "utf8");
      findings.push(...auditHtmlStructure(relativeFile, html));

      for (const reference of referencesInHtml(markupWithoutInlineCode(html))) {
        if (isExternalReference(reference)) continue;
        const target = await resolveSiteTarget(absoluteRoot, absoluteFile, reference);
        if (!target.exists) {
          findings.push(
            finding(
              relativeFile,
              "broken-internal-link",
              `Internal reference "${reference}" does not resolve.`,
              reference,
            ),
          );
        } else if (target.fragmentExists === false) {
          findings.push(
            finding(
              relativeFile,
              "broken-fragment",
              `Fragment in "${reference}" does not match an id.`,
              reference,
            ),
          );
        }
      }
    }

    if (extension === ".css") {
      const css = await readFile(absoluteFile, "utf8");
      const error = delimiterError(css, { "{": "}", "(": ")", "[": "]" });
      if (error) findings.push(finding(relativeFile, "invalid-css", `${error} in stylesheet.`));

      for (const reference of referencesInCss(css)) {
        if (isExternalReference(reference) || reference.startsWith("#")) continue;
        const target = await resolveSiteTarget(absoluteRoot, absoluteFile, reference);
        if (!target.exists) {
          findings.push(
            finding(
              relativeFile,
              "broken-internal-link",
              `Stylesheet reference "${reference}" does not resolve.`,
              reference,
            ),
          );
        }
      }
    }

    if ([".js", ".mjs", ".cjs"].includes(extension)) {
      const result = spawnSync(process.execPath, ["--check", absoluteFile], {
        encoding: "utf8",
      });
      if (result.status !== 0) {
        findings.push(
          finding(
            relativeFile,
            "invalid-javascript",
            `JavaScript does not parse: ${(result.stderr || result.stdout).trim()}`,
          ),
        );
      }
    }
  }

  return findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message),
  );
}
