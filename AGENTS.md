# Agent Guide for `us-hamexam`

This document is for AI agents (and human contributors) working on the FCC Technician Ham Radio study app.

## Project purpose

An offline-first web app for studying the FCC Technician Class Amateur Radio exam (2026–2030). The build produces a self-contained HTML file for desktop/local-file use and an installable PWA for HTTPS hosting, Apple Home Screen installation, and offline use after the first load.

## Repository layout

```
us-hamexam/
├── data/
│   └── questions.json       # 409-question bank (source of truth)
├── src/
│   ├── index.html           # HTML template with placeholders
│   ├── style.css            # Styles
│   ├── app.js               # Vanilla JS application logic
│   └── pwa/                 # Manifest, service worker, install UI, and icons
├── assets/
│   └── app-icon-master.png  # Master application icon
├── scripts/
│   └── build.js             # Inlines src/ + data/ into dist/index.html
├── dist/
│   ├── index.html           # Generated single-file release artifact
│   └── pwa/                 # Generated installable web application
├── tests/
│   ├── app.spec.js          # Standalone cross-browser/viewport tests
│   └── pwa.spec.js          # Install, cache, and offline tests
├── playwright.config.js     # Standalone test configuration
├── playwright.pwa.config.js # Hosted PWA test configuration
├── package.json
├── README.md
└── AGENTS.md                # This file
```

## Key constraints

1. **Preserve the standalone artifact.** Everything required by `dist/index.html` must remain inlined.
2. **Keep the PWA installable and offline.** `dist/pwa/` may contain its manifest, service worker, and local icons. It must make no external runtime requests.
3. **No external dependencies.** Do not add CDN links, external fonts, images, or API calls.
4. **No frameworks.** Keep the runtime as vanilla HTML/CSS/JS so it works on old/low-resource devices.
5. **Cross-platform.** The app must work on desktop Chrome/Firefox/Edge/Safari and mobile WebKit (iOS/iPad/Android).
6. **Offline.** The standalone file works immediately offline; the PWA works offline after its first successful HTTPS load.

## Common commands

```bash
# Build the standalone file and installable PWA
npm run build

# Run cross-browser tests (builds first)
npm test

# Install/update Playwright browsers after a fresh clone
npx playwright install chromium firefox webkit
```

## How to make changes

1. Edit source files under `src/` or `data/`.
2. Run `npm run build` to regenerate `dist/index.html` and `dist/pwa/`.
3. Run `npm test` to verify across browsers and viewports.
4. Commit source changes and both regenerated release targets.

## What to watch out for

- **iOS/Safari compatibility:** Avoid `JSON.parse` on `textContent` of `<script type="application/json">`; Safari/WebKit can garble UTF-8 characters. The current build embeds the question bank as an explicit `window.HAM_EXAM_BANK` assignment.
- **Apple file previews:** Files/Quick Look can render HTML without running JavaScript. iPhone and iPad users should use the HTTPS PWA in Safari.
- **PWA scope:** Keep manifest, service-worker, icon, and registration URLs relative so GitHub Pages project paths work.
- **Touch targets:** Keep buttons and interactive elements large enough for touch (minimum ~44×44 px).
- **Viewport:** Do not break the responsive layout; test mobile/tablet/desktop viewports.
- **File size:** Keep `dist/index.html` reasonably small. Minify JSON and CSS where possible.
- **Question bank format:** Each entry must have `id`, `sub`, `q`, `choices` (object with A/B/C/D), `correct` (letter), `correctText`, and `ref`.

## Adding or editing questions

1. Modify `data/questions.json`.
2. Run `npm run build`.
3. Verify the question count and a few samples in `dist/index.html`.

## Adding features

- Keep changes minimal and scoped.
- Prefer vanilla JS over libraries.
- If a new feature requires data, add it to the question bank or inline it at build time.
- Update `tests/app.spec.js` and `README.md` if user-facing behavior changes.

## Testing checklist before finishing

- [ ] `npm run build` succeeds.
- [ ] `npm test` passes all browser/viewport combinations.
- [ ] `dist/index.html` has no external `<link>` or `<script src>` references.
- [ ] `dist/pwa/manifest.webmanifest`, `sw.js`, and all icons are present.
- [ ] The PWA installs its service worker and caches the complete app shell.
- [ ] The app loads and the first question displays.
- [ ] Navigation, reveal, pause/resume, and timer settings still work.
