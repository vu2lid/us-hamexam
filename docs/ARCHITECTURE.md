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

### Visible startup diagnostics

The HTML contains a static startup status element and installs error handlers before loading the question bank. A successful initialization hides the status. If an Apple document preview suppresses JavaScript, the static element remains and directs the user to an HTTPS Safari page. If the bank is missing or startup throws an error, the page shows the failed stage, sanitized page URL, and sanitized error message instead of leaving an unexplained inert page. It deliberately does not include the browser user agent or other fingerprintable information.

## File responsibilities

| File | Responsibility |
|------|----------------|
| `data/technician.json` | Source of truth for the Technician question pool. |
| `data/general.json` | Source of truth for the General question pool. |
| `data/extra.json` | Source of truth for the Extra question pool. |
| `src/index.html` | HTML template with placeholders (`__CSS__`, `__BANK__`, `__JS__`). |
| `src/style.css` | All visual styles, including responsive rules. |
| `src/app.js` | Application logic: navigation, timer, reveal, pause/resume. |
| `src/pwa/` | PWA metadata, install guidance, service worker source, and icons. |
| `assets/app-icon-master.png` | Master raster artwork used to derive platform icon sizes. |
| `scripts/build.js` | Replaces placeholders and writes `dist/index.html`. |
| `dist/index.html` | Final, deployable, single-file app. |
| `dist/pwa/` | Final installable application deployed by GitHub Pages. |
| `tests/app.spec.js` | Playwright tests for cross-browser behavior. |
| `tests/pwa.spec.js` | Manifest, icon, caching, offline, and request-boundary tests. |
| `playwright.config.js` | Browser and viewport matrix for tests. |

## Runtime behavior

1. The browser loads `dist/index.html`.
2. The first inline script defines the global `HAM_EXAM_BANKS` object containing all three pools.
3. The second inline script (the app IIFE) reads the last selected pool and question index from `localStorage`, then loads that pool and renders the saved question.
4. The user navigates with Previous/Next, reveals answers, changes the timer, switches pools with the dropdown, or bookmarks the current question.
5. Each navigation stores the current index for the active pool in `localStorage`. Bookmarked question IDs are stored separately per pool (`ham-exam-bookmarks-<pool>`) and are not affected by the reset-progress control.
6. No network is used.

## Extending the app

- To change the UI, edit `src/style.css` and/or `src/index.html`.
- To change behavior, edit `src/app.js`.
- To change data, edit the relevant file under `data/`.
- Always run `npm run build` after source changes and commit `dist/index.html`.
- Commit the regenerated `dist/pwa/` directory as well.
