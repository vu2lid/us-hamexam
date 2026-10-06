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
| `displayName`, `subtitle`, `jurisdiction` | non-blank strings | branding/identity; as of Stage 7B duplicated as static `src/index.html` text and not read from here — **Stage 7D now projects `displayName`** to Help/About (`#help-app-name`); `subtitle`/`jurisdiction` remain validated-only |
| `authority` | object: `regulatorName`, `regulatorAbbreviation`, `poolSourceName`, `poolSourceAbbreviation` | all non-blank strings |
| `poolKeys` | ordered, non-empty array | must equal `scripts/pool-registry.js`'s `POOL_KEYS` as a set (no missing, no extra, no duplicates) -- pool identity has exactly one source of truth |
| `defaultPoolKey` | string | must be one of `poolKeys` |
| `labels` | object: `referenceLabelTemplate`, `sourceLabelTemplate`, `elementLabelTemplate` | each must contain the placeholder it names (`{ref}`, `{poolSourceAbbreviation}`, `{element}`) **exactly once** (review follow-up, below); `referenceLabelTemplate`/`elementLabelTemplate` must additionally END with their placeholder, since the runtime only ever uses the text before it as a prefix; mirror `src/app.js`'s previously hardcoded "FCC reference: " + ref / "Element " + element text as templates — **wired in Stage 7D** via the runtime projection (the templates themselves stay build-side; only their resolved prefixes are embedded) |
| `examTimerSecondsValues` | strictly ascending, non-negative integer array | the *shape* is generic; the real profile's array is golden-tested to equal `src/storage.js`'s real `EXAM_TIMER_SECONDS_VALUES` (see Testing below), so it can never silently drift from enforced behavior — **projected in Stage 7D** as `src/app.js`'s allowed-value policy |
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

## Stage 7D: runtime edition metadata (implemented)

Item 3 of the staged sequence. `src/app.js` now consumes a small, allowlisted
runtime **projection** of the validated profile instead of its own hardcoded
US literals. US behavior, wording, storage, and Mock Exam semantics are
unchanged; every projected value is golden-tested to equal the literal
`src/app.js` previously hardcoded (and still falls back to).

### Two separate globals

| Global | Shape | Purpose |
|---|---|---|
| `window.HAM_EXAM_EDITION` | bare string (`"us-fcc"`) | unchanged from Stage 7B -- stable edition identity, still the same expected string |
| `window.HAM_EXAM_EDITION_CONFIG` | compact object, 7 allowlisted fields | **new in 7D** -- the only profile data `src/app.js` reads |

### Runtime projection schema

Derived by `scripts/build.js#buildEditionRuntimeConfig()` from the
already-validated profile, then validated again by
`scripts/edition-profile.js#assertEditionRuntimeConfig()` before any `dist/`
mutation. Every field has a real read site; nothing is embedded "for later".

| Field | Derived from | `src/app.js` read site |
|---|---|---|
| `poolKeys` | `profile.poolKeys` (order preserved) | `POOL_KEYS` -- pool-selector order, Help pool list order, exam pool list order, footer pool names |
| `defaultPoolKey` | `profile.defaultPoolKey` | `DEFAULT_POOL` -- **Start with Technician** (`setPool(DEFAULT_POOL)`, no longer a literal `"technician"`), and the invalid-pool fallback |
| `referenceLabelPrefix` | `labels.referenceLabelTemplate` text before `{ref}` | `REF_LABEL_PREFIX` -- the study question's reference line and the Mock Exam results-review reference |
| `elementLabelPrefix` | `labels.elementLabelTemplate` text before `{element}` | Help pool metadata (`"Element 2, 409 questions, …"`) |
| `sourceLabelText` | `labels.sourceLabelTemplate` with `{poolSourceAbbreviation}` resolved at build time | Help pool-list source link text (`"NCVEC source"`) |
| `examTimerSecondsValues` | `profile.examTimerSecondsValues` | `EXAM_TIMER_SECONDS_VALUES` -- the allowed-value policy gating what the exam-timer preference may persist |
| `displayName` | `profile.displayName` | Help/About app name (`#help-app-name`) |

Prefixes rather than templates: both label read sites only ever concatenate
fixed text before one dynamic value, so the build pre-splits each template at
its placeholder instead of shipping a runtime templating helper for a single
trailing substitution. `sourceLabelText` needs no runtime substitution at all
(its one placeholder resolves to static profile data).

