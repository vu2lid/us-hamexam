# Architecture

This document explains how the project is structured and why.

## Project origin

The original standalone HTML FCC Technician exam page was created by **Prem (VE6XMX / VU2XMX)**. The repository later added the modular source layout, generated release artifacts, compatibility fixes, PWA packaging, automated testing, diagnostics, and security controls described below. See [`AUTHORS.md`](../AUTHORS.md) for the authorship summary.

## Goal

Produce two offline-capable releases from one source: a self-contained local file (`dist/index.html`) and an HTTPS-hosted installable PWA (`dist/pwa/`). Both releases include Technician, General, and Extra question pools and let the user switch between them.

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

### Pool metadata

Human-readable pool metadata (element number, effective dates, NCVEC source URL, and errata note) is stored in a `POOL_META` object in `src/app.js`. The Help / About panel uses this object together with the embedded bank counts to render the pool reference list. `POOL_META` is a legacy runtime copy: the canonical, build-validated identity and metadata source is `data/pools.json` (next section); removing the duplication is scheduled for Stage 5.

### Canonical pool identity registry (Stage 4A0)

`data/pools.json` (`schemaVersion: 1`) is the canonical build-time registry of pool identities. Each of exactly three entries (`technician`, `general`, `extra`) carries `poolKey`, `displayName`, `editionId` (changes when NCVEC replaces the pool), `revisionId` (changes for errata within an edition), `element`, ISO `effectiveStart`/`effectiveEnd`, `expectedCount`, `questionIdPrefix`, `sourceUrl`, and `errataLabel`. The dependency-free validator `scripts/pool-registry.js` enforces the exact schema (unknown fields at either level are rejected), unique edition/revision identities, real calendar dates with start before end, counts equal to the loaded banks, and question ID format/prefix/uniqueness with `sub` consistency. It never mutates its inputs.

`scripts/build.js` loads the banks first (the Stage 2A figure-reference gate runs inside `loadPool`), then validates the registry, then runs the Stage 2D figure-manifest gate — all before the first `dist/` mutation, so a failed gate leaves any pre-existing `dist/` byte-identical. The validated public identity fields are embedded once per generated document as `window.HAM_EXAM_POOLS = {...};` via the same `asInlineScript()` serialization as the banks (no `JSON.parse` of `textContent`), through the `__POOLS__` placeholder in `src/index.html`. No build-only data (file paths, checksums, source-PDF references) is embedded. The embedded value is the bare pools map; the runtime storage consumer (`src/app.js`, below) wraps it into the storage module's canonical `{ pools: <map> }` registry shape at the single adapter-construction call site.

### Versioned storage module (Stage 4A1) and application integration (Stage 4A2)

`src/storage.js` is a dependency-free, ES5-only UMD-style module following the same pattern as `src/exam-engine.js`: `require()` in Node returns an object whose `HAM_EXAM_STORAGE` property is the API; in a browser it sets `window.HAM_EXAM_STORAGE`. Requiring or loading it performs no I/O and reads/writes no storage merely by being loaded — every real access happens through its adapter's `load()`/`save()`. It is inlined into both generated documents (`__STORAGE__` placeholder, after `__ENGINE__` and before `__JS__`).

**Stage 4A2 made the module live.** `src/app.js` constructs exactly one adapter at startup — `window.HAM_EXAM_STORAGE.createStorageAdapter(window.localStorage, <registry>, window.HAM_EXAM_BANKS)`, with the bare embedded pools map wrapped into the module's `{ pools: <map> }` registry shape — and calls `load()` once. The resolved canonical state is then the single source of truth in memory; there is no direct `localStorage` access anywhere else in the app (a build-gate test enforces both invariants on the generated documents). Startup behavior by `load()` status: `valid` — the state is used as-is and **never rewritten** (all mutation paths compare-before-write, so an unchanged startup performs zero canonical writes); `migrated`/`reconciled` — exactly one save commit is attempted, and a failed commit (quota, read-back mismatch) simply leaves the app running from memory, with the untouched legacy keys available for a rerun; `future-schema`/`unsupported-schema`/`storage-unavailable`/`read-error` — `writable:false`, the app runs entirely in memory from the resolved (safe-default) state and never attempts a save. The resolved status and writability are exposed non-visibly through `window.HAM_EXAM_DIAGNOSTICS.storage`, consistent with the existing diagnostics object. Persisted user mutations are pool change, question navigation, bookmark toggle, theme change, and reset progress; per-pool positions are stored as stable question IDs (`currentQuestionId` + `positions.all`), resolved to a bank index at render time with a first-question fallback. Reset progress resets every pool's position to its first question while preserving the active pool, all bookmarks, and the theme. Mock-exam sessions, answers, scores, and results remain memory-only — no persistence calls exist on any exam path, and Help / Mock Exam setup transitions change no stored state. Legacy keys are retained untouched as the rollback/migration input; they are never written, mirrored, or deleted by the app.

