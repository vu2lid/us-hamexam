# Scoped study navigation plan

Status: Stage 6A (transient scope) implemented and independently verified
(unit suite, standalone determinism, `@compat`/`@responsive`/PWA browser
suites, and a dedicated size audit — see the Stage 6A verification
execution-log row in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)).
Uncommitted, pending review; targets the next feature release (0.4.0 or a
later beta), not the already-published 0.3.0-beta.2. Updated: 2026-09-16.

## Stage 6A: what actually shipped

Stage 6A implements the scope types, filtering, and study-mode integration
below, but deliberately as **transient, in-memory-only** state rather than the
persisted MVP originally described in this document. The differences from the
original plan, and why:

- **No persistence.** `src/storage.js`'s schema already restricts its
  `scope`/`positions` fields to `{level:"all", id:null}` /
  `{all: <id>}` only, and Stage 6A does not touch that schema. The active
  scope lives in one module-level variable in `src/app.js`
  (`studyScope`/`studyList`) and is lost on reload, exactly like an ordinary
  page-local UI preference. Reload always starts at `all`. Persisting scope
  (per-pool, surviving reload, isolated positions per scope) remains a
  distinct, deferred follow-up -- see "Next task" below.
- **One combined selector, not three cascading fields.** The drawer has a
  single `#scope-select` (native `<select>` with `<optgroup>`s for
  "Subelement" and "Group", plus a flat "All questions" option) instead of
  separate Subelement/Group/Question controls. This is simpler, has no
  inter-control state to reconcile, and was cheap to keep well under the
  standalone byte budget.
- **No question-picker UI.** The `question` scope level is fully implemented
  and unit-tested in `src/study-scope.js` (`validateScope`/`filterBankByScope`
  both handle it), but `populateScopeSelector()` does not add a per-question
  `<optgroup>`. Populating one for all ~400-600 questions in a pool pushed
  the standalone build over its 1 MiB budget; the plan's own permission to
  add a question option "only if the resulting UI remains usable on the
  smallest mobile viewport" is read here as covering this build-budget
  constraint on usability, not only visual layout. A future slice can add a
  `<datalist>`-backed text filter or a dedicated jump-to-question control
  without changing the underlying model.
- **Progress format:** `"Question N / M"` is unchanged for scope `all` (byte-
  for-byte, so it doesn't break existing assertions); a scoped list uses
  `"Question N of M"` instead of the plan's `"Question 3 / 12 in T6C"` --
  the compact top-bar `#scope-summary` (for example `T6C`) already carries
  the "which scope" information, so the progress string doesn't repeat it.
- **Pool switching always resets scope to `all`**, rather than restoring that
  pool's last scope (there is no per-pool scope memory to restore, by design,
  since nothing is persisted).

Everything else below -- the four scope types, group/subelement identity
rules, navigation/reveal/timer/bookmark/figure behavior, and Mock Exam
isolation -- was implemented as originally planned.

**Standalone size margin (verified, low headroom):** the project's preferred
standalone target remains 1 MiB (`STANDALONE_BUDGET_BYTES`, 1,048,576 bytes);
Stage 6A's own verification pass measured `dist/index.html` at 1,046,391
bytes -- **2,185 bytes (0.24%) of headroom**. A size audit (see the Stage 6A
verification execution-log row) found the question bank (~554 KB, 53%) and
the inlined figure registry (~309 KB, 30%) dominate the file and are
essentially fixed by content, not code; the remaining ~18% is inlined
runtime code, CSS, and markup, where Stage 6A's own additions
(`study-scope.js` plus its `src/app.js`/`style.css` integration) already
needed comment-trimming and dropping the question-picker UI to fit. At this
margin, **another small feature should not be assumed to fit without either
trimming existing code, raising the preferred target with an explicit
decision, or offloading content** -- this is flagged as a standing risk for
whatever is scoped next, including Stage 6B.

## Goal and hierarchy

Let a learner concentrate on an official portion of a question pool and jump to
a particular question without sacrificing the simple sequential study flow.
The default remains the entire active pool.

```text
Pool → Subelement → Group → Question
Technician → T6 → T6C → T6C02
```

Use the official terms “Subelement” and “Group,” with a short explanation that
these are the pool's sections. Do not invent another topic taxonomy. Show a
descriptive title only when it comes from validated official metadata; codes
alone are acceptable for the first slice.

## Sequencing decision

Establish canonical pool edition/revision identity, then implement versioned
storage before scoped-study persistence. This prevents a pool replacement from
attaching old scope state to different content. See
[`POOL_STORAGE_PLAN.md`](POOL_STORAGE_PLAN.md).

Recommended order:

1. Stage 4A0: canonical pool registry, validation, and build gate.
2. Stage 4A1–A2: versioned storage, migration, and app integration.
3. Pure scope model: hierarchy, filtering, navigation, and validation.
4. Settings-drawer UI and study-mode integration.
5. Scoped progress persistence and pool-update recovery.
6. Focused accessibility, responsive, and PWA verification.
7. Stage 5 integration, or an explicit milestone decision if scoped study is
   scheduled for 0.4 rather than beta.2.

This is the first priority within Stage 6, but its release target must be
decided before implementation; this plan does not silently add it to beta.2.

## MVP interaction (as implemented in Stage 6A)

The existing settings drawer gains one new field, right after Pool:

- **Study scope** (`#scope-select`): "All questions", then an "Subelement"
  `<optgroup>` (all subelement codes for the active pool) and a "Group"
  `<optgroup>` (all group codes), both populated from
  `POOLS[currentPool].groupBlueprint`'s own keys via
  `HAM_EXAM_STUDY_SCOPE.enumerateScopes()` -- never a duplicated list.