### What is deliberately NOT projected

Pool-specific data stays exclusively in `HAM_EXAM_POOLS` (`data/pools.json`) --
counts, scoring, group blueprint/hierarchy, question IDs and prefixes,
per-pool display labels and scope labels, per-pool exam defaults, source URLs,
errata labels. A unit test asserts none of those field names is even
projectable. Build-only data (`build` paths, guide-image path, provenance,
validator internals) and validated-but-unread profile fields (`authority`,
raw `labels` templates, `subtitle`, `jurisdiction`, `figurePolicy`,
`namespacePolicy`, `schemaVersion`) never reach the generated documents; a
build-gate test greps both documents for each of those names and values.

Three boundaries stay where they were, by design:

- **`src/storage.js` is untouched.** A fresh profile's initial active pool
  still comes from the storage module's own canonical default state, and
  `ham-exam-state`/legacy keys, the schema, and `EXAM_TIMER_SECONDS_VALUES`'s
  own copy there are unchanged. Parameterizing storage is a later slice; the
  profile's `namespacePolicy` remains validated-only, and the existing golden
  tests still pin it to the real storage constants.
- **The exam-timer `<option>` list stays static template content.** The
  projection owns the *allowed-value policy* (what may be persisted), not the
  offered list, whose human labels ("15 minutes") are not derivable from a
  seconds value. A test narrows the projection to `[0, 900]` and shows a real
  `1800` option is then refused -- policy genuinely follows the projection.
- **Static branding in `src/index.html` is unchanged** (`<title>`, the
  `<h1>` app title/tagline, Help prose). Only the About paragraph's app name
  gained an id (`#help-app-name`) so `displayName` has a read site.

### Build integration

The projection is derived and validated immediately after the profile gate,
still before the first `dist/` mutation. Its literal shares the `__POOLS__`
placeholder's `<script>` tag with `HAM_EXAM_EDITION` and `HAM_EXAM_POOLS`
(both ordered before the pools literal, so the pools JSON remains the last
statement before `;</script>` and existing extraction tooling is unaffected).

Validating the *derived output* is defense in depth: the profile gate already
guarantees every input is well-formed, so only a derivation bug could trip
this second gate -- which is exactly the class of mistake it exists to catch.
Build-gate tests prove it by injecting a derivation bug into a fixture's
`build.js` (leaked key, missing field, bad default pool, blank prefix,
non-ascending timers, non-object) and asserting each aborts with a
field-naming diagnostic and leaves a seeded `dist/` byte-identical.

### Measured size impact at initial implementation (superseded — see "Size-recovery review follow-up" below)

The margin reported in this section as a shortfall was recovered in full by
a subsequent review follow-up (CSS consolidation only, no code-quality
compromise); this section is kept as the original, accurate record of the
initial implementation's measurement, not rewritten.

| Component | Bytes |
|---|---|
| Embedded JSON literal (`window.HAM_EXAM_EDITION_CONFIG = {…};`) | +296 |
| `src/app.js` (comments stripped, as shipped) | +456 |
| `src/index.html` (`#help-app-name` id) | +19 |
| **Total** | **+771** |

Standalone: 1,031,992 B → **1,032,763 B**, headroom 16,584 B → **15,813 B
(1.51%)** — **571 bytes below the 16,384 B (16 KiB) safety target**, reported
here rather than concealed. The 1 MiB budget is untouched and not raised.

Two genuine optimizations were applied before reporting: the `EDITION_CONFIG`
read was reduced from a `typeof`-guarded ternary (needed for `FIGURES`, which
is indexed by arbitrary runtime keys; unnecessary here for a build-validated
object) to a plain `||` fallback (−95 B), and `sourceLabelTemplate` was
redefined to resolve to the pool list's *already-existing* "NCVEC source" link
text, folding that field into a literal-to-variable swap instead of adding a
new tooltip (−55 B, and better wiring besides).

The residual cost is structural, not cosmetic: seven new or modified read
sites plus the literal. Closing 571 B would require abbreviating the JSON key
names (`refPrefix`, `elPrefix`, `timerSecs`) against this repository's
unbroken full-clear-name convention, or a positional array with no field names
at all — code-quality regressions rather than narrow optimizations, and only
~45 B in any case. Recovering the margin belongs in a separate, dedicated
size-recovery slice (the Stage 6A6 CSS-consolidation review fix is the
precedent), not in a rename that makes the projection harder to read.

