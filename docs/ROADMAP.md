# Product and Engineering Roadmap

This document records known defects, proposed enhancements, and recommended next
steps for the US Ham Exam study app. It is intended to remain the shared source
for release planning and continuous improvement.

Execution order, checklists, and session handoff notes are maintained in the
[roadmap implementation plan](IMPLEMENTATION_PLAN.md).

Current product direction (2026-09-20): the product has shipped through
**0.3.0-beta.5** (live, manually checked on desktop Chrome and Pixel 7a).
Everything the original roadmap baseline tracked as upcoming for beta.2 —
official figures, canonical pool identity and versioned storage, mock-exam
accessibility fixes, and Windows path redaction — is complete and released;
the P0/P1/P2 defects that drove that milestone are resolved (see "Resolved
defects (historical)" below). Three further slices shipped after beta.2:
transient scoped study navigation with human-readable subelement/group
labels (0.3.0-beta.3/beta.4, [scoped study plan](SCOPED_STUDY_PLAN.md)); a
"Getting Started" newcomer guide and the **US Ham Exam** rebrand
(0.3.0-beta.5); and a persisted Study order preference, Sequential or Random
(0.3.0-beta.5, [pool/storage plan](POOL_STORAGE_PLAN.md)). See the
completed-work log below for the full list with release/commit references.
The active open item is **Stage 6B, persisting the selected Study scope
across reload** ([scoped study plan](SCOPED_STUDY_PLAN.md)), explicitly
deferred pending release planning — see
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md). Existing release gates
remain; the standalone artifact's headroom is tight enough (see "Current
baseline" below) that it is now a standing constraint on any further
feature touching the standalone bundle, not a formality.

The most recent application slice was **newcomer onboarding clarity**
(committed as `86264e7` and deployed after beta.5): the Getting Started guide
now explains the license levels and first-study path in plain language, and
provides a safe "Start with Technician" action that preserves existing
per-pool progress and preferences. It was a focused usability improvement,
not a new amateur-radio reference portal.

Last reviewed: September 22, 2026

## Product principles

All roadmap work must preserve the project's core constraints:

- The standalone release remains a self-contained HTML file.
- The hosted PWA remains installable and works offline after its first load.
- Technician, General, and Extra pools remain available.
- The runtime remains vanilla HTML, CSS, and JavaScript with no external runtime
  dependencies, fonts, images, analytics, advertising, or API calls.
- New interactions remain accessible by keyboard, screen reader, and touch.
- Personal study data remains on the user's device unless the user explicitly
  exports it.
- The standalone artifact has a preferred 1 MiB budget and a 16 KiB safety
  margin. Optimize first; any future increase requires a separate measured,
  documented decision covering size, load time, and target-device impact.

## Current baseline

The application, branded **US Ham Exam — FCC Amateur Radio License Study**
(`1025f14`, `7920c4f`), currently provides: study with a selectable **Study
order** (Sequential, the default, or an in-memory-shuffled Random order,
Stage 6A6, `cab581c`); a transient **Study scope** selector (subelement or
group, with human-readable "code — title" labels sourced from the tracked
NCVEC pool text, Stage 6A/6A1) that narrows Previous/Next navigation without
persisting across reload; per-pool progress and bookmarks; recall timers;
three themes; a **Help & About** panel that now opens into a dedicated
**"Getting Started"** newcomer guide (Stage 6A5, `d9cc477`) covering what the
hobby involves beyond the exam; and balanced Mock Exams with optional
countdown timers, scoring, subelement results, and answer review — Mock Exam
selection is independent of both Study scope and Study order. Question
figures for every question that references one are embedded and shown in
study mode, mock-exam questions, and results review, with a modal enlarge
viewer.

**Baseline at 0.3.0-beta.5 (measured 2026-09-20, from this repository):**

- 1,431 questions across three pools: Technician 409, General 423, Extra 599.
- Standalone build: `dist/index.html` is 1,032,052 bytes against the 1 MiB
  (1,048,576-byte) budget — **16,524 bytes (1.58%) free.** This is a hard
  constraint on the next feature that touches the standalone bundle, not a
  formality; see `docs/POOL_STORAGE_PLAN.md`'s Stage 6A6 section for how
  tight this margin has become across recent slices.
