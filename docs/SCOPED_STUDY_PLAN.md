# Scoped study navigation plan

Status: product direction approved; implementation not started. Updated: 2026-09-13.

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

## MVP interaction

Add a “Study scope” section to the existing settings drawer:

- **Subelement:** defaults to `All subelements`.
- **Group:** defaults to `All groups`; options follow the selected subelement.
- **Question:** lists questions in the current scope by stable ID plus a concise
  prompt excerpt. Choosing one jumps to it; it does not create a one-question
  scope.
- **Entire pool:** one obvious action clears the focused scope.

Changes apply immediately while the drawer stays open. The top bar indicates
scope compactly (for example, `Technician · T6C`), and progress includes scope
(for example, `Question 3 / 12 in T6C`). Do not add persistent top-bar controls.

## Navigation and state rules

- Previous and Next traverse only the official-order questions in scope.
- Reveal/timer reset exactly as on an ordinary question change.
- Figures, references, themes, and bookmark toggling remain unchanged.
- Mock Exam ignores study scope and remains blueprint-balanced.
- Switching pools restores that pool's last scope and position.
- Selecting a subelement clears an incompatible group; selecting a group
  identifies its parent subelement.
- Invalid or obsolete stored scopes/questions fall back safely to Entire pool
  and a valid question.
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

## Persistence contract

Finalize the shape during Stage 4. Use state only when its `editionId` matches
the embedded pool. Preserve separate sparse positions conceptually:

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
- Chromium: integrated drawer, immediate scope changes, question jump, progress,
  pool isolation, and reload restoration.
- `@compat`: only distinct engine evidence such as cascading native-select
  keyboard/focus behavior.
- `@responsive`: only compact drawer reachability and overflow.
- PWA: one focused persistence/offline integration case.
- List expanded test/project counts before browser execution, build once, use
  `npm run test:routine` for integrated verification, and reserve the full
  matrix for release. Avoid fixed sleeps and record phase duration.

## Acceptance criteria

- Entire pool remains the backward-compatible default.
- Users can select a subelement, optionally a group, and jump to a question.
- Navigation/progress reflect the active scope and correct boundaries.
- Scope and positions are isolated per pool and survive reload through versioned
  storage; invalidated IDs recover safely.
- Mock Exam, figures, bookmarks, timers, Help, themes, standalone, and PWA
  offline behavior remain intact.
- Help, architecture, privacy, testing, roadmap, and artifacts are updated.

## Deferred extensions

Do not bundle random order, incorrect/unseen/weak-area/spaced review, mastery
history, free-text search, bookmark-only scope, or custom question sets into the
MVP. The pure scope model should support these later.

## Next task

Stages 4A0 (pool registry and build validation, `92f45ed`), 4A1 (pure
versioned storage module, `b13b77e`), 4A2 (application integration of
the canonical storage adapter, `97b514c`), 4A3 (recall-delay and
exam-timer preference persistence, `aa8a518`), and 4B (active-exam
unload protection, `ad2664b`) are all committed — Stage 4 is
functionally complete and reviewed. Next: the first slice of
scoped-study UI per this plan.
