# Build and test efficiency plan

Status: T0 timeout safeguard pushed; deployment verification pending. T1 initial
coverage audit complete. T2 implemented and measured once locally (`test:routine`
command, `playwright.routine.config.js`, `scripts/run-routine-tests.js`); awaits
independent review before any deployment-gate change. T3–T5 not implemented.
Updated: 2026-09-12.

## Purpose and boundaries

Reduce redundant execution and agent investigation without weakening assertions
or silently removing supported-browser coverage. This bounded engineering task
supports the responsive-layout release; it does not close L2 human checks or
replace the original feature roadmap. No runtime changes, dependencies, or
version bump are required.

Keep `npm test` / `test:full` and the nine-project release matrix unchanged while
introducing and measuring a separate routine command. Changing the deployment
gate is a later explicit decision, not part of initial implementation.

## Baseline and evidence

Inventory inspected at application commit `b0f7e05`; no suites were executed for
this audit. Counts come from Playwright `--list` and source inspection.

| Standalone file | Unique tests | Smoke | Compatibility | Responsive |
| --- | ---: | ---: | ---: | ---: |
| app.spec.js | 62 | 8 | 14 | 6 |
| exam-engine.spec.js | 1 | 1 | 0 | 0 |
| mock-exam.spec.js | 90 | 6 | 16 | 8 |
| responsive-shell.spec.js | 28 | 1 | 3 | 6 |
| Total | 181 | 16 | 33 | 20 |

The full standalone suite expands to 1,629 executions over nine projects. Node
unit coverage (233 passing cases in prior verification) already owns engine
logic, figure-reference/manifest validation, and build-gate fixtures. PWA has
its own two-project suite; retain it, including its documented offline skips.

Run 34671588937 exceeded its 30-minute build timeout while still progressing
through standalone tests (approximately case 1,376). GitHub's annotation
explicitly confirms the timeout. Run 34671957507 initially waited behind it.
These are not successful full-suite baselines or evidence of an app failure.

There are 21 literal `waitForTimeout` sites: 27.1 seconds in app.spec.js and
2.4 seconds in responsive-shell.spec.js per project, approximately 265.5
seconds across nine projects before retries. Fake-clock durations elsewhere
are simulated time, not equivalent wall-clock waits.

Routine smoke/compat/responsive scripts each rebuild and overlap the full
matrix. Conversely standalone/PWA commands alone do not rebuild. Build-gate
fixture builds are intentional correctness tests, not redundant release builds.
CI currently uses one worker; local defaults are not explicitly bounded.

## T0 — Restore deployment capacity

- [x] Raise only the build-job limit from 30 to 60 minutes (`c006bf1`).
- [ ] Confirm the new run completes all verification and deploys.
- [ ] Record job/step durations and retries as the baseline.

Do not treat the higher timeout as an efficiency improvement or rerun an old
commit expecting it to use the updated workflow.

## T1 — Coverage policy and initial audit

Initial proposal is deliberately more conservative than Chromium-only full
functional coverage. Existing tags miss browser-sensitive scenarios: Help
fragment focus, drawer transition/focus restoration, viewer scroll restoration,
timer expiry while a viewer is open, and native confirmation behavior. Keep all
of these on every desktop engine before considering narrower engine selection.

| Coverage family | Proposed routine ownership | Reason |
| --- | --- | --- |
| Pure engine/build/figure logic | Existing Node suite, unchanged | No browser necessary |
| Every standalone test, including untagged tests | Chromium, Firefox, WebKit desktop | Preserves all logical scenarios on every engine |
| Existing @compat cases | Additionally WebKit mobile | Keeps existing mobile compatibility coverage |
| Existing @responsive cases | Chromium and WebKit mobile/tablet | Preserves current scoped layout coverage |
| PWA install/cache/offline/CSP | Existing PWA suite, unchanged | Requires hosted browser integration |
| All nine standalone projects | Full/manual/release suite, unchanged | Retains exhaustive fallback and release coverage |

Current projected standalone selection: 181 × 3 + 33 + 20 × 4 = 656,
approximately 60% fewer executions than 1,629. This assumes today's tags have
no overlap in the additional projects; implementation must verify the unique
test/project union. This is not a predicted runtime reduction.

