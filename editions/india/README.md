# India ASOC Practice — reviewed practice seed + Stage 8D4

**Status: Stage 8D3A seed bank and Stage 8D4 expansion (30 items) are approved and were browser/technical QA-tested in Stage 8D3B. All 30 items have independent technical/fact review recorded in the provenance sidecar with reviewer `vu2lid`; the edition is buildable locally.** Nothing here is, or claims to be, an official examination.

## What this directory is

A template for the future **India ASOC (Restricted) practice** edition of this
app — an independently authored practice bank for the Indian Amateur Station
Operator's Certificate (Restricted) syllabus, governed by the Stage 8D1
content and provenance contract at
[docs/INDIA_CONTENT_CONTRACT.md](../../docs/INDIA_CONTENT_CONTRACT.md) and the
recorded research at
[docs/INDIA_ASOC_REQUIREMENTS.md](../../docs/INDIA_ASOC_REQUIREMENTS.md).

Everything here is **practice content labeling**: the profile, pool registry,
and (eventually) question bank describe an independent practice exercise.
Nothing here is an official examination, an official question pool, or a
replica of any official paper.

## Files

- `edition.json` — the edition profile: branding ("India ASOC Practice",
  subtitle "ASOC (Restricted) Practice — not an official exam"), jurisdiction
  and authority metadata (Wireless Planning & Coordination Wing / WPC of the
  Department of Telecommunications as the regulator; the question bank is an
  **independently authored practice bank**, not an official pool source),
  label templates, practice timer values, the India storage/cache namespace
  (`india-asoc-practice-*`), and the build input paths. It is fully
  schema-valid — it passes `scripts/edition-profile.js` validation.
- `pools.json` — the pool registry for the single `restricted` practice pool
  (generic idPolicy shape, `R`-prefixed question IDs, syllabus-topic groups).
  The counts, passing score, and timer values are **neutral practice
  placeholders**, chosen small and deliberately NOT encoding the unresolved
  official exam numbers recorded in the research (the 25+25 structure / 40%
  pass-criteria conflict, docs/INDIA_ASOC_REQUIREMENTS.md §1/§3/§6). Replace
  them with evidence-settled configuration before any release.
- `banks/restricted.json` — **30 practice questions across two batches**,
  in the existing runtime schema unchanged (`id`, `sub`, `q`, `choices`,
  `correct`, `correctText`, `ref` -- no new runtime field). A deliberately
  small, documented SUBSET of the Restricted syllabus, not a claim of
  syllabus coverage:
  - **Batch 1 (Stage 8D3A, `approved`, 15 items):**
    - 5 items (`R1B01`-`R1B05`, group `R1`) — Section A: Elementary
      electricity and magnetism (Ohm's Law, resistance units, conductors,
      series resistance, current/magnetism).
    - 5 items (`R1A01`-`R1A05`, group `R1A`) — Section A: AC theory
      basics (frequency, period, RMS value, the frequency/period
      reciprocal, reactance).
    - 5 items (`R2A01`-`R2A05`, group `R2A`) — Section B: ITU phonetic
      alphabet and Q-codes (A/M/S letters, QRM, QTH).
  - **Batch 2 (Stage 8D4, `approved`, 15 items, reviewed by `vu2lid`):**
    - 3 items (`R1C01`-`R1C03`, group `R1C`) — Section A: Semiconductors
      (diode rectification, transistor amplify/switch function,
      semiconductor vs. conductor conductivity).
    - 3 items (`R1D01`-`R1D03`, group `R1D`) — Section A: Receivers
      (detector/demodulator stage, superheterodyne IF conversion, tuned
      circuit/filter selectivity).
    - 3 items (`R1E01`-`R1E03`, group `R1E`) — Section A: Transmitters
      (oscillator stage, modulation, power-amplifier stage).
    - 2 items (`R1F01`-`R1F02`, group `R1F`) — Section A: Propagation
      (ionospheric skywave reflection, line-of-sight/direct-wave
      propagation).
    - 2 items (`R1G01`-`R1G02`, group `R1G`) — Section A: Aerials and
      antennas (basic radiating function, the dipole's two-conductor
      center-fed form).
    - 2 items (`R1H01`-`R1H02`, group `R1H`) — Section A: Frequency
      measurement (the hertz as the unit, the frequency counter as a
      measuring instrument).
  - **Remaining gaps.** Section A: no longer any gap among the named
    topics — elementary electricity/magnetism, AC theory, semiconductors,
    receivers, transmitters, propagation, aerials, and frequency
    measurement are all now represented (each by a small, non-exhaustive
    slice, not full coverage of each topic). Section B: still **not
    covered** — the Indian amateur rules themselves, ITU emission
    designations, frequency allocations, and distress/urgency procedure
    (all explicitly out of scope for Stage 8D4, as source-sensitive/
    unresolved per `docs/INDIA_ASOC_REQUIREMENTS.md` §6). A later slice
    may extend coverage further; this one does not imply completeness.
  - Provenance: batch 1 — 10 items `india-original`, 5 items
    `reference-informed` (ITU Q-codes/phonetic alphabet convention).
    Batch 2 — all 15 items `india-original` (general electronics/
    propagation/antenna facts, not tied to one external convention). No
    item in either batch uses `ncvec-adapted`.
  - **Review status: batch 1 is `approved` (reviewer `vu2lid`, rights
    cleared). Batch 2 is `approved`, reviewer `vu2lid`,
    independent technical and fact review complete. These remain author-curated practice questions, not official ASOC questions.
