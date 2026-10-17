# Stage 8: separate edition builds from one repository

Recorded: October 11, 2026. Status: Stage 8A2 and Stage 8C are complete. The
one-repository, profile-driven multi-edition architecture is adopted with the
bounded fixes committed and deployed as `8612051`; see
[EDITION_BUILDS_DESIGN.md](EDITION_BUILDS_DESIGN.md) for the design record and
`tests/editions-isolation.spec.js` for the same-origin isolation evidence.
Stage 8A1 (India ASOC requirements and source assessment) had a
review-correction pass on October 8, 2026 and is recorded in
[INDIA_ASOC_REQUIREMENTS.md](INDIA_ASOC_REQUIREMENTS.md) (committed as
`de0837d` with review-correction passes): 2024 Rules confirmed as the governing instrument;
Restricted/General written-exam structure (Part A/Part B, 25+25 or 50+50
questions, 1 h/2 h, 100 marks) and the General-grade Morse requirement (≥8
wpm) confirmed via a WPC-attributed FAQ (not letterhead-verified) read
after a failed PDF text extraction was re-inspected as a rendered page, per
this task's own instruction; the pass-threshold finding now separates two
distinct questions rather than conflating them — the Rules' own text
states only one overall 40% threshold, a letterhead-verified WPC Wing
letter (05.12.2024) additionally requires 40% in each of Part A and Part B
(unambiguous within that letter), and a chronologically earlier,
WPC-attributed-but-unverified FAQ (9 Nov 2024) states only the overall
figure — which document reflects the currently applicable policy is left
an open question, not resolved by date order or by treating either as
stronger; no official public question pool found in the sources checked; Vigyan Prasar reuse terms remain unresolved for two distinct
Vigyan Prasar publications (no licence stated for either), while NCVEC's
public-domain dedication is confirmed for question text specifically
(figures are not named by that dedication's own wording); the architecture
section now distinguishes what permits provisional assessment from what
blocks exam-faithful scoring/selection (confirmed by reading `scoreExam()`
in `src/app.js` and the registry validator directly) from what affects
content authoring, replacing a prior "no architecture blockers" framing;
the proposed MVP boundary no longer proposes unverified exam numbers as
production defaults and distinguishes study practice from an exam-faithful
mock exam.

Stage 8D1 (documentation-only, committed `5bf00e8`) adds the India
content and provenance contract at
[INDIA_CONTENT_CONTRACT.md](INDIA_CONTENT_CONTRACT.md): it governs authoring,
review, and release gates for any future India material — Restricted-MVP
syllabus-topic study practice in scope, with General, Morse, and exam-faithful
mock scoring/selection/timing deferred — and records that it does not commit
the single-repository architecture, which remains subject to the Stage 8
adopt/revise/reject review.

Stage 8D2 (committed `ffa9062`) added the India edition build scaffold at
`editions/india/`: a schema-valid practice profile and pool registry with an
intentionally empty `banks/` — an authoring template that was NON-BUILDABLE
by design at that point. See [EDITION_BUILDS_DESIGN.md](EDITION_BUILDS_DESIGN.md)'s
Stage 8D2 section and `editions/india/README.md`.

Stage 8D3A (committed `01c9e85`) added the first 15-question seed bank and
its provenance sidecar, enforced by a new build gate
(`scripts/question-provenance.js`) requiring complete, build-ready review
metadata before any India build. All 15 items have since been reviewed
(reviewer `vu2lid`, `reviewStatus: "approved"`, `rightsStatus: "cleared"`),
so **`--edition india` now builds successfully** — the scaffold is no
longer non-buildable. The seed bank still covers only a small, documented
subset of the Restricted syllabus (elementary electricity/magnetism, AC
theory basics, ITU phonetic alphabet/Q-codes); it is practice content only,
makes no official-exam claim, and is not ready for public release.

Stage 8D3B (uncommitted, pending review) adds browser/technical QA for the
now-buildable India edition: `scripts/serve-editions.js` and
`playwright.editions.config.js` extended to serve `dist-editions/india/`
alongside US and synthetic on one origin, and a new
`tests/india-edition.spec.js` covering rendering, the 15-question bank,
branding/disclaimer text, namespace isolation, Help/Getting Started content
(now India-specific — see below), PWA manifest/service-worker identity,
offline load, 320×568 layout, and basic keyboard accessibility. This QA
pass found one real gap and closed it with the existing generic seam, no
India-specific code: `editions/india/` had declared no
`build.helpContent`/`gettingStartedContent` override, so the built India
app was shipping the shared US Help/Getting-Started prose (FCC, NCVEC,
Technician/General/Extra) verbatim. Fixed by authoring
`editions/india/help-content.html` and `getting-started-content.html`
(practice-labeled, India-specific, no US regulatory terms) and declaring
them in `edition.json` — the same override mechanism Stage 8A2/8C already
built for the synthetic fixture. No engine code changed; US and synthetic
output are confirmed byte-identical to before. No India artifact may be
deployed; this is local QA only.

Content policy is now recorded: the India bank is syllabus-based practice
content with independently authored questions as the default. Vigyan Prasar
books may inform concepts but their wording, structure, questions, and figures
are not copied without permission. NCVEC material may be used only where the
specific release's public-domain dedication applies, with Indian relevance
review and separate figure-rights review. Student or society collections are
topic leads, not source material. Each item will carry provenance metadata and
will not be presented as an official ASOC pool or exact replica.

The initial synthetic and authored-bank shape may retain the US engine's
four-choice item schema and optional figure support. This is a compatible
starting point for practice content, not a settled claim about official ASOC
paper formatting; an India-specific validator or presentation policy can
change if authoritative examination evidence requires it.

### Candidate Stage 8D content-selection pipeline (not adopted)

The downloaded proposal `india-hamexam-question-selection-pipeline-proposal.md`
is recorded as a future candidate, not as an approved implementation. It
describes build-time tooling that would filter clearly US-specific or
figure-bearing NCVEC questions, map technically transferable candidates to
Indian syllabus topics, and produce a provenance-rich review file. A local
model may triage ambiguous candidates, but a human must make every final
keep/edit/reject decision; no model or external request may ship in the app.

If approved later, the pipeline belongs in the derived `india-hamexam`
repository (or an explicitly isolated authoring tool), not in the US release
build. Its committed output would be a reviewed mapping and re-authored India
bank, with the NCVEC pool/release retained for traceability. Part B and other
India-specific regulatory content remain separately authored. Figures remain
excluded unless their rights and provenance are independently cleared. (The
dev-only Stage 8E1/8E2 review tool and its versioned local-model contract now
live at `scripts/review-pipeline.js` / `tools/india-review/` — see
`docs/INDIA_REVIEW_TOOL.md`.)

The pipeline's keep/edit/reject decisions and all provenance obligations are
governed by [INDIA_CONTENT_CONTRACT.md](INDIA_CONTENT_CONTRACT.md) (Stage
8D1): its output, if it is ever approved, must satisfy that contract's review
workflow and validation/release gates — including mandatory human decisions,
traceable candidate records, and explicit practice-content labeling.

This proposal does not change the current policy: independently authored
syllabus-based questions remain the default, NCVEC reuse is optional and must
be reviewed for Indian relevance, and no official ASOC question pool is
claimed. Open decisions before implementation include the authoritative
syllabus version, a labeled evaluation set for any local model, and target
bank sizes.

## Decision and scope

Assess a single repository with shared runtime/build machinery and separate US
and India edition inputs and artifacts. The user approved recording and staged
planning, not a repository rename, deployment migration, or production India
implementation. Stage 7 is complete at `a7d7a63`; it provides reusable seams,
not a complete multi-edition build system.

This proposal reopens Stage 7's assumption that India development must live in
a separate repository. The fork-and-upstream-merge guide remains a fallback;
the experiment and its review will decide which architecture to adopt.

Keep `us-hamexam` and the displayed US Ham Exam name during the experiment.
Separate build outputs must contain only their own edition's content. No
runtime country selector, combined question bank, shared-core package, or new
framework is proposed. Preserve the default US build command and deployment.

Recorded baseline: standalone 951,280 B, 97,296 B free under 1,048,576 B;
PWA HTML 953,726 B. These are the Stage 7 measurements, not a new build run.
The 16 KiB preferred headroom and 1 MiB budget remain unchanged.

## Stages and review gates

| Stage | Deliverable | Exit gate |
|---|---|---|
| 8A: requirements and architecture assessment | Evidence-backed minimum India requirements, remaining US assumptions, proposed edition boundaries, and experiment specification | Review confirms supported requirements, unresolved questions, and a bounded implementation plan |
| 8A2: isolated build experiment (renumbered from the earlier 8B planning label) | An `edition-builds` branch, optionally a separate worktree; US plus a clearly synthetic second edition | Two independent deterministic outputs; existing US command and compatibility preserved |
| 8C: adopt/revise/reject review and remaining seam fixes | Storage/cache isolation, validation, offline, and cross-edition test evidence | **Complete:** adopted with bounded fixes in `8612051`; figure-prefix generalization remains deferred |
| 8D: real India edition planning | If adopted, verified content provenance and implementation slices for the minimum India edition | Separate approval of content and implementation scope; no assumption of India readiness |
| 8E: naming and deployment assessment | Neutral repository-name options and deployment/update migration plan | Review of existing URLs, installed PWAs, rollback, and release/version policy before any rename or deployment change |

Later stages are provisional. Plan each in detail after the preceding review;
do not execute the entire sequence from this document alone.

## Decision: adopt one-repository edition builds

Stage 8C is complete. The profile-driven, one-repository build architecture is
adopted for future regional editions, with the bounded PWA metadata and
cache-prefix fixes committed as `8612051` and deployed successfully. US
defaults, storage compatibility, output isolation, deterministic builds,
offline behavior, and same-origin edition isolation passed the recorded
acceptance checks.

The figure-prefix validator remains an explicit deferred boundary: a figureless
India MVP may proceed, but any India figure support requires a separate policy
and validator task. India content, regulatory scoring, and repository naming
remain outside Stage 8C.

## Next task: Stage 8D

Plan the real India ASOC Restricted practice edition: define its profile,
provenance metadata, authoring workflow, initial syllabus coverage, and review
gates. Do not claim an official question pool or exam-faithful scoring until
the documented regulatory uncertainties are resolved.

## Experiment acceptance criteria

- Existing US pools, labels, behavior, storage keys, migration, progress,
  bookmarks, and preferences remain compatible. Preserve strict US validation.
- US and synthetic builds are deterministic, self-contained standalone HTML
  and independently installable/offline PWAs with no external runtime requests.
- Output paths are isolated; each artifact contains only its own edition data,
  copy, branding, and assets. Invalid configuration cannot modify existing outputs.
- Both editions coexist under separate paths on the same origin. Every storage
  key, including availability probes, is isolated; cache names and activation
  cleanup prefixes cannot affect the other edition. Worker scopes are distinct.
  Test updates in both directions and offline operation afterward.
- Measure and explain US artifact changes against the baseline. Preserve exact
  bytes where feasible, but require behavioral compatibility rather than assuming
  new build plumbing must always produce identical bytes.
- Shared behavior has focused reusable tests plus edition-specific contracts.
  Define CI selection and release gates; do not weaken existing gates silently.
- No widespread regional conditionals in shared code. Use configuration, content,
  or explicit policy boundaries justified by actual differences.

## Naming and continuity

A neutral repository name is a later candidate, not selected or availability-
checked. Repository naming and displayed product naming are separate decisions.
US Ham Exam retains its product identity. Before any repository or Pages URL
change, inventory links, manifest identity/start URL/scope, worker registrations,
cache updates, and origin-bound saved data. Plan continuity for existing installed
PWAs and bookmarks, including rollback; do not assume redirects solve migration.

## Other workstreams

US bug fixes and pool maintenance continue independently. Persisted study scope
(Stage 6B), accessibility/device checks, and test-flake investigation remain
separate tasks. This proposal does not authorize a version bump or store release.
