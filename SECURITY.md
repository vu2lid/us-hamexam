# Security and Privacy

## Data handling

Ham Exam is a static study application. It has no accounts, forms, analytics, advertising, telemetry, cookies, or API calls. It does not request location, camera, microphone, contacts, clipboard, notification, or other device permissions.

Study state is held in memory while the app is open. For convenience, a small set of non-sensitive preferences is stored in the browser's localStorage so the user can resume where they left off after closing the page. Since Stage 4A2 this is one canonical, versioned `ham-exam-state` document (`schemaVersion: 1`) holding:

- the selected question pool and, per pool, the current question as a stable question ID (not a positional index, so pool errata or reordering cannot silently apply progress to the wrong question);
- the selected theme (Light, Dark, or Night);
- the per-pool bookmark list, keyed by stable question ID;
- the study recall (reveal) delay and the preferred mock-exam practice-timer duration (Stage 4A3) — the timer preference is either "use the selected pool's default" or one fixed duration applied to every pool; it never stores which pool it applies to and never affects an exam already in progress.

The pre-versioning legacy keys (`ham-exam-pool`, `ham-exam-theme`, `ham-exam-index-<pool>`, `ham-exam-bookmarks-<pool>`) are retained untouched as the one-time migration input and rollback path; the app never writes, mirrors, or deletes them. Migration is atomic (one read-back-verified write of the complete document), idempotent, and refuses to overwrite a stored document with a newer (or older unsupported) schema version — such values are left untouched and the app runs read-only in memory for that session. When storage is unavailable, throws, or fails mid-write, the app keeps running entirely from in-memory state and never disturbs what is stored.

Mock-exam sessions, selected answers, and scored results are never written to localStorage; they exist only in memory and are discarded on reload or when the exam is exited. The installable PWA also stores its public application shell, icons, manifest, and embedded public question bank in browser Cache Storage. The app does not store user-created content or personal information.

The app itself makes no cross-origin runtime requests. When the PWA is hosted, the hosting provider may process ordinary connection metadata such as IP address, browser headers, and access time under that provider's own privacy terms.

## Implemented controls

- Both release targets receive a build-generated Content Security Policy.
- Inline JavaScript is allowlisted by SHA-256 content hashes; arbitrary inline script is not enabled.
- The PWA restricts resources, connections, workers, and its manifest to the same origin.
- The standalone artifact denies network connections and workers.
- Question text is rendered with `textContent`, not HTML interpretation.
- Inline question-bank data escapes script-closing characters and JavaScript line separators.
- The service worker has an explicit relative scope, caches only a fixed public app shell, and removes superseded Ham Exam caches.
- GitHub Actions use pinned action revisions and only the permissions needed for Pages deployment.
- Runtime diagnostics remove supported local path information from visible and copied failure text — `file:` URLs, POSIX `/home` and `/Users` paths, and Windows drive-letter `Users` paths, including percent-encoded separators — and do not display the browser user-agent or other browser fingerprints. This is best-effort sanitization of recognised path shapes in free-form error text, not a guarantee that every possible path format is parsed.
- The production dependency set is empty; Playwright is development-only.

## Repository metadata

Published commits use the GitHub noreply identity `vu2lid <2585372+vu2lid@users.noreply.github.com>`. The repository-local Git configuration uses the same identity for future commits. Contributors should review their own Git identity before committing if they do not want an email address included in public history.

## Residual limitations

- GitHub Pages does not provide project-controlled response headers through this repository. CSP is therefore delivered with an early HTML `<meta>` element. The `frame-ancestors` directive cannot be enforced that way.
- Styles allow inline CSS because the standalone build embeds its stylesheet and uses a few runtime style changes. Scripts do not use `unsafe-inline`.
- A service worker is privileged within its registered path. Deployment must remain HTTPS, and changes to `src/pwa/sw.js` require the same review as application code.
- Automated WebKit verifies installation and complete Cache Storage contents, but Playwright WebKit cannot perform a forced-offline navigation. Installation and offline relaunch should still be checked on a real Apple device before release.

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting or security-advisory feature after the repository is published. Do not include private device data, account details, or unredacted filesystem paths in a public issue.