### Testing

`tests/unit/edition-profile.test.js` (+12 cases): the expected projection
validates clean; non-object roots; every non-allowlisted key rejected —
including each real profile field that must not be projected; the allowlist is
exactly the seven documented fields; every missing field by name; malformed
`poolKeys` (empty, non-array, duplicate, non-string), out-of-range
`defaultPoolKey`, blank label/display strings, malformed
`examTimerSecondsValues`; a multi-error `assert` throw; a golden check that the
real profile projects exactly the literals `src/app.js` falls back to; and a
check that no pool-specific registry field name is projectable.

`tests/unit/build-gate.test.js` (+6 cases): the real profile embeds exactly the
allowlisted projection once per document with the expected US values and an
unchanged `HAM_EXAM_EDITION`; no build-only path, provenance, or non-projected
profile data in either document; six injected derivation bugs each aborting
before `dist/` mutation; a seeded `dist/` left byte-identical on gate failure;
a profile-level fault still failing at the *profile* gate (never reaching the
projection gate); and a changed profile genuinely changing the embedded values
while `HAM_EXAM_BANKS` key order stays canonical.

`tests/app.spec.js` (+16 cases): the embedded projection's exact allowlist and
US values; pool-selector order and default pool; **Start with Technician**
landing on Technician with the real profile and on `extra` when the projection
says so (proving `setPool(DEFAULT_POOL)`); reference label, Help element
prefix, source-link text, and About display name, each both at their real
value and following an overridden projection; projected exam-timer values
accepted and out-of-policy values refused; no new storage keys and an
unchanged canonical schema with no edition data persisted; Mock Exam
independence; all three themes with no console errors; 320×568 with no
horizontal overflow; and no network requests. The override cases install a
property setter before the build's own literal executes, so `src/app.js` reads
a rewritten value — proving genuine consumption rather than coincidental
agreement with a still-hardcoded literal.

### Next-stage boundary

Stage 7D stops at "app.js reads an allowlisted projection." Still deferred:
generalizing the ID/group and figure-validator seams (item 4);
compatibility/golden and storage-namespace regression tests (item 5);
profile-authoring and merge documentation (item 6); parameterizing
`src/storage.js`, the exam-timer option list, static `src/index.html`
branding, or PWA/cache namespaces. No country selector, runtime edition
switching, plugin system, or non-US content was added.

### Size-recovery review follow-up (margin now above target)

The initial Stage 7D implementation landed at 15,813 B free, 571 B below the
16,384 B (16 KiB) target. A follow-up review recovered the margin through
**CSS selector/declaration consolidation only** -- no JSON key abbreviation,
no new minifier, no behavior change, no required field/content/test removed.

**What changed, and why it is cascade-safe.** `src/style.css` had accumulated
a number of selectors with byte-for-byte identical declaration bodies (or
identical SUBSETS of declarations) scattered across unrelated sections. Each
merge was verified, before being applied, against one of two safety
conditions:

- the grouped selectors can **never match the same element** (disjoint tag
  requirements or disjoint class names -- e.g. `.exam-choice-label` is applied
  only to a `<label>`, so it can never collide with `button:focus-visible,
  select:focus-visible`), so their relative order has no cascade effect at
  all; or
- the grouped selectors live inside the **same existing `@media` block** (or
  are both unconditional base rules) with **no other occurrence** of the
  shared property for either selector anywhere else at equal or higher
  specificity, so moving one declaration's text position relative to the
  other's cannot change which rule wins for any element in any state -- the
  same reasoning this file's own `@media (max-width: 640px)` consolidation
  comment (Stage 6A6 review) already established and reuses here.

