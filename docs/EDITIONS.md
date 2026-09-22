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
