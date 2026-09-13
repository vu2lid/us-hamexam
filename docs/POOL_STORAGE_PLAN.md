# Pool identity and storage migration plan

Status: Stage 4A0 implemented (registry, validator, build gate, embedding, tests) — uncommitted working tree. Two independent review rounds complete; both rounds' findings fixed and re-verified. Updated: 2026-09-13.

## Why this precedes scoped study

The app has stable runtime pool keys (`technician`, `general`, and `extra`) and display names, but bank files are bare arrays and there is no canonical pool edition or errata-revision identity. Legacy progress is stored as an array index, which is unsafe when a pool is reordered, revised, or replaced.

Establish pool identity before migrating storage or adding scoped positions. Do not store copies of question pools locally; the embedded build remains the content source.

## Identity model

Add one validated build-time registry, proposed as `data/pools.json`. Each entry distinguishes:

- `poolKey`: stable application/license-class key.
- `displayName`: user-facing class name.
- `editionId`: changes when NCVEC replaces the pool.
- `revisionId`: changes for errata within that edition.
- Element number, effective dates, expected count, question prefix, source URL, and errata label.

Identifiers are explicit data, not derived from labels or dates. This registry becomes canonical for the build, storage, study UI, and Help. Stage 5 may extend it with exam timers/blueprints and remove `POOL_META` / `EXAM_CONFIG` duplication; storage does not wait for that broader consolidation.

## Stage 4A0 — canonical pool registry

- Add the registry and a dependency-free validator with Node tests.
- Validate unique identities, date ranges, counts, question ID format/prefix/uniqueness, `sub` consistency, and Subelement/Group prefixes.
- Fail the build before modifying `dist/` when registry or bank validation fails.
- Embed validated public metadata using an explicit JavaScript assignment, preserving the WebKit UTF-8 safeguard.
- Preserve visible behavior; do not combine this foundation with scoped-study UI.

### Stage 4A0 outcome (implemented, uncommitted)

`data/pools.json` (`schemaVersion: 1`) is the canonical registry: one `pools`
object with exactly `technician`, `general`, and `extra` entries, each carrying
`poolKey`, `displayName`, `editionId`, `revisionId`, `element`,
`effectiveStart`, `effectiveEnd`, `expectedCount`, `questionIdPrefix`,
`sourceUrl`, and `errataLabel`. The shipped identities are
`technician-2026-2030` / `errata-2026-02-19` (element 2, 409 questions),
`general-2023-2027` / `errata-2026-02-04-6` (element 3, 423), and
`extra-2024-2028` / `errata-2026-02-04-4` (element 4, 599). Revision slugs are
deterministic: `errata-YYYY-MM-DD` from the NCVEC errata date, suffixed with
the errata number when the edition numbers its errata (`-6`, `-4`; the current
Technician errata is unnumbered).

`scripts/pool-registry.js` (pure, dependency-free CommonJS, no I/O on import)
exports `validatePoolRegistry(registry, banks)` returning sorted errors,
`assertPoolRegistry(...)` throwing one Error listing all errors, and the
contract constants (`SCHEMA_VERSION`, `POOL_KEYS`, `POOL_ID_PREFIX`, field
allowlists, `QUESTION_ID_RE`). Enforced invariants: exact schemaVersion 1;
exact three pool keys (no missing/extra); entry key === `poolKey`; exact field
allowlists at both levels (unknown keys rejected); `editionId` matches
`<poolKey>-<startYear>-<endYear>` with the pool prefix matching the registry
key and the years agreeing with the effective range; `revisionId` matches
`errata-YYYY-MM-DD` with an optional `-N` suffix and a real calendar date
(errata may precede the effective start, so it is not range-bounded); unique
`editionId` and unique `(editionId, revisionId)` pairs; strict real-calendar
ISO dates with start < end; positive integer `element`/`expectedCount`;
`expectedCount` equals the bank length; `questionIdPrefix` is the pool's
letter (T/G/E); every question ID matches `^[TGE][0-9][A-Z](?!00)[0-9]{2}$`
with the correct pool letter, is unique, and has `sub` equal to the ID's
first two characters (which also makes the derived Subelement
`[prefix][digit]` and Group `[prefix][digit][A-Z]` prefixes structurally
consistent); `displayName` / `sourceUrl` / `errataLabel` non-blank with
`sourceUrl` parsed via `new URL()` (guarded) requiring exact `https:`
protocol and a non-empty hostname. The validator never mutates its inputs.

