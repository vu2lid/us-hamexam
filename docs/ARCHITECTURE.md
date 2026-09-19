# Architecture

This document explains how the project is structured and why.

## Project origin

The original standalone HTML FCC Technician exam page was created by **Prem (VE6XMX / VU2XMX)**. The repository later added the modular source layout, generated release artifacts, compatibility fixes, PWA packaging, automated testing, diagnostics, and security controls described below. See [`AUTHORS.md`](../AUTHORS.md) for the authorship summary.

## Goal

Produce two offline-capable releases from one source: a self-contained local file (`dist/index.html`) and an HTTPS-hosted installable PWA (`dist/pwa/`). Both releases include Technician, General, and Extra question pools and let the user switch between them.

The product is branded **US Ham Exam — FCC Amateur Radio License Study**: it targets the US FCC exams only, with no country selector or regional abstraction. Future regional editions (different pools, regulations, and branding) could reuse the same engine and build pipeline unchanged.

## Design decisions

### Single-file output

The app is distributed as one HTML file because:

- It works offline without any server.
- Users can copy it to phones, tablets, or USB drives.
- It avoids CORS, path, and asset-loading issues when opened from a local file.

### No frameworks

The runtime uses vanilla HTML, CSS, and ES5-compatible JavaScript. This keeps the file small, fast, and compatible with older/low-resource devices, including older iPads and Android phones.

### Build-time inlining

`scripts/build.js` reads the source files and inlines them into `dist/index.html`:

```
src/style.css                         →  <style>...</style>
data/technician.json + general.json + extra.json  →  <script>window.HAM_EXAM_BANKS = {...};</script>
data/figures.json + assets/figures/*.png          →  <script>window.HAM_EXAM_FIGURES = {...};</script>
src/app.js                            →  <script>...</script>
```

This keeps the source maintainable while producing a single-file release.

### Figure packaging and rendering (Stage 3A–3B)

After the mandatory figure-manifest gate (`assertFigureManifest`, which fully
validates `data/figures.json`, every asset checksum/content, and the
checksum-pinned source PDFs), the build reads the *validated* asset bytes and
emits one **runtime figure registry** per generated HTML document:

```js
window.HAM_EXAM_FIGURES = {
  "T-1": { src: "data:image/png;base64,…", alt: "…", w: 1800, h: 1200 },
  …  // one entry per figure ID; the asset appears once, not once per question
};
```

Only the fields a figure container needs are embedded — data URL, alt text, and
intrinsic dimensions. Source PDFs, provenance, and other manifest fields are
**not** embedded. The registry is serialized with the same `asInlineScript`
escaping as the question banks (no `JSON.parse` on `textContent`; no runtime
fetch). Both `dist/index.html` and `dist/pwa/index.html` carry the identical
registry inline — the PWA introduces **no** separate figure files and **no** new
service-worker precache entries.

The registry is rendered by one shared helper, `renderFigureInto(question,
els)` in `src/app.js`. It takes the container and its parts (`caption`,
`frame`, `img`, `unavailable`) **by reference**, so the same logic drives three
call sites without duplicated code or duplicated element IDs:

- **Study card** — `renderStudyFigure()` resolves the fixed `#study-figure*`
  IDs.
- **Active mock-exam question** — `renderExamFigure()` resolves the fixed
  `#exam-figure*` IDs; `showExamQuestion()` calls it after setting the question
  text and **before** building `<fieldset id="exam-choices">`, so the figure is
  a sibling of the fieldset, never a child. The fieldset keeps its
  question-specific `<legend>`, radio group, and keyboard behaviour unchanged.
- **Results review** — `buildReviewFigure(question)` creates a fresh,
  **class-scoped** `<figure class="study-figure exam-review-figure">` subtree
  (no IDs) per figure-bearing review item and renders into it. Non-figure
  review items get no figure node. Questions that share a figure ID reuse the
  same registry `src` string — the build-time registry is never duplicated.

The helper writes the caption and alt text with `textContent` only (never as
HTML), sets `width`/`height` from the registry for a stable aspect ratio, and
applies `filter: none` via CSS so themes never tint diagram content. A question
without a `figure` field hides the container and clears any prior image,
caption, and alt. A `figure` ID with no registry entry (should not occur in a
valid build) clears the image and shows a concise "Figure unavailable"
indication — it never falls back to a previously shown image.

### Figure viewer / enlargement (Stage 3C)

Each figure container carries an **`Enlarge Figure <ID>`** `<button>`, shown by
`renderFigureInto()` only when a usable registry entry exists and reset to
hidden for non-figure questions and unavailable images. The study and exam
buttons have fixed IDs (`#study-figure-enlarge`, `#exam-figure-enlarge`); review
items use the class `exam-review-figure-enlarge` (no IDs). Its `.onclick` is
reassigned on every render (never `addEventListener`), so repeated renders and
submissions do not stack handlers, and the opener passed to the viewer is the
exact button — so ordinary dismissal restores focus precisely, including for two
results entries that share one figure.

There is **one** modal viewer (`#figure-viewer`, `role="dialog"`
`aria-modal="true"`, labelled by the visible `Figure <ID>` heading). It reuses
`window.HAM_EXAM_FIGURES` — no second registry, no image fetch. It offers three
controls: **Fit to window**, **Actual size**, **Close**. Every open starts in
fit mode. Fit constrains the image with `max-width/height: 100%` (whole image,
aspect ratio kept, no upscaling past natural size); actual size drops the
constraints so the image lays out at its intrinsic CSS pixels and the stage
(`overflow: auto`, `tabindex="0"`) scrolls by keyboard or touch. The selected
mode is mirrored in `aria-pressed` and filled with `--accent` under an
`--on-accent` foreground — a per-theme token (white in light, near-`--bg` dark
in dark/night) so the active control stays ≥ 4.5:1 in every theme, since
`--accent` itself flips from dark to light between themes. Controls sit in a
fixed bar outside the scrolling stage.

Modal isolation does not rely on `aria-modal` (or `inert`, patchy on older
WebKit): a full-viewport backdrop absorbs background pointer events, and while
the viewer is open `document` capture-phase `keydown` (Tab / Shift+Tab wrap,
Escape closes) plus a `focusin` guard that pulls stray focus back to Close keep
keyboard interaction inside the dialog. Both listeners are added on open and
removed on close. `body.figure-viewer-open { overflow: hidden }` locks
background scroll; the offset is saved on open and restored on close.

The viewer never changes answers, scoring, storage, bookmarks, progress, or
timer settings, and study/exam timers keep running (no pause-on-view).
`closeFigureViewer({ transition: true })` is called from `showQuestion()`,
`showExamQuestion()`, `showExamResults()`, `openExamSetup()`, `exitExam()`,
`returnToStudyFromResults()`, `retakeExam()`, and `openHelp()` so a stale viewer
cannot outlive its originating question, mode, or results list. A transition
close drops focus to `<body>` and lets the destination's own focus handling win
(for a timer expiry while the viewer is open: viewer closes, the exam submits
normally, and focus lands on the results heading). Only an ordinary
Close/Escape dismissal returns focus to the opening button. Adjustable zoom,
custom pinch gestures, and drag-to-pan are deferred by user decision
(`docs/ROADMAP.md`); browser zoom is untouched.

### Content-first responsive study shell (Stage L1)

Study mode (`src/index.html`, `#study-shell`) is a viewport-height flex column
with an automatic-height top bar, a flexible independently-scrollable middle,
and an automatic-height bottom bar (`height: 100vh` with a `100dvh` override
for browsers that support dynamic viewport units — the `100vh` declaration is
a plain-CSS fallback, not read by browsers that accept `100dvh`). Only
`#study-scroll` (the middle) scrolls in study mode; the shell itself never
grows taller than the viewport, so there is no second page-level scrollbar.
The same shell — not a separate desktop layout — is used at every viewport;
`#study-scroll` gets `max-width: 720px; margin: 0 auto` for a centered reading
column on wide screens instead of stretching content edge-to-edge. Bars use
`env(safe-area-inset-*)` padding for notched devices. Help, Mock Exam setup,
an active exam, and results are plain page-flow sections outside this shell
and keep ordinary document scrolling; entering any of them hides the whole
shell (`hideStudyUI()`/`showStudyUI()` toggle `#study-shell.hidden`) rather
than its individual parts.

- **Top bar**: a labelled `Menu` button (`aria-expanded`, `aria-controls`)
  that opens the settings drawer, a short app title (`<h1>`, wraps rather than
  truncating), and `#current-pool-label`, kept in sync with the active pool by
  `updateCurrentPoolLabel()` (called from `setPool()`).
