#!/usr/bin/env node
"use strict";

// T2 routine verification runner (see docs/TEST_EFFICIENCY_PLAN.md).
//
// Runs, strictly in sequence, stopping at the first failure:
//   1. npm run build                                       (builds once)
//   2. npm run test:unit
//   3. Playwright --config=playwright.routine.config.js     (656-execution union)
//   4. Playwright --config=playwright.pwa.config.js
//
// Dependency-free: only Node core modules. Every child process is launched
// with an executable + argument array and `shell: false` -- no shell
// interpolation or shell-dependent quoting anywhere in this file. Phases 3-4
// invoke the Playwright CLI's own entry file directly via `process.execPath`
// (not `npx`, not the `.bin` shim), so behavior does not depend on a shell
// resolving `PATH` or Windows `.cmd` wrappers. Phases 1-2 go through npm,
// since "npm run build" / "npm run test:unit" are the specified steps; when
// available (always true when this script itself is invoked via `npm run
// ...`), `process.env.npm_execpath` is used the same way, so no shell is
// needed there either.
//
// Testability: `buildPhases`, `runPhase`, `runAll`, and `exitCodeFor` are
// pure/injectable and exported for tests/unit/run-routine-tests.test.js,
// which fakes the spawn function and never launches npm or a browser. Real
// execution only happens under `require.main === module`, below.

const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function formatDuration(ms) {
  return (ms / 1000).toFixed(1) + "s";
}

// Resolve how to invoke npm without a shell. `npm_execpath` is the path to
// npm's own JS entry point and is set by npm whenever it runs a lifecycle
// script (including `npm run test:routine`, this script's normal entry
// point) -- spawning `process.execPath` against that file is a plain Node
// invocation on every platform, sidestepping the `npm.cmd` shell-wrapper
// issue on Windows entirely. If this script is ever run directly (not via
// npm), fall back to invoking `npm`/`npm.cmd` by name; that fallback still
// uses shell:false and works as-is on POSIX systems.
function resolveNpmCommand() {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath] };
  }
  return { command: process.platform === "win32" ? "npm.cmd" : "npm", args: [] };
}

// Resolve the Playwright CLI's own entry file and invoke it with Node
// directly -- not `npx` (extra process + potential network/version check)
// and not the `node_modules/.bin/playwright` shim (a shell script on POSIX,
// a `.cmd`/`.ps1` wrapper pair on Windows).
function resolvePlaywrightCommand() {
  return { command: process.execPath, args: [require.resolve("@playwright/test/cli")] };
}

// Build the four ordered phases. Pure given the current environment/install;
// exported so tests can assert order, commands, and argument shape without
// spawning anything.
//
// ROUTINE_RUNNER_TEST_PHASES is a test-only escape hatch (used by
// tests/unit/run-routine-tests.test.js to exercise real SIGINT/SIGTERM
// forwarding and child cleanup against a trivial spawned process, without
// launching npm or a browser). It is never set in normal use.
function buildPhases() {
  if (process.env.ROUTINE_RUNNER_TEST_PHASES) {
    return JSON.parse(process.env.ROUTINE_RUNNER_TEST_PHASES);
  }
  const npm = resolveNpmCommand();
  const playwright = resolvePlaywrightCommand();
  return [
    {
      name: "build",
      command: npm.command,
      args: npm.args.concat(["run", "build"]),
    },
    {
      name: "unit",
      command: npm.command,
      args: npm.args.concat(["run", "test:unit"]),
    },
    {
      name: "routine-standalone",
      command: playwright.command,
      args: playwright.args.concat(["test", "--config=playwright.routine.config.js"]),
    },
    {
      name: "pwa",
      command: playwright.command,
      args: playwright.args.concat(["test", "--config=playwright.pwa.config.js"]),
    },
  ];
}