Two merges split a larger rule into a **shared group plus a per-selector
remainder** rather than a full merge, where only a subset of declarations was
identical: `.card`/`.exam-results-body`/`.exam-session-body` share five
properties (background/border/border-radius/padding/box-shadow) with
`.exam-session-body` keeping its own `min-height`/`margin-bottom` separately;
`.help-content section`/`.exam-setup-body` share four properties
(background/border/border-radius/box-shadow) with each keeping its own
`padding` (plus `.help-content section`'s `margin-bottom` and
`.exam-setup-body`'s `max-width`) separately -- in both cases the `padding`
property that differs between the two selectors was deliberately excluded
from the merge, so it is untouched by this change regardless of its own
(unrelated) mobile-breakpoint override elsewhere in the file.

Fourteen such groups were merged in total (full list in this document's
companion execution-log row); two previously-duplicate
`@media (prefers-reduced-motion: no-preference)` blocks were also
consolidated into one, mirroring the existing `@media (max-width: 640px)`
pattern. `scripts/css-optimizer.js` itself was **not modified** -- it remains
the same conservative, comments-and-whitespace-only pass; no general-purpose
minification was introduced, and no JSON runtime-config key was abbreviated.

**Result:** the optimized (embedded) CSS shrank from 20,758 B to 20,166 B
(**−592 B**, exactly matching the measured headroom gain). Standalone:
1,032,763 B → **1,032,171 B**, headroom 15,813 B → **16,405 B (1.57%)** --
**21 B above** the 16,384 B (16 KiB) target. The 1 MiB budget is unchanged and
the target was not lowered. Two consecutive builds remain byte-identical; the
full existing test suite (`npm run test:unit`, focused `edition-profile`/
`build-gate`/`css-optimizer` unit tests, `tests/app.spec.js`,
`mock-exam.spec.js`/`study-scope.spec.js`/`responsive-shell.spec.js`/
`exam-engine.spec.js`, `@storage`, `@compat`, `npm run test:pwa`, and
`npm run test:responsive` across every browser/viewport combination) passes
unmodified, confirming no visual or behavioral regression from the
consolidation.

### Label-template shape review follow-up (closed)

A second independent review of Stage 7D found the profile validator's label
checks were weaker than the runtime projection's actual conversion logic: it
only confirmed each placeholder appeared *somewhere* in its template, when
`scripts/build.js#buildEditionRuntimeConfig` actually performs one of two
different, narrower conversions:

- `referenceLabelTemplate`/`elementLabelTemplate` are converted to a
  **prefix** -- `template.split(placeholder)[0]`, the text *before* the
  placeholder -- because the runtime only ever concatenates that prefix
  directly before a dynamic value (`REF_LABEL_PREFIX + x.ref`, etc.). Any
  text *after* the placeholder in the template was silently dropped, and a
  second occurrence of the placeholder was simply ignored (only the first
  mattered to `split()[0]`).
- `sourceLabelTemplate` is fully resolved via one `.replace()` call, which
  only substitutes the *first* match -- a second occurrence would survive,
  unresolved, as literal `{poolSourceAbbreviation}` text in shipped output.

So a profile author could write `"Reference: {ref} (official)"` or
`"{ref} / {ref}"` and the validator would accept it, while the actual shipped
text silently lost the suffix or left a duplicate placeholder unresolved.

**Fix:** `scripts/edition-profile.js` now requires each placeholder to occur
**exactly once** (not merely "at least once") in its template, and introduces
`LABEL_PLACEHOLDER_MUST_BE_FINAL` (`referenceLabelTemplate`,
`elementLabelTemplate`) -- the two prefix-derived fields, whose placeholder
must additionally be the template's final token (`value.endsWith(placeholder)`,
a strict check with no whitespace trimming). `sourceLabelTemplate` is
exempt from the final-token rule: because it is fully resolved rather than
truncated, suffix text after its placeholder is preserved correctly and was
already supported (and used) by the real profile's default
`"Official NCVEC question pool"`-shaped template before this document's own
example was tightened to `"{poolSourceAbbreviation} source"`. Diagnostics
name the exact occurrence count (`"...exactly once, found 2"`) so a
three-or-more-occurrence template is still reported accurately, not
collapsed into a generic "duplicate" message.

**Testing:** four new unit tests reproduce exactly the three examples the
review gave (`"Reference: {ref} (official)"`, `"{ref} / {ref}"`,
`"Element {element} — details"`) plus a duplicate `{poolSourceAbbreviation}`
case, a strict-trailing-whitespace case, confirmation that suffix text
remains valid for `sourceLabelTemplate`, and a check that
`LABEL_PLACEHOLDER_MUST_BE_FINAL` names exactly the two fields it should. One
new build-gate test drives the same four malformed cases through the real
build entry point, confirming each aborts with the `Edition profile
validation failed` diagnostic before any `dist/` mutation. The real
`data/edition.json` was not changed and continues to validate with zero
errors (confirmed directly). **Bundle size is unchanged**: the rebuilt
standalone artifact is byte-for-byte identical to the pre-fix build (same
1,032,171 B / 16,405 B free, same PWA cache hash `097a91a1e878`), since this
fix only tightens the validator -- it adds no runtime code and does not touch
`buildEditionRuntimeConfig`'s own derivation logic.