- Canonical versioned storage (`schemaVersion: 1`) covers theme, recall
  delay, exam timer, and Study order preferences, plus per-pool edition/
  revision identity, current question, bookmarks, and (currently `"all"`-only
  persisted) scope/position — Study scope itself remains transient by
  design; only Study order is persisted, and only as a value, never a
  shuffle order or seed.
- Manually verified for this release on desktop Chrome and a Pixel 7a;
  real-device Safari, screen-reader, and iPhone/iPad PWA installation checks
  are recorded as **not yet done** (see `docs/RELEASE_NOTES_0.3.0-beta.5.md`'s
  "Known limitations") and must not be treated as complete until they are.

**Historical baseline (September 3, 2026 review, pre-beta.2 — kept for
context, superseded by the measurements above):**

- The build completed with 1,431 questions and a standalone size of about 616 KB.
- All 20 exam-engine unit tests passed.
- All 11 Chromium smoke tests passed.
- All 11 applicable PWA tests passed; the forced-offline WebKit test was skipped
  because Playwright WebKit does not support that navigation mode.
- The exhaustive standalone suite contains 945 browser cases. It was stopped
  after 181 consecutive passes because its runtime was disproportionate for a
  planning review. Two tests reported as interrupted were cancellation artifacts,
  not observed application failures.

## Confirmed defects

No P0–P2 defects are currently confirmed open. The four items tracked here at
the September 2026 baseline review are all resolved, verified by committed
automated tests, and shipped no later than `0.3.0-beta.2` — see "Resolved
defects (historical)" immediately below for the original descriptions,
acceptance criteria, and resolution evidence, preserved rather than deleted.
A new defect belongs in this section, following the priority definitions
under "Continuous-improvement process" below, until it is resolved and moved
to that historical section in turn.

## Resolved defects (historical)

These were tracked as open P0–P2 defects at the original (2026-09-03) roadmap
baseline. Each is now resolved with committed, tested code; the original
problem statement and acceptance criteria are preserved as written at the
time, for historical continuity, not because any of it is still open.

### P0 (resolved, shipped in `0.3.0-beta.2`): Missing official question figures

Forty-four questions refer to figures that are not present in the application:

| Pool | Affected questions | Required figures | Chance in a balanced mock exam |
|------|-------------------:|------------------|--------------------------------:|
| Technician | 12 | T-1, T-2, T-3 | approximately 86.2% |
| General | 5 | G7-1 | approximately 38.5% |
| Extra | 27 | E5-1, E6-1, E6-2, E6-3, E7-1, E7-2, E7-3, E9-1, E9-2, E9-3 | approximately 93.9% |

These questions cannot be studied or answered fairly without their referenced
diagram. The figures should be extracted from the official pool sources, stored
as local source assets, and associated with questions through an optional
`figure` field or a figure-ID mapping.

Acceptance criteria (met — see "Resolution" below):

- Every question containing an official figure reference resolves to a local
  figure asset.
- Figures appear in study mode, mock-exam questions, and results review.
- Figures fit mobile viewports and can be enlarged without horizontal overflow.
- Each figure has a useful accessible name or description and a visible figure
  identifier.
- The standalone build embeds every figure; the PWA makes no external request
  and caches every figure needed offline.
- Prefer optimized SVG for line drawings and schematics; use PNG only when the
  source cannot be represented faithfully as a compact vector image.
- Keep the complete standalone `dist/index.html` at or below 1 MiB. Any proposed
  increase beyond that budget requires a recorded decision with measured device
  and load-time impact.
- A build-time test fails for a missing, unused, or duplicate figure mapping.

**Resolution:** all 14 required figures were extracted, checksum-pinned, and
validated as a mandatory build gate (Stage 2A–2D: `df711f3`, `a0e7e0f`,
`805cf7e`, `15d5a66`); rendered in study mode, mock-exam questions, and
results review with a modal fit/actual-size enlarge viewer (Stage 3A–3C:
`5109df2`, `bb3ca2b`, `3a5cc9c`). Shipped as part of `0.3.0-beta.2`
(`cf37080`). See `docs/FIGURE_PIPELINE.md` and
`docs/IMPLEMENTATION_PLAN.md`'s Stage 2/3 execution-log rows for full detail.

### P1 (resolved, shipped in `0.3.0-beta.2`): Mock-exam accessibility defects

