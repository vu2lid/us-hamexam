# Security and Privacy

## Data handling

Ham Exam is a static study application. It has no accounts, forms, analytics, advertising, telemetry, cookies, or API calls. It does not request location, camera, microphone, contacts, clipboard, notification, or other device permissions.

Study state is held in memory and disappears when the page closes. The installable PWA stores only its public application shell, icons, manifest, and embedded public question bank in browser Cache Storage. It does not store user-created content or personal information.

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
- Runtime diagnostics redact local usernames and do not display the browser user-agent.
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
