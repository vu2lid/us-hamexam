# Ham Exam 0.3.0-beta.4

Unreleased (pending independent review).

## Highlights

- Added human-readable subelement/group titles to the Study scope selector, sourced from the tracked NCVEC pool text (Stage 6A1).
- The study recall countdown now stays paused for the whole time the Settings drawer is open, not merely at the moment it opens, including across a Reveal delay, Pool, or Study scope change made from inside the drawer; it resumes from the exact preserved time once the drawer closes (Stage 6A3).
- Audited the Help & About panel for accuracy against the scoped-study and drawer-timer-pause changes shipped since beta.3, and corrected the progress-persistence wording, which previously implied all study progress was saved without distinguishing the temporary Study scope from the saved full-pool position (Stage 6A4).
- Added a "New to Amateur Radio?" section near the top of Help, with a short explanation of the hobby and licensing process and links to official FCC, ARRL, and NCVEC resources, local-club/mentor guidance, and HTTPS educational software-defined-radio resources (ARRL, Wikipedia) — the app links only to informational pages, never a direct listening service (Stage 6A4).

## Verification

- Unit, focused Help/timer/scope browser, compatibility, responsive, and deterministic-build checks passed during implementation.
- Final push-to-main release verification and Pages deployment remain the release-gate steps once this work is reviewed and merged.

## Known limitations

- Standalone artifact headroom is now under 0.2% of the 1 MiB budget; the next feature touching the standalone bundle should treat this as a hard constraint, not a formality.
- Scope selection remains transient (returns to "All questions" after reload); persisted scope (Stage 6B) remains deferred.
- The "New to Amateur Radio?" external links were verified against their own current content at authorship time (see `docs/IMPLEMENTATION_PLAN.md`'s Stage 6A4 execution-log row for the exact verification date and method per link); external sites can change without notice.
- Real-device Safari, screen-reader, and iPhone/iPad PWA installation checks remain manual follow-up items.

## Upgrade and data

This release preserves the versioned canonical storage schema; no migration is needed. Study scope remains entirely transient and unpersisted. Mock Exam selection remains independent of study scope. No question data, figure assets, or dependencies changed.