- `showExamQuestion()` removes every child of the answer fieldset, including its
  `<legend>`, so the radio group loses its accessible label.
- The results view calls `focus()` on a non-focusable heading. Browser verification
  showed focus falling back to the document body.
- The subelement summary declares `role="table"`, but its generated children lack
  row, column-header, and cell semantics.
- Starting or retaking an exam does not deliberately place focus on the newly
  displayed view.

Acceptance criteria (met — see "Resolution" below):

- Every answer radio group retains a question-specific legend.
- Setup, session, results, retake, exit, and return transitions put focus on a
  useful visible element.
- The subelement breakdown uses a native table where practical, or supplies the
  complete equivalent ARIA structure.
- Automated tests verify accessible names, focus destinations, and keyboard-only
  operation.

**Resolution:** the answer-fieldset legend is preserved (`079ccac`); focus is
deliberately managed across setup/session/results/retake/exit/return
transitions (`1677fe3`); the subelement breakdown renders as a native
`<table>` with `scope="col"`/`scope="row"` headers (`e94d899`). Covered by
`tests/mock-exam.spec.js`'s focus-management and accessibility cases. Shipped
as part of `0.3.0-beta.2` (`cf37080`).

### P1 (resolved, shipped in `0.3.0-beta.2`): Windows path redaction

Startup diagnostics redact POSIX home paths but do not redact raw Windows paths
such as `C:\Users\Alice\study\index.html`. A test confirmed that the username is
currently displayed.

Acceptance criteria (met — see "Resolution" below):

- Raw and `file:` URL forms of Windows, macOS, and Linux home-directory paths are
  redacted.
- Regression tests cover spaces, percent encoding, backslashes, and common path
  punctuation.
- Diagnostics retain enough non-personal information to troubleshoot startup.

**Resolution:** `safeError()` was extended to a two-pass sanitizer covering
POSIX and Windows home paths, either separator style, percent-encoded
separators and spaces, with no general URI decoding so malformed sequences
cannot throw (`712f5e9`). Covered by 18 table-driven `@compat` cases across
Linux/macOS/Windows paths, spaced and percent-encoded usernames, `file:`
URLs, and malformed percent sequences. Shipped as part of `0.3.0-beta.2`
(`cf37080`).

### P2 (resolved, shipped in `0.3.0-beta.2`): Mock Exam ignores the active study pool

Opening Mock Exam while studying General or Extra initially selects Technician.
The setup selector should default to the current study pool while still allowing
the user to choose another pool.

**Resolution:** Mock Exam setup now opens with the pool currently being
studied already selected, while still allowing a different pool to be chosen
for that session only (`01016fc`). Shipped as part of `0.3.0-beta.2`
(`cf37080`).

## Future workstream: edition compatibility refactoring

The US edition remains the product of record. Before creating a derived
regional edition such as a future India ASOC app, improve the seams that make
the current app reusable without changing US behavior or importing regional
content into this repository. This is a planning workstream, not an active
runtime change:

- audit FCC/NCVEC assumptions in runtime code, build scripts, validators,
  tests, Help/PWA metadata, links, and documentation;
- introduce a small build-time edition profile with US defaults (identity,
  jurisdiction, authority, paths, and display metadata);
- parameterize build/runtime metadata while keeping the current US output,
  offline guarantees, deterministic builds, and validation gates unchanged;
- separate generic study-engine behavior from edition-supplied pools,
  categories, scoring, timers, hierarchy, terminology, and optional features;
- retain strict US validators and add compatibility/golden tests for pools,
  IDs, storage, branding, Mock Exam behavior, offline operation, artifacts,
  and the size budget;
- document the derivation workflow, provenance/licensing boundaries, and a
  merge strategy for future editions.

India-specific question content, regulations, branding, legal analysis, and
release work belong in a separate derived repository. No plugin framework,
server-backed question bank, country selector, US version change, or budget
increase is part of this refactor. The 1 MiB/16 KiB policy remains in force;
any increase requires a separate measured decision.

## Release roadmap

### Newcomer onboarding clarity (implemented — unreleased)

Make the first-use path understandable to someone with no Amateur Radio
background:

- Explain that this is a US FCC Amateur Radio exam study app.
- Explain Technician, General, and Extra in plain language, identifying
  Technician as the normal starting point.
