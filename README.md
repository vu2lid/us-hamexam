# FCC Ham Radio Study App

Offline study app for the **FCC Amateur Radio license exams** (Technician, General, and Extra), available as both a standalone HTML file and an installable web application.

Current release: **0.3.0-beta.4**

## Run the app — no setup required

**[Open Ham Exam](https://vu2lid.github.io/us-hamexam/)** to start studying immediately. No account, repository clone, or build tools are needed. You can install it from your browser for quick access; after the first successful load and caching, it works offline.

Prefer a standalone desktop copy? [Download the standalone HTML](https://github.com/vu2lid/us-hamexam/raw/refs/heads/main/dist/index.html), save it as `index.html`, and open it in your browser. On iPhone and iPad, use the hosted app in Safari instead of Files/Quick Look.

## Features

> **Project origin:** The original standalone HTML exam page was created by **Prem (VE6XMX / VU2XMX)**. The build system, browser-compatibility work, installable PWA, automated tests, security hardening, and other features were added later. See [AUTHORS.md](AUTHORS.md).

- **No internet required** after download.
- **Single HTML file** output — copy it to any device and open it in any browser.
- **Installable PWA** — add it to a phone, tablet, or desktop from an HTTPS-hosted copy.
- Works on desktop, mobile, iPad, Android, macOS, Ubuntu, Windows, etc.
- **Three question pools** embedded: Technician (2026–2030), General (2023–2027), and Extra (2024–2028).
- A compact top bar, a scrollable study area, and a compact bottom bar (Previous / Reveal Now / Next) keep the screen content-first on phones, tablets, and desktops alike, with a centered reading column on larger screens.
- Configurable recall timer (5/10/15/20/30/60 seconds, or Never), with a Pause / Resume control shown only while a timed reveal is running or paused.
- **Menu** opens a slide-in settings drawer for Pool, Study scope, Reveal delay, Theme, Mock Exam, Help & About, and Reset progress.
- Switch pools instantly from the settings drawer; the active pool name is always shown next to Menu.
- **Study scope** narrows study to a subelement or group; it is temporary and always starts at "All questions" on reload.
- Your position in "All questions" is saved per pool in `localStorage`, so you pick up where you left off; browsing inside a Study scope never overwrites that saved position.
- Choose from Light, Dark, and Night themes; your choice is saved in `localStorage`.
- Reset progress for all pools from the settings drawer (requires confirmation).
- Bookmark individual questions per pool; bookmarks are saved in `localStorage` and survive reloads.
- **Figure questions** — questions that reference an official NCVEC diagram display that figure (labelled with its number) below the question in study mode, in active mock-exam questions, and in the results review. An **Enlarge Figure** button opens a larger viewer with *Fit to window* and *Actual size* views (Actual size scrolls); Close or Esc returns to the button. Timers keep running while the viewer is open. The 14 required diagrams are embedded in the file, so they work fully offline. Adjustable zoom, pinch gestures, and drag-to-pan are deferred.
- Open the built-in Help & About page for usage guidance, pool sources, installation steps, privacy notes, and troubleshooting.
- **Mock Exam** — choose a pool, see its element, question count, passing score, and effective date, then start a balanced practice session, submit your answers, and review your score with a subelement breakdown. Exam sessions and results are kept in memory only.
- Installs as **Ham Exam** with local icons and standalone display mode, and automatically caches the complete PWA shell for offline reloads.
- Displays startup diagnostics if the embedded data or JavaScript cannot initialize.

## Question pool source

The question banks are the public-domain pools published by the NCVEC Question Pool Committee:

- [Technician 2026–2030](https://ncvec.org/index.php/2026-2030-technician-question-pool) (Element 2, 409 questions, February 19, 2026 errata)
- [General 2023–2027](https://ncvec.org/index.php/2023-2027-general-question-pool-release) (Element 3, 423 questions, 6th errata February 4, 2026)
- [Extra 2024–2028](https://ncvec.org/index.php/2024-2028-extra-class-question-pool-release) (Element 4, 599 questions, 4th errata February 4, 2026)

The PDFs are downloaded from the official NCVEC website and converted to JSON by `scripts/extract-pool.js`.

## Quick start

Open the built file in any browser:

```bash
open dist/index.html        # macOS
xdg-open dist/index.html    # Linux
double-click dist/index.html # Windows
```

Or copy `dist/index.html` to your phone/tablet and open it from the file manager.

Apple Files and Quick Look do not run the app JavaScript. For iPhone and iPad, use the installable HTTPS version described below.

## Install as an application

The build creates an installable PWA under `dist/pwa/`. Host that directory over HTTPS; the included GitHub Pages workflow deploys it on every push to `main` after Pages is configured.

Use the ready-to-run app at **https://vu2lid.github.io/us-hamexam/**. The hosting instructions below are for contributors who want to deploy their own copy.

On iPhone or iPad:

1. Open the HTTPS URL in Safari.
2. Open Safari's Share menu.
3. Choose **Add to Home Screen**.
4. Enable **Open as Web App**, then choose **Add**.
5. Launch **Ham Exam** from its Home Screen icon.

After the first successful load, the service worker caches the complete application and question bank for offline use.

### Enable GitHub Pages

1. Push this repository to GitHub.
2. Open **Settings → Pages** in the GitHub repository.
3. Set **Source** to **GitHub Actions**.
4. Push to `main` or run the **Verify and deploy GitHub Pages** workflow manually.

## Development

### Project layout

```
us-hamexam/
├── data/
│   ├── technician.json      # Technician question pool (JSON)
│   ├── general.json         # General question pool (JSON)
│   └── extra.json           # Extra question pool (JSON)
├── src/
│   ├── index.html           # HTML template
│   ├── style.css            # Styles
│   ├── app.js               # Application logic
│   └── pwa/                 # PWA manifest, worker, install UI, and icons
├── assets/
│   └── app-icon-master.png  # Master application icon
├── scripts/
│   └── build.js             # Builds dist/index.html
├── dist/
│   ├── index.html           # Generated single-file app
│   └── pwa/                 # Generated installable app
├── package.json
└── README.md
```

### Build

You only need Node.js to rebuild both release targets:

```bash
npm run build
```

This creates the self-contained `dist/index.html` and the installable `dist/pwa/` application. Both contain the same question bank and application logic.

### Edit the app

1. Modify files under `src/` or `data/`.
2. Run `npm run build`.
3. Open `dist/index.html` to test.

### Test

```bash
npm test          # full release gate: build + Node unit tests + standalone matrix (9 browser/viewport combos) + @storage + PWA
npm run test:unit # Node unit tests across the engine, build gates, figures, pool registry, storage, and CI/config policy (no browser required, fast)
npm run test:smoke     # build + smoke tests on chromium-desktop only
npm run test:compat    # build + compat tests on chromium/firefox/webkit desktop + webkit mobile
npm run test:responsive # build + responsive tests on chromium/webkit mobile and tablet
npm run test:full      # alias for npm test (build + unit + standalone + @storage + PWA)
npm run test:routine   # build + unit + every standalone test on 3 desktop engines + targeted mobile/tablet + @storage + PWA -- a smaller, audited alternative to npm test for routine local/PR use
npm run test:generated # confirms dist/ exactly matches what Git has committed (no rebuild)
```

`test:unit` runs several dependency-free Node test files (`tests/unit/*.test.js`) covering pure logic and build-time validation: the exam-selection engine (loaded from `src/exam-engine.js` in a VM context — configuration values, seeded determinism, group balancing, withdrawn IDs, duplicate prevention, malformed input, insufficient groups, source-bank immutability), the figure-reference and figure-manifest build gates, the pool-identity/mock-exam registry validator, the versioned-storage module, and (Stage 5B2/5B3) the generated-artifact freshness checker and the CI-workflow/test-routing policy checks — none require Playwright or a browser. See [`docs/TESTING.md`](docs/TESTING.md) for the full file-by-file breakdown.

Tagged subsets (`@smoke`, `@compat`, `@responsive`) run only the matched tests in the selected Playwright projects. Every standalone test, tagged or not, always runs in the full matrix (`npm test` / `test:standalone`) and in `test:routine`'s three desktop-engine projects; only the additional webkit-mobile/chromium-mobile/chromium-tablet/webkit-tablet coverage in `test:routine` is tag-scoped to `@compat`/`@responsive`.

Pull requests are automatically verified by a dedicated GitHub Actions workflow running `test:routine` plus `test:generated` (not the full matrix); the push-to-`main` deployment workflow keeps running the full `npm test` gate plus `test:generated`. See [`docs/TEST_EFFICIENCY_PLAN.md`](docs/TEST_EFFICIENCY_PLAN.md) and [`docs/TESTING.md`](docs/TESTING.md) for the full test matrix, CI policy, and project details.

### Versioning and bug reports

The release version is maintained in `package.json` and inserted into both generated applications during the build. Testers can find it in the footer at the bottom of the page.

This project uses semantic versions. Beta builds use versions such as `0.1.0-beta.1`; increase the final number for each beta build, and use `1.0.0` for the first stable release.

When reporting a bug, use the repository's **Beta bug report** issue form. Include the displayed version, device model, operating-system version, browser, whether the app was installed or opened in a browser, and a screenshot of any startup message. Do not include private account information or unredacted filesystem paths.

## Documentation

- [`AUTHORS.md`](AUTHORS.md) — original authorship and subsequent contributions.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — project structure and design decisions.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — prioritized defects, feature milestones, and continuous-improvement process.
- [`docs/RELEASE_NOTES_0.3.0-beta.2.md`](docs/RELEASE_NOTES_0.3.0-beta.2.md) — an earlier beta release.
- [`docs/RELEASE_NOTES_0.3.0-beta.3.md`](docs/RELEASE_NOTES_0.3.0-beta.3.md) — the previous beta release.
- [`docs/RELEASE_NOTES_0.3.0-beta.4.md`](docs/RELEASE_NOTES_0.3.0-beta.4.md) — this release's highlights, verification, and known limitations.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — staged delivery checklists, release gates, and session handoff log.
- [`docs/TESTING.md`](docs/TESTING.md) — testing guide and command reference.
- [`SECURITY.md`](SECURITY.md) — data handling, implemented controls, and residual risks.
- [`AGENTS.md`](AGENTS.md) — guide for AI agents and contributors.

## Apple device troubleshooting

Chrome's device toolbar simulates screen dimensions but does not run Safari. The automated suite therefore includes WebKit mobile and tablet configurations and loads the app directly through a local `file://` URL.

On macOS, open `dist/index.html` with Safari rather than a document-preview application. On iPhone or iPad, Files, Mail, and Quick Look can render the static HTML while suppressing its JavaScript. In that case the page remains on “Starting the study app…” and “Loading questions…”, and the controls cannot work. Open the hosted PWA URL in Safari and install it from the Share menu instead.

If the page opens in Safari but still does not start, send a screenshot of the startup message along with the device model, OS version, page URL, and how the file reached the device. The page reports its startup stage, sanitized page URL, and sanitized error details when JavaScript runs but initialization fails.

Linux WebKit testing is useful but is not identical to Safari shipped by Apple. A real-device or cloud-device Safari check remains part of the release checklist.

## License

The application code is available under the [MIT License](LICENSE). The NCVEC question pool is in the public domain as described above.