`scripts/build.js` loads the banks first (the Stage 2A figure-reference gate
still runs inside `loadPool`), then reads and validates `data/pools.json`
(unreadable file / invalid JSON / validation failure all throw, naming the
file, before any `dist/` mutation), then runs the existing Stage 2D
figure-manifest gate. Both gates precede `fs.mkdirSync(OUT_DIR)` and every
other `dist/` write/copy/remove; a failed gate leaves a pre-existing `dist/`
byte-identical and creates none where absent.

The validated public identity fields (and nothing else — no file paths,
checksums, or source-PDF references) are embedded once per generated document
as `window.HAM_EXAM_POOLS = {...};` via the existing `asInlineScript()`
serialization, through a new `__POOLS__` placeholder next to `__BANK__` in
`src/index.html`. The CSP script-hash pass covers it automatically. `src/app.js`
does not consume the registry yet; there is no visible runtime change.

Verification (this working tree, after the review-fix round): `npm run
test:unit` 306/306 (263 prior + 37 pool-registry + 6 build-gate); `npm run
build` twice byte-identical (`dist/index.html` 985,206 B of the 1,048,576
budget); `git diff --check` clean; focused `tests/app.spec.js --grep @smoke
--project=chromium-desktop` passed (8/8, startup/CSP coverage for the extra inline
script). `npm run test:routine` and the full matrix were deliberately not run —
no runtime code path changed; the routine/full suites stay reserved for the
integrated storage slice and release gates.

### Second review round (2026-09-13)

A second independent review of the Stage 4A0 validator found two issues,
both since fixed in `scripts/pool-registry.js` (this working tree, still
uncommitted):

- **P2 — canonical identity fields were insufficiently validated.**
  `editionId`/`revisionId` previously accepted any non-blank string, so an
  unrelated string, a General edition ID assigned to Technician, `"x"` as a
  revision, or an ID containing whitespace all passed — a real risk since
  Stage 4A1 uses these identities to decide whether to preserve or reset
  user state. Fixed: `editionId` must match `<poolKey>-<startYear>-<endYear>`
  (`EDITION_ID_RE`), with its pool prefix checked against the registry key
  and its years checked against `effectiveStart`/`effectiveEnd`;
  `revisionId` must match the stable `errata-YYYY-MM-DD` slug contract with
  an optional numeric suffix (`REVISION_ID_RE`), with the date checked as a
  real calendar date via `isValidIsoDate()`. Negative tests added for
  swapped pool editions, malformed/unrelated slugs, whitespace, wrong-case
  slugs, and years disagreeing with the effective range.
- **Low — two validation/documentation accuracy gaps.** The question-ID
  regex accepted `T1A00`; official numbering starts at 01, so subelement-0
  IDs (`T0`/`G0`/`E0`) remain legal but a `00` question number does not.
  Fixed via a negative lookahead in `QUESTION_ID_RE`. The `sourceUrl` check
  accepted malformed values like `https://?`; fixed to parse with `new URL()`
  (guarded so malformed input never throws) requiring an exact `https:`
  protocol and a non-empty hostname. Separately, `docs/ARCHITECTURE.md`'s
  "Pool metadata" section still called `POOL_META` the metadata source;
  reworded to call it a legacy runtime copy of the canonical
  `data/pools.json`, pending removal at Stage 5.

Independently re-verified in this session, not just carried forward from the
prior claim above: `npm run build` run twice more, byte-identical
(`dist/index.html` 985,206 B / 1,048,576 budget, 63,370 B free); `npm run
test:unit` 306/306 (37 pool-registry tests, including the new negative
cases); `git diff --check` clean; the same focused
`tests/app.spec.js --grep @smoke --project=chromium-desktop` re-run, 8/8
passed. `npm run test:routine` and the full matrix were again deliberately
not run, for the same reason as the first round — no runtime code path
changed by this fix, only validator strictness and doc wording.

## Stage 4A1 — versioned storage module

Use one canonical key, proposed as `ham-exam-state`, with `schemaVersion: 1`. Persist stable question IDs, not indexes, and tag pool state with edition/revision identity. The tested schema supports preferences, active pool, current IDs, bookmarks, and reserved scoped positions. It does not retain obsolete question-pool content or old-edition study state.

Centralize parsing, validation, normalization, migration, and writes. Cache storage availability. The app must work when storage is missing, full, corrupt, or throws.

