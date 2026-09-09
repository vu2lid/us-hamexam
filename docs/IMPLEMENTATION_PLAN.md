# Roadmap Implementation Plan

This document turns the [product and engineering roadmap](ROADMAP.md) into an
ordered delivery plan. Use it to identify the next task, preserve implementation
context between sessions, and improve the development workflow over time.

Last reviewed: September 6, 2026

Plan status: Stage 1 complete. Stage 2 (figure pipeline) — 2A–2D done +
16-level grayscale encoding adopted; the per-figure **human** source-PDF
fidelity sign-off (`docs/FIGURE_REVIEW.md` §7) is still open. Stage 3A (inline
figure packaging + study-mode rendering + standalone byte-budget enforcement),
Stage 3B (figure rendering in mock-exam questions and results review), and
Stage 3C (shared fit/actual-size figure viewer) done. Stage 4 may proceed
independently.

Current stage: Stage 3 — code deliverables complete (3A–3C); remaining Stage 3
items are the manual device/a11y review and the human source-PDF fidelity
sign-off. Adjustable zoom stays deferred (`docs/ROADMAP.md`).

## How to use this plan

At the start of a work session:

1. Read `AGENTS.md`, `docs/ROADMAP.md`, and this document.
2. Confirm the current stage and the first unchecked deliverable.
3. Inspect the worktree and recent history before editing.
4. Keep the change limited to one reviewable vertical slice.

At the end of a work session:

1. Run the tests assigned to the stage.
2. Rebuild both release targets when source or data changed.
3. Record completed work, tests, important decisions, and remaining risks here.
4. Update the roadmap's completed-work and decision logs when a milestone changes.
5. Commit source, tests, documentation, and generated artifacts together.

Status markers used below:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed and verified
- `[!]` Blocked; record the reason in the execution log

## Delivery overview

| Stage | Target | Scope | Depends on | Relative size | Status |
|-------|--------|-------|------------|---------------|--------|
| 1 | 0.3.0-beta.2 | Accessibility, privacy, and pool-default fixes | None | Small | Complete |
| 2 | 0.3.0-beta.2 | Figure data model and asset pipeline | Stage 1 baseline | Medium | In progress (2A–2D done; human fidelity sign-off remains) |
| 3 | 0.3.0-beta.2 | Figure rendering and offline packaging | Stage 2 | Large | In progress (3A: inline packaging + study-mode rendering + budget gate; 3B: mock-exam + results-review rendering; 3C: shared fit/actual-size viewer — all done. Manual device/a11y review + human fidelity sign-off remain; adjustable zoom deferred) |
| 4 | 0.3.0-beta.2 | Versioned storage and exam-loss protection | Stage 1 | Medium | Not started |
| 5 | 0.3.0-beta.2 | Metadata, CI, validation, and release | Stages 1–4 | Medium | Not started |
| 6 | 0.4 | Better study workflows | beta.2 | Large | Not started |
| 7 | 0.4 | PWA update lifecycle | beta.2 | Medium | Not started |
| 8 | 0.5 | Local learning progress | Versioned storage | Large | Not started |
| Parallel | Before July 1, 2027 | Replacement General pool readiness | Figure and validation pipelines | Medium | Monitoring |

Stages 2 and 4 may proceed independently after Stage 1. Stage 5 integrates all
beta.2 work and owns its final release gate.

## Stage 1 — Existing defect fixes

Goal: establish a clean, accessible baseline before changing data and storage.

Deliverables:

- [x] Preserve a question-specific `<legend>` when exam choices are rendered.
- [x] Make exam-session and results headings programmatically focusable.
- [x] Define focus destinations for setup, start, results, retake, exit, and
  return-to-study transitions.
- [x] Replace the ARIA-styled subelement grid with a native HTML table.
- [x] Redact raw and encoded local home-directory paths (`file:` URLs, POSIX
  `/home` and `/Users`, and Windows `Users`) from diagnostics without globally
  rewriting remote URLs or unrelated encoded text; supported local-path shapes
  remain redacted when embedded in another string.
- [x] Default Mock Exam setup to the active study pool.
- [x] Add regression tests for every repaired defect.
- [x] Update architecture, testing, security, and Help text affected by the fixes.
- [x] Rebuild `dist/index.html` and `dist/pwa/`.

Verification:

- [x] `npm run test:unit`
- [x] `npm run test:smoke`
- [x] `npm run test:compat`
- [x] Targeted keyboard-only review
- [x] `git diff --check`

Suggested commit sequence:

1. `fix: preserve accessible mock-exam semantics`
2. `fix: manage focus across mock-exam views`
3. `fix: redact Windows paths from diagnostics`
4. `fix: default mock exam to active study pool`

The fixes may be combined when their tests or generated artifacts overlap enough
that separate commits would make review harder.

## Stage 2 — Figure pipeline and data model

Goal: create a reproducible, validated source pipeline for all 14 required
official figures before adding UI rendering.

The asset contract and its validator are documented in
[`docs/FIGURE_PIPELINE.md`](FIGURE_PIPELINE.md) (manifest schema, SVG/PNG
subsets, provenance, filesystem safety, checksum rules, size budget, and the
future build-integration point).

Proposed source layout:

```text
assets/figures/
├── technician/
│   ├── t-1.svg
│   ├── t-2.svg
│   └── t-3.svg
├── general/
│   └── g7-1.svg
└── extra/
    ├── e5-1.svg
    └── ...

data/figures.json
```

The manifest (`data/figures.json`) has a **`sources` registry** plus a `figures`
array whose entries reference a source by id — provenance is stored once, not
repeated on every figure. The authoritative schema (field rules, path safety,
checksum rules) is [`docs/FIGURE_PIPELINE.md`](FIGURE_PIPELINE.md) §2; the shape
is:

```jsonc
{
  "schemaVersion": 1,
  "sources": {
    "technician-2026-2030": {
      "pool": "technician",
      "pdf": "data/pool-sources/technician.pdf",   // tracked (narrow .gitignore exception)
      "url": "https://www.ncvec.org/index.php/2026-2030-technician-question-pool",
      "edition": "2026-2030 Technician …, 19 Feb 2026 errata",
      "sha256": "<64 hex of the exact PDF bytes>"
    }
  },
  "figures": [
    {
      "id": "T-1", "pool": "technician",
      "file": "assets/figures/technician/t-1.png",  // raster-export PNG
      "source": "technician-2026-2030",             // key into "sources"
      "sourcePage": 78,                              // verified 1-based PDF page index
      "extractionMethod": "raster-export",
      "alt": "<neutral description; must not reveal or narrow any answer>",
      "sha256": "<64 hex of the final optimised asset bytes>"
    }
  ]
}
```

Affected question records contain an explicit optional figure ID:

```json
{
  "id": "T6C02",
  "figure": "T-1"
}
```

Deliverables:

- [x] Confirm all 44 affected question IDs and 14 unique figure IDs.
- [x] Decide and document safe SVG and PNG asset requirements. _(Stage 2B:
  `docs/FIGURE_PIPELINE.md` §5 documents the fail-closed SVG element/attribute
  allowlist and the static PNG chunk subset; `scripts/figure-manifest.js`
  enforces both, with adversarial unit tests.)_
- [x] Manually export each figure from its official NCVEC PDF. _(Stage 2C: all
  14 extracted from the committed pool PDFs via `scripts/figure-extract.js`;
  reproducible with `--check`. Provenance/fidelity in `docs/FIGURE_REVIEW.md`.)_
- [x] Prefer optimized SVG for line art; use PNG only when necessary for fidelity.
  _(Stage 2C: every source figure is an embedded raster image in the pool PDF —
  no vector to export without redrawing — so all 14 assets are optimised
  grayscale PNG. `docs/FIGURE_REVIEW.md` §2.)_
- [x] Record the conversion method for every asset: direct vector export, raster
  export, vectorization, or hand tracing. Avoid hand tracing unless faithful
  source extraction is impossible; any traced asset requires a second independent
  content review. _(Stage 2C: all 14 recorded as `raster-export` in
  `data/figures.json`; no hand tracing.)_
- [x] Record source pool, PDF, page, extraction method, checksum, and accessible
  description for every figure. _(Stage 2C: `data/figures.json` — 3-entry
  `sources` registry (pool, PDF path, NCVEC URL, edition/errata, PDF sha256) and
  14 figure entries (pool, source id, verified 1-based `sourcePage`,
  `raster-export`, neutral `alt`, final-asset sha256).)_
- [x] Add explicit question-to-figure mappings.
- [x] Detect textual figure references case-insensitively and normalize their IDs;
  Technician and General use lowercase `figure` while Extra uses capitalized
  `Figure` in the current data.
