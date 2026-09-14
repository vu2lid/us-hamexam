# Pool identity and storage migration plan

Status: Stage 4A0 committed (`92f45ed`); Stage 4A1 (pure versioned-storage
schema, validation, migration, reconciliation, and injected-storage adapter)
committed (`b13b77e`). Stage 4A2 (application integration) is implemented in
this working tree, uncommitted, with its focused tests passing — see "Stage
4A2 outcome" below. Stage 4 is NOT complete: recall-delay and exam-timer
preference persistence and Stage 4B unload protection remain open. Updated:
2026-09-13.

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

### Stage 4A0 outcome (implemented and committed)

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

Verification before commit `92f45ed`, after the review-fix round: `npm run
test:unit` 306/306 (263 prior + 37 pool-registry + 6 build-gate); `npm run
build` twice byte-identical (`dist/index.html` 985,206 B of the 1,048,576
budget); `git diff --check` clean; focused `tests/app.spec.js --grep @smoke
--project=chromium-desktop` passed (8/8, startup/CSP coverage for the extra inline
script). `npm run test:routine` and the full matrix were deliberately not run —
no runtime code path changed; the routine/full suites stay reserved for the
integrated storage slice and release gates.

### Second review round (2026-09-13, included in `92f45ed`)

A second independent review of the Stage 4A0 validator found two issues,
both fixed in `scripts/pool-registry.js` before commit:

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

### Stage 4A1 schema decision

Use this initial logical shape (the pool map below is abbreviated to one entry;
production state contains all three):

```json
{
  "schemaVersion": 1,
  "preferences": {
    "theme": "light",
    "recallSeconds": 10,
    "examTimerSeconds": null
  },
  "study": {
    "activePool": "technician",
    "pools": {
      "technician": {
        "editionId": "technician-2026-2030",
        "revisionId": "errata-2026-02-19",
        "currentQuestionId": "T1A01",
        "bookmarks": [],
        "scope": { "level": "all", "id": null },
        "positions": { "all": "T1A01" }
      }
    }
  }
}
```

All three pool entries are present. No question objects are copied into storage.
`recallSeconds` accepts only the current control values
`[0, 5, 10, 15, 20, 30, 60]`. `examTimerSeconds` accepts
`null` (use the pool default) or one of `[0, 900, 1800, 2100, 3000, 3600]`;
`0` explicitly means no timer. Stage 4A1 validates and reserves timer, scope,
and position fields but does not connect their controls.

### State precedence and recovery

1. A valid supported canonical state wins; legacy values cannot overwrite it.
2. If canonical state is absent, malformed, or invalid schema 1, construct
   defaults and apply individually valid legacy values.
3. If its schema is newer than supported, do not overwrite or repair it. Return
   a read-only/default result marked `future-schema`; Stage 4A2 suppresses
   canonical writes for that session.

Invalid preferences use defaults, an invalid active pool uses Technician,
duplicate/unknown bookmarks are removed, and invalid positions use the first
question. Unknown object fields make input invalid; they are removed only in an
explicit normalization/migration result.

### Pure module and API boundary

Add a dependency-free UMD-style `src/storage.js`, following
`src/exam-engine.js`. Requiring it in Node performs no I/O or global mutation;
in browsers it exposes `window.HAM_EXAM_STORAGE`. Core functions receive the
registry, banks, and plain values as arguments.

Cover these operations:

- constants for schema/key/legacy keys, themes, and numeric bounds;
- `createDefaultState(registry, banks)`;
- `validateState(state, registry, banks)`;
- `normalizeState(state, registry, banks)`;
- `migrateLegacy(legacySnapshot, registry, banks)`;
- `reconcileState(state, registry, banks)`;
- non-throwing parse/serialization helpers;
- an injected-storage adapter that caches one availability probe and
  reads/writes/read-backs the single canonical key.

Return structured results such as `{ state, status, errors, writable }`.
Functions do not mutate inputs.

### Atomicity

`localStorage` has no multi-key transaction. Atomic means one `setItem` of
the complete canonical JSON followed by read-back parsing and validation. Until
that succeeds, legacy keys remain untouched. Stage 4A1 tests the adapter but
does not replace application reads/writes.

### Stage 4A1 implementation scope

Required:

- Validate exact keys/types, bounded containers, supported preferences, all
  pool identities, IDs, bookmarks, scope, and positions.
- Convert valid legacy indexes to IDs using embedded bank order.
- Filter/deduplicate bookmarks while preserving first-seen order.
- For same-edition errata, retain existing IDs and update the revision.
- On edition mismatch, reset only that pool even if IDs are reused; preserve
  preferences and unaffected pools.
