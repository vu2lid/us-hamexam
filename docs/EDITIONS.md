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

## Stage 7C: build integration (implemented)

Stage 7B's profile now *owns the build's data inputs*. `data/edition.json`
gained a required `build` object whose values are repository-relative paths;
`scripts/build.js` resolves every formerly hardcoded US path from it, after
the same pure profile validation and still before any `dist/` mutation. The
US generated artifact is byte-identical to the pre-Stage-7C output.

### Build-input schema

| Field | Shape | Notes |
|---|---|---|
| `build.poolRegistry` | relative path, `.json` | the canonical pool registry (`data/pools.json`) |
| `build.questionBanks` | object keyed by pool key | exactly one relative `.json` path per registry pool -- unknown keys, missing mappings, and non-string values rejected; a duplicate mapping cannot survive JSON parsing (later keys overwrite), so identity is enforced as unknown+missing |
| `build.figureManifest` | **optional** relative path, `.json` | absent => the embedded `HAM_EXAM_FIGURES` is `{}` and the figure gate is skipped -- safe ONLY when no loaded bank question references a figure. Banks with figure references force the manifest (and a `manifestRequired: true` figure policy) at build time, before any `dist/` mutation, even when the profile omits `figurePolicy` and the pure validator's cross-check cannot fire |
| `build.guideImage` | **optional** relative image path (`.png`/`.jpg`/`.jpeg`/`.gif`/`.webp`) | absent => a minimal 1x1 GIF placeholder is inlined for the template's `__GUIDE_IMAGE__` slot, verified ACTUALLY transparent (not merely a valid GIF -- a prior literal here decoded fine but was fully opaque) by a build-gate test that parses its Graphic Control Extension and asserts the transparency flag and transparent color index directly (an edition without a photo adjusts its template alt text in its own `src/`) |

Cross-field rule: `figurePolicy.manifestRequired: true` demands a declared
`build.figureManifest` -- the profile validator rejects
"requires figures but declares no manifest" up front.

### Path-safety rules (validation ownership)

Path validation is split, deliberately, between the pure validator and the
build:

- `scripts/edition-profile.js` (pure, in-memory): every build input must be
  a non-blank **relative** POSIX path -- no absolute paths (`/...`,
  `C:\...`), no backslashes, no empty/`.`/`..` segments (so no traversal), no
  NUL -- plus the extension checks above. A syntactically safe relative path
  resolved against the repo root cannot escape it.
- `scripts/build.js` (build-side, belt and braces): `resolveBuildInput()`
  resolves each validated path with `path.resolve(ROOT, ...)` and verifies
  the result stays inside the repository before any read, then reads with a
  diagnostic naming **both** the offending path and its profile field (e.g.
  `data/no-such-registry.json (profile build.poolRegistry) could not be
  read`). Missing files fail the build; they are never silently skipped.

Filesystem **existence** is intentionally not the pure validator's job (it
touches no files); the golden unit test instead asserts the real profile's
declared paths exist and exactly match the paths `scripts/build.js` used to
hardcode, so the profile is a faithful transfer of the prior constants.

### Build changes and gate order

`scripts/build.js` no longer carries hardcoded US data paths (the
`FIGURES_MANIFEST_*`/`GUIDE_IMAGE_*`/`POOLS_REGISTRY_*` constants and the
three literal `loadPool("technician", ...)` calls are gone; the build-data
pool *titles* for `HAM_EXAM_BANKS` remain a small `POOL_TITLES` map, keyed
by pool key). The gate order changed in one strictly required way,
documented here: the edition-profile gate now runs **first** among the data
gates, because its validated `build` inputs supply every other data path.
After it: question-bank loading (per-pool schema + figure-reference gates,
unchanged), the pool-registry gate, the figure-manifest gate (skipped only
when no manifest is declared), the guide-image read, then the unchanged
byte-budget gate -- all still before the first `dist/` mutation. Bank
loading iterates the registry's canonical `POOL_KEYS` order, so
`HAM_EXAM_BANKS` key order is preserved regardless of profile authoring.

Nothing build-only reaches runtime metadata: `buildPublicEditionProfile()`
still returns only the bare `editionKey`; no path, provenance, or manifest
data is embedded (a build-gate test asserts the generated documents contain
no registry/manifest/source-PDF paths and no absolute paths). `src/app.js`,
`src/storage.js`, the figure validators, the PWA files, storage/cache
namespaces, CSP, and Mock Exam behavior are untouched.

### Compatibility result

Rebuilding from the real US profile reproduces the Stage 7B artifact
**byte-for-byte**: `dist/index.html` 1,031,992 B (16,584 B free, unchanged),
`dist/pwa/index.html` 1,034,438 B, cache version `59951cbdfc21` -- and `git
status` reports `dist/` clean against the committed Stage 7B tree, the
strongest form of the "US output unchanged" requirement. All existing
profile-validator and build-gate tests pass unmodified except four
diagnostic-message assertions updated for the new field-naming diagnostics
(the gates themselves are unchanged). `@smoke` (24/24) and `test:pwa` (19
passed + 7 pre-existing webkit-mobile skips) pass unmodified.

### Testing

`tests/unit/edition-profile.test.js` (+5 cases) covers: a golden check that
the real profile's `build` inputs exactly equal the previously hardcoded US
paths, are all relative/safe, and all exist on disk; malformed `build`
shapes (non-object, unknown keys, missing `poolRegistry`/`questionBanks`);
`questionBanks` identity errors (unknown pool, missing mapping, non-string
path); unsafe paths (absolute Unix and Windows, `..` traversal at the start
and middle of a path, backslashes, wrong extensions for both JSON and image
inputs); and optional-input behavior (both optional inputs plus
`figurePolicy` omitted validates clean; `manifestRequired` without a
declared manifest does not). `tests/unit/build-gate.test.js` drives the real
build entry point: missing mapping, unknown pool key, absolute/traversal/
backslash paths (three diagnostics), a declared path naming a missing file,
a failed resolution leaving a seeded `dist/` tree byte-identical, real
figure-bearing banks forcing the manifest and a `manifestRequired: true`
figure policy even when the profile omits `figurePolicy` entirely (a
regression test for a defect an independent review found: the pure
validator's cross-check cannot fire when `figurePolicy` itself is absent, so
the build now checks the loaded banks' actual `figure` fields directly), the
`manifestRequired` cross-field abort, and the real US profile building with
unchanged content and byte-identical repeats. A dedicated case builds an
edition with no figure manifest AND no guide image (banks scrubbed of every
figure reference first, so the "no figures" path is exercised honestly) and
asserts the embedded figure registry is `{}` and the fallback GIF's
Graphic Control Extension genuinely marks a color transparent -- a second
independent review found the first fix's fallback GIF decoded successfully
but was fully opaque (no Graphic Control Extension at all), which a
weaker header/trailer-only check had missed; the test now parses the GIF's
block structure to verify transparency directly rather than assuming it.

### Next-stage boundary

Stage 7C stops at "the build reads its data paths from the validated
profile." It does **not** parameterize runtime metadata (pool defaults,
label templates, timer options, branding -- item 3 of the staged sequence),
touch the question-ID regexes or figure validators (item 4), or add any
non-US content. Item 5 (compatibility/golden gates) and item 6 (derivation
and merge documentation) also remain separate slices.
