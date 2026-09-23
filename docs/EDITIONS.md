# Edition compatibility

This document records the Stage 7A audit for making `us-hamexam` a safer upstream
for future regional editions. It is a design record, not an invitation to add
regional content to this repository.

## Audit status

The audit was performed against `pre-edition-refactor-2026-09-22` (US Ham Exam
`0.3.0-beta.5`). The working tree was unchanged. The codebase is already
partly profile-shaped: `data/pools.json` owns pool identity, exam counts,
scoring, timers, hierarchy, and scope labels, while `src/exam-engine.js`
receives a pool configuration explicitly. The remaining work is primarily to
extract application-level US assumptions without changing US behavior.

## Assumption inventory

| Area | Current US assumption | Intended boundary |
|---|---|---|
| Pool registry | FCC/NCVEC identities, T/G/E prefixes, source URLs, hierarchy, and labels | Keep in edition-supplied pool data; retain strict US validation for the US profile |
| App defaults | Technician/General/Extra keys and Technician default | Edition profile: ordered pool keys and default pool |
| Metadata and Help | FCC, NCVEC, license names, official links, and US newcomer copy | Edition profile/content; keep historical US documentation in this repository |
| Exam controls | US timer options and pool defaults | Profile configuration; timer mechanics remain generic |
| Question grouping | `[A-Z]\d[A-Z]` assumptions in exam and scope code | Generalize from validated pool/group metadata before accepting another ID scheme |
| Figures | NCVEC figure IDs, manifest, and source-PDF provenance | Keep US pipeline; make figure manifests optional for editions without figures |
| Build inputs | Hardcoded US pool files and figure paths | Build profile supplies inputs while preserving deterministic output |
| Persistence/cache | `ham-exam-state`, legacy `ham-exam-*`, `HAM_EXAM_*`, and cache names | Preserve US names for migration; define collision-safe derived-edition namespace rules |
| Validators | NCVEC ID/provenance and errata conventions | Keep US policy strict; introduce explicit policy seams rather than weakening gates |
| Tests and docs | US counts, names, links, and release history | Generic harness plus US golden assertions; derived repositories maintain their own content/docs |

## Proposed minimal profile

The first implementation should add one validated US profile, with no regional
content and no country selector. It should provide only data needed to replace
application-level assumptions:

- `editionKey`, display name, subtitle, jurisdiction, and authority labels;
- ordered `poolKeys` and `defaultPoolKey`;
- pool-registry and data-input locations for the build, kept out of runtime
  where possible;
- reference/source/element label templates and official links;
- allowed exam-timer values and optional-feature flags;
- figure-manifest policy and provenance-policy identifiers;
- namespace policy, explicitly retaining the current US storage/cache names.

Pool-specific counts, scoring, timers, hierarchy, IDs, and labels remain in the
existing pool registry. The profile must not duplicate them.

## Generic engine boundary

These mechanisms should remain generic: study navigation and scopes,
sequential/random order, bookmarks and progress, recall/exam timers, themes,
figure rendering, storage migration machinery, Mock Exam selection, offline/PWA
packaging, CSP, and diagnostics. Edition data supplies pools, terminology,
scoring, hierarchy, links, and optional features.

## Risks and compatibility gates

1. Stable IDs and group derivation must not silently mis-group a derived pool.
2. Existing US storage and legacy-key migration must remain byte- and behavior-compatible.
3. Derived editions may have different timer values, pool sizes, or no figures.
4. US provenance and validator rules must not be weakened accidentally.
5. Each edition may have different bundle size; the 1 MiB/16 KiB US policy remains
   the default until a separate measured decision says otherwise.
6. Merge conflicts are most likely in `src/index.html`, profile/data files, and
   documentation; keep edition content clearly separated from engine code.

Every implementation slice must retain US golden checks for pool selection,
scoring, storage migration, branding, offline behavior, deterministic builds,
and artifact size.

## Staged implementation sequence

