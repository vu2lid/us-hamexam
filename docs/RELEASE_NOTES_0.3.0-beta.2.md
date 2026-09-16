# Ham Exam 0.3.0-beta.2

Released 2026-09-16.

## Highlights

- Completed the Stage 1 accessibility and privacy fixes, including question-specific legends, focus management, native results-table semantics, diagnostic path redaction, and active-pool Mock Exam defaults.
- Added the official NCVEC figure pipeline, checksum-pinned provenance, build-time validation, offline packaging, study/exam/results rendering, and accessible fit/actual-size viewing.
- Added the content-first responsive shell with a compact settings drawer, safe-area support, contextual controls, and WebKit select contrast correction.
- Added canonical pool edition/revision metadata, versioned local-storage migration, persisted recall and exam-timer preferences, and active-exam unload protection.
- Consolidated Mock Exam metadata into the canonical pool registry and derived the displayed release label from semantic versioning.
- Added pull-request verification, generated-artifact freshness enforcement, routine test routing, and strict question-bank schema validation.

## Verification

- GitHub PR verification passed in 13m49s on PR #1.
- The complete push-to-main gate passed in 38m00s, including the full standalone matrix, storage, PWA, and freshness checks.
- GitHub Pages deployment completed successfully.
- Standalone artifact remains within the 1 MiB budget.

## Known limitations

- Real iPhone/iPad installation and offline relaunch, Safari-specific checks, and screen-reader checks remain manual follow-up items.
- Formal side-by-side source-PDF fidelity review remains deferred; in-app figure readability was accepted on Pixel 10 / Chrome.
- Adjustable zoom, pinch gestures, and drag-to-pan remain deferred enhancements.

## Upgrade and data

This release preserves the versioned canonical storage schema and migrates recoverable legacy study state. Mock Exam answers and results remain memory-only.