- Handle absent, malformed, throwing, full, and read-back-corrupting storage.
- Refuse to overwrite future schemas.
- Inline the inert module before `src/app.js` in both build targets.
- Add focused Node tests, affected docs, and deterministic artifacts.

Non-goals:

- No changes to `src/app.js` storage calls or visible behavior.
- No normal-startup write to `ham-exam-state`; no legacy removal/mirroring.
- No scoped UI, persisted exam session, timer-control integration, or unload
  warning.
- No metadata consolidation, question changes, dependency changes, or version
  bump.

### Stage 4A1 outcome (committed as `b13b77e`)

`src/storage.js` is a dependency-free, ES5-only UMD-style module -- the same
browser/Node pattern as `src/exam-engine.js` (`require()` in Node returns an
object whose `HAM_EXAM_STORAGE` property is the API; in a browser it sets
`window.HAM_EXAM_STORAGE`). Requiring/loading it performs no I/O, never
touches `window` in Node, and never reads or writes `localStorage` merely by
being loaded -- every real storage access happens through
`createStorageAdapter(...)`'s `load()`/`save()`, called only when the
application explicitly does so (which it does not yet).

**Schema** (`SCHEMA_VERSION = 1`, `STORAGE_KEY = "ham-exam-state"`): exactly
the shape in "Stage 4A1 schema decision" above, with all three pools
(`technician`/`general`/`extra`) always present. Allowed values:
`theme` ∈ `["light","dark","night"]`; `recallSeconds` ∈
`[0,5,10,15,20,30,60]`; `examTimerSeconds` is `null` (pool default) or ∈
`[0,900,1800,2100,3000,3600]`; `activePool` is one of the three pool keys;
`scope` is exactly `{level:"all", id:null}` (subelement/group scoping is not
implemented in this slice -- any other shape is rejected, not silently
accepted, per "do not accept arbitrary map keys"); `positions` has exactly
one key, `all`, a question ID present in that pool's bank. Bounds
(`BOUNDS`, all documented in-source): `MAX_STORAGE_VALUE_LENGTH` 65536 (any
raw JSON string this module parses or writes); `MAX_ID_LENGTH` 40
(editionId/revisionId/question-ID strings); `MAX_BOOKMARKS_PER_POOL` 1000
(per-pool bookmark list, and how many raw entries are scanned before the
rest are ignored -- comfortably above the largest current pool, 599); and
`MAX_LEGACY_INDEX_DIGITS` 10 (legacy index strings before numeric
conversion).

