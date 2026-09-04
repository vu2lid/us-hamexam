# Product and Engineering Roadmap

This document records known defects, proposed enhancements, and recommended next
steps for the FCC Ham Exam study app. It is intended to remain the shared source
for release planning and continuous improvement.

Execution order, checklists, and session handoff notes are maintained in the
[roadmap implementation plan](IMPLEMENTATION_PLAN.md).

Last reviewed: September 3, 2026

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

## Current baseline

The application currently provides sequential study, per-pool progress,
bookmarks, recall timers, three themes, Help and About content, and balanced mock
exams with optional countdown timers, scoring, subelement results, and answer
review.

At the September 3, 2026 review:

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

### P0: Missing official question figures

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

Acceptance criteria:

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

### P1: Mock-exam accessibility defects

- `showExamQuestion()` removes every child of the answer fieldset, including its
  `<legend>`, so the radio group loses its accessible label.
- The results view calls `focus()` on a non-focusable heading. Browser verification
  showed focus falling back to the document body.
- The subelement summary declares `role="table"`, but its generated children lack
  row, column-header, and cell semantics.
- Starting or retaking an exam does not deliberately place focus on the newly
  displayed view.

Acceptance criteria:

- Every answer radio group retains a question-specific legend.
- Setup, session, results, retake, exit, and return transitions put focus on a
  useful visible element.
- The subelement breakdown uses a native table where practical, or supplies the
  complete equivalent ARIA structure.
- Automated tests verify accessible names, focus destinations, and keyboard-only
  operation.

### P1: Windows path redaction

Startup diagnostics redact POSIX home paths but do not redact raw Windows paths
such as `C:\Users\Alice\study\index.html`. A test confirmed that the username is
currently displayed.

Acceptance criteria:

- Raw and `file:` URL forms of Windows, macOS, and Linux home-directory paths are
  redacted.
- Regression tests cover spaces, percent encoding, backslashes, and common path
  punctuation.
- Diagnostics retain enough non-personal information to troubleshoot startup.

### P2: Mock Exam ignores the active study pool

Opening Mock Exam while studying General or Extra initially selects Technician.
The setup selector should default to the current study pool while still allowing
the user to choose another pool.

### P2: Metadata and documentation drift

- `package.json` and the PWA HTML description still describe a Technician-only
  application.
- The displayed `(beta)` suffix is hardcoded and would remain after a stable
  version is released.
- Pool dates, sources, and related metadata are duplicated between `POOL_META`
  and `EXAM_CONFIG`.
- The testing guide still says all test cases are in `tests/app.spec.js`.
- Security documentation should explicitly include bookmarks and theme settings
  in its description of locally stored data.

## Release roadmap

### 0.3.0-beta.2: Completeness and accessibility

Goal: make all existing study and exam features complete and trustworthy before
expanding the product.

1. Add and validate all official figures.
2. Repair mock-exam legends, focus management, and table semantics.
3. Extend diagnostic redaction to Windows paths.
4. Default Mock Exam to the current study pool.
5. Correct package, PWA, Help, security, and testing documentation.
6. Derive beta/stable labels from the semantic version instead of hardcoding
   them.
7. Centralize storage access, cache the storage-availability result, introduce a
   versioned schema, and migrate the existing pool, index, theme, and bookmark
   keys without losing user state.
8. Add a best-effort warning before closing or reloading an active mock exam,
   with documentation that some mobile browsers may suppress it.
9. Add regression tests for every defect fixed in this milestone.

Release gate:

- Build, unit, smoke, compatibility, responsive, standalone, and PWA suites pass.
- The complete 945-case standalone matrix finishes uninterrupted; interrupted or
  cancelled cases do not satisfy the release gate.
- Generated release artifacts have no uncommitted differences after rebuilding.
- A real iPhone or iPad PWA installation and offline relaunch is checked.
- Every official figure is spot-checked against its source PDF.
- The standalone artifact remains at or below the 1 MiB size budget.

### 0.4: Better study workflows

Goal: make bookmarks and practice sessions useful as active study tools.

- Add a bookmark browser with counts, jump-to-question, and per-pool filtering.
- Add study modes for all, bookmarked, random, and selected subelements.
- Add an answered/unanswered question navigator to mock exams.
- Offer `Review missed questions` and `Retry missed questions` from results.
- Persist recall-timer and preferred exam-timer settings.
- Notify installed-PWA users when a newly cached application version is ready and
  offer a controlled reload. Test update behavior so errata and pool replacements
  do not remain hidden behind a stale service-worker lifecycle.
- Add documented keyboard shortcuts without interfering with form controls or
  assistive technology.

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

## Engineering improvements

### Question data and build validation

- Validate ID format, pool prefix, subelement consistency, text field types,
  expected pool counts, blueprint coverage, and figure mappings.
- Automate checks for added, withdrawn, and changed questions when applying NCVEC
  errata.
- Keep official source files and a reproducible extraction record for each pool.
- Make pool metadata a single build-time source of truth shared by Help, the exam
  engine, documentation checks, and tests.

### Figure asset pipeline

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
  layer introduced in 0.3.0-beta.2.

### Test and CI strategy

- Run fast unit and Chromium smoke tests for routine changes.
- Run compatibility cases across Chromium, Firefox, and WebKit only where engine
  behavior can differ.
- Run responsive cases on representative mobile and tablet viewports rather than
  multiplying every logic test across all nine projects.
- Reserve the full matrix for releases or a scheduled workflow.
- Add a `pull_request` verification workflow; the current deployment workflow
  runs only on pushes to `main` and manual dispatches.
- Add a CI check that rebuilding leaves tracked `dist/` artifacts unchanged.
- Keep real-device Safari installation and offline relaunch in the release
  checklist.

## Pool maintenance calendar

| Pool | Current effective period | Recommended preparation |
|------|--------------------------|-------------------------|
| General | July 1, 2023 – June 30, 2027 | Begin 2027-pool integration as soon as the official replacement is published. |
| Extra | July 1, 2024 – June 30, 2028 | Monitor official errata and plan replacement during 2027–2028. |
| Technician | July 1, 2026 – June 30, 2030 | Monitor official errata and update figures/data together. |

### Parallel workstream: 2027 General pool readiness

This workstream begins during 0.3.0-beta.2 and proceeds in parallel with 0.4 and
0.5. It has a fixed deadline: a release containing the replacement General pool
must be tested and available before the current pool expires on June 30, 2027.

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

## Completed-work log

Add completed roadmap items here rather than deleting their history.

| Date | Release or commit | Completed work |
|------|-------------------|----------------|
| — | — | No roadmap items completed yet. |
