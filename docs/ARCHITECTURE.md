# Architecture

This document explains how the project is structured and why.

## Project origin

The original standalone HTML FCC Technician exam page was created by **Prem (VE6XMX / VU2XMX)**. The repository later added the modular source layout, generated release artifacts, compatibility fixes, PWA packaging, automated testing, diagnostics, and security controls described below. See [`AUTHORS.md`](../AUTHORS.md) for the authorship summary.

## Goal

Produce two offline-capable releases from one source: a self-contained local file (`dist/index.html`) and an HTTPS-hosted installable PWA (`dist/pwa/`).

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
src/style.css    →  <style>...</style>
data/questions.json  →  <script>window.HAM_EXAM_BANK = [...];</script>
src/app.js       →  <script>...</script>
```

This keeps the source maintainable while producing a single-file release.

### Installable PWA output

The same build also writes `dist/pwa/`. Its HTML still inlines the CSS, application logic, and complete question bank, while local companion files provide the web app manifest, service worker, and platform icon sizes. All URLs are relative so the directory works at a GitHub Pages project path or another static HTTPS host.

The service worker uses a content-derived cache version. It precaches the complete shell during installation, removes older Ham Exam caches during activation, uses network-first navigation when online, and falls back to the cached `index.html` offline.

### Content Security Policy

The build hashes every inline script after templating and injects an early CSP meta element. The standalone policy denies all network connections and workers. The PWA permits only same-origin application resources, connections, manifest, and worker scripts. Inline styles remain enabled because the build embeds CSS and the runtime makes limited style changes; inline scripts require an exact SHA-256 match.

### Question bank as a JS array literal

The build embeds questions as an explicit `window.HAM_EXAM_BANK = [...]` assignment instead of using `JSON.parse` on a `<script type="application/json">` tag. Potential script-closing characters and JavaScript line separators are escaped at build time. This avoids reading inline JSON through `textContent`, which caused the app to fail silently on some iPads.

### Visible startup diagnostics

The HTML contains a static startup status element and installs error handlers before loading the question bank. A successful initialization hides the status. If an Apple document preview suppresses JavaScript, the static element remains and directs the user to an HTTPS Safari page. If the bank is missing or startup throws an error, the page shows the failed stage, page URL, browser user agent, and error instead of leaving an unexplained inert page.

## File responsibilities

| File | Responsibility |
|------|----------------|
| `data/questions.json` | Source of truth for the 409-question bank. |
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
2. The first inline script defines the global `HAM_EXAM_BANK` array.
3. The second inline script (the app IIFE) initializes state and renders the first question.
4. The user navigates with Previous/Next, reveals answers, or changes the timer.
5. All state is kept in memory; no storage or network is used.

## Extending the app

- To change the UI, edit `src/style.css` and/or `src/index.html`.
- To change behavior, edit `src/app.js`.
- To change data, edit `data/questions.json`.
- Always run `npm run build` after source changes and commit `dist/index.html`.
- Commit the regenerated `dist/pwa/` directory as well.