// Run one phase via the injected spawn function. Never throws: resolves with
// a structured result so the caller decides pass/fail and can log every
// phase (including a spawn error) uniformly. `spawnFn` must return an
// EventEmitter-like object supporting `.on("error", ...)` and
// `.on("close", (code, signal) => ...)`, matching child_process.spawn.
function runPhase(phase, spawnFn, extraOpts) {
  return new Promise((resolve) => {
    const start = Date.now();
    console.log("\n=== PHASE START: " + phase.name + " ===");
    console.log("$ " + phase.command + " " + phase.args.join(" "));

    // Node commonly emits "close" after "error" for a process that never
    // actually started (e.g. ENOENT). Without this guard, that second event
    // would call finish() again -- the Promise only resolves once, but a
    // second, contradicting terminal line (e.g. "PASSED" right after "FAILED
    // (spawn error)") would still be logged.
    var settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      const elapsedMs = Date.now() - start;
      const full = Object.assign({ phase: phase.name, elapsedMs: elapsedMs }, result);
      if (full.kind === "spawn-error") {
        console.log("=== PHASE FAILED (spawn error): " + phase.name + " (" + formatDuration(elapsedMs) + ") ===");
        if (full.error) console.error(full.error);
      } else if (full.kind === "signal") {
        console.log("=== PHASE TERMINATED BY SIGNAL " + full.signal + ": " + phase.name + " (" + formatDuration(elapsedMs) + ") ===");
      } else {
        console.log("=== PHASE " + (full.ok ? "PASSED" : "FAILED") + ": " + phase.name +
          " (" + formatDuration(elapsedMs) + "), exit code " + full.code + " ===");
      }
      resolve(full);
    }

    var child;
    try {
      child = spawnFn(phase.command, phase.args, Object.assign(
        { cwd: ROOT, stdio: "inherit" },
        extraOpts,
        { shell: false }
      ));
    } catch (spawnError) {
      finish({ ok: false, kind: "spawn-error", error: spawnError, code: null, signal: null });
      return;
    }

    child.on("error", function (error) {
      finish({ ok: false, kind: "spawn-error", error: error, code: null, signal: null });
    });

    child.on("close", function (code, signal) {
      if (signal) {
        finish({ ok: false, kind: "signal", error: null, code: null, signal: signal });
        return;
      }
      finish({ ok: code === 0, kind: "exit", error: null, code: code, signal: null });
    });
  });
}

// Run all phases strictly in order, stopping at the first failure. Always
// prints a total-elapsed line, whether the run completed or stopped early.
//
// `shouldAbort`, if given, is checked before starting each phase (not just
// while one is running). This covers a signal that arrives in the gap
// between two phases, after the previous child has already exited and
// before the next one has been spawned -- there is no active child to
// forward the signal to at that instant, but the pipeline must still stop
// rather than starting a new phase after having reported "stopping".
async function runAll(phases, spawnFn, extraOpts, shouldAbort) {
  const totalStart = Date.now();
  const results = [];
  for (var i = 0; i < phases.length; i++) {
    if (shouldAbort && shouldAbort()) {
      const totalMs = Date.now() - totalStart;
      const abortedPhase = {
        phase: phases[i].name, elapsedMs: 0, ok: false,
        kind: "aborted", error: null, code: null, signal: null,
      };
      console.log("\nTotal elapsed: " + formatDuration(totalMs) +
        ' (stopped before "' + phases[i].name + '" started; interrupted)');
      return { ok: false, results: results, totalMs: totalMs, failedPhase: abortedPhase };
    }
    const result = await runPhase(phases[i], spawnFn, extraOpts);
    results.push(result);
    if (!result.ok) {
      const totalMs = Date.now() - totalStart;
      console.log("\nTotal elapsed: " + formatDuration(totalMs) + ' (stopped after "' + result.phase + '" failed)');
      return { ok: false, results: results, totalMs: totalMs, failedPhase: result };
    }
  }
  const totalMs = Date.now() - totalStart;
  console.log("\nTotal elapsed: " + formatDuration(totalMs) + " (all " + phases.length + " phases passed)");
  return { ok: true, results: results, totalMs: totalMs, failedPhase: null };
}

// Conventional POSIX-style signal exit codes (128 + signal number) where the
// signal is representable; a distinct nonzero fallback otherwise. Ordinary
// nonzero exit codes propagate exactly as reported by the child.
const SIGNAL_NUMBERS = { SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGKILL: 9, SIGTERM: 15 };

// Whether a child_process.spawnSync()-shaped result represents a genuinely
// successful command. spawnSync() returns normally even when the command
// itself fails or can't be found -- that's reported through
// result.error/status/signal, not a thrown exception -- so callers must
// inspect the result rather than assuming success just because spawnSync()
// didn't throw. Extracted as a pure predicate so this decision (used for the
// Windows taskkill fallback below) is testable without Windows or a real
// taskkill binary.
function taskkillSucceeded(result) {
  return !!result && !result.error && result.status === 0;
}