- **Middle**: the existing question ID, Bookmark, question text,
  figure/enlargement, answer choices, a `.timer-row` (countdown beside a
  contextual Pause/Resume button), reference, and progress — same content and
  order as before, just inside the scrollable container. `showQuestion()`
  resets `#study-scroll`'s `scrollTop`/`scrollLeft` to 0 on every navigation.
- **Bottom bar**: Previous, Reveal Now, Next — the single surviving
  navigation set. The header's duplicate Previous/Next and the standalone
  `.navrow` below the card (`#bottomPrev`/`#bottomNext`) were removed; nothing
  else referenced those IDs.
- **Pause/Resume** (`updatePauseButton()`) is shown only while relevant: it is
  hidden (not merely disabled) whenever `revealed` is true or the reveal delay
  is "Never", and shows the correct label otherwise — a paused countdown
  always keeps its Resume control. Called after every place `revealed`,
  `waitSeconds`, or `paused` changes (`showQuestion`, `revealAnswer`,
  `resumeStudyTimer`, the Pause button's own handler).
- **Settings drawer** (`#settings-drawer`) reuses the existing `#pool`,
  `#wait`, `#theme`, `#mockExamButton`, `#helpButton`, and `#reset` controls
  by ID — moved into the drawer's markup, not duplicated. It overlays rather
  than reflows study content: `role="dialog"` `aria-modal="true"`, a visible
  "Settings" title, a Close button, and independently scrollable content.
  Isolation mirrors the figure viewer's proven pattern rather than relying on
  `aria-modal` alone: removing the `hidden` attribute makes the full-viewport
  backdrop present (and therefore blocking background pointer events) for the
  *entire* open state, including both slide transitions; only the panel's
  `transform` and the backdrop's opacity animate under
  `@media (prefers-reduced-motion: no-preference)`, and a capture-phase
  `keydown` handler traps Tab/Shift+Tab and closes on Escape, backed by a
  `focusin` guard. `openSettingsDrawer()`/`closeSettingsDrawer(opts)` follow
  the figure viewer's `opts.transition` convention: an ordinary Close /
  Escape / backdrop dismissal restores focus to `#menuButton`; a transition
  close (Help or Mock Exam opening) does not, since destination focus (the
  Help/Setup panel's own focus target) should win. `opts.immediate` skips the
  exit transition entirely and is used whenever a transition close must be
  guaranteed to have finished before something else opens (see below) — a
  plain reduced-motion check is not enough, since a frozen fake clock in tests
  can also disable the timer-based fallback that would otherwise finish the
  animation.
  - Theme, pool, and reveal-delay changes apply immediately and leave the
    drawer open. Help and Mock Exam close the drawer with `{ immediate: true
    }` before opening their destination. Reset progress keeps its existing
    confirmation and bookmark-preservation behavior and does not close the
    drawer either.
  - The drawer and the figure viewer are mutually exclusive: opening one
    force-closes the other immediately (`{ immediate: true }`) so the two
    full-viewport overlays are never simultaneously present, even
    mid-transition.
  - **Opening the drawer pauses an active study recall countdown (Stage
    6A3)**: `drawerPausedTimer`, a boolean mirroring `openHelp()`'s own
    `helpPausedTimer` exactly (pause, don't suspend, since the drawer never
    hides study mode the way Help/exam-setup do) -- guarded the same way:
    only when a countdown is actually running, not already paused, not
    revealed, and the reveal delay isn't "Never". Setting `paused = true`
    is sufficient to preserve `remaining` exactly, since the interval's own
    tick callback already returns early whenever `paused` is true, without
    decrementing; no snapshot object, and no second timer implementation,
    is needed. `closeSettingsDrawer()` reverses it unconditionally on every
    close path (Close button, Escape, backdrop, or a transition into
    Help/Mock Exam), so a manually-paused timer (which never set
    `drawerPausedTimer`) is untouched and stays paused, and a transition
    into Help or Mock Exam setup always resumes cleanly before that
    destination's own pause/suspend logic (`helpPausedTimer` or
    `suspendStudyTimer()`) takes over, leaving no stale interval. Changing
    Reveal delay, Pool, or Study scope while the drawer is open all route
    through `showQuestion()`, which still applies its own normal full
    countdown reset (a fresh question, or a fresh delay value) -- but
    **the invariant is that the countdown is paused for as long as the
    drawer is open, not merely at the moment it opens**: a review fix
    made `showQuestion()` re-pause immediately after that reset (setting
    `drawerPausedTimer` again) whenever `settingsDrawerActive` is still
    true, rather than leaving the freshly-reset countdown ticking visibly
    behind the still-open drawer. `paused`/`revealed` are guaranteed false
    and a new `timerHandle` exists at that point whenever the reveal delay
    isn't "Never", so this reuses the same fields `openSettingsDrawer()`
    already sets, with no new state. This is the study recall timer only;
    Mock Exam's own practice timer and the figure viewer's timer behavior
    are unrelated and unchanged (the drawer cannot even open outside
    `mode === "study"`).
- The former `.hint` line ("ONE question at a time…") was removed from the
  study screen; its guidance is folded into the Help panel's "Getting
  started" section instead.

### Standalone size budget

`scripts/build.js` computes `Buffer.byteLength(finalStandaloneHtml, "utf8")`
after all templating and CSP processing and **fails the build** — before any
`dist/` directory or file is created, written, copied, or removed — if it
exceeds `STANDALONE_BUDGET_BYTES` (1,048,576) from
`scripts/figure-manifest.js`. The error reports the actual byte count and the
limit. There is no skip flag and assets are never silently omitted.

### Installable PWA output

The same build also writes `dist/pwa/`. Its HTML still inlines the CSS, application logic, and complete question bank, while local companion files provide the web app manifest, service worker, and platform icon sizes. All URLs are relative so the directory works at a GitHub Pages project path or another static HTTPS host.

The service worker uses a content-derived cache version. It precaches the complete shell during installation, removes older Ham Exam caches during activation, uses network-first navigation when online, and falls back to the cached `index.html` offline.

### Content Security Policy

The build hashes every inline script after templating and injects an early CSP meta element. The standalone policy denies all network connections and workers. The PWA permits only same-origin application resources, connections, manifest, and worker scripts. Inline styles remain enabled because the build embeds CSS and the runtime makes limited style changes; inline scripts require an exact SHA-256 match. `img-src` already allows `data:` (used by the app icons and, since Stage 3A, the inline figure PNGs) but no remote scheme; the CSP was not changed for figure packaging.

### Question banks as a JS object literal

The build embeds all three pools as an explicit `window.HAM_EXAM_BANKS = { technician: {...}, general: {...}, extra: {...} }` assignment instead of using `JSON.parse` on a `<script type="application/json">` tag. Potential script-closing characters and JavaScript line separators are escaped at build time. This avoids reading inline JSON through `textContent`, which caused the app to fail silently on some iPads.

### Base question-bank schema (Stage 5B4)

`scripts/question-bank.js` is a dependency-free, pure validator for the base
per-question shape shared by all three pools — it owns exactly this and
nothing else, so its scope never overlaps the other build-time validators:

| Field | Rule |
|-------|------|
| `id` | required, non-empty string, unique within the bank |
| `sub` | required, non-empty string |
| `q` | required, non-empty string |
| `choices` | required, plain object with exactly the own keys `A`/`B`/`C`/`D`, each a non-empty string |
| `correct` | required, exactly one of `"A"`/`"B"`/`"C"`/`"D"` |
| `correctText` | required, non-empty string, byte-for-byte equal to `choices[correct]` |
| `ref` | required, a string — the empty string is explicitly valid (most real questions have one) |
| `figure` | optional; when present, a non-empty string |

Any other top-level field is rejected. `validateQuestionBank(bank, options?)`
returns `{ errors: string[] }` (pure, never throws, never mutates its input);
`assertQuestionBank(bank, options?)` throws one aggregated `Error` listing
every problem, prefixed with `options.poolKey` when given. Errors are
collected in one deterministic forward pass — a fixed per-field check order,
not the input object's own key order — so the same input always produces the
same error list. A "plain object" here means a non-null, non-array object
whose prototype is `Object.prototype` or `null`: `JSON.parse` (the only
source of real question data) only ever produces the former, so accepting
the latter too costs nothing and avoids an arbitrary rejection rule that
could only ever fire on a hand-built object, never on real data; an object
one step further up a custom prototype chain is rejected. All field-presence
checks use `hasOwnProperty`, so an inherited (not own) property is never
mistaken for a real value.

This validator deliberately does **not** duplicate work the other build-time
validators already own: question-ID syntax and pool-letter prefix, and
`sub === id.slice(0, 2)` consistency, remain `scripts/pool-registry.js`'s
job; figure-ID normalization, pool compatibility, textual figure references,
figure-manifest membership, and asset validation remain
`scripts/figure-references.js`/`scripts/figure-manifest.js`'s job; expected
per-pool bank counts and mock-exam blueprint coverage also remain
`scripts/pool-registry.js`'s job. `loadPool()` in `scripts/build.js` calls
`assertQuestionBank()` immediately after `JSON.parse`-ing each pool file —
before the figure-reference gate, the pool-registry gate, the figure-manifest
gate, the standalone byte-budget check, and every `dist/` mutation — so a
schema violation aborts the build at the very first opportunity. It replaces
the former inline `validateBank()` in `scripts/build.js`, which checked
required-field presence, `choices` A–D string-ness, `correct` membership, and
`correctText` equality, but never checked `q`/`ref`'s types, never rejected
an unknown top-level field, and never rejected an unexpected `choices` key —
and had no direct regression tests of its own. See
`tests/unit/question-bank.test.js` (schema cases, including the real banks)
and `tests/unit/build-gate.test.js`'s "build question-bank gate (Stage 5B4)"
block (real-build integration and gate-ordering cases) for verification.

### Pool metadata

Human-readable pool metadata (element number, effective dates, NCVEC source URL, and errata note) is read directly from the canonical registry, `window.HAM_EXAM_POOLS` (built from `data/pools.json`; see the next section). The Help / About panel derives its reference list from this registry together with the embedded bank counts. There is no separate runtime copy of this metadata anywhere in `src/app.js` — see "Canonical pool/exam registry (Stage 4A0, extended Stage 5A)" below for the field list and `formatPoolDate()`/`poolEffectiveRange()`, the small pure formatter that derives the displayed date range (e.g. `"July 1, 2026 – June 30, 2030"`) from `effectiveStart`/`effectiveEnd` at render time instead of storing a third duplicate string.

### Canonical pool/exam registry (Stage 4A0, extended Stage 5A)

`data/pools.json` (`schemaVersion: 3` — bumped from 2 in Stage 6A1, since `scopeLabels` below is now required and a v2 registry no longer validates against it; bumped from 1 in Stage 5A for the same reason regarding the mock-exam fields; unrelated to the persisted `ham-exam-state` storage schema, which stays at its own `schemaVersion: 1`) is the single canonical build-time registry of pool identity, mock-exam configuration, **and** scoped-study labels. Each of exactly three entries (`technician`, `general`, `extra`) carries:

| Field | Description |
|-------|-------------|
| `poolKey` | Machine identifier (`"technician"`, `"general"`, `"extra"`) |
| `displayName` | Human-readable pool name |
| `editionId` | Changes when NCVEC replaces the pool |
| `revisionId` | Changes for errata within an edition |
| `element` | FCC element number (2, 3, 4) |
| `effectiveStart` / `effectiveEnd` | ISO pool validity window from NCVEC |
| `expectedCount` | Full question-bank size (409/423/599) — **not** the exam session size below |
| `questionIdPrefix` | This pool's single question-ID prefix letter |
| `sourceUrl` | Official NCVEC pool download URL |
| `errataLabel` | Human-readable errata note |
| `examQuestionCount` | Mock-exam session size per FCC Part 97.503 (35/35/50) — distinct from `expectedCount` |
| `passingScore` | Minimum correct answers per FCC Part 97.503 (26/26/37) |
| `defaultTimeLimitSeconds` | Default practice-timer duration (2100 s for Technician/General, 3000 s for Extra) |
| `withdrawnIds` | Question IDs to exclude from exam selection even if present in the JSON bank |
| `groupBlueprint` | Map of NCVEC group identifier (e.g. `"T1A"`) → questions to select from that group |
| `scopeLabels` | `{ subelements, groups }`: human-readable NCVEC titles for scoped study's drawer selector, keyed by the same codes as `groupBlueprint` (Stage 6A1) |

The last five fields were consolidated here in Stage 5A from what used to be two separate runtime duplicates: `POOL_META` in `src/app.js` and `EXAM_CONFIG` in `src/exam-engine.js`. Both are gone; this registry is now their only source.

The dependency-free validator `scripts/pool-registry.js` enforces the exact schema (unknown fields at either level are rejected), unique edition/revision identities, real calendar dates with start before end, counts equal to the loaded banks, and question ID format/prefix/uniqueness with `sub` consistency, plus (Stage 5A): `examQuestionCount` is a positive integer; `passingScore` is a positive integer not exceeding `examQuestionCount`; `defaultTimeLimitSeconds` is an integer in `[0, MAX_DEFAULT_TIME_LIMIT_SECONDS]` (21,600 s / 6 hours — comfortably above any real exam duration, catching unit-entry mistakes); `withdrawnIds` entries are well-formed, pool-prefixed, non-duplicate question IDs (format-checked only — a withdrawn ID may legitimately already be absent from an updated bank); and `groupBlueprint` entries use a valid 3-character group ID with this pool's own prefix, are positive integers, sum to `examQuestionCount`, and each have enough real (non-withdrawn) bank questions to satisfy the requested count ("impossible" entries are rejected); plus (Stage 6A1): `scopeLabels.subelements`/`scopeLabels.groups` each cover exactly the codes derivable from that pool's own `groupBlueprint` (no missing, no unknown code, no duplicated identity source), with non-blank, untrimmed-whitespace-free, ≤`MAX_SCOPE_LABEL_LENGTH` (72) character string titles — a hard schema ceiling; group labels themselves target a stricter ~48-56 character concise-display length (see `docs/SCOPED_STUDY_PLAN.md`'s "Stage 6A1" section), with `tests/unit/pool-registry.test.js` enforcing that narrower real-data bound as a distinct regression check from schema validation. It never mutates its inputs.

`scripts/build.js` loads the banks first (the Stage 2A figure-reference gate runs inside `loadPool`), then validates the registry, then runs the Stage 2D figure-manifest gate — all before the first `dist/` mutation, so a failed gate leaves any pre-existing `dist/` byte-identical. The validated public fields (the full table above, `scopeLabels` included — all public and runtime-required, none are build-only file paths, checksums, or source-PDF references) are embedded once per generated document as `window.HAM_EXAM_POOLS = {...};` via the same `asInlineScript()` serialization as the banks (no `JSON.parse` of `textContent`), through the `__POOLS__` placeholder in `src/index.html`. The embedded value is the bare pools map; the runtime storage consumer (`src/app.js`, below) wraps it into the storage module's canonical `{ pools: <map> }` registry shape at the single adapter-construction call site.

### Versioned storage module (Stage 4A1), application integration (Stage 4A2), preference persistence (Stage 4A3), and exam-loss protection (Stage 4B)

`src/storage.js` is a dependency-free, ES5-only UMD-style module following the same pattern as `src/exam-engine.js`: `require()` in Node returns an object whose `HAM_EXAM_STORAGE` property is the API; in a browser it sets `window.HAM_EXAM_STORAGE`. Requiring or loading it performs no I/O and reads/writes no storage merely by being loaded — every real access happens through its adapter's `load()`/`save()`. It is inlined into both generated documents (`__STORAGE__` placeholder, after `__ENGINE__` and before `__JS__`).

**Stage 4A2 made the module live.** `src/app.js` constructs exactly one adapter at startup — `window.HAM_EXAM_STORAGE.createStorageAdapter(window.localStorage, <registry>, window.HAM_EXAM_BANKS)`, with the bare embedded pools map wrapped into the module's `{ pools: <map> }` registry shape — and calls `load()` once. The resolved canonical state is then the single source of truth in memory; there is no direct `localStorage` access anywhere else in the app (a build-gate test enforces both invariants on the generated documents). Startup behavior by `load()` status: `valid` — the state is used as-is and **never rewritten** (all mutation paths compare-before-write, so an unchanged startup performs zero canonical writes); `migrated`/`reconciled` — exactly one save commit is attempted, and a failed commit (quota, read-back mismatch) simply leaves the app running from memory, with the untouched legacy keys available for a rerun; `future-schema`/`unsupported-schema`/`storage-unavailable`/`read-error` — `writable:false`, the app runs entirely in memory from the resolved (safe-default) state and never attempts a save. The resolved status and writability are exposed non-visibly through `window.HAM_EXAM_DIAGNOSTICS.storage`, consistent with the existing diagnostics object. Persisted user mutations are pool change, question navigation, bookmark toggle, theme change, and reset progress; per-pool positions are stored as stable question IDs (`currentQuestionId` + `positions.all`), resolved to a bank index at render time with a first-question fallback. Reset progress resets every pool's position to its first question while preserving the active pool, all bookmarks, and the theme. Mock-exam sessions, answers, scores, and results remain memory-only — no persistence calls exist on any exam path, and Help / Mock Exam setup transitions change no stored state. Legacy keys are retained untouched as the rollback/migration input; they are never written, mirrored, or deleted by the app.

**Stage 4A3 connects the schema's two reserved preference fields.** `preferences.recallSeconds` (allowed: `0, 5, 10, 15, 20, 30, 60`; `0` is "Never") initializes the runtime `waitSeconds` and the `#wait` selector at startup via `setRecallSeconds()`, which — like `setTheme()` — only calls `persistState()` when the value actually differs from what was just loaded, so an unchanged startup performs zero canonical writes. Changing `#wait` calls the same function and then `showQuestion()`, which resets the current question's reveal countdown from the new value immediately (no fixed delay to observe the change).

`preferences.examTimerSeconds` follows the schema exactly: `null` means "use the selected pool's `defaultTimeLimitSeconds` from the canonical registry" (35 minutes for Technician/General, 50 for Extra); `0` means no timer; a permitted positive value (`900, 1800, 2100, 3000, 3600`) is a fixed duration applied to *every* pool, not stored per pool. `#exam-timer-select` carries one additional, nonnumeric option, `value="default"` ("Pool default"), so a null preference is never confused with numeric `0` or with an empty string `Number()` would silently coerce to `0`. `applyExamTimerSelection(poolKey)` — called both when Mock Exam setup opens and whenever the exam pool changes, mirroring how `updateExamSetupMeta()` already serves both transitions — refreshes the "Pool default" option's label with that pool's configured duration (`updateExamTimerDefaultOption()`, sourced only from the canonical registry, `window.HAM_EXAM_POOLS`, no duplicated metadata) and sets the select to `"default"` when the preference is `null` or to the fixed number otherwise; because a fixed preference is reasserted unchanged regardless of pool, it is naturally never disturbed by a pool change. The select's `onchange` persists the resolved choice (`null`/a permitted number) through `persistState()` and never touches an in-progress exam. `startExam()` resolves the *effective* duration immediately before building `examSession` — `"default"` (or a missing select) resolves to the pool's configured default, any other value is used as-is — and stores only that resolved number on `examSession.timeLimitSeconds`; the selection itself, and the session, are never persisted. A value present in the select but outside the schema's allowed set (short test-only durations injected by `tests/mock-exam.spec.js` to exercise expiry/warning timing without real waits) is still used as that exam's effective duration but is deliberately never written to `appState.preferences.examTimerSeconds` — the `onchange` handler checks schema membership before persisting. The former `examTimerManuallySet` flag and `setExamTimerDefault()`'s "only apply the default once, then never again until setup reopens" behavior are removed entirely; persistence replaces that mechanism.

**Stage 4B adds a `beforeunload` warning while a mock exam is active**, the final Stage 4 slice. One listener is registered exactly once at startup, alongside the existing `hashchange` listener and the `keydown`/`Escape` handler in the same `addEventListener`/`attachEvent` block. `onBeforeUnload(event)` calls `event.preventDefault()` and sets `event.returnValue = ""` only while `mode === "exam"` and `examSession` is set — the same two pieces of state every other exam-lifecycle function already reads and mutates, so no new flag was introduced. It is active from the instant `startExam()` runs (even before any answer is selected) through answering, navigating, pausing, and figure-viewer use, and is disabled the moment either condition stops holding: explicit exit, and both submission routes (manual and timer-expiry both call `showExamResults()`, which sets `mode = "results"`). Retake re-enables it by calling `startExam()` again. It adds no persistence call of any kind and no new canonical-state field; browsers control the unload dialog's presence, appearance, and text entirely, so none is specified here.

The module defines a canonical `schemaVersion: 1` state (key `ham-exam-state`) covering theme/recall/exam-timer preferences and, per pool, edition/revision identity, current question, bookmarks, a (currently `"all"`-only) study scope, and stable-ID positions — never copied question content. It provides: `createDefaultState`/`validateState`/`normalizeState` (strict vs. lenient schema handling); `migrateLegacy`, which converts the eight existing `ham-exam-*` legacy keys (read-only; never deleted or rewritten by this module) into canonical state, attributing migrated pools to the registry's current edition/revision; `reconcileState`, which retains valid IDs and bumps the revision on a same-edition errata update but hard-resets a pool's content on a replacement edition or rollback-build mismatch, even if the new bank reuses the same question ID strings; `resolveState`, the full state-precedence policy (a valid canonical state wins; absent/malformed/not-plausibly-schema-1 canonical data recovers from legacy; a newer schema is preserved untouched and returned read-only; an older/unrecognized schema gets the same read-only treatment rather than being silently treated as schema 1); and `createStorageAdapter(storageLike, registry, banks)`, an injected-storage adapter (never reaching for a global `localStorage` in core logic) that caches one availability probe, performs a canonical write as exactly one `setItem` verified by reading the value back and re-validating it before reporting success, and never overwrites a detected future-schema value. See [`docs/POOL_STORAGE_PLAN.md`](POOL_STORAGE_PLAN.md#stage-4a1-outcome-committed-as-b13b77e) for the complete schema, API, bounds, and verification detail.

### Transient scoped study (Stage 6A)

`src/study-scope.js` is a dependency-free, ES5-only UMD-style module — the
same `require()`/`window` pattern as `exam-engine.js`/`storage.js` — exposing
`window.HAM_EXAM_STUDY_SCOPE`: `validateScope`, `filterBankByScope`,
`resolveScope`, `enumerateScopes`, `describeScope`, `defaultScope`, and the
`groupOf`/`subelementOf` id-parsing helpers. It is pure: no I/O, no globals
beyond its own namespace object, every function returns a new value without
mutating its arguments. It is inlined as `__SCOPE__`, after `__STORAGE__` and
before the app IIFE (`__JS__`), which is its only caller — see "Inline script
order" above.

A scope is `{ level: "all"|"subelement"|"group"|"question", id }`. Subelement
(`"T1"`) and group (`"T1A"`) identity is derived from a question's own stable
ID via the same `/^[A-Z]\d[A-Z]/` prefix pattern `exam-engine.js` and
`scripts/pool-registry.js` already use — never a second, duplicated source of
group metadata. `enumerateScopes(poolConfig)` reads the valid subelement/group
codes straight from `poolConfig.groupBlueprint`'s own keys (the same canonical
registry Mock Exam selection reads), so the drawer's options and Mock Exam's
group balancing can never disagree about what a pool's groups are.

**Ownership boundary: study mode only, entirely transient.** `src/app.js`
holds the only mutable scope state — two module-level variables, `studyScope`
and `studyList` (the current pool's bank filtered by `studyScope`, or the full
bank for `all`) — initialized fresh on every load and never read from or
written to `appState`/`src/storage.js`. `src/storage.js`'s schema already
defines `scope`/`positions` fields per pool, but its validator accepts only
`{level:"all", id:null}` / `{all: <id>}`; Stage 6A does not loosen that
validator or add any new persisted field, so a scope selection cannot survive
reload even by accident. Every study navigation/rendering path that used to
index the raw bank (`showQuestion`, `revealAnswer`, bookmark toggling, the
recall-timer resume path, Previous/Next boundary checks) now indexes
`studyList` instead — `index` addresses a position in `studyList`, not the
full bank. For the default `all` scope, `studyList` is simply a full copy of
the bank, which is why unscoped behavior — including the exact
`"Question N / M"` progress string — is byte-for-byte unchanged. Selecting a
scope, or switching pools (which always resets scope to `all`, since a scope
computed against one pool's groups is not meaningful for another), calls
`recomputeStudyList()`; the new position depends on which way the change
goes. Entering a scope (or moving between two different scopes) resets
`index` to `0`, the start of the newly-filtered list. Returning to `all`
instead **restores** the saved full-pool position (`poolState(currentPool)
.currentQuestionId`, resolved back to an index in the full `studyList`) —
`showQuestion()` only writes that saved position while scope is `all`, so
browsing inside a scope can never silently overwrite it (a review fix over
Stage 6A's initial version, which persisted on every question shown
regardless of scope).

**Mock Exam isolation is structural, not an added guard.** Exam setup and
selection (`startExam()`, `scoreExam()`, `updateExamSetupMeta()`, and the rest
of the exam-engine call path) read `BANKS`/`POOLS` — the full embedded pool
data — directly; none of them reference `BANK`, `index`, `studyScope`, or
`studyList`. Study scope was added without touching any exam function, so
Mock Exam drawing from the full configured pool, independent of whatever the
learner is currently studying, holds by construction.

The settings drawer gains one field, `#scope-select` (a native `<select>`
with "Subelement"/"Group" `<optgroup>`s built by `populateScopeSelector()`),
right after the pool selector. Each option's text is `"<code> — <title>"`
(Stage 6A1) — the title comes from `POOLS[currentPool].scopeLabels`, the
same canonical, validated registry `groupBlueprint`/Mock Exam configuration
live in, never a second copy in `src/app.js`; the code alone is still the
value/identity. It participates in
the drawer's existing generic `button, select` focus-trap query with no
additional wiring. A compact top-bar indicator, `#scope-summary`, mirrors the
existing `#current-pool-label`, stays **code-only** even with Stage 6A1's
labels (there is no room for a title next to the pool name), and is hidden
via the `hidden` attribute whenever scope is `all`. See
[`docs/SCOPED_STUDY_PLAN.md`](SCOPED_STUDY_PLAN.md) for the
full scope-type semantics, the byte-budget-driven decision to omit a
per-question picker UI, and the deferred persistence design.

### Release-status version label (Stage 5B1)

`package.json`'s `version` field is the single version authority. The user-facing release-status label shown in the footer and the Help / About panel — `"0.3.0-beta.1 (beta)"`, `"0.3.0"`, `"0.3.0-rc.1 (prerelease)"`, etc. — is derived from it exactly once, at build time, by the dependency-free `scripts/version-label.js` (`deriveVersionDisplay(version)`; also directly unit-tested in `tests/unit/version-label.test.js`). Classification looks at the version's *parsed prerelease identifier* (its first dot-separated segment), not merely at whether the string contains a hyphen, so a non-beta prerelease like `0.3.0-rc.1` is never mislabeled `(beta)`:

| Version | Displayed label |
|---|---|
| `0.3.0-beta.1` | `0.3.0-beta.1 (beta)` |
| `0.3.0-beta.2` | `0.3.0-beta.2 (beta)` |
| `0.3.0` | `0.3.0` |
| `0.3.0-rc.1` | `0.3.0-rc.1 (prerelease)` |

`scripts/build.js` embeds the result once as `window.HAM_EXAM_VERSION_DISPLAY` (alongside the existing, undecorated `window.HAM_EXAM_VERSION`) and substitutes it into the `__APP_VERSION_DISPLAY__` placeholder for the static pre-JS-load fallback footer in `src/index.html`. `src/app.js` reads that same embedded value for both the runtime-generated footer and the Help / About version text (`renderHelp()`) — neither re-implements the beta/prerelease/stable decision; they only display the one precomputed string, so the footer and Help text always agree. This replaced hardcoded `APP_VERSION + " (beta)"` literals in both locations, which would have kept displaying `(beta)` even after a stable release.

`tests/unit/build-gate.test.js`'s `release version display (Stage 5B1)` block proves this end-to-end through the real build entry point with fixture package versions: a beta version renders `(beta)` in both generated documents; a stable version renders the plain version with no `(beta)` anywhere in either document; a non-beta prerelease (`0.3.0-rc.1`) renders `(prerelease)` and is never labeled beta; and a malformed version still aborts the build before any `dist/` output, exactly as before. `tests/app.spec.js` and `tests/pwa.spec.js` derive their expected footer/Help text from the same `deriveVersionDisplay()` function against the real `package.json`, instead of hardcoding a literal `(beta)` suffix that would go stale at a stable release.

### Help / About panel

A self-contained Help / About panel is included in the same HTML document. It is hidden by default and toggled via JavaScript, so opening Help requires no network request and works in the standalone file and the PWA.

Help is treated as a full in-page study view rather than a modal dialog. While Help is open, the whole study shell (`#study-shell` — top bar, middle scroller, bottom bar) and the settings drawer are hidden using the `hidden` attribute, which removes them from the accessibility tree and the keyboard tab order. Only Help navigation remains available: the Help panel and its `Back to study` control. Since `Help & About` itself lives inside the settings drawer (see the responsive shell section below), closing Help returns focus to the top bar's `Menu` button — the drawer's opener — rather than to the (now unreachable) button inside a closed drawer.

Opening Help pauses an active recall timer; closing Help resumes it. The current question, pool, theme, bookmark, and progress state are not changed. Pressing `Escape` while Help is open closes it and returns focus to the `Help & About` button. The `#help` URL fragment opens Help directly and scrolls to the top of the panel; the browser back button also closes Help.

**Content audit and newcomer section (Stage 6A4).** Help's static text is audited whenever a feature changes its behavior, so it never drifts from what the app actually does — Stage 6A (scoped study) and Stage 6A3 (drawer timer pause) both landed without a matching Help update, which this stage corrected: the "Getting started" list now names `Study scope` alongside `Pool` as a Settings control, and the progress bullet no longer implies all study progress is saved unconditionally — it now states plainly that only the position in "All questions" is saved per pool, that a `Study scope` is temporary and resets to "All questions" on reload, and that browsing inside one never overwrites the saved full-pool position. A new `#help-newcomer` section, placed first in `#help-content` (before "Getting started"), gives a short explanation of amateur radio and licensing plus plain `<a>` links to official FCC, ARRL, and NCVEC resources, local-club/mentor guidance, and two HTTPS educational software-defined-radio pages (ARRL, Wikipedia) — ordinary anchors only, no iframe, runtime fetch, or analytics, consistent with the panel's existing offline-first, dependency-free design. The SDR paragraph deliberately never promises the app itself provides listening: it names these as informational pages that may in turn reference independently operated receiver directories whose availability and security are outside this app's control, and states the distinction that listening never authorizes transmitting (which always requires a license and callsign) in the same paragraph — this wording replaced an earlier draft that linked two HTTP-only receiver-directory sites directly, corrected before commit because it read as the app vouching for third-party listening services it does not control. See `docs/IMPLEMENTATION_PLAN.md`'s Stage 6A4 execution-log row for the exact link list and verification method/date.

**Getting Started guide (Stage 6A5).** A second Help sub-view, `#getting-started`, gives newcomers a mobile-first orientation to what the hobby actually involves beyond the exam — Parks on the Air and other outdoor/portable operation, hiking/camping/mobile radio, satellite and ISS contacts, digital modes and experimentation, emergency/public-service communication, and home stations/clubs/mentors — ending with a "Learn more" section of HTTPS links (FCC, ARRL, POTA, ARISS, AMSAT) and the same listening-never-authorizes-transmitting distinction as the SDR paragraph above. `#help-newcomer` gained a short intro sentence and an `Open Getting Started` button near the top of Help, per the design goal of keeping Help itself concise by linking to the guide rather than inlining all of its content there. The guide shares Help's overlay mechanics rather than duplicating them: `helpView` (`null` | `"help"` | `"guide"`) tracks which of the two sub-view elements (`#help` / `#getting-started`, both `.help-panel`) is unhidden; entering the overlay from study mode — closing the drawer/figure viewer, pausing a running countdown, hiding the study shell — happens once, in `enterHelpOverlay()`, regardless of which sub-view is entered first or how many times the two are switched between afterward, so switching between them never re-pauses an already-paused timer or re-hides an already-hidden shell. Opening the guide (from Help's button, or a direct `#getting-started` deep link) pushes a new history entry, matching how opening Help itself behaves; stepping back to Help — the guide's `Back to Help` button or `Escape` — instead *replaces* the current history entry with `#help`, so the browser's own Back button moves on to study next rather than bouncing forward into the guide just left (`backToHelp()`, mirroring `closeHelp()`'s existing use of `replaceState` for the same reason). The guide's one photo (`assets/portable-radio-outdoors.jpg`, a portable/POTA-style setup) is inlined as a `data:` URI by `scripts/build.js` exactly like every other embedded asset — resized, compressed, and stripped of all EXIF/GPS/timestamp/Motion-Photo metadata before being committed — with no manifest of its own, unlike the question-figure pipeline below: it is a single static asset with nothing to validate it against, not one tied to per-question data.

### Visible startup diagnostics

The HTML contains a static startup status element and installs error handlers before loading the question bank. A successful initialization hides the status. If an Apple document preview suppresses JavaScript, the static element remains and directs the user to an HTTPS Safari page. If the bank is missing or startup throws an error, the page shows the failed stage, sanitized page URL, and sanitized error message instead of leaving an unexplained inert page. It deliberately does not include the browser user agent or other fingerprintable information.

`safeError()` sanitizes free-form error text with three ordered passes: any path-like `file:` URL is masked to the end of its line; a Windows drive-letter `Users` path (raw or with `%2F`/`%5C` separators) becomes `<drive>/Users/[user]`; and a POSIX `/home` or `/Users` path at a plausible absolute-path boundary becomes `/home/[user]` or `/Users/[user]`. Separators are matched literally and never decoded, so malformed sequences cannot throw and unrelated encoded prose and ordinary remote or nested paths pass through byte-for-byte. Privacy takes precedence when a supported local-path shape is embedded in another string, including a remote URL. This recognises the path shapes the project supports; it is not a promise to parse every possible path format, which is why the roadmap tracks a move to structured, allowlisted diagnostics.

## Mock-exam mode — Phase 1: exam configuration and selection engine

Phase 1 added the data model and selection logic underneath the mock-exam UI.
The setup, session, results, and practice-timer views built on top of it are
described in the Phase 2–4 sections below and are all shipping in the current
release.

### Exam configuration and the selection engine's dependency injection (Stage 5A)

`src/exam-engine.js` no longer owns any configuration data. Through Stage 4B it
defined its own `EXAM_CONFIG` constant, duplicating fields already present in
`data/pools.json`; Stage 5A removed it. `selectExamQuestions(poolKey, banks,
rng, poolConfig)` is a pure function that takes that pool's canonical registry
entry (`window.HAM_EXAM_POOLS[poolKey]`) as an explicit fourth argument instead
of reading a hidden module-level global, reading only `poolConfig.poolKey`
(cross-checked against `poolKey`, so a mismatched entry is a build/wiring bug
caught immediately rather than silently mis-scoring an exam),
`poolConfig.examQuestionCount`, `poolConfig.groupBlueprint`, and
`poolConfig.withdrawnIds`. `src/app.js` is the only caller and passes
`window.HAM_EXAM_POOLS[poolKey]` directly. See "Canonical pool/exam registry"
above for the full field table.

**Official values (FCC Part 97.503):**

| Pool | Element | Questions | Passing |
|------|---------|-----------|---------|
| Technician | 2 | 35 | 26 |
| General | 3 | 35 | 26 |
| Extra | 4 | 50 | 37 |

### Group blueprints and effective dates

The NCVEC pool documents organise each pool into lettered groups (e.g. `T1A`,
`G2E`, `E9H`) and recommend selecting one question from each group for balanced coverage.
This is a practice-design recommendation, not an FCC-mandated selection rule.

| Pool | Groups | Exam questions | NCVEC source and errata |
|------|--------|---------------|------------------------|
| Technician | 35 (T1A – T0C) | 35 (1 per group) | 2026-2030 pool, February 19, 2026 errata |
| General | 35 (G1A – G0B) | 35 (1 per group) | 2023-2027 pool, 6th errata February 4, 2026 |
| Extra | 50 (E1A – E0A) | 50 (1 per group) | 2024-2028 pool, 4th errata February 4, 2026 |

The group lists were derived by inspecting the question IDs in the JSON pool files
and cross-referencing with the NCVEC documents.  The pool files already reflect
the applicable errata; no questions that were subsequently withdrawn remain in the
JSON (e.g. `G1A04` was removed before the General pool was captured).  The
`withdrawnIds` arrays are therefore empty for all three pools; they exist as an
explicit safety mechanism so that any future errata can be applied without editing
the JSON files.

**Uncertainty note:** the blueprint counts above were verified by counting
distinct group identifiers in the JSON pools, which must equal the official
question-pool blueprints published by NCVEC.  If a future errata adds or removes
an entire group, both the bank JSON and `data/pools.json`'s `groupBlueprint` must
be updated together; `scripts/pool-registry.js` now enforces at build time that
the blueprint's keys use this pool's prefix, exist with enough real (non-withdrawn)
questions in the bank, and sum to `examQuestionCount`, so a bank/blueprint drift
fails the build instead of shipping silently.

### Selection algorithm

The engine is implemented in `src/exam-engine.js` and exposed as
`window.HAM_EXAM_ENGINE`.  The algorithm:

1. Builds an index of available questions keyed by their three-character group
   identifier (e.g. `"T1A"` from `"T1A05"`), excluding any IDs listed in
   `withdrawnIds`.
2. Iterates over every group in `groupBlueprint` in insertion order.
3. For each group, performs a partial Fisher-Yates shuffle on a shallow copy of
   the group's question array to pick the required number of questions at random.
   The original bank array is never modified.
4. Accumulates the selected questions (deduplication is enforced; a duplicate
   would throw).
5. Returns the full exam array.

**This is an NCVEC-balanced practice approximation, not an FCC-mandated
algorithm.**  FCC Part 97.507 requires that VECs use the published question pools
and that exam questions come from those pools, but does not prescribe a specific
random-selection procedure.

The engine accepts an injectable random-number generator (`rng` parameter).
Passing `HAM_EXAM_ENGINE.seededRng(n)` produces a deterministic exam for testing.
The default is `Math.random`.

### Inline script order

The build inlines these scripts in this order:

```
<script> diagnostics bootstrap          </script>   (inline in template)
<script> __BANK__ (HAM_EXAM_BANKS)      </script>
<script> __POOLS__ (HAM_EXAM_POOLS)     </script>
<script> __FIGURES__ (HAM_EXAM_FIGURES) </script>
<script> __ENGINE__ (HAM_EXAM_ENGINE)   </script>
<script> __STORAGE__ (HAM_EXAM_STORAGE) </script>
<script> __SCOPE__ (HAM_EXAM_STUDY_SCOPE) </script>
<script> __JS__ (app IIFE)              </script>
<script> __PWA_JS__                     </script>
```

`exam-engine.js` sits between the pool registry and the app IIFE so that the
engine is available before the app runs, but does not depend on the app. The
figure registry is a plain data assignment placed right after the banks.
`__SCOPE__` (Stage 6A) sits after storage and immediately before the app IIFE,
its only caller — it never touches storage and storage never touches it. Every
inline `<script>` — the figure registry included — gets its own build-derived
SHA-256 in the CSP.

## Mock-exam mode — Phase 2: setup screen and session shell

Phase 2 wired the Phase 1 selection engine to the UI. At the end of Phase 2,
scoring, exam timers, and result persistence were intentionally deferred; scoring,
submission, and review were added in Phase 3, and an optional practice countdown
timer was added in Phase 4.

### Mode management

A module-level `mode` variable (values: `"study"`, `"exam-setup"`, `"exam"`,
`"results"`) tracks the active view. Switching modes is always explicit: the mode
variable updates first, then the relevant HTML sections are shown or hidden using
the `hidden` attribute. The study UI (header, `<main>`, footer) and exam panels are
mutually exclusive.

`openHelp()` is guarded with `if (mode !== "study") return;` so the Help panel
cannot be accidentally opened while an exam is running or while results are shown.

### Focus management across exam views

Every mode transition moves keyboard focus into the view that becomes visible so
focus is never stranded on `<body>` or inside a panel that was just hidden:

| Transition | Focus destination |
|------------|-------------------|
| Study → setup (`openExamSetup`) | `#exam-pool-select` |
| Setup → session (`startExam`), and retake | `#exam-session-heading` |
| Session → results (`showExamResults`) | `#exam-results-heading` |
| Setup cancel (`closeExamSetup`) | `#mockExamButton` |
| Session exit (`exitExam`) | `#mockExamButton` |
| Results → study (`returnToStudyFromResults`) | `#mockExamButton` |

`#exam-session-heading` and `#exam-results-heading` carry `tabindex="-1"` so they
can receive programmatic focus without joining the ordinary Tab sequence. Exit,
cancel, and return-to-study each restore the study UI first, then focus
`#mockExamButton`, so focus lands on a visible control.

### Session model

When an exam starts, `startExam(poolKey)` calls `selectExamQuestions` and stores
the result in an in-memory `examSession` object:

```
examSession = {
  poolKey : string,         // "technician" | "general" | "extra"
  questions: Question[],    // ordered array from selectExamQuestions
  index   : number,         // zero-based current question index
  answers : { [id]: "A"|"B"|"C"|"D" }  // user's selections so far
}
```

Session state is never written to `localStorage`. It exists only in memory; a
page reload clears it. `window.HAM_EXAM_DIAGNOSTICS.examSession` mirrors the
live value for test introspection.

### Answer choice rendering

Each question in the exam view is displayed with a `<fieldset>` / `<legend>` /
`<label>` / `<input type="radio">` structure. This provides correct radio-group
semantics so screen readers announce the group and each option.  The `name`
attribute of the radio inputs is unique per question ID
(`"exam-answer-<questionId>"`), so navigating between questions never leaks a
previous selection into a new group.

`showExamQuestion()` clears the `<fieldset>` on every render and re-inserts a
visually-hidden, question-specific `<legend>` ("Answer choices for `<id>`") as the
first child, before the labels. The static `<legend>` in the HTML template is a
fallback; the rendered legend always names the current question so the radio
group has a meaningful accessible name as the user moves through the exam.

When a user selects a radio, the `onchange` handler records the answer in
`examSession.answers` and adds the `selected` CSS class to the parent label.
When `showExamQuestion()` renders a question that already has a saved answer, it
pre-checks the matching radio and adds the `selected` class synchronously —
ensuring the choice is visually indicated with or without CSS `:has()` support.

### Separation from study mode

The exam panels (`#exam-setup`, `#exam-session`) are siblings of `<main>` in the
HTML. They are always in the DOM but hidden. The study-mode timer, reveal,
bookmark, pool-switch, and reset controls are all in the header, which is hidden
during exam modes; they are never reached or mutated during an exam session. Study
progress (canonical per-pool question ID, bookmarks, active pool) is unchanged
by entering, running, or exiting a mock exam.

### Finish exam and submission

"Finish Exam" calls `submitExam()`, which compares the count of answered
questions with the total. If unanswered questions remain, a `window.confirm()`
asks the user to confirm that unanswered questions will count as incorrect.
Cancelling leaves the session and answers unchanged. Confirming (or submitting
an all-answered exam) calculates the score and opens the results view.

## Mock-exam mode — Phase 3: scoring, submission, and results/review

Phase 3 replaces the placeholder finish behavior with real scoring and a
results/review panel.

### Scoring model

`scoreExam(session)` is a pure function that returns:

| Field | Description |
|-------|-------------|
| `correct` | Selected answers that match the question's `correct` field |
| `incorrect` | Selected answers that do not match |
| `unanswered` | Questions with no selected answer |
| `total` | Total questions in the session |
| `percentage` | `Math.round((correct / total) * 100)` |
| `passingScore` | From the canonical registry, `window.HAM_EXAM_POOLS[poolKey].passingScore` |
| `passed` | `correct >= passingScore` |
| `bySubelement` | `{ [sub]: { correct, total } }` computed from the selected questions only |

Unanswered questions count as incorrect for the pass/fail verdict but are
reported separately in the UI.

### Submission flow

1. `finishExam()` calls `submitExam()`.
2. `submitExam()` counts answered questions. If any are unanswered, it shows a
   confirmation dialog explaining that unanswered questions count as incorrect.
3. On confirmation, `showExamResults()` sets `mode = "results"`, hides the exam
   session panel, and renders the results view.

### Results view

The results panel (`#exam-results`) contains:

- A score summary with percentage and Pass / Needs review verdict.
- Counts for Correct, Incorrect, Unanswered, Total, and Passing threshold.
- A subelement breakdown rendered as a native `<table>` (`#exam-subelement-table`,
  labelled by its `<h3>` via `aria-labelledby`). The `<thead>` is static with
  three `scope="col"` headers; `showExamResults()` fills `<tbody>` with one row
  per subelement — a `<th scope="row">` for the subelement plus `<td>` cells for
  correct and total — sorted alphabetically. No ARIA `role` overrides are used.
- A review list showing every question, the user's answer (or "Unanswered"),
  the correct answer and text, and the FCC reference when available.
- `Retake exam` and `Return to study` action buttons.

The review list uses text labels and left-border color coding so status is not
conveyed by color alone.

### Results actions

- **Return to study** clears the in-memory `examSession`, returns `mode` to
  `"study"`, restores the study UI, and resumes the suspended study timer. The
  original study question, pool, theme, bookmarks, and progress are unchanged.
- **Retake exam** starts a new exam for the same pool with a fresh question set
  and empty answers.

No exam session, answers, or results are written to `localStorage`.

## Mock-exam mode — Phase 4: optional practice countdown timer

Phase 4 adds a deadline-based practice countdown timer. This is an app practice
aid; it is not an FCC examination requirement.

### Timer configuration

The canonical registry carries a `defaultTimeLimitSeconds` field for each pool
(2100 s for Technician and General; 3000 s for Extra). The setup panel exposes a
`#exam-timer-select` dropdown with options from 15 minutes to 60 minutes, plus
"No timer". The default is set from the registry when the setup panel opens and
whenever the pool selection changes. The persisted `preferences.examTimerSeconds`
preference (Stage 4A3) governs whether "Pool default" or a fixed duration is
selected — see that field's description above; the former manual-override flag
(`examTimerManuallySet`) was removed when persistence replaced it.

### Timer lifecycle

1. `startExam()` reads `#exam-timer-select`, stores `timeLimitSeconds` on the
   session, and calls `startExamTimer()`.
2. `startExamTimer()` resets `examTimerState` to `"normal"`, records `startedAt`
   and `deadline = Date.now() + timeLimitSeconds * 1000`, and starts a 1-second
   `setInterval` calling `updateExamTimer()`. If `timeLimitSeconds` is zero the
   interval is not created and the display reads "No time limit".
3. `updateExamTimer()` recomputes remaining seconds from the wall-clock deadline
   (`Math.ceil((deadline - Date.now()) / 1000)`) so drift is bounded even if
   the interval fires late. At zero, it calls `submitExam({ timedOut: true })`.
4. `stopExamTimer()` clears the interval and sets the handle to `null`. It is
   called from `exitExam()`, `retakeExam()`, `submitExam()`, and `startExamTimer()`.

### Warning and urgent states

`updateExamTimerDisplay()` sets `.warning` on `#exam-timer` when ≤ 300 s remain
and `.urgent` when ≤ 60 s remain. To avoid announcing every one-second tick,
`#exam-timer` carries `aria-live="off"`. A persistent `#exam-timer-announce`
element (`aria-live="assertive"`, visually hidden) sits outside all exam panels
so it is never covered by a `hidden` attribute. It receives a one-time message
only when the state transitions from normal → warning or warning → urgent.

### Automatic submission

When the timer reaches zero, `submitExam({ timedOut: true })` is called. It sets
`examSession.timedOut = true`, skips the unanswered confirmation dialog, stops
the timer, and calls `showExamResults()`. The results view then shows
"Time expired — submitted automatically" in `#exam-result-status` rather than
"Submitted manually".

## File responsibilities

| File | Responsibility |
|------|----------------|
| `data/technician.json` | Source of truth for the Technician question pool. |
| `data/general.json` | Source of truth for the General question pool. |
| `data/extra.json` | Source of truth for the Extra question pool. |
| `src/index.html` | HTML template with placeholders (`__CSS__`, `__BANK__`, `__POOLS__`, `__FIGURES__`, `__GUIDE_IMAGE__`, `__ENGINE__`, `__STORAGE__`, `__JS__`); includes the `#study-shell` (top bar, `#study-scroll`, bottom bar), the `#settings-drawer`, the `#study-figure`/`#exam-figure` containers, the shared `#figure-viewer` modal, and the `#help`/`#getting-started` overlay pair. |
| `src/style.css` | All visual styles, including the responsive study shell, the settings drawer, and other responsive rules. |
| `src/exam-engine.js` | Question-selection engine (`selectExamQuestions`), pure and config-free — the caller passes in that pool's canonical registry entry. |
| `src/storage.js` | Stage 4A1 pure versioned-storage schema, validation, migration, reconciliation, and injected-storage adapter (`window.HAM_EXAM_STORAGE`); Stage 4A2 made it the app's only persistence path (see above). |
| `tests/storage.spec.js` | Stage 4A2 focused Chromium-only integration tests (tag `@storage`) for migration, canonical authority, stable-ID positions, failure modes, and memory-only exams; run via `playwright.storage.config.js` (`npm run test:storage`). The tests are outside the nine-project full matrix and the routine standalone selection (both defined in `playwright.config.js`/`playwright.routine.config.js`), but run as a dedicated phase in both the `npm test` release/deployment gate and `npm run test:routine`. |
| `src/app.js` | Application logic: navigation, timer, reveal, pause/resume, the settings drawer, and the study scroller. |
| `src/pwa/` | PWA metadata, install guidance, service worker source, and icons. |
| `assets/app-icon-master.png` | Master raster artwork used to derive platform icon sizes. |
| `assets/portable-radio-outdoors.jpg` | Stage 6A5: the Getting Started guide's one photo, inlined by `scripts/build.js`; resized, compressed, and stripped of all metadata (see the Help / About panel section above). |
| `scripts/build.js` | Replaces placeholders and writes `dist/index.html`. |
| `scripts/question-bank.js` | Stage 5B4: base question-bank schema validator (required/optional top-level fields, scalar types, `choices`/`correct`/`correctText`), the first build-time gate `loadPool()` runs. |
| `scripts/version-label.js` | Stage 5B1: derives the release-status display label from `package.json`'s version. |
| `scripts/check-generated.js` | Stage 5B2: dependency-free `dist/` freshness checker (`npm run test:generated`/`check:generated`). |
| `dist/index.html` | Final, deployable, single-file app. |
| `dist/pwa/` | Final installable application deployed by GitHub Pages. |
| `.github/workflows/verify-pr.yml` | Stage 5B2: pull-request CI (`test:routine` + `test:generated`, no deployment). |
| `.github/workflows/deploy-pages.yml` | Push-to-`main` CI: the full `npm test` gate, `test:generated`, then Pages deployment. |
| `playwright.routine.config.js` | Routine standalone selection: every test on 3 desktop engines plus tag-scoped mobile/tablet coverage (`npm run test:routine`). |
| `playwright.storage.config.js` | Dedicated `@storage` suite, chromium-desktop only (`npm run test:storage`). |
| `tests/unit/version-label.test.js` | Node `--test` direct unit tests for `deriveVersionDisplay` (beta/stable/non-beta-prerelease/malformed-input cases). |
| `tests/unit/check-generated.test.js` | Node `--test` unit tests for the `dist/` freshness checker, using isolated temporary Git repositories. |
| `tests/unit/workflow-policy.test.js` | Node `--test` static policy checks on both GitHub Actions workflows and the relevant `package.json` scripts. |
| `tests/unit/routine-routing.test.js` | Node `--test` policy checks (via real `playwright --list`, no browser) that the routine/full-matrix project routing has no duplicate test/project pairs and matches the documented tag policy. |
| `tests/unit/question-bank.test.js` | Stage 5B4: Node `--test` direct unit tests for `scripts/question-bank.js` — the real banks plus exhaustive synthetic positive/negative schema cases. |
| `tests/unit/exam-engine.test.js` | Node `--test` unit tests for the seeded RNG and `selectExamQuestions`, reading the real `data/pools.json` for pool configuration. |
| `tests/app.spec.js` | Playwright standalone study-mode, diagnostics, redaction, figure, figure-viewer, Help/About, and Getting Started guide tests. |
| `tests/exam-engine.spec.js` | Playwright integration check that the engine is inlined and startup still works. |
| `tests/mock-exam.spec.js` | Mock-exam setup, session, scoring, results, focus, legend, table, timer, and figure tests. |
| `tests/pwa.spec.js` | Manifest, icon, caching, offline, and request-boundary tests. |
| `tests/responsive-shell.spec.js` | L1 responsive study shell and settings-drawer tests: open/close/backdrop/Escape, focus containment and restoration, every relocated setting, current-pool sync, contextual Pause/Resume, study-scroll reset, figure-viewer scroll preservation, drawer/viewer exclusion, Help/exam transitions, no duplicate IDs, layout at 320×568/390×844/844×390 landscape, and reduced-motion behavior. |
| `playwright.config.js` | Standalone browser and viewport matrix; `@smoke`/`@compat`/`@responsive` tags. |
| `playwright.pwa.config.js` | Localhost server and browser projects for the hosted PWA suite. |

## Runtime behavior

1. The browser loads `dist/index.html`.
2. The first inline script defines `window.HAM_EXAM_VERSION`/`HAM_EXAM_VERSION_DISPLAY` and the global `HAM_EXAM_BANKS` object containing all three pools.
3. The next inline script defines `window.HAM_EXAM_POOLS` — the canonical pool identity and mock-exam configuration registry (Stage 4A0, extended Stage 5A).
4. The next inline script defines `window.HAM_EXAM_FIGURES` — the figure registry keyed by figure ID (`{ src: data URL, alt, w, h }`), one entry per figure.
5. The next inline script defines `window.HAM_EXAM_ENGINE` — the mock-exam selection engine only (`selectExamQuestions`, `seededRng`); since Stage 5A it carries no configuration data of its own (see "Exam configuration and the selection engine's dependency injection" above).
6. The next inline script defines `window.HAM_EXAM_STORAGE` (Stage 4A1), the versioned canonical-storage module.
7. The app IIFE constructs one storage adapter (`window.HAM_EXAM_STORAGE.createStorageAdapter(window.localStorage, <pools registry>, window.HAM_EXAM_BANKS)`) and calls `load()` once, resolving the canonical `ham-exam-state` document (or a safe in-memory default) as the single source of truth — the last-selected pool and current question are recovered from it as a stable question ID, not a raw index. It also initialises `window.HAM_EXAM_DIAGNOSTICS.examMode` to `"study"`.
8. **Study mode:** the user navigates with Previous/Next in the bottom bar, reveals answers, or bookmarks the current question in the middle scroller; Pool, Reveal delay, Theme, Mock Exam, Help & About, and Reset progress are reached through the settings drawer opened from the top bar's Menu button. Each navigation calls `persistState()`, which writes the canonical document (compare-before-write, so an unchanged state performs no write) — there is no direct `localStorage` access anywhere else in the app. Navigation also resets `#study-scroll`'s scroll position and updates `#current-pool-label`. If the question carries a `figure` ID, `renderStudyFigure()` shows the registry's inline PNG in the `#study-figure` container with its caption, manifest alt text, and an `Enlarge Figure <ID>` button that opens the shared `#figure-viewer` modal; otherwise the container and button are hidden and any prior image cleared. A visible Pause/Resume button appears beside the countdown only while a timed reveal is running or paused.
9. **Mock-exam setup:** clicking **Mock Exam** hides the study UI, shows the setup panel, and calls `openExamSetup()`. Every time setup opens, `#exam-pool-select` is set to the active study pool (`currentPool`) before `updateExamSetupMeta()` runs, so the element number, question count, passing score, effective dates, and the pool-specific default practice-timer value are all derived (from `window.HAM_EXAM_POOLS`) for the pool the user was studying. Focus moves to `#exam-pool-select`. The user may pick a different exam pool; that choice does not change the active study pool and is discarded if setup is cancelled and reopened.
10. **Mock-exam session:** clicking **Start Mock Exam** calls `selectExamQuestions(poolKey, BANKS, Math.random, window.HAM_EXAM_POOLS[poolKey])`, creates an in-memory `examSession`, hides the setup panel, shows the session panel, and moves focus to `#exam-session-heading`. The user answers questions with radio buttons and navigates with Previous/Next. Answers are stored only in the session object; nothing is written to `localStorage`. If the current question carries a `figure` ID, `renderExamFigure()` shows it in the `#exam-figure` container between the question text and the answer fieldset; navigation updates or clears it with no stale content.
11. **Exiting or finishing:** confirming **Exit** destroys the session, restores the study UI to exactly the state it was in before the exam began, returns `mode` to `"study"`, and — since Mock Exam is reached through the settings drawer — focuses the top bar's **Menu** button (the drawer's opener), not the button inside the now-closed drawer. Clicking **Finish Exam** submits the session and shows the results view (`mode = "results"`) with focus on `#exam-results-heading`. The review list renders a class-scoped figure inside each figure-bearing question's review item. From results, **Return to study** discards the session, restores study mode (including the study card's own figure), and focuses **Menu**; **Retake exam** starts a fresh session for the same pool and focuses the session heading.
12. No network is used at any point.

## Extending the app

- To change the UI, edit `src/style.css` and/or `src/index.html`.
- To change behavior, edit `src/app.js`.
- To change data, edit the relevant file under `data/`.
- Always run `npm run build` after source changes and commit `dist/index.html`.
- Commit the regenerated `dist/pwa/` directory as well.
