# US Ham Exam 0.3.0-beta.5

Released 2026-09-20.

## Highlights

- Rebranded the product as **US Ham Exam — FCC Amateur Radio License Study**: the document title, app header (with a new subtitle tagline), Help & About, PWA manifest name/short_name, Apple mobile web-app title, and README now state plainly that this is a US FCC amateur-radio exam study app, with a recorded note that future regional editions could reuse the engine with different pools, regulations, and branding. No country selector or regional abstraction was added (`1025f14`, `7920c4f`).
- Added a persisted **Study order** preference — Sequential (the default) or Random — to the Settings drawer. A random order is an in-memory Fisher-Yates shuffle rebuilt only on pool change, scope change, order change, or reload; only the preference value is ever persisted (no schema bump — existing documents migrate to sequential), and Mock Exam selection remains independent (Stage 6A6, `cab581c`).
- Added a **"Getting Started" newcomer guide** reachable from a new "New to Amateur Radio?" Help section: what the hobby involves (Parks on the Air, hiking/camping/mobile radio, satellites and the ISS, digital modes, emergency communication, clubs and mentors), one inlined and metadata-stripped photo, and a "Learn more" HTTPS link section (Stage 6A5, `d9cc477`).
- Fixed the figure viewer clobbering the study scroller's scroll position on close: restoring focus to the opener no longer scrolls it back into view, so the exact prior `scrollTop` (and the page scroll in exam/results contexts) is preserved (15a17e2, with the regression test hardened in 7f0e313).
- Added standard mobile web-app capability metadata for broader Android install/launch compatibility (`e1888ce`).
- Restored the standalone artifact's 16 KiB safety margin by merging three pairs of byte-identical CSS declaration blocks, recovering 392 B with no rendering change (`cab581c`).

## Verification

- Unit, focused Help/branding, `@storage`, study-scope, mock-exam, responsive-shell, PWA, generated-artifact, and deterministic-build checks passed during implementation of each slice.
- `tests/unit/workflow-policy.test.js`'s version-string test now expects `0.3.0-beta.5`.
- Final push-to-main release verification (`npm test`, the full nine-project matrix, run by the deploy-pages workflow) and Pages deployment are the release-gate steps for this push.

## Known limitations

- Standalone artifact headroom is ~1.6% of the 1 MiB budget (16,524 B free at release); the next feature touching the standalone bundle should treat this as a hard constraint, not a formality.
- Scope selection remains transient (returns to "All questions" after reload); persisted scope (Stage 6B) remains deferred.
- Real-device Safari, screen-reader, and iPhone/iPad PWA installation checks remain manual follow-up items.

## Upgrade and data

This release preserves the versioned canonical storage schema (schema version 1); no migration is needed. Existing documents without the new `studyOrder` preference load as reconciled and adopt the Sequential default without disturbing theme, recall delay, exam timer, bookmarks, or per-pool positions. Study scope remains entirely transient and unpersisted. Mock Exam selection remains independent of study scope and study order. No question data, figure assets, or dependencies changed.
