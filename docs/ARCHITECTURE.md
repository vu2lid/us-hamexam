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
src/app.js                            →  <script>...</script>
```

This keeps the source maintainable while producing a single-file release.

### Installable PWA output

The same build also writes `dist/pwa/`. Its HTML still inlines the CSS, application logic, and complete question bank, while local companion files provide the web app manifest, service worker, and platform icon sizes. All URLs are relative so the directory works at a GitHub Pages project path or another static HTTPS host.

The service worker uses a content-derived cache version. It precaches the complete shell during installation, removes older Ham Exam caches during activation, uses network-first navigation when online, and falls back to the cached `index.html` offline.

### Content Security Policy

The build hashes every inline script after templating and injects an early CSP meta element. The standalone policy denies all network connections and workers. The PWA permits only same-origin application resources, connections, manifest, and worker scripts. Inline styles remain enabled because the build embeds CSS and the runtime makes limited style changes; inline scripts require an exact SHA-256 match.

### Question banks as a JS object literal

The build embeds all three pools as an explicit `window.HAM_EXAM_BANKS = { technician: {...}, general: {...}, extra: {...} }` assignment instead of using `JSON.parse` on a `<script type="application/json">` tag. Potential script-closing characters and JavaScript line separators are escaped at build time. This avoids reading inline JSON through `textContent`, which caused the app to fail silently on some iPads.

### Pool metadata

Human-readable pool metadata (element number, effective dates, NCVEC source URL, and errata note) is stored in a single `POOL_META` object in `src/app.js`. The Help / About panel uses this object together with the embedded bank counts to render the pool reference list. Keeping the metadata in one place avoids duplication between documentation, the UI, and tests.

### Help / About panel

A self-contained Help / About panel is included in the same HTML document. It is hidden by default and toggled via JavaScript, so opening Help requires no network request and works in the standalone file and the PWA.

Help is treated as a full in-page study view rather than a modal dialog. While Help is open, the study question card, footer, and the study control groups (Navigation, Study actions, Study settings, Progress) are hidden using the `hidden` attribute, which removes them from the accessibility tree and the keyboard tab order. Only Help navigation remains available: the Help panel, its `Back to study` control, and the header's `Help & About` button. The Help button stays visible so the user knows where focus returns.

Opening Help pauses an active recall timer; closing Help resumes it. The current question, pool, theme, bookmark, and progress state are not changed. Pressing `Escape` while Help is open closes it and returns focus to the `Help & About` button. The `#help` URL fragment opens Help directly and scrolls to the top of the panel; the browser back button also closes Help.

### Visible startup diagnostics

The HTML contains a static startup status element and installs error handlers before loading the question bank. A successful initialization hides the status. If an Apple document preview suppresses JavaScript, the static element remains and directs the user to an HTTPS Safari page. If the bank is missing or startup throws an error, the page shows the failed stage, sanitized page URL, and sanitized error message instead of leaving an unexplained inert page. It deliberately does not include the browser user agent or other fingerprintable information.

## Mock-exam mode — Phase 1: exam configuration and selection engine

Phase 1 adds the data model and selection logic needed for a future mock-exam UI.
No mock-exam UI is included yet.

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

The build now inlines four scripts in this order:

```
<script> diagnostics bootstrap     </script>   (inline in template)
<script> __BANK__ (HAM_EXAM_BANKS) </script>
<script> __ENGINE__ (HAM_EXAM_ENGINE) </script>
<script> __JS__ (app IIFE)         </script>
<script> __PWA_JS__                </script>
```

`exam-engine.js` sits between the bank data and the app IIFE so that the engine
is available before the app runs, but does not depend on the app.

## File responsibilities

| File | Responsibility |
|------|----------------|
| `data/technician.json` | Source of truth for the Technician question pool. |
| `data/general.json` | Source of truth for the General question pool. |
| `data/extra.json` | Source of truth for the Extra question pool. |
| `src/index.html` | HTML template with placeholders (`__CSS__`, `__BANK__`, `__ENGINE__`, `__JS__`). |
| `src/style.css` | All visual styles, including responsive rules. |
| `src/exam-engine.js` | Exam configuration (`EXAM_CONFIG`) and question-selection engine. |
| `src/app.js` | Application logic: navigation, timer, reveal, pause/resume. |
| `src/pwa/` | PWA metadata, install guidance, service worker source, and icons. |
| `assets/app-icon-master.png` | Master raster artwork used to derive platform icon sizes. |
| `scripts/build.js` | Replaces placeholders and writes `dist/index.html`. |
| `dist/index.html` | Final, deployable, single-file app. |
| `dist/pwa/` | Final installable application deployed by GitHub Pages. |
| `tests/app.spec.js` | Playwright tests for cross-browser behavior. |
| `tests/exam-engine.spec.js` | Selection-engine configuration and correctness tests. |
| `tests/pwa.spec.js` | Manifest, icon, caching, offline, and request-boundary tests. |
| `playwright.config.js` | Browser and viewport matrix for tests. |

## Runtime behavior

1. The browser loads `dist/index.html`.
2. The first inline script defines the global `HAM_EXAM_BANKS` object containing all three pools.
3. The second inline script defines `window.HAM_EXAM_ENGINE` (exam configuration and selection engine).
4. The third inline script (the app IIFE) reads the last selected pool and question index from `localStorage`, then loads that pool and renders the saved question.
5. The user navigates with Previous/Next, reveals answers, changes the timer, switches pools with the dropdown, or bookmarks the current question.
6. Each navigation stores the current index for the active pool in `localStorage`. Bookmarked question IDs are stored separately per pool (`ham-exam-bookmarks-<pool>`) and are not affected by the reset-progress control.
7. No network is used.

## Extending the app

- To change the UI, edit `src/style.css` and/or `src/index.html`.
- To change behavior, edit `src/app.js`.
- To change data, edit the relevant file under `data/`.
- Always run `npm run build` after source changes and commit `dist/index.html`.
- Commit the regenerated `dist/pwa/` directory as well.