The module defines a canonical `schemaVersion: 1` state (key `ham-exam-state`) covering theme/recall/exam-timer preferences and, per pool, edition/revision identity, current question, bookmarks, a (currently `"all"`-only) study scope, and stable-ID positions — never copied question content. It provides: `createDefaultState`/`validateState`/`normalizeState` (strict vs. lenient schema handling); `migrateLegacy`, which converts the eight existing `ham-exam-*` legacy keys (read-only; never deleted or rewritten by this module) into canonical state, attributing migrated pools to the registry's current edition/revision; `reconcileState`, which retains valid IDs and bumps the revision on a same-edition errata update but hard-resets a pool's content on a replacement edition or rollback-build mismatch, even if the new bank reuses the same question ID strings; `resolveState`, the full state-precedence policy (a valid canonical state wins; absent/malformed/not-plausibly-schema-1 canonical data recovers from legacy; a newer schema is preserved untouched and returned read-only; an older/unrecognized schema gets the same read-only treatment rather than being silently treated as schema 1); and `createStorageAdapter(storageLike, registry, banks)`, an injected-storage adapter (never reaching for a global `localStorage` in core logic) that caches one availability probe, performs a canonical write as exactly one `setItem` verified by reading the value back and re-validating it before reporting success, and never overwrites a detected future-schema value. See [`docs/POOL_STORAGE_PLAN.md`](POOL_STORAGE_PLAN.md#stage-4a1-outcome-committed-as-b13b77e) for the complete schema, API, bounds, and verification detail.

### Help / About panel

A self-contained Help / About panel is included in the same HTML document. It is hidden by default and toggled via JavaScript, so opening Help requires no network request and works in the standalone file and the PWA.

Help is treated as a full in-page study view rather than a modal dialog. While Help is open, the whole study shell (`#study-shell` — top bar, middle scroller, bottom bar) and the settings drawer are hidden using the `hidden` attribute, which removes them from the accessibility tree and the keyboard tab order. Only Help navigation remains available: the Help panel and its `Back to study` control. Since `Help & About` itself lives inside the settings drawer (see the responsive shell section below), closing Help returns focus to the top bar's `Menu` button — the drawer's opener — rather than to the (now unreachable) button inside a closed drawer.

Opening Help pauses an active recall timer; closing Help resumes it. The current question, pool, theme, bookmark, and progress state are not changed. Pressing `Escape` while Help is open closes it and returns focus to the `Help & About` button. The `#help` URL fragment opens Help directly and scrolls to the top of the panel; the browser back button also closes Help.

### Visible startup diagnostics

The HTML contains a static startup status element and installs error handlers before loading the question bank. A successful initialization hides the status. If an Apple document preview suppresses JavaScript, the static element remains and directs the user to an HTTPS Safari page. If the bank is missing or startup throws an error, the page shows the failed stage, sanitized page URL, and sanitized error message instead of leaving an unexplained inert page. It deliberately does not include the browser user agent or other fingerprintable information.

`safeError()` sanitizes free-form error text with three ordered passes: any path-like `file:` URL is masked to the end of its line; a Windows drive-letter `Users` path (raw or with `%2F`/`%5C` separators) becomes `<drive>/Users/[user]`; and a POSIX `/home` or `/Users` path at a plausible absolute-path boundary becomes `/home/[user]` or `/Users/[user]`. Separators are matched literally and never decoded, so malformed sequences cannot throw and unrelated encoded prose and ordinary remote or nested paths pass through byte-for-byte. Privacy takes precedence when a supported local-path shape is embedded in another string, including a remote URL. This recognises the path shapes the project supports; it is not a promise to parse every possible path format, which is why the roadmap tracks a move to structured, allowlisted diagnostics.

## Mock-exam mode — Phase 1: exam configuration and selection engine

Phase 1 added the data model and selection logic underneath the mock-exam UI.
The setup, session, results, and practice-timer views built on top of it are
described in the Phase 2–4 sections below and are all shipping in the current
release.

### Exam configuration (`EXAM_CONFIG`)

`src/exam-engine.js` defines a single `EXAM_CONFIG` constant with one entry per
pool.  Each entry contains:

| Field | Description |
|-------|-------------|
| `poolKey` | Machine identifier (`"technician"`, `"general"`, `"extra"`) |
| `displayName` | Human-readable pool name |
| `element` | FCC element number (2, 3, 4) |
| `questionCount` | Required questions per FCC Part 97.503 |
| `passingScore` | Minimum correct answers per FCC Part 97.503 |
| `effectiveDateRange` | Pool validity window from NCVEC |
| `ncvecSource` | Official NCVEC pool download URL |
| `withdrawnIds` | Question IDs to exclude even if present in the JSON |
| `groupBlueprint` | Map of group identifier → questions to select from that group |

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
an entire group, both the JSON pool and `EXAM_CONFIG.groupBlueprint` must be
updated together.

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
<script> diagnostics bootstrap        </script>   (inline in template)
<script> __BANK__ (HAM_EXAM_BANKS)    </script>
<script> __FIGURES__ (HAM_EXAM_FIGURES) </script>
<script> __ENGINE__ (HAM_EXAM_ENGINE) </script>
<script> __JS__ (app IIFE)            </script>
<script> __PWA_JS__                   </script>
```

`exam-engine.js` sits between the bank data and the app IIFE so that the engine
is available before the app runs, but does not depend on the app. The figure
registry is a plain data assignment placed right after the banks. Every inline
`<script>` — the figure registry included — gets its own build-derived SHA-256
in the CSP.

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
progress (`localStorage` indices, bookmarks, pool) is unchanged by entering,
running, or exiting a mock exam.

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
| `passingScore` | From `EXAM_CONFIG[poolKey].passingScore` |
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

`EXAM_CONFIG` for each pool carries a `defaultTimeLimitSeconds` field (2100 s for
Technician and General; 3000 s for Extra). The setup panel exposes a
`#exam-timer-select` dropdown with options from 15 minutes to 60 minutes, plus
"No timer". The default is set from `EXAM_CONFIG` when the setup panel opens and
whenever the pool selection changes, unless the user has manually changed the
timer (tracked by `examTimerManuallySet`).

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
| `src/index.html` | HTML template with placeholders (`__CSS__`, `__BANK__`, `__POOLS__`, `__FIGURES__`, `__ENGINE__`, `__STORAGE__`, `__JS__`); includes the `#study-shell` (top bar, `#study-scroll`, bottom bar), the `#settings-drawer`, the `#study-figure`/`#exam-figure` containers, and the shared `#figure-viewer` modal. |
| `src/style.css` | All visual styles, including the responsive study shell, the settings drawer, and other responsive rules. |
| `src/exam-engine.js` | Exam configuration (`EXAM_CONFIG`) and question-selection engine. |
| `src/storage.js` | Stage 4A1 pure versioned-storage schema, validation, migration, reconciliation, and injected-storage adapter (`window.HAM_EXAM_STORAGE`); Stage 4A2 made it the app's only persistence path (see above). |
| `tests/storage.spec.js` | Stage 4A2 focused Chromium-only integration tests (tag `@storage`) for migration, canonical authority, stable-ID positions, failure modes, and memory-only exams; run via `playwright.storage.config.js` (`npm run test:storage`). The tests are outside the nine-project and 656-execution standalone selections, but run as a dedicated phase in both the `npm test` release/deployment gate and `npm run test:routine`. |
| `src/app.js` | Application logic: navigation, timer, reveal, pause/resume, the settings drawer, and the study scroller. |
| `src/pwa/` | PWA metadata, install guidance, service worker source, and icons. |
| `assets/app-icon-master.png` | Master raster artwork used to derive platform icon sizes. |
| `scripts/build.js` | Replaces placeholders and writes `dist/index.html`. |
| `dist/index.html` | Final, deployable, single-file app. |
| `dist/pwa/` | Final installable application deployed by GitHub Pages. |
| `tests/unit/exam-engine.test.js` | Node `--test` unit tests for `EXAM_CONFIG`, the seeded RNG, and `selectExamQuestions`. |
| `tests/app.spec.js` | Playwright standalone study-mode, diagnostics, redaction, figure, and figure-viewer tests. |
| `tests/exam-engine.spec.js` | Playwright integration check that the engine is inlined and startup still works. |
| `tests/mock-exam.spec.js` | Mock-exam setup, session, scoring, results, focus, legend, table, timer, and figure tests. |
| `tests/pwa.spec.js` | Manifest, icon, caching, offline, and request-boundary tests. |
| `tests/responsive-shell.spec.js` | L1 responsive study shell and settings-drawer tests: open/close/backdrop/Escape, focus containment and restoration, every relocated setting, current-pool sync, contextual Pause/Resume, study-scroll reset, figure-viewer scroll preservation, drawer/viewer exclusion, Help/exam transitions, no duplicate IDs, layout at 320×568/390×844/844×390 landscape, and reduced-motion behavior. |
| `playwright.config.js` | Standalone browser and viewport matrix; `@smoke`/`@compat`/`@responsive` tags. |
| `playwright.pwa.config.js` | Localhost server and browser projects for the hosted PWA suite. |

## Runtime behavior

1. The browser loads `dist/index.html`.
2. The first inline script defines the global `HAM_EXAM_BANKS` object containing all three pools.
3. The next inline script defines `window.HAM_EXAM_FIGURES` — the figure registry keyed by figure ID (`{ src: data URL, alt, w, h }`), one entry per figure.
4. The next inline script defines `window.HAM_EXAM_ENGINE` (exam configuration and selection engine).
5. The app IIFE reads the last selected pool and question index from `localStorage`, then loads that pool and renders the saved question. It also initialises `window.HAM_EXAM_DIAGNOSTICS.examMode` to `"study"`.
6. **Study mode:** the user navigates with Previous/Next in the bottom bar, reveals answers, or bookmarks the current question in the middle scroller; Pool, Reveal delay, Theme, Mock Exam, Help & About, and Reset progress are reached through the settings drawer opened from the top bar's Menu button. Each navigation stores the current index in `localStorage`, resets `#study-scroll`'s scroll position, and updates `#current-pool-label`. If the question carries a `figure` ID, `renderStudyFigure()` shows the registry's inline PNG in the `#study-figure` container with its caption, manifest alt text, and an `Enlarge Figure <ID>` button that opens the shared `#figure-viewer` modal; otherwise the container and button are hidden and any prior image cleared. A visible Pause/Resume button appears beside the countdown only while a timed reveal is running or paused.
6. **Mock-exam setup:** clicking **Mock Exam** hides the study UI, shows the setup panel, and calls `openExamSetup()`. Every time setup opens, `#exam-pool-select` is set to the active study pool (`currentPool`) before `updateExamSetupMeta()` runs, so the element number, question count, passing score, effective dates, and the pool-specific default practice-timer value are all derived from the pool the user was studying. Focus moves to `#exam-pool-select`. The user may pick a different exam pool; that choice does not change the active study pool and is discarded if setup is cancelled and reopened.
7. **Mock-exam session:** clicking **Start Mock Exam** calls `selectExamQuestions`, creates an in-memory `examSession`, hides the setup panel, shows the session panel, and moves focus to `#exam-session-heading`. The user answers questions with radio buttons and navigates with Previous/Next. Answers are stored only in the session object; nothing is written to `localStorage`. If the current question carries a `figure` ID, `renderExamFigure()` shows it in the `#exam-figure` container between the question text and the answer fieldset; navigation updates or clears it with no stale content.
8. **Exiting or finishing:** confirming **Exit** destroys the session, restores the study UI to exactly the state it was in before the exam began, returns `mode` to `"study"`, and — since Mock Exam is reached through the settings drawer — focuses the top bar's **Menu** button (the drawer's opener), not the button inside the now-closed drawer. Clicking **Finish Exam** submits the session and shows the results view (`mode = "results"`) with focus on `#exam-results-heading`. The review list renders a class-scoped figure inside each figure-bearing question's review item. From results, **Return to study** discards the session, restores study mode (including the study card's own figure), and focuses **Menu**; **Retake exam** starts a fresh session for the same pool and focuses the session heading.
9. No network is used at any point.

## Extending the app

- To change the UI, edit `src/style.css` and/or `src/index.html`.
- To change behavior, edit `src/app.js`.
- To change data, edit the relevant file under `data/`.
- Always run `npm run build` after source changes and commit `dist/index.html`.
- Commit the regenerated `dist/pwa/` directory as well.
