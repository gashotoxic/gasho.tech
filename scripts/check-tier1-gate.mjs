#!/usr/bin/env node
/**
 * Failing-case guard for the Tier 1 code gate (spec §6 — data/projects.ts).
 *
 * Proves, against the REAL data module, that a project with any false tier1 flag can never
 * be presented as live. Three enforcement arms are exercised:
 *
 *   1. TYPE LEVEL   — a `status: "live"` entry with a false flag fails `tsc` (negative
 *                     fixture), while a valid live entry and a mixed-flag preview entry
 *                     compile clean. The checker is validated BOTH ways before it is
 *                     trusted: known-good must pass AND known-broken must fail.
 *   2. BUILD TIME   — `validateProjects()` (what `next build` runs at module load) throws
 *                     on violating entries: live-with-false-flag, incomplete tier1 map,
 *                     wrong flag type, invalid status, bad/duplicate slug, over-long
 *                     tagline, null entry.
 *   3. RENDER LEVEL — `isLiveProject()` / `effectiveStatus()` / `liveProjects()` deny a
 *                     violating entry even when it is force-injected into the data (the
 *                     cast/mutation path), and the draft-hiding rule still holds.
 *
 * Also asserts the wiring: every public-visibility surface (grid, detail route, static
 * params, sitemap, llms.txt) routes its status decision through the gate helpers, so no
 * consumer can re-introduce a raw `status` check that bypasses the gate.
 *
 * Run: node scripts/check-tier1-gate.mjs   (or: npm run check:tier1-gate)
 * Exit 0 = gate holds. Exit 1 = gate broken (each FAIL line names the regression).
 *
 * Portable: compiles data/projects.ts with the repo-local tsc (works on the Node 20 CI
 * runner as well as newer local Node), so it never depends on native TS imports.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tscBin = path.join(repoRoot, "node_modules", ".bin", "tsc");
const dataModuleTs = path.join(repoRoot, "data", "projects.ts");
const workDir = mkdtempSync(path.join(tmpdir(), "tier1-gate-"));

let passed = 0;
let failed = 0;
function check(ok, label) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}`);
  }
}

/** A complete, valid entry with every tier1 flag true (the known-good baseline). */
function makeEntry(overrides = {}) {
  const { tier1: tier1Overrides, ...rest } = overrides;
  return {
    slug: "gate-fixture",
    title: "Gate Fixture",
    tagline: "Fixture entry used by the Tier 1 gate guard.",
    problem: "Fixture problem.",
    workflow: "1. Do the thing.",
    agentArchitecture: { models: ["m"], tools: ["t"], memory: "mem", routing: "route" },
    liveUrl: "https://example.com",
    hosting: { provider: "Vercel", plan: "Hobby", region: "US", url: "https://example.com" },
    githubUrl: "https://example.com/repo",
    readmeUrl: "https://example.com/readme",
    demoVideoUrl: "https://example.com/demo.mp4",
    status: "live",
    tier1: {
      readme5min: true,
      demoVideo60s: true,
      publicGithub: true,
      promptsVersioned: true,
      modelCallsLogged: true,
      toolOutputsValidated: true,
      retriesWithBackoff: true,
      secretsStripped: true,
      humanApprovalOnMoneyEmailDelete: true,
      streamingResponses: true,
      repeatQueriesCached: true,
      budgetCap: true,
      ...tier1Overrides,
    },
    ...rest,
  };
}

function expectThrow(fn, pattern, label) {
  let threw = null;
  try {
    fn();
  } catch (err) {
    threw = err;
  }
  check(threw !== null && pattern.test(String(threw.message)), `${label}${threw ? ` — "${String(threw.message).slice(0, 90)}"` : " — did NOT throw"}`);
}

