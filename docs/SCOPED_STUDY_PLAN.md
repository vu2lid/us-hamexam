# Scoped study navigation plan

Status: Stage 6A (transient scope) shipped in 0.3.0-beta.3. Stage 6A1
(human-readable subelement/group labels for the scope selector, this
document's new section below) is committed as `acf4198`; it targets
the next feature release, same as Stage 6A before it. Updated:
2026-09-18.

## Stage 6A1: human-readable scope labels

Stage 6A's scope selector showed bare codes only (`T1`, `T1A`). Stage 6A1
adds an official title next to each code (`T1A — Purpose and permissible use
of the Amateur Radio Service`), sourced from the tracked NCVEC pool text —
never invented, never derived from question wording.

### Provenance

Source: the tracked, checksum-pinned NCVEC pool documents already committed
under `data/pool-sources/` — specifically their plain-text extractions
(`technician.txt`, `general.txt`, `extra.txt`), which each contain the
official pool's own short "subelement summary" page (for example
Technician's page listing `SUBELEMENT T1 - COMMISSION'S RULES [6 Exam
Questions - 6 Groups]` followed by one line per group: `T1A Purpose and
permissible use of the Amateur Radio Service; Operator/primary station
license grant; ...`). The `.pdf` originals are the checksummed source of
record (see `docs/FIGURE_PIPELINE.md`'s sibling pattern for question/figure
provenance); the `.txt` files are a plain-text extraction of the same
committed PDFs, used here only because they are practical to search
programmatically -- every title below was cross-checked against the
corresponding PDF page before being recorded.

Every subelement title and every group's raw topic text was extracted once
with a small script (not committed -- one-time data entry, not a build
step), verified group-for-group against `groupBlueprint`'s own key set (zero
missing, zero unknown codes, for all three pools), then hand-reviewed before
being written into `data/pools.json`.

### Title-shortening decisions

- **Subelement titles** are the NCVEC section title verbatim (e.g.
  "COMMISSION'S RULES", "ELECTRONIC AND ELECTRICAL COMPONENTS"), converted
  from the source's all-caps typesetting to title case (minor words --
  "and", "of", "the", "in", "to", "for", "or" -- lowercased unless first).
  The one embedded acronym in this dataset, "RF" (General's G0, "ELECTRICAL
  AND RF SAFETY"), is preserved uppercase via an explicit two-entry
  allowlist in the generation step, not a generic "short all-caps word"
  heuristic (which would also wrongly preserve "AND").
- **Group titles** are NCVEC's own per-group topic line, which is a
  semicolon/colon-separated list of subtopics rather than a single short
  title (e.g. `T1A`'s **full official line**, kept here and in
  `data/pool-sources/technician.txt` as the permanent record: "Purpose and
  permissible use of the Amateur Radio Service; Operator/primary station
  license grant; Meanings of basic terms used in FCC rules; Interference;
  RACES rules; Phonetics; Frequency Coordinator; Beacon"). The **shipped
  display label** is a concise derivative of that line, built by
  `conciseLabel()`-style logic (a one-time generation step, not a build
  step): accumulate whole clauses (split on `;`/`:`) while the running
  length stays at or under a 48-character target; if even the first clause
  alone exceeds 48 characters by more than a small grace margin (10
  characters, so a clause landing at, say, 51 or 55 stays whole rather than
  losing its key word), truncate it at the last word boundary that fits and
  append "…". This is mechanical shortening of official text throughout --
  never a paraphrase or an invented summary. `scripts/pool-registry.js`'s
  `MAX_SCOPE_LABEL_LENGTH` (72) is the hard schema ceiling; a stricter
  56-character real-data regression bound (with two documented exceptions,
  below) lives in `tests/unit/pool-registry.test.js` to catch a label
  quietly regrowing past comfortable mobile readability even if it would
  still pass the schema.
- **Extra's E0 cleanup:** the official text reads "SUBELEMENT E0 - SAFETY -
  [1 exam question - 1 group]" -- a trailing " -" before the bracketed count
  that does not appear on any other subelement header in any of the three
  pools. Treated as a source formatting artifact (consistent with every
  other subelement's plain "TITLE [" shape) and recorded as "Safety",
  matching Technician's and General's own safety-subelement titles in
  spirit. This is the only place a title was cleaned up beyond mechanical
  case conversion and truncation.
- **Disambiguating same-pool collisions:** two pairs of Extra groups share
  an identical first official clause -- `E2D`/`E2E` both begin "Operating
  methods:", and `E7E`/`E8B` both begin "Modulation and demodulation:". An
  independent review correctly flagged the original all-first-clause-only
  design (shipped before this note was added) for leaving both members of
  each pair with the same unhelpful bare label. Both pairs now carry one
  more official clause each, chosen from their own real text (not
  invented), even though this exceeds the general 48-character target:
  `E2D` → "Operating methods; digital modes and procedures for VHF and UHF"
  (63 chars), `E2E` → "Operating methods; digital modes and procedures for
  HF" (54 chars); `E7E` → "Modulation and demodulation; reactance, phase,
  and balanced modulators" (70 chars, the longest label in any pool today),
  `E8B` → "Modulation and demodulation; modulation methods" (47 chars). Both
  sides of a pair are always extended together (never only the one whose
  next clause happens to fit short), so neither stays generic while its
  sibling gets specific.

### No open provenance questions

Every group and subelement code was cross-checked against
`groupBlueprint`'s own key set with zero mismatches for all three pools, and
every extracted title was read against its source PDF page. There is no
unresolved title or provenance question for this slice.

### Independent review follow-up: concise, on-mobile-readable labels

The first Stage 6A1 pass shipped each group's full first official clause
verbatim (up to 71 characters for Technician `T7B`). Independent review
found two usability issues before commit: native mobile `<select>` menus do
not reliably wrap long option text, so a 60-70 character label is not
reliably readable at a 320px viewport even though it renders and doesn't
break page layout (the original tests verified the latter, not practical
readability); and the two same-pool collisions above left both members
equally uninformative. The fix is the concise-label algorithm described
above, applied only to group labels (subelement labels were already short
and unaffected). The full official text remains the permanent record in
`data/pool-sources/*.txt` and in this document; only the *display* label
changed. No code, storage, Mock Exam, or scope-identity behavior changed --
the option `value` (the code) is untouched, so this is a labels-only
follow-up.

### Validation and embedding

`scripts/pool-registry.js` (registry `SCHEMA_VERSION` 3) requires each pool
entry's `scopeLabels.subelements`/`scopeLabels.groups` to cover exactly the
codes derived from that pool's own `groupBlueprint` -- no missing code, no
code that doesn't exist in `groupBlueprint`, no unknown top-level key --
plus non-blank, untrimmed-whitespace-free, ≤72-character string values
(`MAX_SCOPE_LABEL_LENGTH`). This runs as part of the same mandatory,
pre-`dist/`-mutation registry gate as every other registry field (see
`docs/ARCHITECTURE.md`'s pool-registry section) -- an invalid label fails
the build before any output is written, exactly like a bad `editionId` or
`groupBlueprint` today.
`scripts/build.js`'s `buildPublicPoolsRegistry()` embeds `scopeLabels`
alongside the registry's other public, runtime-required fields in
`window.HAM_EXAM_POOLS`; no source path, PDF checksum, or other build-only
provenance is embedded.

### UI

The scope selector's existing `<optgroup>`s are unchanged; each `<option>`'s
text is now `"<code> — <title>"` (built once, in `populateScopeSelector()`,
by reading `POOLS[currentPool].scopeLabels` -- never a second, app.js-local
copy of the title text) instead of the bare code. "All questions" and the
compact top-bar `#scope-summary` are deliberately unchanged: the summary
stays code-only (`T6C`, not `T6C — Circuit diagrams`), since it must stay
compact next to the pool label. The question-specific scope level remains
implemented only in `src/study-scope.js` and is still not exposed in the
selector (see Stage 6A's own note above) -- unaffected by this slice.

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
standalone target remains 1 MiB (`STANDALONE_BUDGET_BYTES`, 1,048,576
bytes). Stage 6A's own verification pass measured 1,046,391 bytes (2,185
bytes free); a conservative inline-CSS optimizer added afterward (shipped in
`0.3.0-beta.3`, alongside Stage 6A) recovered headroom to roughly 10,852
bytes before Stage 6A1 began. Stage 6A1's labels (this document's own
section above) consumed most of that back down: 1,043,459 bytes after the
first pass, then 1,044,190 bytes (**4,386 bytes / 0.42% free**) after the
independent-review follow-up that disambiguated the two same-pool label
collisions (a deliberate, reviewed trade-off -- see "Disambiguating
same-pool collisions" above -- that costs bytes but fixes a real usability
gap). A size audit found the question bank (~554 KB, 53%) and the inlined
figure registry (~309 KB, 30%) dominate the file and are essentially fixed
by content, not code. At this margin, **another small feature should not be
assumed to fit without either trimming existing code, raising the preferred
target with an explicit decision, or offloading content** -- this is
flagged as a standing risk for whatever is scoped next, including Stage 6B.

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
scoped study) shipped in 0.3.0-beta.3 (PR #3), and Stage 6A1
(human-readable scope labels) is committed as `acf4198`.
Next, if pursued: a persistence stage building on the "Persistence
contract" section above -- extending `src/storage.js`'s schema (a real
schema-version bump, migration, and validator change, unlike Stage 6A),
restoring a pool's last scope on pool switch, and a question-picker UI
for the `question` scope level that stays within the standalone budget.