**API**: `SCHEMA_VERSION`, `STORAGE_KEY`, `POOL_KEYS`, `DEFAULT_POOL_KEY`,
`THEMES`/`DEFAULT_THEME`, `RECALL_SECONDS_VALUES`/`DEFAULT_RECALL_SECONDS`,
`EXAM_TIMER_SECONDS_VALUES`/`DEFAULT_EXAM_TIMER_SECONDS`,
`LEGACY_POOL_KEY`/`LEGACY_THEME_KEY`/`legacyIndexKey(pool)`/
`legacyBookmarksKey(pool)`, `BOUNDS`, `STATUS`, `createDefaultState`,
`validateState`, `normalizeState`, `migrateLegacy`, `reconcileState`,
`safeParseJson`/`safeSerialize`, `createStorageAdapter`. Also exported:
`resolveState(canonicalRaw, legacySnapshot, registry, banks)`, the pure
function implementing the full state-precedence policy end to end (used
internally by the adapter's `load()`, and directly unit-tested).
`STATUS` values: `valid`, `reconciled` (a same-edition drift was corrected,
or a pool with a replaced/missing/malformed edition identity was reset),
`migrated` (canonical absent/unparseable/invalid for any reason other than
edition drift -- recovered from legacy; see "otherwise valid except edition
drift" below), `future-schema`, `unsupported-schema`, `storage-unavailable`
(load and save), `read-error` (a guarded read of the canonical key itself
threw -- treated as "unknown", never as "absent", so neither `load()` nor
`save()` proceeds as if nothing were there), and `ok`/`invalid`/
`serialize-error`/`write-error`/`read-back-error`/`read-back-mismatch`
(save) -- always one of these strings, never an ambiguous boolean.

**Validation/normalization**: `validateState` is strict at every level --
exact key sets (unknown keys rejected at every object level, root through
scope/positions), exact `schemaVersion`, allowed preference enums,
`editionId`/`revisionId` equal to the CURRENT registry's values for that
pool, and `currentQuestionId`/`positions.all`/every bookmark present (and,
for bookmarks, deduplicated and within bound) in that pool's CURRENT bank.
`normalizeState` is the lenient counterpart: never fails, repairs invalid
preferences/activePool to defaults, reconstructs a missing pool entry from
the registry/bank, falls invalid IDs back to the pool's first question, and
filters/dedupes/bounds bookmarks -- all evaluated against the current
bank/registry, not against whichever edition a stale value happened to
belong to (see reconciliation below for that distinction). Both never
mutate their inputs.

**Legacy migration**: `migrateLegacy` starts from `createDefaultState`
(attributing every pool to the registry's CURRENT edition/revision -- "the
edition embedded during the first successful migration") and applies each
of the 8 legacy keys independently, so one malformed field never discards
another valid one. Legacy indexes are parsed by an explicit character scan
(not a `^...$` regex, which would let a trailing "\n" slip through): only
ASCII digits, no sign/decimal/exponent/whitespace, bounded length; an
out-of-range index falls back to the first question. Legacy bookmark JSON
is parsed defensively (bounded length, must be an array) and filtered to
deduplicated, first-seen-order, same-pool valid IDs. Pure and deterministic
-- the same snapshot always yields the same result -- and idempotent;
legacy keys are read-only from this module's perspective (Stage 4A1 never
deletes or rewrites them).

**Reconciliation** (same edition vs. replacement): `reconcileState` first
runs generic `normalizeState` repair, then decides same-vs-different edition
per pool using that pool's **original, pre-normalization** `editionId`
(a bounded string, or treated as unknown if missing/malformed) compared to
the registry's current value -- deliberately not the value `normalizeState`
backfills, so a missing edition identity is never silently promoted to
"current edition" (see the review-fix note below). Same edition: the bank is
unchanged, so already-normalized IDs remain correct as-is; only
`revisionId` is bumped to the registry's current value (an errata update).
Missing, malformed, or different edition (a genuine replacement, a rollback
build whose embedded edition does not match stored state, or no recorded
edition at all): that pool's current question, bookmarks, scope, and
positions are hard-reset to a fresh default attributed to the registry's
current edition/revision -- deliberately ignoring whether the new bank
happens to reuse any of the same question ID strings, since content may
have changed (or was never attributable to any edition in the first place).
Preferences and unaffected pools pass through untouched, and the active-pool
*choice* survives even when that pool's content is the one reset.

`resolveState` ties this together as the full precedence policy: an
absent/unparseable canonical value recovers from legacy (`migrated`); a
newer schema is preserved untouched and returned as a safe, read-only
default (`future-schema`, `writable:false`); an older/unrecognized schema
version gets the same read-only treatment (`unsupported-schema`) rather than
being silently guessed at as schema 1; otherwise the object must be
**strictly valid except for per-pool edition/revision identity**
(`isValidExceptEditionDrift` -- everything `validateState` checks except
whether each pool's `editionId`/`revisionId` equals the registry's current
value, and except bank membership, which depends on which edition is
actually in play) before reconciliation is even attempted -- an object
invalid for any OTHER reason (an invalid preference, an unknown key, a
malformed field) is treated exactly like "invalid schema 1" and recovers
from legacy in full, never selectively repaired in place. Once that gate
passes, the object is reconciled and re-validated, reporting `reconciled` if
anything was actually changed (including a pool reset) or `valid` if the
stored value was already byte-for-byte current.

**Storage adapter**: `createStorageAdapter(storageLike, registry, banks)`
requires an object with `getItem`/`setItem`/`removeItem` (core code never
reaches for a global `localStorage`). Availability is probed at most once
per adapter instance and cached; the probe uses a dedicated throwaway key,
reads whatever was already there first, and never writes if that key is
occupied. A successful read of an occupied key is sufficient evidence of
availability; only an absent key is tested with a write/read/remove cycle.
This avoids relying on a restoration write that could fail and clobber an
existing value. Reads of the canonical key are distinguished from reads of the 8
legacy keys: a legacy `getItem` that throws is tolerated as "absent" (one
inaccessible legacy field must not block the others), but a **canonical**
`getItem` that throws fails closed with `status:"read-error"` in both
`load()` (`writable:false`, a safe default state) and `save()` (no `setItem`
call) -- an unreadable canonical value is never treated as "absent", since
it might be hiding a real (possibly future-schema) value this module must
never silently proceed past. `load()` otherwise returns `resolveState(...)`'s
result; storage being unavailable returns a safe default with
`status:"storage-unavailable"`, `writable:false`, never a thrown exception.
`save(newState)` is exactly one `setItem` of the complete canonical JSON,
gated on: storage available; the existing canonical value could actually be
read; that value, if any, is not a future **or** older-unsupported schema
(both are documented read-only and neither is ever overwritten); `newState`
itself passing `validateState`. After writing, it reads the value back and
re-parses/re-validates it -- success is reported only if the read-back
matches exactly and still validates, so silent truncation/corruption is
reported as failure, not success. Every `storageLike` call is wrapped in
try/catch and turned into a structured `{ok:false, status, errors}` result --
a throwing/full/disabled Storage implementation never throws into the
caller. Legacy keys are never read, removed, or rewritten by `save()`.
**Atomicity**: `localStorage` has no multi-key transaction; "atomic" here
means exactly one `setItem` of the complete canonical JSON, verified by
read-back. Legacy keys remain available and untouched regardless of this
write's outcome, until Stage 4A2 decides migration is committed and
changes what `src/app.js` itself reads and writes.

**Build integration**: a new `__STORAGE__` placeholder in `src/index.html`,
inlined after `__ENGINE__` (banks/pool-registry/engine) and before `__JS__`
(`src/app.js`, which does not call it). `scripts/build.js` reads
`src/storage.js` and fills the placeholder exactly like the other inlined
scripts; the existing `render()` unresolved-placeholder check and CSP
SHA-256 hashing apply unchanged. (One implementation pitfall worth
recording: an early draft of a source comment contained the literal
two-character sequence `` $` `` (dollar-backtick), which `String.replace()`
interprets as "insert everything before the match" -- this silently
tripled large chunks of the template until diagnosed. The initial Stage 4A1
implementation only reworded the comment; the later review fix recorded below
corrected the shared `render()` function to use a replacement callback, so all
inlined replacement content is now inserted literally.)

**Verification performed** (see exact counts/durations further below):
`node --test tests/unit/storage.test.js` (105 tests, pure logic, adapter,
module-inertness, and a small real-registry/banks contract check);
`node --test tests/unit/build-gate.test.js` (26 tests, including one new
build-integration check: the module is inlined exactly once per document
and never invoked); `npm run test:unit` (412 total); `npm run build` twice,
byte-identical; `git diff --check` clean; one focused Chromium `@smoke` run
(8/8) to verify the new unconditional inline script actually parses and
runs in a real browser engine and that CSP still permits it -- something
Node's syntax/require checks cannot establish. `npm run test:routine` and
the full matrix were deliberately not run: no live/visible runtime behavior
changed.

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

## Stage 4A2 — application integration (implemented; see "Stage 4A2 outcome")

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

## Next task: Stage 4 remainder (recall/exam-timer persistence, then 4B)

Stage 4A0 (registry, validator, build gate, embedding; `92f45ed`), Stage 4A1
(the pure versioned-storage module: schema, validation, normalization, legacy
migration, edition-aware reconciliation, and an injected-storage adapter;
`b13b77e`), and Stage 4A2 (application integration; see "Stage 4A2 outcome"
above) are all implemented. The next coding slices are: (a) recall-delay and
preferred exam-timer preference persistence — the schema already reserves the
fields, but their controls are not wired to storage yet; and (b) Stage 4B,
the separate `beforeunload` exam-loss warning. Both need their own focused
tests and independent review. Stage 4 is not complete until they land.

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

### Stage 4A1 measured verification (2026-09-13)

| Step | Command | Result | Duration |
| --- | --- | --- | ---: |
| 1 | `node --test tests/unit/storage.test.js` | 105/105 pass | 0.3s |
| 2 | `node --test tests/unit/build-gate.test.js` | 26/26 pass (incl. 1 new storage-integration test) | 4.6s |
| 3 | `npm run test:unit` | 412/412 pass | 4.9s |
| 4 | `npm run build` | success | 0.4s |
| 5 | Repeat build, compare full `dist/` file hashes | byte-identical | 0.4s |
| 6 | `git diff --check` | clean (exit 0) | n/a |
| 7 | `npx playwright test tests/app.spec.js --grep @smoke --project=chromium-desktop` | 8/8 pass | 5.6s |

Not run: `npm run test:routine`, the full standalone matrix, and the
tag-scoped compat/responsive/PWA batteries -- no live/visible runtime
behavior changed (`src/app.js` is untouched other than adding the
`__STORAGE__`/`storage.js` build wiring, which the focused smoke run above
already exercises for CSP/parsing risk).

Generated artifact: `dist/index.html` is 1,028,612 bytes of the 1,048,576-byte
budget -- **19,964 bytes (1.9%) free**, down from 63,370 bytes before this
slice. `src/storage.js` itself is documentation-heavy (roughly 41 KB raw,
uncompressed, uncommented-out); this is the single largest remaining-headroom
risk from this slice and should be watched closely by whatever adds the next
inlined script (Stage 4A2's own change should be small, but a later,
unrelated growth could combine with this to approach the budget). `dist/pwa/`
is not budget-gated. Both documents were confirmed (via
`tests/unit/build-gate.test.js`) to inline the module exactly once and never
invoke it.

### Review round: two P1 storage-safety defects found and fixed (2026-09-13)

Independent review found two P1 defects before this slice was ready to
commit. Both are fixed in `src/storage.js`, with dedicated regression tests
reproducing the reviewer's exact scenarios.

- **P1 — an invalid schema-1 canonical state could suppress valid legacy
  data and bypass edition-reset safety.** `resolveState`'s gate for "is this
  worth reconciling in place" (`hasPlausibleSchema1Shape`) only checked that
  the expected containers were objects, then ran `reconcileState`, whose
  lenient `normalizeState` pass could repair almost anything into something
  that also passed `validateState` -- so canonical data essentially always
  won, even when genuinely invalid, contradicting the documented "invalid
  schema 1 -> migrate from legacy" rule. Reproduced two ways: (1) an invalid
  `theme` value was silently repaired to the default in place, discarding an
  independently valid legacy theme entirely; (2) a pool entry with **no**
  `editionId` was normalized by backfilling the registry's current edition
  and then treated as "same edition" by `reconcileState`, letting a reused
  `currentQuestionId`/bookmark survive with no genuine basis for believing it
  belonged to the current edition. **Fixed** with two changes:
  - `hasPlausibleSchema1Shape` was replaced by `isValidExceptEditionDrift`,
    which strictly validates everything `validateState` does -- exact key
    sets at every level, preference enums, activePool, exactly the three
    pools, well-typed/bounded pool-entry fields, the fixed scope shape --
    **except** per-pool `editionId`/`revisionId` equality and bank
    membership (the two things reconciliation exists to fix). Any other
    invalidity (an invalid theme, an unknown key, a malformed field, and so
    on) now makes the whole object fall back to migrating from legacy, never
    a selective in-place repair.
  - `reconcileState` now decides "same edition vs. reset" using each pool's
    **original, pre-normalization** `editionId` (a bounded string, or `null`
    if missing/malformed/absent) rather than the value `normalizeState`
    backfills. A missing or malformed `editionId` is therefore treated
    exactly like a genuinely different edition -- a hard reset -- never
    silently promoted to "current edition" just because normalization
    supplied a default afterward.
  - Regression tests: `tests/unit/storage.test.js` reproduces both exact
    scenarios against `reconcileState` directly and against `resolveState`
    end to end (4 new tests).
- **P1 — a failed canonical preflight read was treated as "no state", and
  `save()` could overwrite an unknown (possibly future-schema) value.**
  `safeGet()` converted every `getItem()` exception into `null`, so
  `load()`/`save()` could not distinguish a genuinely absent canonical key
  from one that could not be inspected. Reproduced: an existing future-schema
  value present in storage, whose read throws -- `save()` reported
  `{ok:true, status:"ok"}` and overwrote it; the same ambiguity let `load()`
  report a normal, writable `"migrated"` result after a canonical read
  failure. **Fixed** by splitting canonical reads from legacy reads: a new
  `safeGetCanonical()` returns `{ok, value, error}` instead of collapsing a
  throw to `null`; legacy reads keep the old tolerant-`null` behavior (no
  future-schema concept applies to them, and one inaccessible legacy field
  must not block the others). `load()` and `save()` both fail closed on a
  canonical read failure with the new `STATUS.READ_ERROR` (`writable:false`
  for `load()`; no `setItem` call for `save()`) instead of proceeding as if
  the key were absent. `save()` was also extended to refuse overwriting an
  existing **older, unsupported** schema (`schemaVersion` below
  `SCHEMA_VERSION`), not only a future one -- both are documented read-only.
  Regression tests: a throwing canonical preflight read on `save()` (no
  `setItem` call, `READ_ERROR`), a throwing canonical read on `load()`
  (`READ_ERROR`, `writable:false`, not `"migrated"`), and an existing
  `schemaVersion: 0` value refusing to be overwritten (3 new tests).

Re-verified after the fix: `node --test tests/unit/storage.test.js`
**111/111** (105 + 6 new regression tests, 0.25s); `npm run test:unit`
**418/418** (4.7s); two more builds, byte-identical; `git diff --check`
clean; the same focused Chromium `@smoke` run, 8/8 (3.7s) -- no runtime
behavior changed by these fixes beyond the module's own internal decision
logic. Generated artifact grew slightly with the added logic/comments:
`dist/index.html` is now **1,036,298 / 1,048,576 bytes -- 12,278 bytes
(1.2%) free**. This headroom is now critically tight and should be the
first thing checked before any further growth is inlined into the
standalone document.

### Review round: probe-overwrite defect and comment-bulk headroom (2026-09-13)

A further review found one more P2 defect and one P2 headroom concern.

- **P2 — the availability probe could overwrite an existing value if
  restoration failed.** `probeAvailability()` temporarily replaced any
  existing `__ham_exam_storage_probe__` value with `"1"` and tried to
  restore the saved-off original afterward; if that restoring `setItem`
  itself threw, the function returned `false` (unavailable) but the real
  original value had already been permanently clobbered. Reproduced exactly
  as the review described: `available` false, `probe-after` `"1"`, original
  value `"important-old-value"` lost. **Fixed**: the probe now never writes
  to the probe key at all if it already holds a value -- a successful read
  of an occupied key is treated as sufficient evidence of availability
  (there is no safe way to guarantee a restore succeeds, so the fix is to
  never need one); the destructive write/read/remove test only runs when the
  key is confirmed absent. Real write failures are still caught independently
  by every guarded write elsewhere (`save()`). Regression test: an occupied
  probe key whose `setItem`/`removeItem` would throw if ever called --
  `isAvailable()` still reports `true` (from the successful read alone) and
  the original value is asserted unchanged.
- **P2 — Stage 4A1 consumed almost all remaining standalone space, mostly
  through shipped comments.** `src/storage.js` was 51,021 bytes / 1,137
  lines, with roughly 22,365 characters of comments embedded verbatim into
  both release artifacts, leaving only 12,278 bytes of standalone headroom --
  too tight for Stage 4A2's integration code. **Fixed** by trimming
  extensive rationale/narration comments down to short notes on non-obvious
  invariants and failure boundaries, moving the detailed explanation to this
  document (where the "Stage 4A1 outcome" section already carried most of
  it) rather than duplicating it in both places. No regex-based comment
  stripper or minification step was added (per review guidance) and no logic
  or tests changed -- only comment text. This pass also caught (a second
  time) the same `` $` ``/`` $' `` `String.replace()` footgun from the first
  review round, reintroduced by one of the trimmed comments; fixed again by
  rewording, and a permanent regression test now scans the source file for
  either literal sequence so a third recurrence fails fast in `test:unit`
  rather than only when a build happens to be run.

`src/storage.js` is now 41,940 bytes / 996 lines (~18% smaller). Re-verified:
`node --test tests/unit/storage.test.js` **113/113** (112 + 1 new regression
test); `npm run test:unit` **420/420** (5.7s); two more builds,
byte-identical; `git diff --check` clean; the same focused Chromium `@smoke`
run, 8/8. Generated artifact: `dist/index.html` is now **1,027,223 /
1,048,576 bytes -- 21,353 bytes (2.0%) free**, recovering roughly 9,075
bytes of headroom (up from the critically tight 12,278 bytes before this
round, though still below the 63,370 bytes free prior to Stage 4A1
entirely). Stage 4A2's integration code should still budget carefully.

### Review round: the underlying renderer bug, not just one file (2026-09-13)

A further review correctly identified that the previous round's fix treated
a symptom, not the cause.

- **P1 — the regression test guarded only `src/storage.js`; the actual bug
  is in the shared build renderer.** `scripts/build.js`'s `render()` passed
  replacement content directly as a STRING second argument to
  `String.prototype.replace()`, which specially interprets `$&`/`` $` ``/
  `$'`/`$$` sequences in that argument -- so the same silent-duplication
  failure could occur in *any* inlined CSS, JavaScript, registry, or
  question-bank content, not just in `src/storage.js`'s comments (where it
  had now happened twice by chance). Scanning one file's source for two
  specific sequences moved the hazard elsewhere rather than removing it.
  **Fixed** at the actual source: `render()` now calls
  `output.replace(placeholder, () => replacements[placeholder])` -- a
  replacement *callback* instead of a string. A callback's return value is
  always inserted literally; none of the four special sequences are ever
  interpreted, in any inlined source, regardless of wording. The
  storage-specific source-text regression test was removed (it tested the
  wrong layer) and replaced with a renderer-level regression test in
  `tests/unit/build-gate.test.js`: it plants a sentinel containing all four
  sequences (`$&`, `` $` ``, `$'`, `$$`) into a real inlined source file
  (`src/app.js`, the `__JS__` placeholder) inside an isolated fixture, runs
  the real build, and asserts the sentinel survives byte-for-byte in both
  generated documents. Verified this test actually catches the bug: reverting
  `render()` to the plain-string form made it fail with the exact same
  "Template still contains unresolved placeholders" error the real
  regressions produced, confirming it is not a placebo.

Re-verified: `node --test tests/unit/build-gate.test.js` **27/27** (26 + 1
new renderer regression test); `node --test tests/unit/storage.test.js`
**112/112** (113 - 1 removed wrong-layer test); `npm run test:unit`
**420/420** (net unchanged); two more builds, byte-identical; `git diff
--check` clean; the same focused Chromium `@smoke` run, 8/8. Generated
artifact unchanged from the prior round: `dist/index.html` **1,027,223 /
1,048,576 bytes -- 21,353 bytes (2.0%) free** (the `render()` fix itself is
a few bytes of source, negligible against the budget).

## Stage 4A2 outcome (implemented in working tree, uncommitted, tests passing)

`src/app.js`'s direct legacy `localStorage` reads/writes are replaced by the
Stage 4A1 adapter. One adapter is constructed at startup
(`window.HAM_EXAM_STORAGE.createStorageAdapter(window.localStorage, <registry>,
window.HAM_EXAM_BANKS)` — the bare embedded `window.HAM_EXAM_POOLS` pools map
is wrapped into the module's `{ pools: <map> }` registry shape at that single
call site, since the build embeds the public identity map directly), `load()`
runs once, and the resolved canonical state is the app's single source of
truth in memory. There is no direct `localStorage` access anywhere else in
`src/app.js`; a build-gate test asserts both invariants (exactly one adapter
construction, no `localStorage.getItem/setItem/removeItem` calls) on both
generated documents, and a source-level unit test asserts them for
`src/app.js` itself.

Runtime behavior by `load()` status:

- `valid` — the state is used unchanged; startup performs **no** canonical
  write. Every mutation path compares before writing (theme, position), so an
  unchanged valid startup cannot produce a rewrite.
- `migrated` / `reconciled` — exactly one save commit is attempted at startup.
  If it fails (quota, read-back mismatch, mid-write interruption), the app
  keeps running from the in-memory state; legacy keys were never touched, so
  the next load simply migrates again (rerunnable/idempotent).
- `future-schema` / `unsupported-schema` / `storage-unavailable` /
  `read-error` — `writable:false`; the app runs entirely in memory from the
  resolved (safe-default where applicable) state and never attempts a save.

The resolved status and writability are reported non-visibly through
`window.HAM_EXAM_DIAGNOSTICS.storage`, consistent with the existing
diagnostics object; there is no error UI and no console logging.

Persisted mutations (each a complete-state `adapter.save()` only after the
user action): pool change (`study.activePool`), question navigation
(per-pool `currentQuestionId` + `positions.all`, stored as **stable question
IDs**, resolved to a bank index at render time with a first-question
fallback), bookmark toggle (per-pool `bookmarks` array in the canonical
state), theme change (`preferences.theme`), and reset progress (every pool's
position reset to its first question; active pool, all bookmarks, and theme
preserved). Help and Mock Exam setup/exam/results transitions perform no
persistence calls; **mock-exam sessions, answers, scores, and results remain
memory-only** — verified by a full-exam browser test that finds exactly one
localStorage key (`ham-exam-state`) and no session/answer/score fields in it.

Legacy keys (`ham-exam-pool`, `ham-exam-theme`, `ham-exam-index-<pool>`,
`ham-exam-bookmarks-<pool>`) are **retained without dual writes**: they are
migration input only — never read after a successful canonical load, never
written, never mirrored, never deleted. Canonical authority: a valid stored
`ham-exam-state` always wins over conflicting legacy values.

Tests added/updated:

- `tests/storage.spec.js` (new) — 13 focused cases tagged `@storage`, run
  once on `chromium-desktop` through the new `playwright.storage.config.js`
  (`npm run test:storage` / `test:storage:list`). At the initial Stage 4A2
  handoff they were deliberately excluded from both verification commands;
  the subsequent review fix recorded below added them as a dedicated
  Chromium phase to `npm test` and `npm run test:routine`. They remain outside
  the nine-project and 656-execution standalone selections because the Node
  suite owns the decision logic and one engine suffices for DOM wiring. No
  fixed sleeps; storage spies/seeders run via `page.addInitScript`.
- `tests/pwa.spec.js` — one new Chromium case: canonical study state
  (position, bookmark, theme) restored after an offline reload.
- `tests/app.spec.js`, `tests/responsive-shell.spec.js` — existing
  persistence assertions rewritten from legacy keys to the canonical
  document (plus explicit never-written legacy-key checks where relevant).
- `tests/mock-exam.spec.js` — localStorage whitelist assertions extended
  with the canonical key.
- `tests/unit/storage.test.js`, `tests/unit/build-gate.test.js` — the two
  Stage-4A1 "module is inert / not wired in yet" regression tests replaced by
  their Stage-4A2 opposites (exactly one adapter construction; no direct
  localStorage access).

Recall-delay (`preferences.recallSeconds`) and preferred exam-timer
(`preferences.examTimerSeconds`) persistence are intentionally NOT wired in
this slice — the schema reserves them; connecting their controls is part of
the remaining Stage 4 work, together with Stage 4B (`beforeunload` exam-loss
warning). Stage 4 must not be marked complete until those land.

Measured verification (working tree on top of `b13b77e`; durations local,
one worker where applicable):

| Step | Command | Result | Duration |
| --- | --- | --- | ---: |
| 1 | `npm run test:unit` | 420/420 pass | ~5.2s |
| 2 | `npm run test:storage:list` | 13 selections, 1 project | n/a |
| 3 | `npx playwright test --config=playwright.storage.config.js` | 13/13 pass | ~12s |
| 4 | `npx playwright test tests/app.spec.js tests/responsive-shell.spec.js --project=chromium-desktop --workers=1` | 90/90 pass | ~1m30s |
| 5 | `npx playwright test tests/mock-exam.spec.js --project=chromium-desktop --workers=1` | 90/90 pass | ~1m54s |
| 6 | `npm run test:pwa` | 18 passed, 6 documented WebKit offline skips (was 17+5; +1 new Chromium-only case skipped on webkit-mobile) | ~14s |
| 7 | `npm run test:compat` | 132/132 pass (33 @compat x 4 projects) | ~2m19s |
| 8 | `npm run test:routine` | all 4 phases pass: build, unit 420/420 (5.2s), routine-standalone 656/656 (1180.5s, 1 worker, 0 failed/skipped/retried/flaky), PWA 18 passed + 6 documented WebKit offline skips (16.6s); total 1202.7s (~20.0 min) | ~20.0 min |

Not run: the full nine-project `npm test` matrix (release gate; this slice
ran the routine union, the @compat matrix, and focused Chromium coverage
instead). Independent review of this slice is required before commit, same
as prior stages.

### Review fix: the 13 `@storage` tests were not wired into any gate

Independent review found a P1 gap: `tests/storage.spec.js`'s 13 tests were
runnable directly (`npx playwright test --config=playwright.storage.config.js`,
row 3 above) but were not part of `npm test`, and `scripts/run-routine-tests.js`
had no storage phase -- so both the GitHub deployment gate and the routine
runner could pass while every canonical migration/integration test was
broken. Fixed:

- `package.json`: added a no-build `test:storage:run` (`playwright test
  --config=playwright.storage.config.js`); `test:storage` is now `npm run
  build && npm run test:storage:run`; `npm test` now runs
  `build && test:unit && test:standalone && test:storage:run && test:pwa`
  (storage immediately after the standalone phase, before PWA).
- `scripts/run-routine-tests.js`: added a `storage` phase (Playwright
  `--config=playwright.storage.config.js`) between `routine-standalone` and
  `pwa`, so `npm run test:routine` is now 5 phases:
  build → unit → routine-standalone → storage → pwa.
- `tests/unit/run-routine-tests.test.js`: updated the phase-count/order/args
  assertions for 5 phases (`build`, `unit`, `routine-standalone`, `storage`,
  `pwa`); all still pass with no other changes to the runner's tested logic
  (signal handling, abort-between-phases, exit-code propagation, etc. are
  unaffected by which phases exist).

Per the review, the storage config stays a dedicated one-project Chromium
selection (not multiplied across the nine-project matrix or added to the
656-execution routine union) -- only *where it runs* changed, not *what* or
*how many projects*.

Verified without repeating the 656-execution routine-standalone phase (its
selection did not change): `node --test tests/unit/run-routine-tests.test.js`
**30/30 pass** (confirms `buildPhases()` now returns the 5-phase order for
real, and `runAll`/`exitCodeFor`/signal-handling logic is unaffected); `npm
run test:storage:run` directly, **13/13 pass in 11.5s** (matching the
reviewer's ~11-second estimate); `npm run build` (fresh, to exercise
`test:storage:run` against current output) succeeded, `dist/index.html`
**1,030,282 / 1,048,576 bytes -- 18,294 bytes (1.7%) free** (unchanged from
the measurement above; this fix touches no `src/` files). A fresh full `npm
run test:routine` (now 5 phases, ~20 minutes) was deliberately not re-run,
per the review's explicit guidance that the unchanged 656-selection result
need not be repeated immediately; it should still be run once before this
slice is considered fully re-verified end-to-end.

Generated artifact: `dist/index.html` grew from 1,027,223 to **1,030,282
bytes of the 1,048,576 budget (+3,059 bytes net; 18,294 bytes / 1.7% free)**
— near size-neutral, well inside the 8 KiB slice budget, because removing
the legacy helpers offset most of the integration code. Consecutive rebuilds
are byte-identical (whole-`dist/` sha256 comparison) and `git diff --check`
is clean. `dist/pwa/` is not budget-gated (app shell 1,032,696 bytes;
`dist/pwa/` total 1,359,312 bytes on disk).