**T2 verified this at implementation time:** `@compat` (33) and `@responsive`
(20) tags do not overlap in the current inventory (0 tests carry both), so the
formula is equivalently 181 × 3 (desktop) + 53 (webkit-mobile, `@compat` OR
`@responsive`, one grep) + 20 × 3 (chromium-mobile/chromium-tablet/webkit-tablet,
`@responsive` only) = 656. `playwright.routine.config.js --list` confirms 656
total, 181/181/181/53/20/20/20 per project, and 0 duplicate test/project pairs
(verified by walking the JSON reporter's output, not just the printed total).

Responsive-shell cases that explicitly set their own viewport repeat that
same size under several projects. Defer deduplicating these until selection is
audited; a project can differ in touch/mobile emulation as well as dimensions.
The standalone WebKit mobile/tablet projects currently set viewport only;
do not call them physical iOS or full device emulation.

Potential later Node candidates include pure diagnostic-string cases and
static artifact/manifest assertions. Keep browser integration checks for
startup reporting, CSP enforcement, loaded images, and fetched PWA resources.
Do not extract production code solely to save a few tests in this slice.

## T2 — Implement routine verification (implemented; awaiting independent review)

- [x] Add a separate `test:routine` command that builds once, runs Node tests,
  the selected standalone union, then the existing PWA suite sequentially.
  (`package.json` → `test:routine` runs `scripts/run-routine-tests.js`.)
- [x] Use one standalone invocation/config with project-specific selection;
  do not concatenate overlapping smoke/compat/responsive runs.
  (`playwright.routine.config.js`, one `playwright test` invocation, per-project
  `grep` regexes: a single `/@compat|@responsive/` alternation for
  webkit-mobile rather than two runs.)
- [x] Reuse shared project definitions where practical; prevent divergent
  browser/viewport definitions without refactoring unrelated test behavior.
  (`playwright.routine.config.js` `require()`s `playwright.config.js` read-only
  and shallow-clones the specific project objects it reuses — it cannot mutate
  the full config's cached module, and `playwright.config.js` itself is
  unchanged, confirmed by an empty `git diff -- playwright.config.js`.)
- [x] Default routine execution to one worker. Fail immediately on a failed
  phase and propagate its nonzero exit status.
  (`workers: 1` in the routine config; `scripts/run-routine-tests.js` stops at
  the first failed phase and propagates its exact exit code, or the
  conventional `128 + signal` code on SIGINT/SIGTERM.)
- [x] Preserve default full-suite configuration and existing commands.
  (`playwright.config.js` untouched; `npm test`/`test:full`/`test:standalone`/
  `test:pwa`/`test:smoke`/`test:compat`/`test:responsive` untouched — see the
  `package.json` diff, which only adds `test:routine` and `test:routine:list`
  and appends one file to `test:unit`.)
- [x] Check `--list` output first: all 181 logical cases on every desktop
  engine; all selected mobile/tablet cases; no duplicate test/project pairs.
  (`npm run test:routine:list` → 656 total; 181/181/181/53/20/20/20 per
  project; 0 duplicate test/project pairs, verified via the JSON reporter.)
- [x] Ensure new untagged cases automatically run on all desktop engines.
  (The three desktop projects reuse the full project definition with no
  `grep`, so every logical test — tagged or not — runs on all three; verified
  by diffing the per-test title lists of the three desktop projects' `--list`
  output, which are identical.)
- [x] Run routine verification once; report exact counts, skips, retries,
  duration, tested commit/worktree, and remaining coverage limitations.
  (See "T2 measured run" below.)
- [x] Emit phase start/end, elapsed wall time and exit status for build, Node,
  standalone and PWA phases; emit a total duration and retain partial progress
  when a phase fails. Preserve nonzero exits. Do not add arbitrary hard timeouts
  or claim a killed process completed successfully.
  (`scripts/run-routine-tests.js` prints `=== PHASE START/PASSED/FAILED/
  TERMINATED BY SIGNAL ===` and a `Total elapsed:` line; no hard timeout is
  imposed; a SIGINT/SIGTERM always forces a nonzero exit even if a race lets
  the killed child report a clean exit. Covered by
  `tests/unit/run-routine-tests.test.js`, including real-subprocess tests
  that send an actual SIGINT and assert exit code 130 and full process-tree
  termination — see "Independent review findings" below.)
- [ ] Independent review before any deployment-gate change. (Not yet reviewed;
  the deployment workflow still runs `npm test`, unchanged.)

No timer rewrites, CI sharding, blanket tag additions, or app changes were made
in T2.

### T2 measured run

Tested commit: `c006bf1` (the T0 60-minute-timeout commit), plus the
uncommitted working-tree changes listed in the execution log below. One
complete `npm run test:routine` was run locally, sequentially, one worker for
the standalone phase, no scoped/full suites run before or after it:

| Phase | Status | Duration | Detail |
| --- | --- | ---: | --- |
| build | pass | 0.4s | `dist/index.html` 984,024 bytes / 1,048,576 budget (64,552 bytes free); `dist/pwa` app shell 986,438 bytes |
| unit (`test:unit`) | pass | 3.6s | 253 passed / 0 failed, 40 suites (includes the 20 new `run-routine-tests.test.js` cases) |
| routine-standalone | pass | 1213.1s (20.2m) | 656 passed / 0 failed / 0 skipped / 0 retried / 0 flaky, 1 worker |
| pwa | pass | 13.9s | 22 total, 17 passed, 5 skipped (the documented Chromium-only offline-reload/figure/drawer checks, skipped on `pwa-webkit-mobile` as designed), 0 failed, 0 flaky |
| **Total** | **pass** | **1231.0s (~20.5 min)** | all 4 phases passed, no interruption |

Post-run checks: `git diff --stat -- dist/` and `git status --porcelain --
dist/` are both empty — the build phase regenerated `dist/index.html` and
`dist/pwa` byte-identical to what is already committed. `git diff --check`
across the whole working tree is clean (exit 0).

This is a local measurement, not an apples-to-apples comparison with the
~37-minute successful GitHub Actions run: the local run excludes dependency
installation and Playwright browser installation, which the CI job pays on
every run. Separately, as a projected execution-count reduction, the routine
standalone selection (656) is 59.7% smaller than the full standalone matrix
(1,629); whether that translates into a proportional CI wall-clock or
runner-minute reduction is a T4 question, not something this run establishes.

No retries or flakes occurred in this run. This run does not exercise
SIGINT/SIGTERM delivery to the real npm/Playwright phases (that would require
interrupting a real multi-minute run); real-signal forwarding is instead
covered by the dedicated unit tests against trivial substituted subprocesses
(see T2 checklist above, and "Independent review findings" below). Full-suite
verification (`npm test`, 1,629 executions), the tag-scoped
`smoke`/`compat`/`responsive` commands, and a second `test:routine` run were
deliberately not performed, per this task's scope.

### Independent review findings (2026-09-12)

Independent review of the T2 implementation found two runner reliability
issues; the audited 656-execution selection itself was confirmed correct.
Both were fixed and covered by new regression tests, without rerunning the
measured `npm run test:routine` above — the fixes only change error/signal
handling paths that a normal, uninterrupted, non-failing run (as measured)
never exercises; build/unit/routine-standalone/pwa behavior on success is
unaffected.

- **Interruption did not reliably stop the whole process tree.** The SIGINT/
  SIGTERM handler signaled only the immediate phase child. An npm phase can
  have a Node process beneath it, and Playwright launches worker and browser
  descendants; signaling only the immediate child left those running, so the
  "no leftover browser/test processes" guarantee did not actually hold. Fixed
  by spawning each phase with `detached: true` on POSIX (making it the leader
  of its own process group) and signaling the whole group via
  `process.kill(-pid, signal)`, with a `taskkill /pid <pid> /t /f` fallback on
  Windows. This does not catch a descendant that itself creates a new session
  (e.g. via `setsid()`) — uncommon for the build/test/browser tooling used
  here, but a documented residual limit, not one silently assumed away.
  Regression test: `tests/unit/run-routine-tests.test.js` spawns a phase that
  itself spawns a grandchild process, sends the runner a real SIGINT, and
  asserts the grandchild is also gone afterward (not just the immediate
  child). Separately, a signal arriving in the gap between two phases (after
  the previous child exited, before the next was spawned) left `currentChild`
  null and could let `runAll()` start the next phase despite having logged
  "stopping." Fixed by adding an optional `shouldAbort()` check to `runAll()`,
  evaluated before each phase starts, wired in production to
  `forcedExitCode !== null`. Regression test: a fake spawn sets an abort flag
  when phase "a" closes; the test asserts phase "b" is never spawned.
- **A spawn error could produce contradictory terminal output.** `runPhase()`
  called `finish()` on the child's `error` event, but Node commonly also
  emits `close` afterward for a process that never started; the Promise only
  resolves once, but the second call still logged another terminal status
  line (potentially "PASSED" immediately after "FAILED (spawn error)").
  Fixed with a `settled` guard in `finish()` so only the first terminal event
  logs or resolves. Regression test: a fake child emits `error` then `close`;
  the test asserts exactly one terminal status line is logged and it reports
  the spawn error, not a contradicting pass.

A second review round found one more issue in the Windows fallback added
above:

- **The Windows `taskkill` cleanup fallback could silently fail.**
  `child_process.spawnSync()` returns normally even when the command it ran
  failed or could not be found — that is reported through the result
  object's `error`/`status`/`signal` fields, not a thrown exception. The
  original code called `spawnSync("taskkill", ...)` and returned
  immediately without inspecting the result, so a failed `taskkill` (wrong
  PID, `taskkill` not on `PATH`, access denied, etc.) was treated as a
  success and the direct `child.kill()` fallback was never attempted —
  possibly leaving test/browser descendants running on Windows. Fixed by
  extracting the success check into a pure `taskkillSucceeded(result)`
  predicate (`!result.error && result.status === 0`) and only skipping the
  fallback when it returns true. Regression test: `taskkillSucceeded()` is
  exercised directly against clean-exit, nonzero-status, spawn-error, and
  killed-by-signal result shapes (no Windows or real `taskkill` binary
  needed, since the decision is a pure function over the result object).

`tests/unit/run-routine-tests.test.js` now has 30 tests (up from 20);
`npm run test:unit` totals 263, all passing, run repeatedly with no
flakiness in the real-subprocess tests. No leaked processes were observed
after those runs (`pgrep` for the fixture's own marker came back empty).

## T3 — Remove unnecessary waiting

- [ ] Replace timer sleeps with fake-clock control while preserving assertions
  for paused/resumed, setup/session isolation, and viewer/drawer behavior.
- [ ] Use observable-state assertions for non-timer UI waits.
- [ ] Preserve intentional real-animation tests, including reduced motion.
- [ ] Inspect long fake-clock advancement for expensive repeated callbacks;
  do not replace it blindly where intermediate tick behavior is under test.
- [ ] Run only affected tests on their relevant engines, then one routine run
  after the slice stabilizes. Record before/after durations.

## T4 — Measure and decide CI policy

- [ ] Compare successful full and routine results: elapsed time, execution
  counts, retries/flakes, and approximate runner minutes.
- [ ] Compare local durations with full CI job duration (setup included), record
  queue delay separately, and set timeout headroom from measured runs. Surface
  timeout/cancellation distinctly in CI summaries and retain available logs.
- [ ] Consider two CI workers only after a bounded benchmark; parallelism
  reduces elapsed time but does not inherently reduce total compute.
- [ ] Obtain approval before switching ordinary push/deploy verification to
  routine. Preserve full manual/release validation with documented triggers.
- [ ] Keep deployment dependent on a passing verification gate. Do not bypass
  failures or use stale artifacts to get a deployment through.

## T5 — Durable agent workflow and handoff

- [x] Update TESTING.md and AGENTS.md with change-type verification guidance
  and mandatory efficiency review questions (2026-09-12). Execution/reporting
  automation and the routine command remain future implementation work.
- [ ] Record when source/data changes require rebuilding; routine must build
  its own artifact rather than trusting stale dist output.
- [ ] Reuse results only for matching tested code/artifacts/configuration;
  distinguish prior-agent evidence from personal verification.
- [ ] Save reports/screenshots outside Playwright's disposable output folder.
  Track a concise durable summary, not a large screenshot collection.
- [ ] Set a 30-minute exploratory-investigation checkpoint: report remaining
  questions instead of expanding into another custom harness or broad matrix.
- [ ] Do not run all scoped suites followed by full tests on unchanged code.

## Execution log and resumption

2026-09-12: Read-only inventory/tag/wait audit completed. No browser tests run.
Conservative 656-execution routine proposal documented; not implemented and
not timed. Timeout-only commit `c006bf1` pushed independently. Next: confirm
deployment status, review this policy, then hand T2 to an implementation agent.
Resume responsive L2/L3 and the feature roadmap after this bounded workstream;
manual Safari, screen-reader, and figure-fidelity gates remain independently open.

2026-09-12 (T2): Implemented `playwright.routine.config.js`,
`scripts/run-routine-tests.js`, `tests/unit/run-routine-tests.test.js`, and the
`test:routine`/`test:routine:list` `package.json` scripts, on top of `c006bf1`
plus pre-existing uncommitted planning/doc changes. Verified the 656-execution
selection via `--list` and a JSON-reporter duplicate-pair check before running
any browser. Ran the 20 new orchestration unit tests (isolated and as part of
the full 253-test `test:unit`) — all passing, no real subprocess launched
except the one dedicated real-SIGINT test. Ran exactly one complete
`npm run test:routine`: all 4 phases passed, 656/656 routine-standalone,
17/22 PWA (5 documented skips), 253/253 unit, total 1231.0s (~20.5 min), no
retries or flakes; `dist/` regenerated byte-identical to committed, `git diff
--check` clean. Deployment workflow (`npm test` gate) left unchanged. All
changes left uncommitted for independent review. Next: independent review of
this slice, then either T3 (remove unnecessary waiting) or an explicit T4
decision on whether/how CI policy should use `test:routine`. Responsive L2
physical Safari/screen-reader checks and figure-fidelity sign-off remain
separately open and are unaffected by this slice.

2026-09-12 (T2 review round): Independent review found two runner reliability
issues (see "Independent review findings" above) — signal forwarding did not
reach a phase's whole process tree, and a spawn error could log a
contradicting second terminal status after a race with the child's `close`
event. The 656-execution selection itself was confirmed correct, no changes
needed there. Both issues fixed in `scripts/run-routine-tests.js`
(process-group signaling with a Windows `taskkill /t` fallback, a
between-phase `shouldAbort()` check in `runAll()`, and a `settled` guard in
`runPhase()`'s `finish()`), with 5 new regression tests added (25 total in
`tests/unit/run-routine-tests.test.js`, 258 in `test:unit`), including one
real-subprocess test that confirms a grandchild process is also terminated on
SIGINT. Full suite run three times with no flakiness; no leaked processes
observed. The prior measured `test:routine` run above was not repeated, since
these fixes only change error/signal-handling paths that run did not exercise
on its successful, uninterrupted path. Next: independent review of this
fixed version, same as before.

2026-09-12 (T2 second review round): Independent review confirmed the POSIX
process-group signaling, the between-phase abort check, and the settled
guard were all sound, and the real grandchild-cleanup regression test
passes. Found one more issue in the Windows fallback: `spawnSync("taskkill",
...)` returns normally even on failure, and the code returned immediately
without checking the result, so a failed `taskkill` was silently treated as
success and the `child.kill()` fallback never ran. Fixed by extracting a pure
`taskkillSucceeded(result)` predicate, exported and directly unit-tested
against clean/failed/spawn-error/signaled result shapes (5 new tests; 30
total in `tests/unit/run-routine-tests.test.js`, 263 in `test:unit`, all
passing). No change to the measured `test:routine` run, same reasoning as the
prior round. Next: independent review of this fix.

2026-09-12 (T2 commit): Committed as `531f35a` (with the AGENTS.md efficiency
policy and docs/TESTING.md updates). Pre-commit verification: `test:unit`
263/263; `test:routine:list` = 656 selections; one complete `npm run
test:routine` run passed all four phases (build, unit, 656-execution
standalone union, PWA 17 passed + 5 documented skips) in 1131.9s with exit
code 0; `git diff --check` clean; `dist/` untouched. Awaiting independent
review before T3 or any T4 CI-policy decision.