1. Add and validate the minimal profile with no behavior change.
2. Integrate profile inputs into the build and prove US output remains stable.
3. Parameterize runtime metadata, pool defaults, labels, and timer options.
4. Generalize ID/group and figure-validator seams without weakening US gates.
5. Add compatibility/golden tests and storage-namespace regression tests.
6. Document profile authoring, provenance boundaries, and the upstream-to-derived
   merge workflow.

## Decisions deferred

- Keep `HAM_EXAM_*` globals unchanged initially; storage/cache namespaces require
  explicit policy, but cosmetic global renaming is not needed for the first slice.
- Make figures optional by edition/pool rather than requiring every edition to
  carry an NCVEC-style manifest.
- Start with profile-level timer options; allow per-pool overrides only when a
  real edition requires them.
- Keep `us-hamexam` as the upstream repository; do not create a shared-core repo
  until repeated merge experience justifies it.
- Preserve CSP/hash mechanics unchanged and regenerate hashes normally.

India-specific questions, regulations, provenance/licensing, branding, and
release work belong in a separate derived repository.

## Stage 7B: minimal edition profile (implemented)

The proposed minimal profile above is now a real, validated file:
`data/edition.json`, schema-owned by `scripts/edition-profile.js` (a pure,
dependency-free CommonJS validator with the same shape as
`scripts/pool-registry.js`: exact key allowlists, `validateEditionProfile`
returning `{ errors }`, and `assertEditionProfile` throwing before any
`dist/` mutation).

### Schema (`schemaVersion: 1`)

| Field | Shape | Notes |
|---|---|---|
| `editionKey` | lowercase, hyphen-separated string | `"us-fcc"` for this repository; the shape itself does not hardcode "us" |
| `displayName`, `subtitle`, `jurisdiction` | non-blank strings | branding/identity; currently duplicated as static `src/index.html` text, not yet read from here |
| `authority` | object: `regulatorName`, `regulatorAbbreviation`, `poolSourceName`, `poolSourceAbbreviation` | all non-blank strings |
| `poolKeys` | ordered, non-empty array | must equal `scripts/pool-registry.js`'s `POOL_KEYS` as a set (no missing, no extra, no duplicates) -- pool identity has exactly one source of truth |
| `defaultPoolKey` | string | must be one of `poolKeys` |
| `labels` | object: `referenceLabelTemplate`, `sourceLabelTemplate`, `elementLabelTemplate` | each must contain the placeholder it names (`{ref}`, `{poolSourceAbbreviation}`, `{element}`); mirror `src/app.js`'s current hardcoded "FCC reference: " + ref / "Element " + element text as templates, not yet wired to it |
| `examTimerSecondsValues` | strictly ascending, non-negative integer array | the *shape* is generic; the real profile's array is golden-tested to equal `src/storage.js`'s real `EXAM_TIMER_SECONDS_VALUES` (see Testing below), so it can never silently drift from enforced behavior |
| `figurePolicy` | **optional** object: `manifestRequired` (boolean), `provenanceScheme` (`"checksum-pdf"` or `"none"`) | the one field an edition with no figures may omit entirely |
| `namespacePolicy` | object: `storageKey`, `legacyKeys` (array), `cachePrefix` | required; the real profile's values are golden-tested to equal `src/storage.js`'s real `STORAGE_KEY`/`LEGACY_POOL_KEY`/`LEGACY_THEME_KEY`/`legacyIndexKey`/`legacyBookmarksKey` and the PWA's `"ham-exam-"` cache prefix -- explicitly *preserving*, never proposing to change, the current US names |

Pool-specific counts, scoring, timers, hierarchy, question IDs, and
per-pool display labels remain exclusively in `data/pools.json`; the profile
never duplicates them. The only pool-registry fact cross-checked here is
identity (`poolKeys`/`defaultPoolKey` against `POOL_KEYS`) -- the same set
`data/pools.json` itself is validated against.

### Build integration and runtime embedding