- Present a compact learn → practice → exam → explore path.
- Add a safe Start with Technician action that selects Technician and All questions
  without deleting progress, bookmarks, or preferences.
- Keep the existing hobby examples and links concise and jargon-light.
- Verify keyboard access, themes, 320×568 layout, storage preservation, and
  no external runtime requests.

The slice must preserve at least the current 16 KiB standalone safety margin.
If the content cannot fit safely, reduce wording or defer the change. The 1 MiB
limit is a project budget rather than a platform limit; raising it remains
possible only through a separate, measured architecture/release decision.


### 0.3.0-beta.2: Completeness and accessibility (shipped — historical)

**Status: shipped** as `0.3.0-beta.2` (`cf37080`); kept below for historical
context (the original milestone plan), not as a current or upcoming release.
All nine numbered items were completed (see "Resolved defects (historical)"
above and the completed-work log for individual commit references). Of the
release-gate conditions below, in-app figure readability was accepted on a
target device (Pixel 10 / Chrome, per `docs/RELEASE_NOTES_0.3.0-beta.2.md`),
but the **real iPhone/iPad PWA installation and offline relaunch check was
not actually done** — `docs/RELEASE_NOTES_0.3.0-beta.2.md` itself records it
as a "known limitation," and it remains an open manual-verification gap
through every release since, beta.5 included (see "Current baseline" above).

Goal: make all existing study and exam features complete and trustworthy before
expanding the product.

1. Add and validate all official figures.
2. Repair mock-exam legends, focus management, and table semantics.
3. Extend diagnostic redaction to Windows paths.
4. Default Mock Exam to the current study pool.
5. Correct package, PWA, Help, security, and testing documentation.
6. Derive beta/stable labels from the semantic version instead of hardcoding
   them.
7. Add canonical pool edition/revision identity; centralize storage, introduce
   a versioned schema, convert indexes to stable IDs, and migrate existing state
   without losing recoverable data. Treat errata and replacement as distinct
   transitions; see `docs/POOL_STORAGE_PLAN.md`.
8. Add a best-effort warning before closing or reloading an active mock exam,
   with documentation that some mobile browsers may suppress it.
9. Add regression tests for every defect fixed in this milestone.

Release gate:

- Build, unit, smoke, compatibility, responsive, standalone, and PWA suites pass.
- The complete standalone matrix (all logical tests across all nine
  browser/viewport projects in `playwright.config.js` -- 1,728 executions as
  of Stage 5B3, `npx playwright test --list`; re-check rather than trusting
  this figure, since it grows as tests are added) finishes uninterrupted;
  interrupted or cancelled cases do not satisfy the release gate.
- Generated release artifacts have no uncommitted differences after rebuilding
  (`npm run test:generated`, Stage 5B2).
- A real iPhone or iPad PWA installation and offline relaunch is checked.
- Human in-app readability of every official figure is accepted on a target
  device. A formal side-by-side source-PDF provenance review is recommended but
  deferred and non-blocking unless a content discrepancy is reported.
- The standalone artifact remains at or below the 1 MiB size budget.

### 0.4: Better study workflows

Goal: make bookmarks and practice sessions useful as active study tools.
Several items below have since shipped (marked **Done**); the rest remain
open.