function runTsc(args) {
  try {
    const stdout = execFileSync(tscBin, args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.status === undefined ? 1 : err.status, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

try {
  // ── Compile the real data module (same source next build sees) ─────────────────────────
  mkdirSync(path.join(workDir, "emit"));
  const emit = runTsc([
    dataModuleTs,
    "--outDir", path.join(workDir, "emit"),
    "--target", "es2020",
    "--module", "commonjs",
    "--skipLibCheck",
  ]);
  if (emit.code !== 0) {
    console.error("FATAL: could not compile data/projects.ts — the module itself is broken:\n" + emit.output);
    process.exit(1);
  }
  const require = createRequire(import.meta.url);
  const gate = require(path.join(workDir, "emit", "projects.js"));
  const { projects, validateProjects, isLiveProject, isPublicProject, effectiveStatus, allTier1Pass, liveProjects, publicProjects, getProject } = gate;

  console.log("── 2. BUILD TIME: validateProjects() rejects violating entries ──");
  validateProjects(projects); // real data must pass
  check(true, "real data entries pass validateProjects()");
  expectThrow(() => validateProjects([makeEntry({ tier1: { publicGithub: false } })]), /live/, 'status "live" with one false tier1 flag throws');
  expectThrow(
    () => validateProjects([makeEntry({ tier1: { budgetCap: false, readme5min: true, demoVideo60s: true, publicGithub: true, promptsVersioned: true, modelCallsLogged: true, toolOutputsValidated: true, retriesWithBackoff: true, secretsStripped: true, humanApprovalOnMoneyEmailDelete: true, streamingResponses: true, repeatQueriesCached: true } })]),
    /live/,
    'status "live" with budgetCap false throws',
  );
  {
    const incomplete = makeEntry();
    delete incomplete.tier1.budgetCap;
    expectThrow(() => validateProjects([incomplete]), /tier1\.budgetCap/, "incomplete tier1 map throws");
  }
  {
    const wrongType = makeEntry();
    wrongType.tier1.budgetCap = "yes";
    expectThrow(() => validateProjects([wrongType]), /tier1\.budgetCap/, "non-boolean tier1 flag throws");
  }
  expectThrow(() => validateProjects([makeEntry({ status: "shipped" })]), /invalid status/, "invalid status value throws");
  expectThrow(() => validateProjects([makeEntry({ slug: "Bad Slug" })]), /slug/, "non url-safe slug throws");
  expectThrow(() => validateProjects([makeEntry(), makeEntry()]), /duplicate slug/, "duplicate slug throws");
  expectThrow(() => validateProjects([makeEntry({ tagline: "x".repeat(121) })]), /tagline/, "tagline over 120 chars throws");
  expectThrow(() => validateProjects([null]), /not an object/, "null entry throws");
  {
    const allFalseLive = makeEntry({ tier1: { readme5min: false, demoVideo60s: false, publicGithub: false, promptsVersioned: false, modelCallsLogged: false, toolOutputsValidated: false, retriesWithBackoff: false, secretsStripped: false, humanApprovalOnMoneyEmailDelete: false, streamingResponses: false, repeatQueriesCached: false, budgetCap: false } });
    expectThrow(() => validateProjects([allFalseLive]), /live/, 'status "live" with ALL flags false throws');
  }

  console.log("── 3. RENDER LEVEL: gate helpers deny violating entries ──");
  const liveLie = makeEntry({ slug: "live-lie", tier1: { publicGithub: false } });
  check(isLiveProject(liveLie) === false, "isLiveProject() denies live-with-false-flag");
  check(effectiveStatus(liveLie) === "preview", 'effectiveStatus() downgrades live-with-false-flag to "preview"');
  const honestLive = makeEntry({ slug: "honest-live" });
  check(isLiveProject(honestLive) === true && effectiveStatus(honestLive) === "live", "known-good live entry still passes the gate (checker sanity)");
  const draftWithTrueFlags = makeEntry({ slug: "draft-true-flags", status: "draft" });
  check(isPublicProject(draftWithTrueFlags) === false && effectiveStatus(draftWithTrueFlags) === "draft", "draft entry is not public and never presents live, even with all flags true");
  const mixedPreview = makeEntry({ slug: "mixed-preview", status: "preview", tier1: { budgetCap: false } });
  check(isLiveProject(mixedPreview) === false && effectiveStatus(mixedPreview) === "preview", "preview entry with a false flag never presents live");

  // Mutation path: force violating entries into the live data array (what a cast or a
  // non-TS tool could do) and prove every read path still denies "live".
  projects.push(liveLie, draftWithTrueFlags);
  try {
    check(!liveProjects().some((p) => p.slug === "live-lie"), "liveProjects() (sitemap) excludes the injected live-lie");
    check(liveProjects().every((p) => allTier1Pass(p) && p.status === "live"), "liveProjects() (sitemap) contains only fully-passing live entries");
    check(!publicProjects().some((p) => p.slug === "draft-true-flags"), "publicProjects() (grid/detail/static params) hides the injected draft");
    const injected = publicProjects().find((p) => p.slug === "live-lie");
    check(Boolean(injected) && effectiveStatus(injected) === "preview", "grid/detail data shows the injected live-lie only as preview");
    check(getProject("live-lie") !== undefined && effectiveStatus(getProject("live-lie")) === "preview", "detail route lookup resolves the live-lie as preview only");
  } finally {
    projects.pop();
    projects.pop();
  }

  {
    // Real data invariant: nothing may present live while a flag is false.
    const liars = projects.filter((p) => effectiveStatus(p) === "live" && !allTier1Pass(p));
    check(liars.length === 0, "real data: no entry presents live while a tier1 flag is false");
    check(liveProjects().every((p) => isLiveProject(p)), "real data: liveProjects() === entries where isLiveProject() holds");
  }

  console.log("── 4. WIRING: every public-visibility surface routes through the gate ──");
  const consumers = [
    ["app/projects/page.tsx (grid)", "app/projects/page.tsx", ["publicProjects", "effectiveStatus"]],
    ["app/projects/[slug]/page.tsx (detail + static params)", "app/projects/[slug]/page.tsx", ["publicProjects", "isPublicProject", "effectiveStatus"]],
    ["app/sitemap.ts (sitemap)", "app/sitemap.ts", ["liveProjects"]],
    ["app/llms.txt/route.ts (llms.txt)", "app/llms.txt/route.ts", ["publicProjects", "effectiveStatus"]],
  ];
  for (const [label, file, helpers] of consumers) {
    let src = null;
    try {
      src = readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      check(false, `${label} — file missing or unreadable: ${file}`);
      continue;
    }
    check(helpers.every((h) => src.includes(h)), `${label} uses gate helper(s): ${helpers.join(", ")}`);
    check(!/\.status\s*(?:===?|!==?)/.test(src), `${label} makes no raw .status comparison (status decisions go through gate helpers only)`);
  }

  console.log("── 1. TYPE LEVEL: tsc rejects a live entry with a false tier1 flag ──");
  const relImport = path.relative(workDir, dataModuleTs).replace(/\\/g, "/").replace(/\.ts$/, "");
  const goodSrc = [
    `import type { Project } from "${relImport.startsWith(".") ? relImport : "./" + relImport}";`,
    `export const goodLive: Project = ${JSON.stringify(makeEntry({ slug: "good-live" }), null, 2)};`,
    `export const goodPreview: Project = ${JSON.stringify(makeEntry({ slug: "good-preview", status: "preview", tier1: { budgetCap: false } }), null, 2)};`,
  ].join("\n");
  const badLiveSrc = [
    `import type { Project } from "${relImport.startsWith(".") ? relImport : "./" + relImport}";`,
    `export const badLive: Project = ${JSON.stringify(makeEntry({ slug: "bad-live", tier1: { publicGithub: false } }), null, 2)};`,
  ].join("\n");
  const badStatusSrc = [
    `import type { Project } from "${relImport.startsWith(".") ? relImport : "./" + relImport}";`,
    `export const badStatus: Project = ${JSON.stringify(makeEntry({ slug: "bad-status", status: "shipped" }), null, 2)};`,
  ].join("\n");
  writeFileSync(path.join(workDir, "good.ts"), goodSrc);
  writeFileSync(path.join(workDir, "bad-live.ts"), badLiveSrc);
  writeFileSync(path.join(workDir, "bad-status.ts"), badStatusSrc);
  const typeFlags = ["--noEmit", "--strict", "--skipLibCheck", "--target", "es2020", "--module", "esnext", "--moduleResolution", "bundler"];

  const good = runTsc([path.join(workDir, "good.ts"), ...typeFlags]);
  check(good.code === 0, `known-good fixtures compile clean (checker sanity)${good.code === 0 ? "" : " — tsc said:\n" + good.output.slice(0, 400)}`);
  const badLive = runTsc([path.join(workDir, "bad-live.ts"), ...typeFlags]);
  check(badLive.code !== 0 && /TS2322|not assignable|tier1/.test(badLive.output), "type checker REJECTS status 'live' with a false tier1 flag");
  const badStatus = runTsc([path.join(workDir, "bad-status.ts"), ...typeFlags]);
  check(badStatus.code !== 0 && /TS2322|not assignable|status/.test(badStatus.output), "type checker REJECTS an invalid status literal");
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

console.log(`\nTier 1 gate guard: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