## Legacy migration rule

Legacy keys have no edition metadata. Document one bounded assumption: legacy indexes and bookmarks belong to the edition embedded during the first successful migration.

- Convert valid indexes to IDs in the embedded bank.
- Preserve valid bookmark IDs; discard invalid IDs rather than attaching them to
  another question.
- A complete supported canonical state wins over legacy data.
- Write and validate canonical state atomically. Migration is idempotent and rerunnable.
- Continue reading, and where needed mirroring, legacy keys through beta.2 for rollback. Remove them only in a later recorded release.
- Never overwrite a schema version newer than this build supports.

## Pool update policy

### Same edition, new revision

Keep positions and bookmarks whose IDs still exist. Normalize a missing current
ID and discard bookmark IDs that no longer exist. Update `revisionId` only
after normalization and a successful write.

### Replacement edition

Do not transfer question state merely because an ID is reused; its content may
have changed. Delete the replaced edition's position, bookmarks, and future
scope state, initialize the new edition at a valid default, and retain only
pool-independent preferences. Old question content is replaced at build time
and is not copied into local storage.

A rollback build whose embedded `editionId` does not match stored state also
starts that pool fresh. Supporting historical pools inside the app is explicitly
out of scope.

## Stage 4A2 — application integration

Replace direct legacy reads/writes for pool, theme, position, and bookmarks. Keep exam answers/results memory-only. Add recall and preferred exam-timer persistence only after migration is proven. Runtime code may compute an index after validating the stored ID.

## Stage 4B — exam-loss warning

Implement `beforeunload` protection separately. It affects exam lifecycle, not storage, and must not expand into persisted exam sessions.

## Efficient verification

- Node tests own registry/storage validation, migration, pool-update reset
  behavior, failure injection, and idempotency.
- Use a small Chromium set for local-storage wiring and reload behavior.
- Add cross-engine cases only for plausible engine differences.
- Build once per phase, list test/project counts first, avoid fixed waits, record duration, use `npm run test:routine` for integration, and reserve the full matrix for release.

## Acceptance criteria

- Every pool has explicit edition/revision identity validated against its bank.
- A replacement cannot silently apply old state to new content.
- Legacy users retain recoverable progress, bookmarks, theme, and pool choice.
- Migration is atomic, idempotent, bounded, and safe under corruption,
  exceptions, reloads, upgrades, and edition mismatch.
- Positions use stable IDs; scoped study needs no further schema redesign.
- Standalone, PWA, privacy, dependency, and memory-only exam constraints remain intact.

## Recommended slices

1. Registry, validator, build gate, and tests.
2. Pure storage schema, pool-update policy, and migration tests.
3. App integration for pool, position, bookmarks, and theme.
4. Recall/exam-timer preferences and documentation.
5. Separate active-exam unload warning.
6. Scoped-study model and UI per [`SCOPED_STUDY_PLAN.md`](SCOPED_STUDY_PLAN.md).

## Next task: Stage 4A1 implementation boundary

Stage 4A0 (registry, validator, build gate, embedding) is implemented in the
working tree; see "Stage 4A0 outcome" above. The next coding slice is the
versioned storage module described in "Stage 4A1 — versioned storage module"
above: schema, parsing/validation/normalization, and migration tests.

For the record, the completed Stage 4A0 slice delivered:

- Add `data/pools.json` for exactly Technician, General, and Extra using the
  currently shipped official editions and errata.
- Add a pure, dependency-free registry validator under `scripts/` and focused
  Node tests under `tests/unit/`.
- Wire validation into `scripts/build.js` after banks are loaded and before
  any `dist/` mutation.
- Embed a minimal `window.HAM_EXAM_POOLS` registry in both HTML targets.
- Update architecture/testing documentation and regenerate deterministic
  artifacts.

Non-goals:

- No local-storage migration or runtime consumption yet.
- No scoped-study controls or navigation.
- No change to question content, figures, exam selection, timers, or version.
- Do not move exam blueprints/timers into the registry in this slice.

Verification is primarily Node-based: valid real registry, malformed schema,
duplicate identities, bad dates/counts/prefixes, inconsistent `sub`/group,
missing/extra pools, output preservation on failure, registry serialization,
deterministic build, and `git diff --check`. Run only a focused browser smoke
check if embedding changes runtime parsing; defer `npm run test:routine` until
the integrated storage slice unless review finds broader risk.
