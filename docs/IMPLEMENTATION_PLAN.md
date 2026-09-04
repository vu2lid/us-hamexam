# Roadmap Implementation Plan

This document turns the [product and engineering roadmap](ROADMAP.md) into an
ordered delivery plan. Use it to identify the next task, preserve implementation
context between sessions, and improve the development workflow over time.

Last reviewed: September 3, 2026

Plan status: Ready to begin

Current stage: Stage 1 — existing defect fixes

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
| 1 | 0.3.0-beta.2 | Accessibility, privacy, and pool-default fixes | None | Small | Not started |
| 2 | 0.3.0-beta.2 | Figure data model and asset pipeline | Stage 1 baseline | Medium | Not started |
| 3 | 0.3.0-beta.2 | Figure rendering and offline packaging | Stage 2 | Large | Not started |
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

- [ ] Preserve a question-specific `<legend>` when exam choices are rendered.
- [ ] Make exam-session and results headings programmatically focusable.
- [ ] Define focus destinations for setup, start, results, retake, exit, and
  return-to-study transitions.
- [ ] Replace the ARIA-styled subelement grid with a native HTML table.
- [ ] Redact raw and encoded Windows home-directory paths from diagnostics.
- [ ] Default Mock Exam setup to the active study pool.
- [ ] Add regression tests for every repaired defect.
- [ ] Update architecture, testing, security, and Help text affected by the fixes.
- [ ] Rebuild `dist/index.html` and `dist/pwa/`.

Verification:

- [ ] `npm run test:unit`
- [ ] `npm run test:smoke`
- [ ] `npm run test:compat`
- [ ] Targeted keyboard-only review
- [ ] `git diff --check`

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

Each figure manifest entry should include:

```json
{
  "id": "T-1",
  "pool": "technician",
  "file": "assets/figures/technician/t-1.svg",
  "sourcePdf": "data/pool-sources/technician.pdf",
  "sourcePage": 55,
  "alt": "Schematic containing six numbered components",
  "sha256": "..."
}
```

Affected question records should contain an explicit optional figure ID:

```json
{
  "id": "T6C02",
  "figure": "T-1"
}
```

Deliverables:

- [ ] Confirm all 44 affected question IDs and 14 unique figure IDs.
- [ ] Decide and document safe SVG and PNG asset requirements.
- [ ] Manually export each figure from its official NCVEC PDF.
- [ ] Prefer optimized SVG for line art; use PNG only when necessary for fidelity.
- [ ] Record the conversion method for every asset: direct vector export, raster
  export, vectorization, or hand tracing. Avoid hand tracing unless faithful
  source extraction is impossible; any traced asset requires a second independent
  content review.
- [ ] Record source pool, PDF, page, extraction method, checksum, and accessible
  description for every figure.
- [ ] Add explicit question-to-figure mappings.
- [ ] Detect textual figure references case-insensitively and normalize their IDs;
  Technician and General use lowercase `figure` while Extra uses capitalized
  `Figure` in the current data.
- [ ] Reject missing, unused, duplicate, cross-pool, and checksum-mismatched
  figure mappings.
- [ ] Reject active or externally referenced content in figure assets.
- [ ] Enforce a complete standalone size budget of at most 1 MiB.
- [ ] Add Node tests for the figure manifest and mappings.

Verification:

- [ ] All 44 affected questions resolve exactly one expected figure.
- [ ] All 14 assets are referenced and pass a recorded, per-figure side-by-side
  comparison with the relevant source-PDF page before Stage 2 is complete.
- [ ] `npm run build`
- [ ] `npm run test:unit`
- [ ] `git diff --check`

The initial implementation deliberately uses reviewed manual export. The text
extractor should detect missing mappings but should not silently extract or redraw
figures from PDFs.

## Stage 3 — Figure rendering and offline packaging

Goal: make every figure-dependent question usable in every application mode.

Deliverables:

- [ ] Add a reusable figure component/container for study mode.
- [ ] Render the same figure in mock-exam questions.
- [ ] Render the figure with its question in results review.
- [ ] Embed figures in the standalone release.
- [ ] Inline or locally package and precache figures in the PWA.
- [ ] Provide a visible figure identifier and useful accessible description.
- [ ] Add keyboard- and touch-operable enlargement or zoom.
- [ ] Constrain figures to the viewport without horizontal overflow.
- [ ] Support questions with no figure without leaving empty UI.
- [ ] Add tests for shared figures, missing assets, safe rendering, zoom, offline
  behavior, and responsive layouts.
- [ ] Add standalone CSP assertions and extend the existing PWA CSP assertions to
  verify that figure rendering does not weaken policy or permit external content.
- [ ] Update Help, architecture, security, and build documentation.

Verification:

- [ ] Figure questions pass in study, exam, and results modes.
- [ ] No figure causes a runtime network request.
- [ ] Standalone CSP and PWA CSP tests pass.
- [ ] `dist/index.html` is at most 1 MiB.
- [ ] `npm run test:responsive`
- [ ] `npm run test:pwa`
- [ ] Manual mobile and desktop visual review

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

## Plan revision log

| Date | Change | Reason |
|------|--------|--------|
| 2026-09-03 | Initial staged implementation plan | Preserve delivery sequence, gates, and workflow across sessions. |
| 2026-09-03 | Strengthened figure, migration, CSP, semver-test, and pool-monitoring requirements | Incorporate independent implementation-plan review before Stage 1. |
