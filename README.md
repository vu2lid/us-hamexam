# FCC Technician Ham Radio Study App

Offline study app for the **FCC Technician Class Amateur Radio exam (2026–2030)**, available as both a standalone HTML file and an installable web application.

Current release: **0.1.0-beta.1**

> **Project origin:** The original standalone HTML exam page was created by **Prem (VE6XMX / VU2XMX)**. The build system, browser-compatibility work, installable PWA, automated tests, security hardening, and other features were added later. See [AUTHORS.md](AUTHORS.md).

- **No internet required** after download.
- **Single HTML file** output — copy it to any device and open it in any browser.
- **Installable PWA** — add it to a phone, tablet, or desktop from an HTTPS-hosted copy.
- Works on desktop, mobile, iPad, Android, macOS, Ubuntu, Windows, etc.
- All 409 Technician questions are embedded.

## Question pool source

The question bank is based on the [NCVEC 2026–2030 Technician Class question pool](https://ncvec.org/index.php/2026-2030-technician-question-pool), including the February 19, 2026 errata. The NCVEC Question Pool Committee released this pool into the public domain. It is effective from July 1, 2026 through June 30, 2030.

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

The GitHub Pages URL follows this pattern:

```text
https://<github-user>.github.io/<repository>/
```

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
│   └── questions.json       # Question bank (JSON)
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
npm test
```

This rebuilds both release targets, runs the standalone matrix across Chromium, Firefox, and WebKit, and verifies PWA installation assets, caching, offline behavior, and WebKit loading. See [`docs/TESTING.md`](docs/TESTING.md) for details.

### Versioning and bug reports

The release version is maintained in `package.json` and inserted into both generated applications during the build. Testers can find it in the footer at the bottom of the page.

This project uses semantic versions. Beta builds use versions such as `0.1.0-beta.1`; increase the final number for each beta build, and use `1.0.0` for the first stable release.

When reporting a bug, use the repository's **Beta bug report** issue form. Include the displayed version, device model, operating-system version, browser, whether the app was installed or opened in a browser, and a screenshot of any startup message. Do not include private account information or unredacted filesystem paths.

## Documentation

- [`AUTHORS.md`](AUTHORS.md) — original authorship and subsequent contributions.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — project structure and design decisions.
- [`docs/TESTING.md`](docs/TESTING.md) — testing guide and command reference.
- [`SECURITY.md`](SECURITY.md) — data handling, implemented controls, and residual risks.
- [`AGENTS.md`](AGENTS.md) — guide for AI agents and contributors.

## Features

- One question at a time.
- Configurable recall timer (5/10/15/20/30/60 seconds, or never).
- Pause / Resume timer.
- Reveal answer immediately.
- Previous / Next navigation.
- Progress indicator.
- Works offline with zero external dependencies.
- Installs as **Ham Exam** with local icons and standalone display mode.
- Automatically caches the complete PWA shell for offline reloads.
- Displays startup diagnostics if the embedded data or JavaScript cannot initialize.

## Apple device troubleshooting

Chrome's device toolbar simulates screen dimensions but does not run Safari. The automated suite therefore includes WebKit mobile and tablet configurations and loads the app directly through a local `file://` URL.

On macOS, open `dist/index.html` with Safari rather than a document-preview application. On iPhone or iPad, Files, Mail, and Quick Look can render the static HTML while suppressing its JavaScript. In that case the page remains on “Starting the study app…” and “Loading questions…”, and the controls cannot work. Open the hosted PWA URL in Safari and install it from the Share menu instead.

If the page opens in Safari but still does not start, send a screenshot of the startup message along with the device model, OS version, page URL, and how the file reached the device. The page reports its startup stage and browser information when JavaScript runs but initialization fails.

Linux WebKit testing is useful but is not identical to Safari shipped by Apple. A real-device or cloud-device Safari check remains part of the release checklist.

## License

The application code is available under the [MIT License](LICENSE). The NCVEC question pool is in the public domain as described above.