function exitCodeFor(result) {
  if (result.ok) return 0;
  const failed = result.failedPhase;
  if (failed.kind === "exit" && typeof failed.code === "number" && failed.code !== 0) {
    return failed.code;
  }
  if (failed.kind === "signal") {
    const num = SIGNAL_NUMBERS[failed.signal];
    return num ? 128 + num : 1;
  }
  // spawn-error, aborted (interrupted between phases), or an exit with a
  // falsy/non-numeric code that still failed.
  return 1;
}

module.exports = {
  ROOT: ROOT,
  formatDuration: formatDuration,
  resolveNpmCommand: resolveNpmCommand,
  resolvePlaywrightCommand: resolvePlaywrightCommand,
  buildPhases: buildPhases,
  runPhase: runPhase,
  runAll: runAll,
  exitCodeFor: exitCodeFor,
  taskkillSucceeded: taskkillSucceeded,
};

if (require.main === module) {
  const { spawn, spawnSync } = require("child_process");
  const phases = buildPhases();

  // Track the currently-running child so SIGINT/SIGTERM can be forwarded to
  // its whole process tree (rather than only to this process, or only to the
  // immediate child), so an interrupted routine run does not leave a
  // Playwright/browser process tree behind. An npm phase can have a Node
  // process beneath it, and Playwright launches worker and browser
  // descendants -- signaling only the immediate child would leave those
  // running.
  //
  // On POSIX, spawning with `detached: true` makes the child the leader of a
  // new process group, which every process it forks (without itself
  // detaching) inherits; `process.kill(-pid, signal)` then reaches the whole
  // group. This does not catch a descendant that itself creates a new
  // session (e.g. via setsid()) -- uncommon for the build/test/browser
  // tooling used here, but a real limit of this approach, not one this file
  // silently assumes away. Windows has no equivalent to POSIX signals or
  // process groups; `child.kill()` there only terminates the named process,
  // so `taskkill /t` (recurse over the tree) `/f` (Windows has no graceful
  // termination signal to send instead) is used as a best-effort fallback.
  var currentChild = null;
  function trackingSpawn(command, args, opts) {
    const spawnOpts = Object.assign({}, opts);
    if (process.platform !== "win32") {
      spawnOpts.detached = true;
    }
    const child = spawn(command, args, spawnOpts);
    currentChild = child;
    child.once("exit", function () {
      if (currentChild === child) currentChild = null;
    });
    return child;
  }

  function killTree(child, signal) {
    if (!child || typeof child.pid !== "number") return;
    if (process.platform === "win32") {
      var result;
      try {
        result = spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
      } catch (e) {
        result = { error: e };
      }
      // Only treat this as having cleaned up the tree on genuine success;
      // otherwise fall through to the direct kill below instead of silently
      // assuming descendants are gone (see taskkillSucceeded() above).
      if (taskkillSucceeded(result)) {
        return;
      }
    } else {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch (e) {
        // Group signal failed (child already gone, or not actually a group
        // leader for some reason); fall back to the direct kill below.
      }
    }
    try {
      child.kill(signal);
    } catch (e) {
      // Child may have already exited; nothing more to do.
    }
  }

  // Once set, this wins over any later "all phases passed" result: an
  // interrupted run must never be reported as passing, even if the killed
  // child happens to also report a clean exit race. It also doubles as the
  // "stop before starting the next phase" signal passed to runAll below, so
  // a signal arriving in the gap between two phases (no active child to
  // forward it to) still halts the pipeline instead of starting another one.
  var forcedExitCode = null;
  function forwardSignal(signal) {
    console.log("\nReceived " + signal + " -- forwarding to the active phase's process tree and stopping.");
    killTree(currentChild, signal);
    forcedExitCode = signal === "SIGINT" ? 130 : 143;
    process.exitCode = forcedExitCode;
  }
  process.on("SIGINT", function () { forwardSignal("SIGINT"); });
  process.on("SIGTERM", function () { forwardSignal("SIGTERM"); });

  runAll(phases, trackingSpawn, undefined, function () { return forcedExitCode !== null; }).then(function (result) {
    if (forcedExitCode !== null) {
      process.exitCode = forcedExitCode;
      return;
    }
    process.exitCode = exitCodeFor(result);
  });
}
