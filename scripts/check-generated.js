#!/usr/bin/env node
"use strict";

// Stage 5B2: dependency-free generated-artifact freshness checker.
//
// Detects ANY difference between the committed `dist/` tree and Git's view of
// the working tree -- modified tracked files, deleted tracked files, renamed
// files, untracked files, unexpected extra generated files, and (review
// fix) ignored files matching a gitignore pattern under dist/ (e.g. a stray
// dist/.DS_Store -- .DS_Store is repo-ignored, so without --ignored=matching
// it would silently pass as "clean" despite being an unexpected extra file
// under a directory this checker promises to fully account for). This does
// NOT rebuild anything; it only inspects whatever is already on disk. Pair it
// with `npm run build` first (see the `check:generated` package script) when
// no prior build is guaranteed.
//
// `git diff --exit-code` is deliberately NOT used here: it does not report
// untracked (or ignored) files, so a build that leaves a stray new file under
// dist/ (or one whose name changed) would go undetected. Instead this uses:
//
//   git status --porcelain=v1 --untracked-files=all --ignored=matching -- dist
//
// Every process is launched with an executable + argument array and
// `shell: false` -- no shell interpolation anywhere in this file -- so this
// works correctly even when the repository's own path contains spaces.
//
// Testability: `parsePorcelainStatus`, `describeStatusCode`, and
// `checkGenerated` are pure/injectable (an alternate `spawnFn` and `cwd` can
// be supplied) and exported for tests/unit/check-generated.test.js. Real CLI
// execution only happens under `require.main === module`, below. This module
// never writes, stages, resets, checks out, or otherwise mutates the
// repository it inspects -- it only spawns a single read-only `git status`.

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

// Decode one git status XY code into a short human-readable description.
// X is the index (staged) state, Y is the worktree (unstaged) state; "??"
// and "!!" are the two special two-character codes git uses instead of the
// X/Y pair for untracked and ignored paths.
const STATUS_LETTERS = {
  M: "modified",
  A: "added",
  D: "deleted",
  R: "renamed",
  C: "copied",
  U: "unmerged",
  T: "type changed",
};

function describeStatusCode(code) {
  if (code === "??") return "untracked";
  if (code === "!!") return "ignored";
  const x = code[0];
  const y = code[1];
  const parts = [];
  if (STATUS_LETTERS[x]) parts.push("staged " + STATUS_LETTERS[x]);
  if (STATUS_LETTERS[y]) parts.push("unstaged " + STATUS_LETTERS[y]);
  return parts.length ? parts.join(", ") : code;
}

// Parse `git status --porcelain=v1` output into { code, path, description }
// entries, sorted by path for deterministic output regardless of the
// underlying git version's own ordering. Each line is "XY<space>PATH", where
// PATH runs to end of line and may itself legitimately contain spaces (a
// rename line reads "XY<space>OLD -> NEW"; both are preserved verbatim as one
// opaque path string here since this checker only needs to report that a
// generated path is stale, not to interpret the rename semantically).
function parsePorcelainStatus(stdout) {
  const entries = (stdout || "")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const code = line.slice(0, 2);
      const filePath = line.slice(3);
      return { code: code, path: filePath, description: describeStatusCode(code) };
    });
  entries.sort(function (a, b) {
    if (a.path < b.path) return -1;
    if (a.path > b.path) return 1;
    return 0;
  });
  return entries;
}

// Inspect `dist/` (or `distDir`, relative to `cwd`) against Git. Returns a
// result object; never throws. `kind` distinguishes a genuine Git execution
// failure ("git-error": the check itself could not run) from a successful
// check that found staleness ("stale") or found none ("clean").
function checkGenerated(options) {
  const opts = options || {};
  // Default to the CURRENT process's working directory (how `npm run
  // test:generated` is actually invoked, from wherever the caller is), not
  // this module's own ROOT constant -- ROOT is this script's install
  // location, which would be wrong when invoked (as intended) against a
  // different working directory, such as a test fixture repository.
  const cwd = opts.cwd || process.cwd();
  const distDir = opts.distDir || "dist";
  const gitPath = opts.gitPath || "git";
  const spawnFn = opts.spawnFn || spawnSync;

  const result = spawnFn(
    gitPath,
    ["status", "--porcelain=v1", "--untracked-files=all", "--ignored=matching", "--", distDir],
    { cwd: cwd, encoding: "utf8", shell: false }
  );

  if (result.error) {
    return {
      ok: false,
      kind: "git-error",
      message: "git could not be executed: " + result.error.message,
      entries: [],
    };
  }
  if (result.signal) {
    return {
      ok: false,
      kind: "git-error",
      message: "git was terminated by signal " + result.signal,
      entries: [],
    };
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || "").toString().trim();
    return {
      ok: false,
      kind: "git-error",
      message: "git exited with status " + result.status + (stderr ? ": " + stderr : ""),
      entries: [],
    };
  }

  const entries = parsePorcelainStatus(result.stdout);
  if (entries.length > 0) {
    return { ok: false, kind: "stale", message: "Generated artifacts are stale", entries: entries };
  }
  return { ok: true, kind: "clean", message: "Generated artifacts are up to date", entries: [] };
}

// Exit codes: 0 clean, 1 stale (a real freshness failure), 2 the check itself
// could not run (git missing, not a repository, etc.) -- distinct from 1 so a
// caller can tell "the artifacts are wrong" apart from "the check didn't run".
function main(options) {
  const result = checkGenerated(options);
  if (result.kind === "git-error") {
    console.error("Could not check generated-artifact freshness: " + result.message);
    return 2;
  }
  if (!result.ok) {
    console.log("Generated artifacts under dist/ are STALE relative to Git:");
    result.entries.forEach(function (entry) {
      console.log("  " + entry.code + "  " + entry.path + "  (" + entry.description + ")");
    });
    console.log("\nRun `npm run build` and commit the regenerated dist/ output.");
    return 1;
  }
  console.log("Generated artifacts under dist/ are up to date.");
  return 0;
}

module.exports = {
  ROOT: ROOT,
  describeStatusCode: describeStatusCode,
  parsePorcelainStatus: parsePorcelainStatus,
  checkGenerated: checkGenerated,
  main: main,
};

if (require.main === module) {
  process.exitCode = main();
}