## Stage 7E: identifier and figure-validator seams (implemented, size-recovered)

Item 4 of the staged sequence. The last hardcoded NCVEC/T-G-E assumptions are
out of the reusable study, exam-selection, and figure-reference code. US
behavior is unchanged (all US selection/scope/figure results and diagnostics
are preserved, golden-tested, and build-identical in content); the review-
mandated size-recovery pass cleared the initial 1,444 B shortfall — see
"Bundle size" below — leaving **97,296 B free**, 5.9x the 16 KiB target.

### Group/subelement resolution (Scope 1)

`src/exam-engine.js` and `src/study-scope.js` no longer parse question IDs
with `/^[A-Z]\d[A-Z]/`. Group identity is resolved **from the pool's validated
registry metadata** by matching the question ID against the pool's
`groupBlueprint` keys, with a deterministic **longest-match** rule when keys
overlap:

- `groupOf(id, poolConfig)` / the engine's internal `groupKeyFor(id,
  groupBlueprint)` return the longest configured key the ID starts with, or
  `null` when no configured group claims it. `null` is **fail closed**: the
  question is excluded from group/subelement scope filters, and the exam
  engine's per-group availability check then throws if that group still needs
  questions. There is no silent US-regex fallback anywhere in the production
  path.
- `subelementOf(id, poolConfig)` resolves the group first, then matches the
  group against the pool's `scopeLabels.subelements` keys (again
  longest-prefix wins). Without that registry metadata it returns `null`
  rather than assuming a fixed cut (e.g. the old `slice(0, 2)`).
- `enumerateScopes(poolConfig)` derives subelements from
  `scopeLabels.subelements` keys and groups from `groupBlueprint` keys; a
  config missing either yields empty lists, never derived guesses.
- `filterBankByScope(bank, scope, poolConfig)` takes the pool config (its only
  caller, `resolveScope`, already has it). `validateScope` semantics are
  unchanged: a subelement/group id is valid iff the registry enumerates it.

For the US registry both rules reproduce the old results exactly (all group
keys are 3 chars, all subelement keys are their 2-char prefixes), which the
existing study-scope/exam-engine suites plus a new golden-shape exam-selection
test pin.

### Figure-reference policy (Scope 2)

`scripts/figure-references.js` no longer carries the hardcoded
`{technician: "T", general: "G", extra: "E"}` map (`POOL_PREFIX`/`poolPrefix`
are gone). The expected figure-ID prefix for a pool is a **policy parameter**:

- `validateQuestionFigure(question, poolKey, figurePrefix)`,
  `validatePoolFigures(questions, poolKey, figurePrefix)`, and
  `assertPoolFigureReferences(questions, poolKey, figurePrefix)` take the
  prefix explicitly. A missing/unknown/malformed policy (anything but exactly
  one uppercase letter) **fails closed** with a deterministic policy
  diagnostic naming the pool; all existing mapping diagnostics
  (normalization, textual-reference matching, cross-pool rejection) are
  preserved verbatim.
- `scripts/build.js` now runs the per-pool figure-reference gate **after** the
  pool-registry gate (the one strictly required gate reordering: the gate's
  prefix policy is derived from the registry's validated `questionIdPrefix`,
  so it cannot run before the registry is validated). It builds
  `figurePrefixes` from the validated registry and passes it to both the
  per-pool gate and the figure-manifest gate.
- `scripts/figure-manifest.js`: `validateManifestShape(manifest, options)`
  accepts `options.figurePrefixes`; when supplied, each figure entry's ID
  must agree with its pool's policy prefix and a pool missing from the map
  fails closed. `validateManifestAgainstQuestions` requires the policy (the
  delegated per-question revalidation fails closed without it);
  `validateFigurePipeline` threads `options` through both. When the option is
  omitted, the agreement check alone is skipped for direct shape-validation
  callers -- the build path always supplies it.
- Editions without figures build exactly as Stage 7C defined (no manifest, no
  figure references => skipped gates, empty embedded figure registry).

### What remains intentionally US-specific

- `scripts/pool-registry.js` still pins `questionIdPrefix` to T/G/E per pool
  key and validates the NCVEC question/group ID shapes (`QUESTION_ID_RE`,
  `GROUP_ID_RE`, edition-id slugs). That validator gates `data/pools.json`,
  which this task left untouched; a derived edition replaces or parameterizes
  this validator as part of its own data work. The build-gate test proving a
  wrong registry prefix fails before any `dist/` mutation covers this seam.
- `scripts/figure-manifest.js` still owns US figure-pipeline infrastructure:
  the `POOLS` list, `assets/figures/<pool>/` asset-dir conventions, and the
  checksum-PDF provenance scheme. Out of Scope 2, which covered only the
  pool-to-figure-prefix map.
- `data/pools.json`, question banks, `data/figures.json`, storage namespaces,
  PWA files, and static branding are unchanged.

### Bundle size (target cleared by the size-recovery follow-up)

The runtime resolution code initially netted **+1,465 B** shipped (JS comments
are build-stripped, so this is code only), landing at 14,940 B free — 1,444 B
below the 16,384 B / 16 KiB target. The review-mandated **size-recovery pass**
cleared it without touching any Stage 7E logic or policy:

1. **Dead `correctText` dedup (the bulk, ~-82.2 KB).** Every question's
   `correctText` byte-for-byte duplicates `choices[correct]` (verified across
   all 1,431 questions; the existing 5B4 bank gate already enforces that
   invariant per question), and no shipped runtime code ever reads it —
   `src/app.js` renders the revealed answer from `choices[correct]`
   directly. `scripts/build.js#loadPool` now deletes the field from the
   **embedded copy only**, immediately after the bank gate: `data/*.json`
   keeps the full documented schema, the gate still validates the invariant,
   and the registry/figure gates operate only on fields they own.
