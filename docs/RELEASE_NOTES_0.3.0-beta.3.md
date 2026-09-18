# Ham Exam 0.3.0-beta.3

Released 2026-09-18.

## Highlights

- Added transient scoped study navigation by subelement, group, and individual question while preserving full-pool progress.
- Preserved the existing offline-first study, figure, storage, Mock Exam, and responsive-layout behavior.
- Reduced generated CSS overhead so the scoped-study release remains within the standalone artifact budget.

## Verification

- Pull-request verification passed on the scoped-study branch.
- Unit, smoke, compatibility, responsive, PWA, storage, generated-artifact, and deterministic-build checks passed during implementation.
- Final push-to-main release verification and Pages deployment are the remaining release-gate steps.

## Known limitations

- Scope selection is transient and returns to All questions after reload; persisted scope remains deferred.
- Real-device Safari, screen-reader, and iPhone/iPad PWA installation checks remain manual follow-up items.
- Adjustable zoom, pinch gestures, and drag-to-pan remain deferred enhancements.

## Upgrade and data

This release preserves the versioned canonical storage schema. Scope selection does not alter persisted full-pool progress, and Mock Exam selection remains independent of study scope.