Changing the selector applies immediately (no separate "Apply" step) and
resets study position to the start of the newly-scoped list. The top bar
shows a compact `#scope-summary` (for example `T6C`) next to the existing
pool label, hidden entirely while scope is `all`. Progress reads
`Question N of M` while scoped, `Question N / M` while `all`.

## Navigation and state rules

- Previous and Next traverse only the official-order questions in scope.
- Reveal/timer reset exactly as on an ordinary question change.
- Figures, references, themes, and bookmark toggling remain unchanged.
- Mock Exam ignores study scope and remains blueprint-balanced.
- Switching pools resets the scope to `all` and starts at that pool's resolved position.
- Selecting a subelement or group directly replaces the previous transient scope.
- Invalid or obsolete in-memory scopes fall back safely to the entire pool
  and a valid question. Persisted scope recovery is deferred to Stage 6B.
- Scope changes never delete bookmarks or overwrite full-pool progress.
- Empty scopes must not strand the UI.

## Pure model and validation

Keep hierarchy/filter/index logic in a small build-inlined vanilla-JS module
covered primarily by Node tests. The existing `sub` field is the subelement
code. Validate group identity against the stable question-ID prefix (`T1A`,
`G7B`, `E9C`, etc.) before relying on it.

Pure operations should build the ordered hierarchy, normalize a requested
scope, return its ordered IDs, translate a stable ID to its scoped index,
recover from obsolete values, and compute navigation boundaries. Persist only
stable IDs and validated scope codes, never copied question objects.

## Persistence contract (deferred; not implemented in Stage 6A)

Stage 6A ships transient scope only -- the shape below remains the plan for a
future persistence stage, not yet built. `src/storage.js`'s schema still
hard-validates `scope` as `{level:"all", id:null}` and `positions` as
`{all: <id>}` only; nothing was loosened. Finalize the shape below during
that later stage. Use state only when its `editionId` matches the embedded
pool. Preserve separate sparse positions conceptually:

```json
{
  "study": {
    "pools": {
      "technician": {
        "editionId": "technician-2026-2030",
        "revisionId": "2026-02-19-errata",
        "scope": { "level": "group", "id": "T6C" },
        "positions": {
          "all": "T1A01",
          "sub:T6": "T6A01",
          "group:T6C": "T6C02"
        }
      }
    }
  }
}
```

This is illustrative. Convert legacy indexes once to stable IDs under the
documented current-edition assumption. Same-edition errata retain valid IDs;
replacement editions discard their position, bookmarks, and scope state even
when an ID is reused. Malformed state is safely repaired or discarded;
storage-disabled use remains functional.

## Accessibility and compact layout

- Persistent visible labels and useful accessible names for every selector.
- Stable IDs remain visible; prompt excerpts are not the sole identifier.
- Native keyboard behavior, visible focus, and 44px touch targets remain.
- All controls remain reachable in the drawer on the smallest phone and short
  landscape viewport.
- Dynamic options preserve sensible focus. Avoid noisy live-region updates.
- Native selects remain readable in all themes, including WebKit.

## Efficient test strategy

- Node: hierarchy, filtering, boundaries, recovery, storage validation/migration.
- Chromium: integrated drawer, immediate scope changes, subelement/group
  navigation, progress, pool isolation, and reload-to-`all` behavior.
- `@compat`: only distinct engine evidence such as cascading native-select
  keyboard/focus behavior.
- `@responsive`: only compact drawer reachability and overflow.
- PWA: one focused persistence/offline integration case.
- List expanded test/project counts before browser execution, build once, use
  `npm run test:routine` for integrated verification, and reserve the full
  matrix for release. Avoid fixed sleeps and record phase duration.

## Acceptance criteria

Stage 6A acceptance:

- The entire pool remains the backward-compatible default.
- Users can select a subelement or group from the active pool.
- Navigation and progress reflect the active scope and its boundaries.
- Scope changes reset study position and never delete bookmarks or alter Mock Exam
  selection.
- Reload returns to `all`; no scope is persisted in Stage 6A.
- Mock Exam, figures, bookmarks, timers, Help, themes, standalone, and PWA
  offline behavior remain intact.
- Help, architecture, privacy, testing, roadmap, and generated artifacts are
  updated.

Deferred Stage 6B acceptance:

- Persist scope and per-scope positions through the versioned storage schema.
- Restore a pool's last scope safely across pool switches and pool revisions.
- Provide a usable question-picker/jump-to-question control within the standalone
  size budget.

## Deferred extensions

Do not bundle random order, incorrect/unseen/weak-area/spaced review, mastery
history, free-text search, bookmark-only scope, or custom question sets into the
MVP. The pure scope model should support these later.

## Next task

Stages 4A0 (pool registry and build validation, `92f45ed`), 4A1 (pure
versioned storage module, `b13b77e`), 4A2 (application integration of
the canonical storage adapter, `97b514c`), 4A3 (recall-delay and
exam-timer preference persistence, `aa8a518`), and 4B (active-exam
unload protection, `32afd5e`) are all committed. Stage 6A (transient
scoped study, this document's implemented section above) is complete
pending review, and intentionally left uncommitted for that review.
Next, if pursued: a persistence stage building on the "Persistence
contract" section above -- extending `src/storage.js`'s schema (a real
schema-version bump, migration, and validator change, unlike Stage 6A),
restoring a pool's last scope on pool switch, and a question-picker UI
for the `question` scope level that stays within the standalone budget.
