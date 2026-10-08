# Stage 8: separate edition builds from one repository

Recorded: October 7, 2026. Status: proposal; implementation not started.
Stage 8A1 (India ASOC requirements and source assessment) had a
review-correction pass on October 8, 2026 and is recorded in
[INDIA_ASOC_REQUIREMENTS.md](INDIA_ASOC_REQUIREMENTS.md) (uncommitted,
pending review): 2024 Rules confirmed as the governing instrument;
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
| 8B: isolated build experiment | An `edition-builds` branch, optionally a separate worktree; US plus a clearly synthetic second edition | Two independent deterministic outputs; existing US command and compatibility preserved |
| 8C: isolation and compatibility review | Storage/cache isolation, validation, offline, and cross-edition test evidence | Acceptance criteria below pass; explicit adopt/revise/reject decision |
| 8D: real India edition planning | If adopted, verified content provenance and implementation slices for the minimum India edition | Separate approval of content and implementation scope; no assumption of India readiness |
| 8E: naming and deployment assessment | Neutral repository-name options and deployment/update migration plan | Review of existing URLs, installed PWAs, rollback, and release/version policy before any rename or deployment change |

Later stages are provisional. Plan each in detail after the preceding review;
do not execute the entire sequence from this document alone.

## Next task: Stage 8A

Documentation and read-only assessment only. Produce:

1. An India requirements table covering license categories, syllabus versions,
   question/answer format, selection and scoring rules, timing, topic hierarchy,
   and any practical/Morse component. Cite current authoritative sources with
   retrieval dates; distinguish confirmed facts, assumptions, and unknowns.
   Do not copy a question bank or equate free availability with copying rights.
2. A source/provenance inventory, including permissions or unresolved reuse
   terms. Reference material and authored practice questions must be distinguished
   from an official published examination pool.
3. A code-grounded boundary table: shared engine, edition data/content, validation
   policy, storage defaults/namespaces, PWA identity/cache cleanup, and tests.
   Identify which Stage 7 profile fields are still validated-only.
4. Proposed build selection and output layout, preserving today's US command
   and paths until a separately reviewed migration. Specify how invalid editions
   fail before mutation and how one build avoids overwriting another's output.
5. A minimal synthetic fixture specification and test plan. Use intentionally
   different pool keys and grouping to expose hardcoding; do not imply it models
   Indian exam rules or publish it as a usable exam-preparation product.
6. An ordered implementation breakdown for 8B, with risks, rollback, expected
   verification cost, and a comparison against the separate-repository fallback.

Do not create a branch/worktree, move production files, modify runtime/build
code, create a repository, rename anything, or change CI/deployment in 8A.
Source research should precede architecture commitments dependent on exam rules.
Unresolved requirements should be recorded as decision gates, not guessed.

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