2. **Runtime-code tightening (~-0.3 KB).** The two duplicated longest-match
   loops in `src/study-scope.js` now share one `longestKeyPrefix` helper
   (behavior-identical; `Object.keys` string-key guards dropped as dead),
   with matching compaction in `src/exam-engine.js#groupKeyFor`.

Final: standalone **951,280 B / 1,048,576 (97,296 B / 9.28% free — 5.9x the
16 KiB target)**, `dist/pwa/index.html` 953,726 B, cache `b5690428df39`. The
1 MiB budget gate and the 16 KiB target are unchanged.

### Testing

- `tests/unit/study-scope.test.js` (+6 net): metadata-driven `groupOf`/
  `subelementOf` with the synthetic fixture now carrying registry-shaped
  `scopeLabels`; fail-closed cases (no poolConfig, no `scopeLabels`,
  US-shaped ID against a non-US blueprint); a synthetic **PHY** group-key
  shape; longest-match with overlapping keys; metadata-driven filtering/
  validation for the synthetic shape. Callers updated for the new
  `filterBankByScope(bank, scope, poolConfig)` signature.
- `tests/unit/exam-engine.test.js` (+4): non-T/G/E blueprint selection, the
  longest-overlap rule, fail-closed unassigned questions, and a US
  golden-shape selection test (fixed seed, one-per-group in blueprint order).
- `tests/unit/figure-references.test.js` (+4): synthetic alternate prefix,
  missing/unknown/malformed policy fail-closed (single deterministic
  diagnostic, pool-level throw), wrong-policy cross-pool mismatch, and
  `isValidFigurePrefix` shape checks. All existing cases updated to pass the
  policy explicitly.
- `tests/unit/figure-manifest.test.js` (+8 net): every direct
  pipeline/cross-check caller now passes the US policy map; a new
  Stage 7E block pins the policy-map agreement check, the missing-pool
  fail-closed case, a synthetic-prefix acceptance, and the documented
  optionless-skip semantics.
- `tests/unit/build-gate.test.js` (+5): a corrupted (cross-pool) figure
  mapping fails the moved figure-reference gate with the same diagnostics and
  leaves a seeded `dist/` byte-identical; a registry prefix that disagrees
  with the pool key fails the registry gate (the policy's source) before any
  `dist/` mutation; the real US build still embeds the T/E figure registries;
  the embedded banks carry **no** `correctText` while the data files keep the
  full schema; and a `correctText` mismatch still aborts pre-`dist/` (the
  invariant that makes the dedup safe is itself build-gated).

Full verification record: `docs/IMPLEMENTATION_PLAN.md`'s Stage 7E
execution-log rows.
