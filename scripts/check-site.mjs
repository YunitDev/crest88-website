#!/usr/bin/env node

import { auditSite } from "./lib/site-audit.mjs";

const findings = await auditSite(process.cwd());

if (findings.length > 0) {
  console.error(`Static site checks found ${findings.length} issue${findings.length === 1 ? "" : "s"}:`);
  for (const item of findings) {
    console.error(`- ${item.file} [${item.code}] ${item.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("Static site checks passed.");
}