- Add a bookmark browser with counts, jump-to-question, and per-pool filtering. — still open.
- Add scoped study navigation using Pool → Subelement → Group → Question:
  Entire pool remains the default, Previous/Next stay within the selected scope,
  and users can jump to a stable question ID. Persist scope and position per
  pool on the versioned storage layer; Mock Exam remains blueprint-balanced.
  See `docs/SCOPED_STUDY_PLAN.md`. — **Done in part** (`0.3.0-beta.3`/`beta.4`,
  Stage 6A/6A1, `c581c20`/`3df1252`): Pool → Subelement → Group navigation with
  human-readable labels shipped, transient (never persisted) by design, and
  Mock Exam remains blueprint-balanced and independent of scope. **Still
  open:** persisting scope/position per pool across reload (Stage 6B,
  explicitly deferred) and a per-question jump control (deferred at the
  standalone byte budget — see `docs/SCOPED_STUDY_PLAN.md`'s "Stage 6A: what
  actually shipped").
- Add bookmarked and random study modes after the scope foundation is proven. —
  **Done in part** (`0.3.0-beta.5`, Stage 6A6, `cab581c`): a persisted
  **Random** study order (in-memory Fisher-Yates shuffle) shipped. **Still
  open:** a bookmarked-only study mode.
- Add an answered/unanswered question navigator to mock exams. — still open.
- Offer `Review missed questions` and `Retry missed questions` from results. — still open.
- Persist recall-timer and preferred exam-timer settings. — **Done**
  (`0.3.0-beta.2`, Stage 4A3, `aa8a518`).
- Notify installed-PWA users when a newly cached application version is ready and
  offer a controlled reload. Test update behavior so errata and pool replacements
  do not remain hidden behind a stale service-worker lifecycle. — still open;
  the service worker calls `skipWaiting()` on install but there is no
  user-facing "update ready" prompt.
- Add documented keyboard shortcuts without interfering with form controls or
  assistive technology. — still open.

### 0.5: Local learning progress

Goal: help learners identify weak areas without accounts or telemetry.

- Record local attempt counts, correct/incorrect counts, and last-seen dates.
- Present per-subelement mastery and weak-area summaries.
- Add unseen-question, weak-area, and spaced-review study modes.
- Optionally resume interrupted mock exams and retain a local exam history.
- Add JSON export/import for backup and device migration.
- Add a clear `Delete all local data` action.
- Version the local-storage schema and provide safe migrations.

Exam persistence should be opt-in or clearly explained because current exam
sessions and results are intentionally memory-only.

### Future candidates

These ideas need product design before scheduling:

- A quiz study mode that records a selected answer before revealing feedback.
- Local question search by ID, text, subelement, or FCC reference.
- System-theme support and additional reduced-motion/high-contrast refinements.
- Printable or locally exported progress and exam summaries.
- Adjustable figure zoom (zoom steps/slider, custom pinch gestures, or drag-to-pan).
  Deferred by user decision on 2026-09-08; the initial enlargement viewer will
  offer fit-to-window and actual-size views with scrolling. Revisit adjustable
  zoom only if usability feedback demonstrates a need; no milestone assigned.

## Engineering improvements

### Question data and build validation

- Validate ID format, pool prefix, subelement consistency, text field types,
  expected pool counts, blueprint coverage, and figure mappings.
- Automate checks for added, withdrawn, and changed questions when applying NCVEC
  errata.
- Keep official source files and a reproducible extraction record for each pool.
- Make pool identity (stable key, edition, revision, dates, count, and source) a
  validated build-time source before storage migration. Extend it with exam
  rules/blueprints during release integration.
- Store positions by stable ID, not array index. On pool replacement, reset that
  pool's question-specific state; do not archive obsolete pools or assume a
  reused ID represents unchanged content.

### Figure asset pipeline (implemented — historical)

**Status: implemented and shipped** as part of `0.3.0-beta.2` (Stage 2A–2D
extraction/validation, `df711f3`/`a0e7e0f`/`805cf7e`/`15d5a66`; Stage 3A–3C
rendering, `5109df2`/`bb3ca2b`/`3a5cc9c`). The plan below is kept as the
design record of what was built, not as upcoming work; see
`docs/FIGURE_PIPELINE.md` for the pipeline as it actually works today.

The 14 required figures are few enough that manual, reviewed extraction is safer
than adding generic PDF image extraction to `scripts/extract-pool.js`. The initial
pipeline should therefore:

1. Export each figure from its official NCVEC source PDF as a local SVG where the
   source is vector line art, or as an optimized PNG when faithful vector export
   is not practical.
2. Record the figure ID, source pool, source PDF, source page, extraction method,
   and asset checksum in a mapping file committed with the assets.
3. Associate question IDs with figure IDs in data rather than inferring the
   relationship at runtime from question wording.
4. Have the build validate mappings, optimize embedding, and include figures in
   both release targets without runtime network requests.
5. Spot-check visual fidelity, labels, accessible descriptions, mobile sizing,
   and zoom behavior whenever the source pool or errata changes.

The text extractor should detect figure references and fail validation when a
mapping is absent, but it should not silently attempt to extract or redraw figures.

### Application structure

- Gradually split the large `src/app.js` IIFE into small build-inlined vanilla-JS
  modules without introducing a framework or runtime dependency.
- Move pure scoring, formatting, and state-transition logic into modules that can
  be covered by fast Node tests.
- Build later persisted preferences and learning history on the versioned storage
  layer introduced in 0.3.0-beta.2. Recall delay, exam timer (`0.3.0-beta.2`),
  and Study order (`0.3.0-beta.5`) already live there; future preferences and
  any learning-history data (0.5, below) should follow the same pattern.

### Structured diagnostics

- Replace arbitrary exception text in user-visible diagnostics with structured,
  allowlisted fields such as stage, stable error code, and non-sensitive context.
- Keep raw exception messages and stack traces out of copied or displayed
  diagnostics; retain `safeError()` as a defensive compatibility layer while
  callers migrate to structured failures.
- Cover every diagnostic code and fallback path with tests that verify useful
  troubleshooting context remains available without local paths, usernames,
  browser fingerprints, or other environment details.
- Do not add a general URL, filesystem-path, or logging-redaction dependency for
  this purpose unless a future design demonstrates a clear benefit. Such
  libraries can parse isolated values but cannot reliably find ambiguous paths
  inside arbitrary prose, and a dependency would add bundle and supply-chain
  cost to both offline release targets.

### Test and CI strategy

- Run fast unit and Chromium smoke tests for routine changes.
- Run compatibility cases across Chromium, Firefox, and WebKit only where engine
  behavior can differ.
- Run responsive cases on representative mobile and tablet viewports rather than
  multiplying every logic test across all nine projects.
- Reserve the full matrix for releases or a scheduled workflow.
- Keep real-device Safari installation and offline relaunch in the release
  checklist.

## Pool maintenance calendar

| Pool | Current effective period | Recommended preparation |
|------|--------------------------|-------------------------|
| General | July 1, 2023 – June 30, 2027 | Begin 2027-pool integration as soon as the official replacement is published. |
| Extra | July 1, 2024 – June 30, 2028 | Monitor official errata and plan replacement during 2027–2028. |
| Technician | July 1, 2026 – June 30, 2030 | Monitor official errata and update figures/data together. |

### Parallel workstream: 2027 General pool readiness

This workstream was slated to begin during `0.3.0-beta.2` and proceed in
parallel with 0.4 and 0.5; **no work on it has started as of `0.3.0-beta.5`**
(no replacement-pool extraction, validation, or report exists in this
repository). It remains open and has a **fixed deadline that does not move**:
a release containing the replacement General pool must be tested and
available before the current pool expires on **June 30, 2027**.

- Exercise the extractor, stricter bank validation, and figure-mapping pipeline
  against the replacement pool as soon as official source material is published.
- Produce an ID-level added, changed, withdrawn, and figure-impact report.
- Keep the old and replacement pools clearly separated during review; select the
  pool appropriate to the user's planned exam date if their effective periods
  require an overlap strategy.
- Complete source cross-checking, all automated suites, and real-device offline
  verification before publishing the replacement.

## Continuous-improvement process

Review this document before starting a feature and at each release candidate:

1. Reproduce or validate each new finding before classifying it as a defect.
2. Record the user impact, priority, affected files, and acceptance criteria.
3. Assign the item to the earliest milestone that can safely contain it.
4. Add automated regression coverage alongside the implementation.
5. Update documentation and regenerate both release targets.
6. Move completed work to the log below, including the release or commit.
7. Reassess file size, offline behavior, accessibility, privacy, and pool validity.

Priority definitions:

- **P0:** Core content is unavailable, incorrect, or capable of invalidating a
  study/exam result. Blocks release.
- **P1:** Significant accessibility, privacy, reliability, or data-integrity
  problem. Fix in the next release.
- **P2:** Noticeable workflow or maintenance problem with a safe workaround.
- **P3:** Optional enhancement or polish.

## Decision log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-09-03 | Prioritize figure support before new learning features. | Missing figures make 44 official questions incomplete and frequently affect balanced mock exams. |
| 2026-09-03 | Keep future progress features local-first. | Preserves offline operation and the project's no-account, no-telemetry privacy model. |
| 2026-09-03 | Optimize rather than remove cross-browser testing. | Browser coverage is valuable, but duplicating all logic cases across nine projects is unnecessarily expensive. |
| 2026-09-03 | Use a reviewed manual figure-export pipeline with a committed mapping file. | Fourteen known figures do not justify unreliable generic PDF image extraction, but their provenance and reproduction must remain auditable. |
| 2026-09-03 | Establish versioned storage in beta.2. | Every later persisted setting and learning record should start on a migration-safe foundation. |
| 2026-09-03 | Treat General-pool replacement as a parallel deadline-driven workstream. | The current General pool expires June 30, 2027, regardless of feature-release timing. |
| 2026-09-05 | Prefer structured, allowlisted diagnostics over increasingly complex free-text redaction. | Structured failures remove sensitive data at the source; third-party URL/path libraries do not solve ambiguous path discovery in prose and would add dependency cost. |
| 2026-09-13 | Implement versioned storage before scoped study navigation. | Per-pool scope and position should begin on the migration-safe schema rather than create more legacy keys. |
| 2026-09-13 | Model focused study with the official pool hierarchy. | Pool → Subelement → Group → Question supports deep topic practice without an invented taxonomy; Entire pool and Mock Exam retain their current defaults. |
| 2026-09-17 | Ship scoped study as transient, in-memory-only rather than the originally planned persisted MVP. | `src/storage.js`'s schema already restricted `scope`/`positions` to `"all"`-only; persisting real scope/position across reload was deferred as Stage 6B rather than expanding that schema before the foundation was proven in use. |
| 2026-09-22 | Planning decision | Prioritize newcomer onboarding clarity as the next application slice; retain the 1 MiB/16 KiB standalone budget as the default policy, with any increase requiring measured documentation and approval. |
| 2026-09-19 | Extend the existing schema-1 `preferences` object with `studyOrder` rather than bumping `SCHEMA_VERSION`. | A version bump would route every real existing user's document through the read-only "unsupported schema" branch, discarding their theme/recall-delay/bookmarks; extending `isValidExceptEditionDrift`'s existing drift-tolerance (already used for edition/revision) to also cover a missing `studyOrder` reconciles it safely instead. See `docs/POOL_STORAGE_PLAN.md`'s "Stage 6A6 schema decision." |
| 2026-09-19 | Persist only the Study-order preference value, never a shuffle sequence or seed. | Keeps the canonical document small and simple; a random order is cheap to regenerate deterministically-enough for the user's purposes (deliberately not reproducible) on each rebuild trigger. |
| 2026-09-19 | Rebrand as **US Ham Exam** without adding a country selector or regional abstraction. | States plainly, now, that this is a US FCC exam study app, while recording that a future regional edition could reuse the engine with different pools/regulations/branding if ever pursued — not committing to that scope now. |
| 2026-09-22 | Plan edition-compatibility refactoring in the US repository before starting a derived regional edition. | Establish a reusable boundary and compatibility gates first; keep India-specific content, regulations, provenance, branding, and releases separate while preserving the US app unchanged. |

## Completed-work log

Add completed roadmap items here rather than deleting their history.

| Date | Release or commit | Completed work |
|------|-------------------|----------------|
| 2026-09-03 – 2026-09-04 | `079ccac`, `1677fe3`, `e94d899` (`0.3.0-beta.2`) | Mock-exam accessibility fixes: preserved answer-fieldset legend, deliberate focus management across setup/session/results/retake/exit/return, native `<table>` subelement breakdown. Resolves the P1 "Mock-exam accessibility defects" item. |
| 2026-09-05 | `712f5e9` (`0.3.0-beta.2`) | Extended startup-diagnostic redaction to Windows home paths (plus POSIX), percent-encoded separators/spaces, and spaced usernames; 18 new `@compat` regression cases. Resolves the P1 "Windows path redaction" item. |
| 2026-09-06 | `01016fc` (`0.3.0-beta.2`) | Mock Exam setup now defaults to the active study pool. Resolves the P2 "Mock Exam ignores the active study pool" item. |
| 2026-09-07 – 2026-09-09 | `df711f3`, `a0e7e0f`, `805cf7e`, `15d5a66`, `c6382c7`, `5109df2`, `bb3ca2b`, `3a5cc9c` (`0.3.0-beta.2`) | **Figure support**: extracted, checksum-pinned, and validated all 14 required NCVEC figures as a mandatory build gate (Stage 2A–2D); rendered them in study mode, mock-exam questions, and results review with a modal fit/actual-size enlarge viewer (Stage 3A–3C). Resolves the P0 "Missing official question figures" defect. |
| 2026-09-11 | `60a545a`, `4cc13c6` | Content-first responsive study shell with a compact settings drawer, safe-area support, and a WebKit native-`<select>` contrast fix. |
| 2026-09-13 – 2026-09-14 | `92f45ed`, `b13b77e`, `97b514c`, `aa8a518`, `32afd5e` (`0.3.0-beta.2`) | **Versioned storage**: canonical pool edition/revision identity; the pure, versioned `src/storage.js` schema/validation/migration/reconciliation module and its injected-storage adapter; wired into the live app as the sole persistence path; persisted recall-delay and exam-timer preferences; a `beforeunload` warning before an active mock exam could be discarded. See `docs/POOL_STORAGE_PLAN.md`. |
| 2026-09-15 | `980c2a0`, `559bf38`, `5c5fe45`, `c65cffc`, `27af87c` (`0.3.0-beta.2`) | Consolidated pool/exam metadata into the canonical registry; derived beta/stable release labels from the semantic version; added pull-request CI and generated-artifact freshness enforcement; reconciled documentation/test inventory; hardened the question-bank schema validator. |
| 2026-09-15 | `cf37080` | **Released `0.3.0-beta.2`**: "Completeness and accessibility" — figures, mock-exam accessibility, Windows redaction, Mock Exam pool default, the responsive shell, versioned storage, and the metadata/CI/documentation consolidation above, all in one release. (`docs/RELEASE_NOTES_0.3.0-beta.2.md` records the release date as 2026-09-16; this commit's own timestamp is 2026-09-15 late evening.) |
| 2026-09-17 | `c581c20`, `29fafc8`, `a6be3b7`, `8ce5334` | **Scoped study navigation**: transient (non-persisted) Study scope — Pool → Subelement → Group, Previous/Next confined to the active scope, returning to "All questions" restores the saved full-pool position, Mock Exam unaffected. See `docs/SCOPED_STUDY_PLAN.md`. |
| 2026-09-17 | `09ffb88` | **Released `0.3.0-beta.3`**: scoped study navigation above. |
| 2026-09-18 | `3df1252`, `879f37e` | **Scoped-study human-readable labels** ("code — title" subelement/group options sourced from the tracked, checksum-pinned NCVEC pool text, Stage 6A1); the Settings drawer's recall countdown now pauses for the whole time it is open, not merely at the moment it opens (Stage 6A3). |
| 2026-09-19 | `4552ff0` | **Released `0.3.0-beta.4`**: the scoped-study labels and drawer timer-pause fix above. |
| 2026-09-19 | `d9cc477` | **"Getting Started" newcomer guide**: a second Help sub-view covering what the hobby involves beyond the exam (Parks on the Air, hiking/camping/mobile radio, satellites and the ISS, digital modes, emergency communication, clubs and mentors), one inlined and metadata-stripped photo, and a "Learn more" HTTPS link section (Stage 6A5). |
| 2026-09-19 | `1025f14`, `7920c4f`, `e1888ce` | **US Ham Exam branding**: renamed the product to "US Ham Exam — FCC Amateur Radio License Study" across the document title, app header, Help & About, PWA manifest, and README; added standard mobile web-app capability metadata. |
| 2026-09-19 | `cab581c` | **Persisted Study order**: a `preferences.studyOrder` ("sequential"/"random") added to the existing schema-1 canonical document without a version bump; an in-memory Fisher-Yates shuffle rebuilt only on pool/scope/order change or reload; Mock Exam remains fully independent (Stage 6A6). See `docs/POOL_STORAGE_PLAN.md`. |
| 2026-09-19 | `7f0e313`, `15a17e2` | Fixed the figure viewer clobbering the study scroller's scroll position on close. |
| 2026-09-20 | `a5e9a0a` | **Released `0.3.0-beta.5`**: US Ham Exam branding, the Getting Started guide, persisted Study order, the figure-viewer scroll fix, and mobile web-app capability metadata, all in one release. Live and manually checked on desktop Chrome and a Pixel 7a; real-device Safari, screen-reader, and iPhone/iPad PWA installation checks remain open (see "Current baseline" above). |