- `banks/restricted.provenance.json` — the per-item authoring/provenance
  sidecar (docs/INDIA_CONTENT_CONTRACT.md §2), one entry per bank question
  keyed by its `id`: syllabus code/topic, provenance class, source
  citation, author, reviewer, review status, rights status, rationale, and
  figure status (`"none"` for every item -- this slice is figureless).
  Validated by `scripts/question-provenance.js`, wired into the India build
  path via the new, edition-agnostic `profile.build.provenanceSidecars`
  field (declared only here; US and the synthetic fixture declare none and
  are completely unaffected by this gate).

- `help-content.html` / `getting-started-content.html` — India-specific
  Help & About / Getting Started prose (Stage 8D3B), declared in
  `edition.json`'s `build.helpContent`/`gettingStartedContent`. Added after
  QA found the build otherwise fell back to the shared US default prose
  (FCC, NCVEC, Technician/General/Extra) verbatim -- the same override
  mechanism Stage 8A2/8C already built for the synthetic fixture, no new
  engine code. Explicitly practice-labeled; states the limited syllabus
  coverage and makes no official-exam claim.

## Build and review status (Stage 8D3A and Stage 8D4 batches approved)

The bank and provenance sidecar are schema-valid and build-ready for all 30 entries. Every entry records reviewer `vu2lid`, `reviewStatus: "approved"`, and `rightsStatus: "cleared"`. The provenance gate therefore permits the India build before output mutation; malformed or incomplete provenance still fails closed. The build remains practice-only and makes no official ASOC status or complete syllabus claim.

`npm run build -- --edition india` produces `dist-editions/india/` after all ordinary pre-mutation gates pass. Repeated builds are deterministic, and the India artifact is not deployed by this scaffold; deployment requires a separate release decision and the content/architecture gates recorded in the India contract.

## Timing values

`examTimerSecondsValues: [0, 600, 1200, 1800, 2400]` are modest practice values; the 2400-second option matches the registry's neutral practice pool default.
They encode **no official timing claim** — no official ASOC time limit is
recorded in the research; treat them as placeholders to be revisited with
evidence.

## Browser and technical QA (Stage 8D3B; counts updated for Stage 8D4)

With the Stage 8D3A seed bank reviewed and the build gate passing, this
pass added local browser/technical QA against the real
`dist-editions/india/` output -- `tests/india-edition.spec.js`, served
alongside US and synthetic on one origin via the extended
`scripts/serve-editions.js` (`npm run test:editions`). 13 India-specific
test cases (plus the 7 existing US/synthetic edition-isolation cases, all
still passing -- 20/20 total) cover:

- the standalone app loads and shows the first question (`R1B01`);
- all practice questions in the bank are reachable via Next (the test
  file's expected count and ID list were updated for Stage 8D4's 30-item
  bank);
- "India ASOC Practice" / "ASOC (Restricted) Practice — not an official
  exam" branding and the in-app disclaimer text are visible;
- no US/FCC/NCVEC/Technician/General/Extra term appears anywhere in the
  rendered UI (checked via `innerText`, not raw HTML source -- a few
  inert, never-displayed fallback literals remain in shared `src/app.js`,
  the same documented boundary as the synthetic edition);
- the single `restricted` pool is selected and is the only option;
- progress and bookmarks persist across a reload;
- the canonical key, all four legacy-key templates, and the probe key
  resolve to the `india-asoc-practice-*` namespace, confirmed both by
  reading the resolved runtime config and by a real legacy-migration
  round-trip;
- Help & Getting Started content is now India-specific (see above), not a
  fallback to US prose;
- the PWA manifest's name/short_name/description and the page's
  `apple-mobile-web-app-title`/meta description are India-specific;
- the service worker's scope (`/editions/india/`) and cache-name prefix
  (`india-asoc-practice-`) are India-specific, with no interference from
  the US/synthetic workers or caches on the same origin;
- an offline reload after installation still shows the first question and
  can reveal its answer;
- the 320×568 layout has no horizontal overflow and the main controls
  (Menu, Next, Reveal) meet the 44px touch-target minimum;
- Menu, the pool selector, and Reveal are keyboard-focusable and operable
  via Enter/Escape.
Stage 8D4 is approved; `npm run test:editions` runs against the real committed India content; `build:india` succeeds because all 30 provenance entries are approved; malformed/incomplete provenance is covered in `tests/unit/build-gate.test.js`; all 20/20 pass against real `dist-editions/india/`; no scratch copy is needed.

**One real gap was found and fixed** (not an India-specific hack -- the
existing generic content-override seam, already proven by the synthetic
fixture): see "Files" above for `help-content.html`/
`getting-started-content.html`. No other generic-engine assumption
surfaced; a single-pool edition's pool selector, storage, exam setup, and
offline/PWA behavior all worked correctly on the first attempt.

**This remains a small, reviewed practice slice, not a release-ready
product.** The seed bank's syllabus coverage is deliberately limited (see
"Files" above for exactly what is and is not covered) and the product
makes no claim to official ASOC status, format, scoring, or timing
fidelity. Public release requires a separate, explicitly gated decision
(see "Deployment prohibition" below), broader syllabus coverage, and
resolution of the open regulatory questions in
`docs/INDIA_ASOC_REQUIREMENTS.md` §6 before any exam-faithful feature.

## Deployment prohibition

No artifact may be deployed from this scaffold. A buildable, reviewed India
edition is not the same decision as a public release: deployment requires
its own separate, explicitly gated decision, unaffected by this QA pass.