`scripts/build.js` reads and validates `data/edition.json` via
`assertEditionProfile()` -- one of the mandatory pre-mutation gates, alongside
the question-bank, figure-reference, pool-registry, and figure-manifest gates,
all of which run before `fs.mkdirSync(OUT_DIR)`/any `dist/` write. A malformed
profile aborts the build with no output, exactly like a malformed
`data/pools.json`.

Embedding is deliberately **narrower** than the schema: only the bare
`editionKey` string is embedded, as `window.HAM_EXAM_EDITION = "us-fcc";`,
sharing its `<script>` tag with `window.HAM_EXAM_POOLS` (the same
byte-saving technique `__BANK__` already uses for
`HAM_EXAM_VERSION`/`HAM_EXAM_VERSION_DISPLAY`/`HAM_EXAM_BANKS`). No other
profile field is embedded yet -- `poolKeys`/`defaultPoolKey`,
`authority`/`labels` (branding), `examTimerSecondsValues`, and
`figurePolicy`/`namespacePolicy` all stay validated-only, because nothing in
the current runtime reads them; embedding unread data would only spend
standalone-budget bytes the 16 KiB safety target does not have to spare. A
later stage that actually parameterizes pool defaults, labels, timers, or
branding embeds the specific fields it needs then, re-deriving them from this
same validated file -- this is `window.HAM_EXAM_EDITION`'s *contract*
allowed to grow, not a promise that it stays a bare string forever.

`window.HAM_EXAM_EDITION` is otherwise completely inert: no current code
(`src/app.js`, `src/storage.js`, the figure validators, or the PWA files)
reads it. This matches the precedent `src/storage.js` itself set at Stage
4A1 (embedded and unused for one stage before being wired in).

### Compatibility result

Every existing `HAM_EXAM_*` global, `ham-exam-state`/legacy storage key, pool
selection path, Mock Exam behavior, Help content, CSP mechanism, and offline
(PWA) behavior is unchanged -- confirmed by the full existing test suite
(`@smoke`, `test:pwa`) passing unmodified, and by two build-gate tests that
explicitly assert `window.HAM_EXAM_POOLS` is still assigned exactly once and
its content is unaffected by sharing its `<script>` tag with the new literal.
No existing validation rule was weakened: the new gate is additive (one more
mandatory pre-mutation check), and the profile's `examTimerSecondsValues`/
`namespacePolicy` fields are golden-tested against `src/storage.js`'s real
constants rather than being allowed to assert anything independently.

Standalone size: embedding the minimal profile costs 35 bytes
(`window.HAM_EXAM_EDITION = "us-fcc";`) plus the one-time schema/validator
code is build-tool-only and never shipped. See
`docs/IMPLEMENTATION_PLAN.md`'s Stage 7B execution-log row for the exact
before/after byte accounting.

### Testing

`tests/unit/edition-profile.test.js` covers the real profile (validates
clean, records the expected identity, cross-checks `poolKeys`/`defaultPoolKey`
against the pool registry, and the two storage-golden checks above) and
synthetic malformed profiles (every required-field omission, an invalid
edition key, a duplicate pool key, an invalid default pool key, malformed
`authority`/`labels` -- including a missing placeholder, invalid
`examTimerSecondsValues`, an invalid optional `figurePolicy`, and a malformed
`namespacePolicy`). `tests/unit/build-gate.test.js` adds the same real-build
proof pattern used for the pool-registry gate: missing file, malformed JSON,
a tampered profile, four distinct malformed-profile diagnostics, byte-identical
`dist/` on gate failure (sentinels included), no output directory created on
failure, and the real profile passing with exactly one `HAM_EXAM_EDITION`
assignment per document and two consecutive builds byte-identical.

### Next-stage boundary

Stage 7B stops at "validated and embedded as inert identity." It does **not**:
parameterize `src/app.js`, `src/storage.js`, the figure validators, or PWA
behavior; change any runtime label; add a country selector; or add any
non-US content. The next staged step (per "Staged implementation sequence"
above, item 2) is integrating profile inputs into the build itself while
proving US output stays stable -- still no runtime parameterization. Runtime
consumption (pool defaults, label templates, timer options, branding) is
item 3, and remains a separate, later slice.