- [x] Reject missing, unused, duplicate, cross-pool, and checksum-mismatched
  figure mappings. _(Stage 2A: missing / cross-pool / non-normalized /
  format-invalid / multi-reference question mappings are rejected at build time.
  Stage 2B: `scripts/figure-manifest.js` additionally rejects unused, duplicate,
  cross-pool, and checksum-mismatched **manifest** entries. Stage 2C: exercised
  against the **real** `data/figures.json` + all three real banks + on-disk
  assets + source PDFs. **Stage 2D: `scripts/build.js` `main()` calls
  `assertFigureManifest(banks)` right after the pools load and before the first
  `dist/` mutation — a nonzero exit on any manifest / cross-reference / asset /
  checksum / path / missing-source-PDF error.**)_
- [x] Reject active or externally referenced content in figure assets. _(Stage 2B:
  `validateSvg` rejects `script`/`foreignObject`/`use`/`image`/`a`/animation
  elements, `on*`/`href`/`xlink:href`/`style` attributes, `url(...)` and URI
  schemes, DOCTYPE/entities/PIs; `validatePng` rejects APNG and metadata chunks.
  Stage 2B review fixes: the `url(...)`/scheme checks run on the value after
  decoding permitted XML character references and CSS escapes, `fill`/`stroke`/
  `color` are held to a fail-closed static-colour allowlist, element membership
  is an own-property check (`<constructor>` etc. rejected, not thrown), the XML
  character range is enforced document-wide (numeric refs, literal content, and
  markup whitespace — the tokenizer accepts only XML `S` space/tab/CR/LF, not
  JS `\s`), and Buffer input is validated with a strict UTF-8 decode. **Stage 2D:
  now enforced on every build — `tests/unit/build-gate.test.js` proves a
  checksum-matching but unsafe SVG (`<script>`) still fails the build.**)_
