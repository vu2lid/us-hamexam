# Edition-build design: build selection, isolation, and boundaries (Stage 8A2)

Recorded: October 11, 2026. Status: design for the Stage 8B-class isolated
build experiment; not yet adopted architecture. Companion to
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
- The runtime-projection allowlist gains exactly one field:
  `namespacePolicy`. Nothing else is projected; build-only data never embeds.
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
   `Technician`/`General`/`Extra`, `US Ham Exam`, the repository URL):
   nothing remains except three inert, unreachable JS fallback literals and
   one internal (non-user-visible) DOM id, both described in the "Known
   boundary" note above.
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
