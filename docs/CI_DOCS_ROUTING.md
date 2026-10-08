# Documentation-only deployment routing

Implemented October 2026; hosted execution still requires verification after push.

The Pages workflow keeps its push-to-main and manual triggers. A short read-only
job runs routing-policy tests, then compares HEAD with the most recent successful
Pages deployment found among the last 20 successful runs of this workflow on
main. It requires a successful `deploy` job, not merely a successful workflow:
docs-only runs skip deployment and cannot advance this baseline.

Only root README.md, AGENTS.md, AUTHORS.md, SECURITY.md, and Markdown under
docs/ qualify. Every changed path must qualify, and `git diff --check` must pass.
The complete local Git diff is used with rename detection disabled, so a source
file moved into docs cannot evade the full gate. There is no API path-list limit.

Mixed changes, unknown paths, empty diffs, missing/divergent history, API failures,
or no deployment within the lookup window select full verification. A failure of
the routing job itself blocks downstream jobs. Manual dispatch always selects
full verification. A docs push following a failed app push compares against the
older successful deployment, so those outstanding app changes still require tests.

Documentation-only pushes run policy tests and whitespace checks, skip dependency
and browser installation, and skip build/deployment; the current live app remains
unchanged. PR verification remains `test:routine` plus freshness checks. All
non-docs deployment runs retain npm ci, dependency audit, all three browsers,
the full `npm test` gate, freshness verification, and deployment only on success.
No assertions, retries, test selection, or release gates have been reduced for
application changes. The explicit docs exception was authorized by the maintainer.

## Timeout evidence and limits

Run 37710439871 was cancelled during tests at the old 60-minute job ceiling.
Playwright installation (including OS dependencies) took 18m45s: apt reported
126 MB fetched in 18m6s. The preceding successful run installed in 47 seconds
and completed build/tests in 50m46s. The app/test files were unchanged between
those commits. This establishes slow setup as the loss of available test time;
it does not establish the underlying reason for the slow package transfer.

The build job now has a bounded 90-minute ceiling and browser/dependency
installation a 25-minute step ceiling. This adds scheduling headroom, not a
speed improvement. Browser caching alone would not address the observed OS
package transfer. No installation retries, mirror overrides, or caches were
added. Record timings from the first hosted run before considering further work.

## Verification and rollout

Unit coverage exercises docs/mixed/manual classification, a skipped docs run
followed by an older deployed baseline, unavailable history/API, whitespace
failure, and a real temporary Git repository with a source-to-docs rename and
over 300 files. Workflow-policy assertions preserve the full gate/deploy dependency.

The workflow-changing push must take the full path. After it deploys, verify a
subsequent docs-only push runs the short check and skips build/deploy. Confirm
manual dispatch still executes the full path when next needed; local mocked
policy tests are not evidence that hosted routing has already run.

Local verification on the implementation worktree: focused routing/workflow
tests 32/32 (0.47s); complete Node suite 774/774 (19.1s); generated-artifact
freshness and `git diff --check` pass. A read-only live API/Git check classified
committed HEAD `a7d7a63` as docs-only relative to deployed `6aecd72`, matching
the actual two-file documentation diff. This did not submit or rerun a workflow.
Browser suites and a rebuild were not run: runtime, data, and generated artifacts
are unchanged. The separate Stage 8 planning edits were preserved uncommitted.