- [~] Enforce a complete standalone size budget of at most 1 MiB. _(Stage 2B:
  `STANDALONE_BUDGET_BYTES = 1048576` and per-asset byte limits are defined and
  documented. Stage 2C: 8-bit assets totalled 325,927 B / 434,592 B base64,
  which would overshoot the budget. **Encoding adopted** (after the
  `docs/FIGURE_OPTIMIZATION.md` experiment, on the user's visual authorisation):
  13 figures re-encoded to **16-level grayscale** (`g16`, colour type 0 /
  bit depth 4); E5-1 kept at 8-bit. Committed assets now total **229,489 B
  on-disk / 306,008 B base64**; `scripts/figure-extract.js` reproduces them
  byte-identically (`--check`); `data/figures.json` checksums updated for the 13.
  Estimated projected `dist/index.html` ≈ 943,208 B → ≈ 39,832 B free after a
  64 KiB Stage 3 allowance (estimate, not compliance). Final embedded-size
  enforcement belongs to Stage 3 packaging; human source-PDF sign-off still
  pending (`docs/FIGURE_REVIEW.md` §7).)_
- [x] Add Node tests for the figure manifest and mappings. _(Mapping tests:
  Stage 2A. Manifest / SVG / PNG / path-safety tests: Stage 2B. Stage 2C:
  `tests/unit/figure-manifest.test.js` "real figure manifest and assets" runs
  the pipeline against `data/figures.json`, the real banks, the committed
  assets, and the source PDFs, and locks the 14-figure / 44-question inventory
  and each figure's source page. Stage 2D: `tests/unit/build-gate.test.js` drives
  `node scripts/build.js` in isolated temp-repo fixtures — valid build +
  determinism, and each failure mode (missing/malformed manifest, missing asset,
  asset & source-PDF checksum mismatch, duplicate/unused/cross-pool entry,
  unsafe SVG with a matching checksum) — plus output-preservation on failure.)_

Verification:

- [x] All 44 affected questions resolve exactly one expected figure. _(Stage 2C:
  `validateManifestAgainstQuestions(data/figures.json, real banks)` → 0 errors;
  every mapped question resolves to exactly one same-pool entry and every entry
  is referenced.)_
- [~] All 14 assets are referenced and pass a recorded, per-figure side-by-side
  comparison with the relevant source-PDF page before Stage 2 is complete.
  _(Stage 2C: `docs/FIGURE_REVIEW.md` records an agent visual comparison for all
  14 and structural validation passes. **Per-figure human fidelity review is
  PENDING** — Stage 2 is not complete until it is signed off.)_
- [x] `npm run build` _(Stage 2D: succeeds with the gate active; the full
  generated-output inventory (`dist/index.html` + `dist/pwa/**`, 9 files) is
  byte-identical to the pre-change baseline and to a repeat build — assets are
  not rendered or embedded yet.)_
- [x] `npm run test:unit` _(Stage 2D: 223/223, including the 14 new
  `build-gate.test.js` cases.)_
- [x] `git diff --check` _(clean.)_

The initial implementation deliberately uses reviewed manual export. The text
extractor should detect missing mappings but should not silently extract or redraw
figures from PDFs.

**Remaining before Stage 2 closes:** sign-off of the per-figure **human** fidelity
review (`docs/FIGURE_REVIEW.md` §7). The Stage 2D build gate only checks
structural validity (schema, checksums, safe content, cross-references) — not
visual correctness against the source pages.

## Stage 3 — Figure rendering and offline packaging

Goal: make every figure-dependent question usable in every application mode.

Sub-slices: **3A** — inline packaging + study-mode rendering (done). **3B** —
mock-exam and results-review figure rendering (done). **3C** — shared
fit-to-window / actual-size figure viewer (done). Adjustable zoom / pinch /
drag-to-pan deferred by user decision (`docs/ROADMAP.md`).

Deliverables:

- [x] Add a reusable figure component/container for study mode. _(3A:
  `#study-figure` in `src/index.html`; `renderStudyFigure()` in `src/app.js`,
  written stateless so exam/results can reuse it later. 3B: generalized into the
  shared `renderFigureInto(question, els)` helper that takes target elements by
  reference; `renderStudyFigure()` is now a thin wrapper — study-mode behavior
  and tests unchanged.)_
- [x] Render the same figure in mock-exam questions. _(3B: `#exam-figure`
  container in `src/index.html` between the question text and the answer
  fieldset — never inside it; `renderExamFigure()` called from
  `showExamQuestion()` so every navigation updates or clears it. Legend, radio
  group, keyboard nav, and focus destinations unchanged.)_
- [x] Render the figure with its question in results review. _(3B:
  `buildReviewFigure()` builds a class-scoped `<figure>` (no IDs) inside each
  figure-bearing review item only; shared figures reuse one registry data URL;
  filtering, order, and scoring presentation unchanged.)_
- [x] Embed figures in the standalone release. _(3A: `window.HAM_EXAM_FIGURES`
  registry built from the validated manifest + asset bytes, inlined in
  `dist/index.html`; one entry per figure, not per question.)_
- [x] Inline or locally package and precache figures in the PWA. _(3A decision:
  **inline** the identical registry in `dist/pwa/index.html` — no separate PWA
  files, no new service-worker precache entries.)_
- [x] Provide a visible figure identifier and useful accessible description.
  _(3A: `Figure <id>` caption via `textContent`; `<img alt>` set from the
  manifest alt text, injected as text, not HTML.)_
- [x] Add keyboard- and touch-operable figure enlargement. _(Stage 3C scope:
  fit-to-window and actual-size views with scrolling. User decision,
  2026-09-08: adjustable zoom controls, custom pinch gestures, and drag-to-pan
  are deferred to the roadmap's future candidates; preserve normal browser
  zoom. No adjustable-zoom implementation is required to complete this stage.
  Done (3C): one shared `#figure-viewer` modal (`role="dialog"`
  `aria-modal="true"`) opened by an `Enlarge Figure <ID>` button on the study,
  exam, and each review figure. Fit (whole image, no upscaling) / Actual size
  (intrinsic pixels, stage scrolls by keyboard + touch) / Close; opens in fit
  every time; mode exposed via `aria-pressed`. Background interaction blocked by
  a full-viewport backdrop plus capture-phase `keydown` focus-trap and a
  `focusin` guard — not `aria-modal`/`inert` alone. Escape/Close restore focus
  to the exact opener; transition-driven closes (question/mode change, results
  replaced, retake, timer expiry) drop focus to the destination. Timers keep
  running; no storage/answer/scoring/bookmark change. Browser zoom untouched.)_
- [x] Constrain figures to the viewport without horizontal overflow. _(3A:
  `.study-figure-frame { max-width: 560px }` + `img { width:100%; height:auto }`;
  `@responsive` test on mobile/tablet/desktop.)_
- [x] Support questions with no figure without leaving empty UI. _(3A: container
  hidden; stale image src / alt / caption cleared; `img` never falls back to a
  previous question's asset — a missing registry entry shows a concise
  unavailable indication, which a valid build prevents.)_
- [~] Add tests for shared figures, missing assets, safe rendering, zoom, offline
  behavior, and responsive layouts. _(3A: `build-gate.test.js` covers the
  registry, the byte budget, and over-budget failure preservation;
  `app.spec.js` covers shared figures, figure↔non-figure navigation, pool
  switch + reload, responsive overflow, no-network; `pwa.spec.js` covers an
  offline reload showing a figure. Missing-asset already fails the build gate.
  3B: `mock-exam.spec.js` adds active-exam + results-review figure tests
  (deterministic sessions, all three pools, figure↔non-figure↔figure nav with
  answers preserved, shared review figures using one data URL, no duplicate
  results IDs, retake, return-to-study restoration, a runtime-removed registry
  entry, responsive sizing); `pwa.spec.js` adds an offline exam+results figure
  test. 3C: `app.spec.js` +11 and `mock-exam.spec.js` +11 (incl. a fake-clock
  timer-expiry-while-open case) cover the shared viewer — open from study /
  exam / results, fit vs actual-size pixels + scrolling, fit-on-every-open,
  keyboard-only open/switch/close, Tab/Shift+Tab containment with background
  covered, Escape/Close focus return (independent per shared-figure results
  entry), transition dismissal, timers still running, no button for non-figure,
  no duplicate IDs; `pwa.spec.js` +1 offline enlargement.)_
- [~] Add standalone CSP assertions and extend the existing PWA CSP assertions to
  verify that figure rendering does not weaken policy or permit external content.
  _(3A: `app.spec.js` asserts `img-src data:` with no remote scheme and no CSP
  change; PWA CSP assertions unchanged and still pass. No dedicated new PWA CSP
  assertion added.)_
- [~] Update Help, architecture, security, and build documentation. _(3A + 3B +
  3C: `src/index.html` Help (study, exam, results; 3C adds viewer instructions —
  fit vs actual size, "cannot recover detail absent from the source image",
  timers keep running), `docs/ARCHITECTURE.md` (shared `renderFigureInto()`
  helper + exam/results placement + the `#figure-viewer` modal), `docs/TESTING.md`,
  `README.md`, `docs/ROADMAP.md` (adjustable zoom deferred). Security doc not
  separately updated — CSP is unchanged.)_

Verification (3A + 3B + 3C):

- [x] Figure questions render in study, exam, and results modes. _(3A: study
  mode across all three pools on chromium/firefox/webkit desktop + responsive.
  3B: active mock-exam questions and results review across all three pools on
  chromium + webkit desktop, plus responsive sizing. These are structural /
  browser checks — they do not establish source-PDF content fidelity, which
  remains a pending human sign-off in `docs/FIGURE_REVIEW.md` §7.)_
- [x] No figure causes a runtime network request. _(3A: verified — figures are
  `data:` URIs; `app.spec.js` and `pwa.spec.js` assert zero external requests.)_
- [x] Standalone CSP and PWA CSP tests pass. _(3A: unchanged CSP; `test:compat`
  and `test:pwa` pass.)_
- [x] `dist/index.html` is at most 1 MiB. _(3C: 966,113 B, 82,463 B under the
  1,048,576 budget; `dist/pwa/index.html` 968,527 B. The build **fails** if the
  final standalone HTML exceeds `STANDALONE_BUDGET_BYTES` before any `dist/`
  mutation; that gate passed. Registry still 309,190 B (assets unchanged).)_
- [x] `npm run test:responsive` _(3C: 56/56, incl. new study + exam viewer
  fit/scroll tests on the four responsive projects.)_
- [x] `npm run test:pwa` _(3C: 14 passed, 4 skipped — Chromium-only offline
  tests skip on webkit-mobile as before.)_
- [ ] Manual mobile and desktop visual review. _(Pending — agent inspection is
  not a human review. Still needed for 3C: real touch pinch/scroll of the
  actual-size viewer and screen-reader dialog semantics on an actual iOS/Android
  device. The per-figure human source-PDF fidelity sign-off in
  `docs/FIGURE_REVIEW.md` §7 also remains open; browser tests do not establish
  content fidelity.)_

## Stage 4 — Versioned storage foundation

Goal: make persistence migration-safe before new preferences and learning data are
introduced.

Proposed initial shape:

```json
{
  "schemaVersion": 1,
  "preferences": {
    "theme": "light",
    "recallSeconds": 10,
    "examTimerSeconds": 2100
  },
  "study": {
    "activePool": "technician",
    "indexes": {},
    "bookmarks": {}
  }
}
```

The precise migration and rollback policy must be recorded before implementation.
Existing progress and bookmarks must not be lost.

Deliverables:

- [ ] Centralize all storage reads, validation, migrations, and writes.
- [ ] Cache storage-availability detection rather than probing on every operation.
- [ ] Define the canonical key and schema-version policy.
- [ ] Define rollback behavior and the lifetime of legacy keys.
- [ ] Make migration idempotent and safe to rerun after a reload, exception, or
  partially completed write.
- [ ] Continue reading legacy keys until the complete versioned state has been
  validated and committed successfully.
- [ ] Migrate pool, indexes, theme, and bookmarks from existing keys without
  overwriting newer valid versioned data.
- [ ] Repair or safely ignore malformed stored values.
- [ ] Preserve operation when storage is unavailable.
- [ ] Persist recall and preferred exam-timer settings.
- [ ] Add a best-effort unload warning while a mock exam is active.
- [ ] Do not persist exam answers or results in this stage.
- [ ] Update privacy, Help, and architecture documentation.

Verification:

- [ ] Migration tests cover complete, partial, malformed, and absent legacy data.
- [ ] Failure-injection tests cover reload or exception before and after the new
  state is committed, followed by a successful rerun.
- [ ] Existing user state survives migration and reload.
- [ ] Storage-disabled operation remains functional.
- [ ] Unload protection is active only while an exam could be lost.
- [ ] `npm run test:unit`
- [ ] `npm run test:compat`

Suggested commit sequence:

1. `refactor: add versioned local storage with legacy migration`
2. `test: cover idempotent storage migration and recovery`
3. `fix: warn before discarding an active mock exam`

The unload warning remains a separate commit because it changes exam lifecycle
behavior rather than stored-state representation.

## Stage 5 — beta.2 integration and release

Goal: consolidate metadata and make the release process reliable and repeatable.

Deliverables:

- [ ] Establish a single pool configuration source for titles, elements, dates,
  sources, errata, expected counts, exam rules, timers, and blueprints.
- [ ] Consume the configuration from the app, Help, exam engine, build validation,
  and tests.
- [ ] Correct Technician-only package and PWA descriptions.
- [ ] Derive beta or stable display labels from the semantic version.
- [ ] Replace the literal `(beta)` assertions in `tests/app.spec.js` and
  `tests/pwa.spec.js` with expectations derived from the semantic version, and
  cover at least one prerelease and one stable-version rendering case.
- [ ] Validate question ID format, pool prefix, subelement, field types, expected
  counts, blueprint coverage, and figures at build time.
- [ ] Add pull-request CI.
- [ ] Add a generated-artifact freshness check.
- [ ] Route logic, compatibility, and responsive tests to appropriate projects so
  routine runs do not multiply every test across nine configurations.
- [ ] Keep the complete matrix available for release verification.
- [ ] Update all user and contributor documentation.
- [ ] Update the roadmap decision and completed-work logs.
- [ ] Bump the version and prepare release notes.

Release gate:

- [ ] `npm run build`
- [ ] `npm run test:unit`
- [ ] `npm run test:smoke`
- [ ] `npm run test:compat`
- [ ] `npm run test:responsive`
- [ ] Complete standalone matrix finishes uninterrupted
- [ ] `npm run test:pwa`
- [ ] Rebuilding leaves no unexpected tracked artifact differences
- [ ] Standalone remains at or below 1 MiB
- [ ] Every official figure is spot-checked against its source PDF
- [ ] Real iPhone or iPad installation and offline relaunch are verified

## Stage 6 — Better study workflows for 0.4

Goal: turn existing bookmarks, results, and pool structure into active study
tools.

Implement each item as a separate vertical slice with UI, accessibility, storage,
tests, Help updates, and regenerated artifacts:

- [ ] Bookmark browser with counts, filters, and jump-to-question.
- [ ] Study modes for all, bookmarked, random, and selected subelements.
- [ ] Answered/unanswered mock-exam navigator.
- [ ] Review-missed and retry-missed actions from exam results.
- [ ] Documented keyboard shortcuts that do not interfere with form controls or
  assistive technology.

Verification for every slice:

- [ ] State remains isolated by pool.
- [ ] Empty states and invalidated question IDs are handled.
- [ ] Touch targets and keyboard focus remain usable.
- [ ] Standalone and PWA behavior remain equivalent.
- [ ] Relevant unit, smoke, compatibility, responsive, and PWA tests pass.

## Stage 7 — PWA update lifecycle for 0.4

Goal: ensure that installed users receive pool errata and application corrections
predictably without disrupting active work.

Deliverables:

- [ ] Detect a newly installed or newly controlling service worker.
- [ ] Show a non-disruptive `Update ready` notification.
- [ ] Allow immediate reload or deferral.
- [ ] Never reload an active mock exam without confirmation.
- [ ] Expose the running version through diagnostics and Help.
- [ ] Test first install, unchanged reload, update discovery, deferral, acceptance,
  controller change, and offline behavior.
- [ ] Document how updates behave when the device remains offline.

## Stage 8 — Local learning progress for 0.5

Goal: help users identify weak areas without accounts, telemetry, or mandatory
cloud storage.

Recommended vertical slices:

- [ ] Attempt and correctness tracking.
- [ ] Per-subelement mastery summaries.
- [ ] Unseen-question and weak-area practice.
- [ ] Spaced-review scheduling.
- [ ] Optional interrupted-exam recovery.
- [ ] Optional local exam history.
- [ ] JSON export and import.
- [ ] A clear delete-all-local-data action.

Each new persisted structure requires a schema migration, size limit, validation,
privacy documentation, and corrupt-data recovery test. Exam persistence must be
optional or clearly disclosed.

## Parallel workstream — 2027 General pool

Goal: publish a verified replacement before the current General pool expires on
June 30, 2027. This deadline is independent of feature-release progress.

Owner: repository maintainer

Monitoring cadence: check the official NCVEC General-pool page monthly and record
the date and result in the execution log. After replacement material is
published, review changes weekly until the updated app is released.

- [ ] Monitor NCVEC for the official replacement pool and errata.
- [ ] Exercise the extractor and strict validation as soon as sources are
  published.
- [ ] Produce an ID-level added, changed, withdrawn, and figure-impact report.
- [ ] Export, map, and validate all replacement figures.
- [ ] Decide whether effective-date overlap requires both General pools to be
  selectable temporarily.
- [ ] Cross-check the parsed data against an independent source.
- [ ] Complete the full release gate and real-device offline verification.
- [ ] Publish the replacement before July 1, 2027.

## Workflow improvement backlog

Use this section for changes to how the project is developed rather than what the
application does.

- [ ] Create a small Node-based validation command covering banks, metadata,
  figures, and generated artifact size.
- [ ] Add a fast default verification command for routine local work.
- [ ] Separate PR verification, scheduled full-matrix testing, and release gates.
- [ ] Record full-suite duration and investigate significant regressions.
- [ ] Add a reusable manual accessibility and real-device release checklist.
- [ ] Add release notes or a changelog linked to roadmap completions.
- [ ] Review dependency versions and pinned GitHub Actions regularly.

## Decision points requiring explicit review

Do not silently decide these during implementation:

- How long legacy storage keys remain after successful migration.
- Whether PWA figures are inlined or separately precached.
- What figure enlargement interaction works best on older mobile browsers.
- Whether old and new General pools overlap in the UI during their transition.
- Whether exam recovery and history are opt-in, opt-out, or disabled by default.
- What evidence justifies exceeding the 1 MiB standalone size budget.

Record each resolution in the roadmap decision log before merging the dependent
feature.

## Execution log

Append one concise row after each completed or blocked implementation slice.

| Date | Stage | Commit or branch | Verification | Result and next step |
|------|-------|------------------|--------------|----------------------|
| 2026-09-03 | Planning | `d4b2b8a` | Roadmap review and `git diff --check` | Roadmap committed; implementation plan created; begin Stage 1. |
| 2026-09-03 | Stage 1 | `079ccac` | New `@compat` legend regression test passes on chromium-desktop, firefox-desktop, webkit-desktop, and webkit-mobile; `npm run test:smoke` 11/11; full `tests/mock-exam.spec.js` on chromium-desktop 64/64; `git diff --check` clean | `showExamQuestion()` now re-creates a visually hidden, question-specific `<legend>` ("Answer choices for `<id>`") before the radio labels. Legend deliverable complete. Next: remaining Stage 1 accessibility fixes (focus management, native subelement table). |
| 2026-09-04 | Stage 1 | `1677fe3` | Four `@compat` focus tests (setup focus, start/retake focus, exit/return focus, and explicit setup-cancel focus) pass on chromium-desktop, firefox-desktop, webkit-desktop, and webkit-mobile (16/16); `npm run test:smoke` 11/11; rebuild byte-identical; `git diff --check` clean | `#exam-session-heading` and `#exam-results-heading` are now `tabindex="-1"`; `startExam()` focuses the session heading, so start and retake move focus into the session view and the previously silent results-heading `focus()` now lands. Focus deliverables complete. Next: native subelement results table. |
| 2026-09-04 | Stage 1 | `e94d899` | Two focused table tests pass on chromium-desktop, firefox-desktop, webkit-desktop, and webkit-mobile (8/8); `npm run test:smoke` 11/11; `npm run test:responsive` 40/40; rebuild byte-identical; `git diff --check` clean; no `role="table"` remains | `#exam-subelement-table` is now a native `<table>` with static `<thead>` (`scope="col"` headers) and a JS-populated `<tbody id="exam-subelement-body">` using `th[scope="row"]` + `<td>`; div/span grid CSS replaced with plain table CSS. Scoring and ordering unchanged. Next: Windows path redaction, Mock Exam pool default. |
| 2026-09-05 | Stage 1 | `712f5e9` | `@compat` diagnostic-redaction test covers 31 path cases, including punctuation-bound POSIX paths, multiple `file:` slash forms, special-character usernames, encoded separators, and byte-for-byte preservation cases; passes on chromium-desktop, firefox-desktop, webkit-desktop, and webkit-mobile; all 4 diagnostics tests ×4 projects 16/16; `npm run test:smoke` 11/11; `npm run test:compat` 72/72; rebuild byte-identical; `git diff --check` clean | `safeError()` runs three ordered passes: (1) any path-like `file:` URL is masked to the end of its line regardless of slash form because an unquoted URL has no dependable terminator and privacy wins; (2) a Windows path is a drive letter at a non-path boundary + `Users` (any case) + raw or encoded (`%2F`/`%5C`) separators; (3) `/home` or `/Users` (case-significant) is redacted at start of text or after a non-alphanumeric, non-path boundary, covering common `path=`, `cwd:`, and bracketed diagnostics without matching remote or nested path segments. Separators are matched literally, never decoded, so unrelated encoded prose is preserved and `%ZZ` cannot throw. Next: Mock Exam pool default. |
| 2026-09-06 | Stage 1 | `01016fc` | New focused `@compat` test "Mock Exam setup defaults to the active study pool" passes on chromium-desktop, firefox-desktop, webkit-desktop, and webkit-mobile (4/4); `npm run test:smoke` 11/11; `npm run test:compat` 76/76; rebuild byte-identical (generated-file hashes unchanged on a second build); `git diff --check` clean | `openExamSetup()` now sets `#exam-pool-select.value = currentPool` after the lazy option build and before `updateExamSetupMeta()`, so opening Mock Exam while studying General or Extra defaults the exam pool, setup metadata, and pool-specific timer default (Technician/General 2100 s, Extra 3000 s) to the active study pool. It re-applies on every open, so a manual exam-pool choice is discarded when setup is cancelled and reopened. Choosing an exam pool still does not change the active study pool, and focus still lands on `#exam-pool-select`. Stage 1 defect fixes complete; next: regression-test sweep and affected-doc updates. |
| 2026-09-06 | Stage 1 | `ca6e304` | `npm run build` twice, byte-identical; `npm run test:unit` 20/20; `npm run test:smoke` 11/11; `npm run test:compat` 80/80; new keyboard-only answer test 4/4 across compatibility projects; `git diff --check` clean | All six fixes and their regression coverage verified; added keyboard-only radio interaction coverage and updated architecture, testing, security, and Help documentation. Physical screen-reader checks and real Apple-device install/offline relaunch remain release checks. Next: Stage 2 or Stage 4. |
| 2026-09-06 | Stage 2A | `df711f3` | Independently derived inventory from `data/*.json` with `/\bfigure\s+([A-Za-z][0-9]*-[0-9]+)(?![A-Za-z0-9_-])/i` over prompt + choices: Technician 12 (T-1,T-2,T-3), General 5 (G7-1), Extra 27 (E5-1,E6-1,E6-2,E6-3,E7-1,E7-2,E7-3,E9-1,E9-2,E9-3) = 44 questions / 14 figures — matches the expected inventory. Added optional normalized `figure` field to exactly those 44 records (diff = a comma on each `"ref"` line + one `"figure"` line, nothing else; 1,431 questions preserved). New `scripts/figure-references.js` (dependency-free CommonJS) wired into `scripts/build.js` `loadPool()` as a hard gate. Code-review follow-up: `TEXT_REF_RE` gained a trailing `(?![A-Za-z0-9_-])` so a valid prefix inside a longer token (`figure T-1a`, `figure T-1-2`, `figure T-1_extra`, `figure E9-12a`) matches nothing instead of yielding a shorter ID; punctuation-terminated refs (`figure T-1.` `,` `?` `(Figure E9-3)`) still detected. `npm run test:unit` 57/57 (20 exam-engine + 37 figure-references, both files via updated `test:unit`); `npm run build` OK (`dist/index.html` 633,892 B ≈ 0.605 MiB, < 1 MiB); `npm run test:smoke` 11/11; negative build check on tampered fixture copies — missing, mismatched, cross-pool, and format-invalid mappings each abort the build (exit 1) before writing artifacts, tracked `data/` untouched; `npm run build` twice byte-identical (artifact hashes unchanged by the regex fix); `git diff --check` clean. Next slice (Stage 2B): `data/figures.json` manifest + SVG/PNG asset requirements and checksum/unused-mapping validation. |
| 2026-09-07 | Stage 2B | `a0e7e0f` | Added `docs/FIGURE_PIPELINE.md` (manifest schema v1 + source registry; fail-closed SVG element/attribute allowlist; static-PNG chunk subset; strict symlink-rejection path policy; sha256 rule; 1 MiB contract vs. packaging enforcement; future build-integration point) and `scripts/figure-manifest.js` (dependency-free CommonJS: `validateSvg`, `validatePng` with a local CRC-32 table, `validateManifestShape`, `validateManifestAgainstQuestions` reusing Stage 2A `figure-references.js`, `validateManifestAssets` with injected repo root + `fs`, `validateFigurePipeline`/`assertFigurePipeline`, path-safety primitives). New `tests/unit/figure-manifest.test.js` (102 cases, synthetic fixtures + temp fixture roots): SVG accept/reject incl. quote styles, whitespace, entities, namespaces, DOCTYPE/PI/comment, malformed markup; PNG accept/reject incl. bad signature, truncation, interlace, dimension/byte limits, tEXt metadata, APNG, CRC mismatch, PLTE, chunk count; manifest shape, dup id/path, cross-pool, provenance, alt rules, hand-tracing review; question cross-check against real pools (full 14-figure synthetic manifest → 0 errors; missing/unused/wrong-pool entries flagged); asset checks incl. sha mismatch, disguised file types, unlisted assets, path traversal, symlink escape, source-PDF existence/checksum; no-mutation. `npm run test:unit` 159/159 (20 exam-engine + 37 figure-references + 102 figure-manifest, all three files via updated `test:unit`); `npm run build` OK — `dist/index.html` 633,892 B; generated artifacts **byte-identical** to the pre-slice baseline (`dist/` unchanged, sha256 `4cb0b3ea…` / `0ca8acc2…` / `3926df56…`); `git diff --check` clean. `scripts/build.js` unchanged; no `data/figures.json`; no deps; version untouched. Remaining Stage 2 work: acquire official PDFs + assets, author the real `data/figures.json`, wire `assertFigurePipeline` into `scripts/build.js` as a mandatory gate, per-figure fidelity review, then Stage 3 rendering/packaging. |
| 2026-09-07 | Stage 2B (review fixes) | `a0e7e0f` | Security-review follow-up to the Stage 2B validator (three independently reproduced `validateSvg` defects; still no manifest, no assets, not a build gate). **(1) Encoded external references.** Attribute values are now inspected after resolving the permitted XML character references *and* CSS escape sequences (`\26 `, `\000075`, `\28`, line continuations); the `url(...)`/URI-scheme checks run on that decoded value. `fill`/`stroke`/`color` additionally get a fail-closed value allowlist (`none`/`currentColor`/`transparent`/`inherit`, hex, numeric `rgb()`/`hsl()`, CSS `<named-color>`); every `url(...)` paint reference and bare identifier is rejected. `<path fill="&#117;rl(&#104;ttps://…)">` → `SVG: "url(...)" reference in attribute "fill"`. **(2) Inherited element names.** Element membership is an `Object.prototype.hasOwnProperty` check, so `<constructor>`, `<toString>`, `<__proto__>` (with or without attributes, self-closing or paired) return `SVG: <name> is not in the allowed element subset` instead of being accepted or throwing `TypeError`. **(3) Invalid XML characters.** After the strict UTF-8 decode the *whole* document is scanned once against the XML 1.0 `Char` range (C0 controls except tab/LF/CR, surrogates, `U+FFFE`/`U+FFFF`, `> U+10FFFF`), and numeric references are range-checked the same way — so `&#0;`, `&#xFFFF;`, `&#x110000;`, literal `U+0001`, a literal `U+FFFE` (valid UTF-8), **and** a vertical tab / form feed used as markup whitespace all fail. Follow-up to reviewer's P2: the tokenizer no longer treats JavaScript `\s` as a separator (it matched VT/FF, which slipped past the per-node checks between attributes / around `=` / inside closing tags) — it now recognises only the XML `S` set (space, tab, CR, LF), and the document-wide character scan is the authoritative check (the earlier per-text-node / per-attribute-value scans were removed as redundant). Buffer UTF-8 validity uses `TextDecoder({ fatal: true })` (Node-built-in, no deps) instead of a decoded-byte-length comparison; string inputs reject unpaired surrogates. New exports: `SVG_PAINT_ATTRS`, `isAllowedPaintValue`. `docs/FIGURE_PIPELINE.md` §5.1 rewritten to state the decode-then-check order, the paint-value allowlist and its intentional omissions (gradient/pattern refs, space-separated CSS Color 4), the document-wide XML character range + XML-only markup whitespace, and the strict UTF-8 decode. `tests/unit/figure-manifest.test.js` +41 cases: exact reproductions; decimal/hex entity and CSS-escaped encodings of `url(`; protocol-relative refs; ordinary static paint values and benign encoded text preserved; prototype-property element names with/without attributes and with a close tag; out-of-range/surrogate/non-character numeric refs and literal C0 controls in text and attributes; VT/FF used as start-tag / between-attribute / around-`=` / closing-tag whitespace, with legitimate space/tab/CR/LF in every markup position still passing; invalid-UTF-8 buffers (overlong, truncated, encoded surrogate, `> U+10FFFF`, lone continuation) and valid non-ASCII/emoji labels; a malicious entity-encoded SVG on disk rejected through `validateManifestAssets` and `validateFigurePipeline`; rejected inputs return an errors array, never throw. `npm run test:unit` **200/200** (20 exam-engine + 37 figure-references + 143 figure-manifest); `npm run build` OK — `dist/index.html` 633,892 B, generated artifacts **byte-identical** to the pre-fix baseline (`4cb0b3ea…` / `0ca8acc2…` / `3926df56…` / `34b7c35e…`), confirmed on a second build; `git diff --check` clean; only `scripts/figure-manifest.js`, `tests/unit/figure-manifest.test.js`, `docs/FIGURE_PIPELINE.md`, and this log touched. `scripts/build.js` unchanged; no `data/figures.json`; no deps; version untouched. Browser suites not run (no runtime source or generated-artifact change). Remaining Stage 2 work unchanged: acquire official PDFs + assets, author the real `data/figures.json`, wire `assertFigurePipeline` into the build as a mandatory gate, per-figure fidelity review, then Stage 3. |
| 2026-09-07 | Stage 2C | `805cf7e` | Acquired the real figure material and built the real manifest; **no** build wiring, rendering, PWA, dependency, version, question-content, or mapping changes. **Sources.** The three NCVEC pool PDFs already in `data/pool-sources/` were re-downloaded from the current NCVEC release pages on 2026-09-07 and confirmed **byte-identical** (SHA-256) to the working-tree copies: Technician 2026-2030 (19 Feb 2026 errata, `3618649d…`, 79 pp), General 2023-2027 (6th errata 4 Feb 2026, `0627221f…`, 87 pp), Extra 2024-2028 (4th errata 4 Feb 2026, `9cc63ae0…`, 121 pp). `.gitignore` gains three narrow `!` exceptions so these ~1.9 MiB of PDFs are **tracked** (a fresh checkout can reproduce extraction and full provenance validation); all other `data/pool-sources/` working files stay ignored. All three match `src/app.js` pool metadata exactly — no source/bank discrepancy; newest pools not substituted. NCVEC "releases into public domain" the pools. **Extraction.** All 14 figures are embedded raster images in the pool PDFs (`pdfimages -list`); vector SVG export is not viable without redrawing, so all 14 are faithful `raster-export` PNGs. New `scripts/figure-extract.js` (dependency-free Node; shells to `pdfimages`/`convert`/`optipng`; **not** wired into the build): extracts each embedded image at native resolution, flattens its fully-opaque soft mask onto white, converts to grayscale (every figure verified monochrome — the only non-neutral pixels are balanced JPEG chroma-ringing), and runs `optipng -o5 -strip all`. `node scripts/figure-extract.js --check` re-derives all 14 byte-identically (poppler 24.02.0 / ImageMagick 6.9.12-98 / optipng 0.7.8). Assets committed under `assets/figures/{technician,general,extra}/`, 8-bit grayscale, chunks `IHDR`/`IDAT`/`IEND`, 325,927 B total (largest 59,893 B). **Manifest.** New `data/figures.json` (schemaVersion 1): 3-entry `sources` registry (pool, tracked PDF path, NCVEC https URL, edition/errata string, PDF sha256) + 14 figure entries (pool, source id, verified 1-based `sourcePage` — T-1 p78, T-2/T-3 p79, G7-1 p87, E5-1..E6-3 p119, E7-1..E9-1 p120, E9-2/E9-3 p121 — `raster-export`, neutral single-line `alt` reviewed against every one of the 44 questions and reworded where it would have hinted an answer, final-asset sha256). **Validation.** `validateFigurePipeline(data/figures.json, {real banks, repoRoot, fs})` → **0 errors** (shape + question cross-check + on-disk assets + source-PDF checksums). New `tests/unit/figure-manifest.test.js` block "real figure manifest and assets (Stage 2C)" (+9 cases, no skips): source PDFs present, shape, question coverage/no-leftovers, `validateManifestAssets` (assets **and** source PDFs) zero errors, full `validateFigurePipeline`/`assertFigurePipeline`, inventory lock (14 / 3 sources / 3-1-10 per pool), per-figure source-page lock, alt-text bounds + no answer words, source-PDF sha match. `npm run test:unit` **209/209** (20 exam-engine + 37 figure-references + 152 figure-manifest); `npm run build` OK — `dist/index.html` 633,892 B, `dist/` **byte-identical** to the pre-change baseline (`4cb0b3ea…` / `0ca8acc2…` / `3926df56…` / `34b7c35e…`) on a repeat build (assets are not embedded yet); `git diff --check` clean. `scripts/build.js`, `package.json`, `src/**`, `data/*.json` question banks untouched. **Fidelity:** `docs/FIGURE_REVIEW.md` (new) records agent visual comparison of all 14 against their source pages plus provenance and the size/packaging estimate (base64 inline ≈ 435 KB > current standalone headroom → 1-bit re-encode ~95 KB or separate PWA precache, decided in 2D/3); **per-figure human review is PENDING** and Stage 2 is not complete. **Next (Stage 2D):** wire `assertFigurePipeline` into `scripts/build.js` as a mandatory gate; obtain human fidelity sign-off. |
| 2026-09-07 | Stage 2D | `15d5a66` | Made figure validation a **mandatory build gate**; **no** runtime, asset, dependency, version, or manifest/bank content changes. **`scripts/build.js`:** `main()` now calls a new `assertFigureManifest(banks)` immediately after the three pools are loaded (which already runs the Stage 2A per-pool reference gate inside `loadPool`) and **before the first output mutation** — `fs.mkdirSync(OUT_DIR)` / `fs.writeFileSync(OUT_FILE)` / `fs.rmSync(PWA_OUT_DIR)` / the PWA writes / the manifest+icon copies. `assertFigureManifest` reads and `JSON.parse`s `data/figures.json` (an unreadable file or invalid JSON throws a build error naming the manifest), then calls the existing `figureManifest.assertFigurePipeline(manifest, { banks, repoRoot: ROOT, fs })` — schema, question cross-check vs. all three pools, on-disk asset content + exact checksums, safe paths, unlisted assets, and every checksum-pinned source PDF (a missing PDF is an error — committed input). `main()` is unguarded, so any throw exits nonzero before `dist/` is touched. No skip flag / optional mode / missing-source fallback / network / extraction. Diff is +1 require, +2 path consts, +1 helper (~25 lines), +1 call; no other build logic changed. **Tests:** new `tests/unit/build-gate.test.js` (14 cases) drives `node scripts/build.js` in isolated temp-repo fixtures (real banks / PDFs / assets / `dist/` never mutated — only per-test copies): valid build succeeds + repeat build byte-identical; and each failure aborts nonzero with an actionable diagnostic — missing manifest, malformed JSON, missing asset, asset sha mismatch, missing source PDF, source-PDF sha mismatch, duplicate entry, unused entry, cross-pool entry, and a **checksum-matching but unsafe SVG (`<script>`)** proving content (not just checksum) validation runs; plus a pre-existing `dist/` tree (with sentinel files) left **byte-identical** on failure, no `dist/` created where none existed, and the Stage 2A gate still firing. `package.json` `test:unit` gains the new file. **Verification:** `npm run test:unit` **223/223** (20 exam-engine + 37 figure-references + 152 figure-manifest + 14 build-gate); `npm run build` OK — full generated-output inventory (`dist/index.html` + `dist/pwa/**`, 9 files) **byte-identical** to the pre-change baseline and to a repeat build (`4cb0b3ea…` / `0ca8acc2…` / `3926df56…` / `34b7c35e…` + 5 unchanged icons); `git diff --check` clean; scope = `scripts/build.js`, `tests/unit/build-gate.test.js`, `package.json`, `AGENTS.md`, `docs/FIGURE_PIPELINE.md`, `docs/IMPLEMENTATION_PLAN.md`. Browser suites not run (no runtime source or generated-output change). **Still open:** per-figure **human** fidelity review (`docs/FIGURE_REVIEW.md` §7) — structural gate ≠ visual correctness; Stage 2 not marked complete. |
| 2026-09-07 | Stage 2 experiment | `e04c6f9` | **Bounded figure-encoding experiment — recommendation only; no production asset, `data/figures.json`, source PDF, or build/extraction script changed.** New: `docs/FIGURE_OPTIMIZATION.md`, `scripts/figure-optim-experiment.js` (experiment helper, not build-wired). Edited: this plan's size-budget deliverable note. **Baseline (re-measured):** `dist/index.html` 633,892 B; budget 1,048,576; headroom 414,684; 14 assets 325,927 B on-disk / **434,592 B actual base64** → inlining as-is overshoots the budget by ~20 KB before any Stage 3 code. All 14 are grayscale colour type 0 / bit depth 8. **Candidates** (native size/orientation kept; ImageMagick 6.9.12 + optipng 0.7.8, all run through the unmodified `validatePng` — all pass): `opt` lossless (optipng -o7) = **0 bytes saved** (assets already ran optipng -o5; the tested optimiser saved nothing, other lossless approaches were not evaluated; a lossless-only path would need ~89 KB base64 off the figure payload); `g16` 16-level grayscale `-depth 4` no-dither = 298,312 B b64; `g4` 4-level = 199,204 B b64 but visible anti-alias-halo banding + E5-1 background turns mid-gray; `p16` adaptive 16 = 302,296 B b64 (larger than g16); `p4` = drops 300–3,004 thin line px per schematic (reject); `bw` 1-bit = 94,892 B b64 but fragments the thin polar/Smith grids of E9-1/E9-2/E9-3 and jags all text (reject as general). Pixel metrics: for `g16` the `maxΔ ≤ 16` bound makes the dropout/`>64Δ` threshold tests **vacuously zero** — not fidelity evidence; they only rule out the coarser candidates. **Agent visual inspection of all 14 figures** (base|g16|g4|bw, native + 1–3× zoom; two montage batches): `g16` **visually indistinguishable from the 8-bit baseline on all 13 recommended figures** — small numerals, thin wires/grids, junction dots, arrowhead fill/direction, FET/BJT + gate/channel distinctions, inversion bubbles, chart scales and call-outs all preserved. **E5-1 exception:** its background is value 254 (not 255) and a contrast stretch reveals faint pre-existing ghost artifacts in NCVEC's raster; `g16`/`g4` posterisation makes them visible → **keep E5-1 at 8-bit**, and flag a separate follow-up to consider a cleaner official E5-1 source (do not substitute here). **Recommendation:** `g16` for 13 figures + E5-1 unchanged = 229,489 B on-disk / **306,008 B base64**. **Packaging estimate (labelled estimate, not compliance):** projected `dist/index.html` 943,208 B (633,892 + 306,008 + 308 data-URL prefixes + ~3,000 registry/`alt`) → 105,368 B under budget → **39,832 B free after a 64 KiB Stage 3 planning allowance** (independent review reproduced this). PWA precache does not relieve the standalone budget. **Verification:** all recommended candidates pass `validatePng`; `npm run test:unit` **223/223**; `git diff --check` clean; production assets / PDFs / manifest / `scripts/build.js` / `scripts/figure-extract.js` / `scripts/figure-manifest.js` / runtime sources / `package.json` all unchanged (`git diff` empty). Browser suites not run (irrelevant to this experiment). **Pending:** human sign-off of the `g16` re-encode + the E5-1 decision — this experiment does not adopt any encoding. Experiment artifacts (candidate PNGs + `results.csv`) in a temp dir named in `docs/FIGURE_OPTIMIZATION.md` §7 (not committed). |
| 2026-09-07 | Stage 2 encoding adoption | `c6382c7` | Adopted the selected encoding — **no** rendering/UI, PWA, build-gate, validator-policy, dependency, version, question-bank, source-PDF, figure-ID, source-page, or `alt`-text changes. **User decision:** move forward with 16-level grayscale (`g16`) for 13 figures + the existing 8-bit E5-1 unchanged; encoding comparisons not reopened; `p4` stays a documented future option. Recorded as **user visual feedback + authorisation to adopt**, distinct from a formal per-figure source-PDF comparison. **`scripts/figure-extract.js`:** added an `encoding` field per figure — `"grayscale8"` (E5-1: unchanged Stage 2C recipe, `optipng -o5`) vs `"g16"` (the other 13: `convert <8-bit baseline> -colorspace Gray +dither -depth 4 -strip -define png:exclude-chunks=bkgd,date,time,text` then `optipng -o7 -strip all` → colour type 0 / bit depth 4). The quantisation input is always the fresh 8-bit baseline from the checksum-pinned PDF; committed assets are never re-quantised; `--check` stays a non-mutating reproducibility check; extraction is still not invoked by the build. **Assets:** regenerated exactly the 13 `g16` PNGs (E5-1 byte-for-byte untouched, sha256 `2ecf1e64…`). Bytes **byte-identical to the Stage 2 experiment candidates** (all 13 shas match). All 14 native dimensions unchanged. Aggregate **229,489 B on-disk / 306,008 B base64** (was 325,927 / 434,592). **`data/figures.json`:** updated **only** the 13 `sha256` fields (diff = 13 `-`/`+` sha lines, nothing else; E5-1 entry untouched). **Tests:** new `tests/unit/figure-manifest.test.js` block "adopted figure encoding (g16 + E5-1 8-bit)" (+5 cases, offline, no external tools — reads PNG headers via `validatePng`): all 14 pass the restricted PNG subset; the 13 are colour type 0 / bit depth 4; E5-1 is colour type 0 / bit depth 8 with its exact pre-change sha256 (asset **and** manifest); every figure keeps its pre-change WxH; every manifest sha256 matches committed bytes. **Verification:** `npm run test:unit` **228/228** (20 exam-engine + 37 figure-references + 157 figure-manifest + 14 build-gate), 0 skipped; `node scripts/figure-extract.js --check` → all 14 reproduce byte-identically; the mandatory build gate (`validateFigurePipeline`, `assertFigurePipeline`) → 0 errors against the new assets + updated checksums; `npm run build` twice → full `dist/` inventory (9 files) **byte-identical** to the pre-change baseline (`4cb0b3ea…` / `0ca8acc2…` / `3926df56…` / `34b7c35e…` + 5 icons) — assets are not embedded yet; `git diff --check` clean. **Packaging estimate (estimate, not compliance):** projected `dist/index.html` ≈ 943,208 B → ≈ 39,832 B free after a 64 KiB Stage 3 allowance. **Docs:** `docs/FIGURE_REVIEW.md` §2/§4/§5/§6/§7 (per-figure encoding, updated sizes, four distinct evidence kinds incl. user authorisation vs pending human source-PDF sign-off), `docs/FIGURE_OPTIMIZATION.md` (ADOPTED banner; kept as historical experiment record), `docs/FIGURE_PIPELINE.md` (status + §7 + resolved design decision). **Scope touched:** `scripts/figure-extract.js`, the 13 PNGs, `data/figures.json` (13 sha), `tests/unit/figure-manifest.test.js`, and the four docs. Browser suites not run (no runtime source or generated-output change). **Still open:** human source-PDF fidelity sign-off for all 14 (`docs/FIGURE_REVIEW.md` §7) — Stage 2 not marked complete; ready for Stage 3A rendering. |
| 2026-09-08 | Stage 3A | `5109df2` | Inline figure packaging + study-mode rendering + standalone byte-budget gate. **No** asset / `data/figures.json` / question-bank / manifest-alt / dependency / version / PWA-file / service-worker / CSP-policy changes. **Packaging (`scripts/build.js`):** after the mandatory figure gate (which now also **returns** the parsed manifest), `buildFigureRegistry()` reads the *validated* asset bytes and builds one registry per generated HTML doc — `window.HAM_EXAM_FIGURES = { "T-1": { src: "data:image/png;base64,…", alt, w, h }, … }` — via the existing `asInlineScript` escaping (no `JSON.parse` on `textContent`, no runtime fetch). Each asset is embedded **once per document, not once per referencing question**; source PDFs / provenance / other manifest fields are not embedded. New `__FIGURES__` template placeholder is emitted in both `dist/index.html` and `dist/pwa/index.html` (identical registry; no separate PWA files, no new precache entries). **Budget:** the build computes `Buffer.byteLength(finalStandaloneHtml, "utf8")` after templating + CSP and **throws before any `dist/` create/write/copy/remove** if it exceeds `STANDALONE_BUDGET_BYTES` (1,048,576); the error names the actual bytes and the limit; no skip flag, no silent asset omission. **Rendering (`src/index.html` + `src/app.js` + `src/style.css`):** reusable `<figure id="study-figure">` (visible `Figure <id>` caption via `textContent`, `<img>` with the manifest `alt` set as text, `width`/`height` from the registry for a stable aspect ratio, `filter: none` so themes never tint exam images, `.study-figure-frame { max-width: 560px }` for no horizontal overflow). `renderStudyFigure(question)` is called from `showQuestion()`; keeps no state (reusable for exam/results later). No-figure questions hide the container and clear image src / alt / caption; a missing registry entry shows a concise "Figure unavailable" indication and never falls back to the previous image (a valid build prevents this). Navigation, pool switch, bookmarked-question nav, and reload all pick the right figure; timers / reveal / bookmarks / progress / themes / Help unchanged. **Sizes:** `dist/index.html` **946,885 B** (101,691 B under the 1,048,576 budget); `dist/pwa/index.html` **949,299 B**; registry 309,190 B inline; build deterministic across repeat runs; `dist/pwa/sw.js` cache version re-derived normally. Only `dist/index.html`, `dist/pwa/index.html`, `dist/pwa/sw.js` regenerated (icons / manifest unchanged). **Tests:** `tests/unit/build-gate.test.js` +5 (registry covers all 14 once, bytes+alt match the validated assets, both targets, real standalone ≤ budget, oversized final HTML fails through the real entry point before any output + leaves a pre-existing tree byte-identical); `tests/app.spec.js` +8 (loaded image/caption/alt for figure questions across all three pools, shared-figure reuse, no stale image on figure↔non-figure nav, pool switch + reload selection, `@responsive` no overflow, no network, `@compat` unchanged figure CSP); `tests/pwa.spec.js` +1 (embedded figure shows after an offline reload, Chromium). **Verification:** `npm run test:unit` **233/233**, 0 skipped; `npm run test:smoke` 12/12; `npm run test:compat` 88/88; `npm run test:responsive` 44/44; `npm run test:pwa` 12 passed / 2 skipped (webkit-mobile offline, pre-existing); full `app.spec.js` 50/50 on chromium-desktop and the figure subset green on firefox-desktop + webkit-desktop; `npm run build` twice → identical `dist/`; `git diff --check` clean. Full standalone matrix and manual device review not run. **Docs:** `docs/ARCHITECTURE.md` (figure packaging + budget + inline-script order), `docs/TESTING.md`, `README.md`, `src/index.html` Help. **Out of scope / deferred:** mock-exam + results figure rendering, figure enlargement/zoom. **Still open:** per-figure **human** source-PDF fidelity sign-off (`docs/FIGURE_REVIEW.md` §7) — browser tests do not establish content fidelity. |
| 2026-09-08 | Stage 3B | `bb3ca2b` | Figure rendering in active mock-exam questions and results review. **No** change to question selection, scoring, timer logic, persistence, exam-session privacy, the registry / build-gate / manifest / assets, CSP, storage keys, dependencies, or version. **Shared renderer (`src/app.js`):** the Stage 3A `renderStudyFigure()` body became `renderFigureInto(question, els)` — `els` supplies `{container, caption, frame, img, unavailable}` by reference. `renderStudyFigure()` / new `renderExamFigure()` resolve fixed IDs (`#study-figure*` / `#exam-figure*`); new `buildReviewFigure(question)` builds a fresh **class-scoped** `<figure class="study-figure exam-review-figure">` (no IDs) per figure-bearing review item and returns `null` for non-figure questions. Metadata via `textContent` only; missing-entry path unchanged (clears image, shows "Figure unavailable", never a stale image). **Active exam (`src/index.html` + `showExamQuestion()`):** `#exam-figure` sits between `#exam-question` and `<fieldset id="exam-choices">` — a sibling, never inside the fieldset; `renderExamFigure(q)` runs on every question change, so Next/Previous update or clear it while answers (kept in `examSession.answers`) survive. Legend, radio group name, keyboard nav, and focus destinations untouched. `exitExam()` / `returnToStudyFromResults()` also call `renderExamFigure(null)`. **Results review:** in the existing `examSession.questions` loop, a review figure is appended after the question text only when `q.figure` is set; questions sharing a figure ID reuse the same registry `src` string (registry not duplicated); review filtering, order, scoring, and the native subelement table unchanged. **CSS (`src/style.css`):** `.exam-figure` / `.exam-review-figure` reuse the `.study-figure*` visual rules (untinted `img`, responsive width, stable aspect ratio) with only spacing differences; `.exam-review-figure .study-figure-frame { max-width: 460px }`. **Help:** study-mode-only wording replaced with study + exam + results; enlargement noted as not yet available. **Sizes:** `dist/index.html` **950,761 B** (97,815 B under the 1,048,576 budget; mandatory gate passed); `dist/pwa/index.html` **953,175 B**; `dist/pwa/sw.js` cache version re-derived normally; registry still 309,190 B (assets unchanged). `npm run build` twice → identical `dist/` (all 9 files). Regenerated: `dist/index.html`, `dist/pwa/index.html`, `dist/pwa/sw.js`. **Tests:** `tests/mock-exam.spec.js` +9 in a new `mock exam figures (Stage 3B)` describe — deterministic sessions built by replacing the live `examSession.questions` list: `@smoke` active-exam figure (caption/alt/registry src/dims/loaded, figure not inside the fieldset), `@compat` all three pools, figure→non-figure→figure nav with answers preserved, runtime-removed registry entry → unavailable with no stale image, `@compat` legend + keyboard radio group intact with a figure present, results review (one figure per figure-bearing item, shared figures = one data URL, right item association, no duplicate IDs in `#exam-results`), retake clears prior results + empty answers, return-to-study restores the prior study question and its figure, `@responsive` exam + results sizing. `tests/pwa.spec.js` +1 (Chromium: figures in an active exam and its results review after an offline reload). Image-load assertions use retrying `expect.poll` on `img.complete && img.naturalWidth > 0`. **Verification:** `npm run test:unit` **233/233**, 0 skipped; `npm run test:smoke` 13/13; `npm run test:compat` 96/96; `npm run test:responsive` 48/48; `npm run test:pwa` 13 passed / 3 skipped (webkit-mobile offline, pre-existing); full `app.spec.js` + `exam-engine.spec.js` 51/51 and full `mock-exam.spec.js` 80/80 on chromium-desktop; `npm run build` twice → identical `dist/`; `git diff --check` clean. Full 9-project standalone matrix and firefox-mobile/tablet for the new tests not run; manual device/theme visual review not performed. **Out of scope / deferred:** figure enlargement / zoom / modal. **Still open:** per-figure **human** source-PDF fidelity sign-off (`docs/FIGURE_REVIEW.md` §7) — the 3B browser tests confirm structural rendering, not content fidelity. |
| 2026-09-08 | Stage 3C | `3a5cc9c` | Shared accessible figure enlargement. **No** change to question selection, scoring, timer logic/policy, persistence, exam-session privacy, the registry / build-gate / manifest / assets, CSP, storage keys, dependencies, or version; browser zoom untouched; adjustable zoom / custom pinch / drag-to-pan not implemented (deferred, `docs/ROADMAP.md`). **Trigger (`renderFigureInto`):** each figure container gains an `Enlarge Figure <ID>` `<button>` — fixed IDs `#study-figure-enlarge` / `#exam-figure-enlarge`, class `exam-review-figure-enlarge` (no IDs) for review items; shown only for a usable registry entry, reset (hidden, `onclick=null`, generic label) for non-figure and unavailable images. `.onclick` is reassigned per render (never `addEventListener`) and passes the exact button as the opener. **Viewer (`src/index.html` `#figure-viewer`):** one modal, `role="dialog"` `aria-modal="true"`, labelled by the visible `Figure <ID>` `<h2>`; reuses `window.HAM_EXAM_FIGURES` (no second registry, no fetch). Controls: **Fit to window** / **Actual size** / **Close**, in a fixed bar outside the scrolling stage; `aria-pressed` mirrors the mode, and the selected control paints `--accent` under a new per-theme `--on-accent` foreground (white in light; near-`--bg` dark in dark/night) so it clears 4.5:1 in all three themes — `--accent` is dark in light theme but light in dark/night, so a fixed white foreground failed contrast there (review fix). Opens in fit every time. Fit = `max-width/height:100%` (whole image, aspect kept, no upscaling); actual = constraints dropped so the `<img>` lays out at intrinsic CSS px and the `tabindex="0"` stage (`overflow:auto`, `overscroll-behavior:contain`) scrolls by keyboard/touch. Image keeps `filter:none` on `#fff`. **Isolation (`src/app.js`):** full-viewport backdrop absorbs background pointer events; capture-phase `document` `keydown` (Tab/Shift+Tab wrap; Escape closes) + a `focusin` guard that returns stray focus to Close — added on open, removed on close (no handler accumulation). `body.figure-viewer-open { overflow:hidden }` locks background scroll; offset saved on open, restored on close. Focus moves to Close on open. **Lifecycle:** `closeFigureViewer({transition:true})` is called from `showQuestion()`, `showExamQuestion()`, `showExamResults()`, `openExamSetup()`, `exitExam()`, `returnToStudyFromResults()`, `retakeExam()`, `openHelp()`. Ordinary Escape/Close returns focus to the exact opener (per results entry for shared figures); a transition close blurs into `<body>` and lets the destination's own focus win — so a practice-timer expiry while open closes the viewer, submits normally, and focuses `#exam-results-heading`. Study/exam timers keep running (no pause-on-view). **Sizes:** `dist/index.html` **966,113 B** (82,463 B under the 1,048,576 budget; mandatory gate passed); `dist/pwa/index.html` **968,527 B**; `dist/pwa/sw.js` cache version re-derived normally; registry still 309,190 B (assets unchanged). `npm run build` twice → identical `dist/` (all 9 files). Regenerated: `dist/index.html`, `dist/pwa/index.html`, `dist/pwa/sw.js`. **Tests:** `tests/app.spec.js` +12 (study viewer: fit open + caption/alt/registry src + loaded; actual-size intrinsic px + scroll + return to fit; fit on every open; `@compat` keyboard-only open/switch/Escape → focus to opener; `@compat` Tab/Shift+Tab containment + background control covered; Escape and Close both dismiss + refocus; question change dismisses without trapping focus; recall timer keeps running; no button for non-figure; `@compat` no duplicate IDs; `@compat` selected view-mode control meets 4.5:1 contrast in light/dark/night; `@responsive` fit + reachable controls + actual-size scroll). `tests/mock-exam.spec.js` +11 (`@smoke` open from exam + Close refocus; two results entries sharing a figure refocus independently; `@compat` no duplicate IDs in results; question change / retake / return-to-study dismiss; opening changes no answers/session state; `@compat` keyboard containment; `@responsive` small-viewport use; and in the fake-clock suite, timer-expiry-while-open → normal submission + results-heading focus). `tests/pwa.spec.js` +1 (Chromium: offline enlargement + actual-size scroll + focus restore). Image-load assertions use retrying `expect.poll`. **Verification:** `npm run test:unit` **233/233**, 0 skipped; `npm run test:smoke` 15/15; `npm run test:compat` 120/120; `npm run test:responsive` 56/56; `npm run test:pwa` 14 passed / 4 skipped (Chromium-only offline tests skip on webkit-mobile); full `app.spec.js`+`exam-engine.spec.js`+`mock-exam.spec.js` **153/153** on chromium-desktop; the new untagged 3C tests also green on firefox-desktop + webkit-desktop; `npm run build` twice → byte-identical `dist/` (9 files); `git diff --check` clean. **Not run:** full 9-project standalone matrix; firefox-mobile/tablet for the new tests; real-device touch pinch/scroll and screen-reader dialog semantics. **Still open:** manual mobile/desktop + a11y device review (3C) and the per-figure **human** source-PDF fidelity sign-off (`docs/FIGURE_REVIEW.md` §7) — browser tests confirm behaviour and structure, not content fidelity. |

## Plan revision log

| Date | Change | Reason |
|------|--------|--------|
| 2026-09-03 | Initial staged implementation plan | Preserve delivery sequence, gates, and workflow across sessions. |
| 2026-09-03 | Strengthened figure, migration, CSP, semver-test, and pool-monitoring requirements | Incorporate independent implementation-plan review before Stage 1. |
