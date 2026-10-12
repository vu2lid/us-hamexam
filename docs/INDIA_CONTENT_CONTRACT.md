# India content and provenance contract (Stage 8D1)

Recorded: October 11, 2026. Status: documentation-only contract, uncommitted and
pending review. This document defines the content and provenance rules any
future India ASOC study material must satisfy before it is authored, reviewed,
or released. It adds no question, code, build input, or artifact to this
repository, and it does not create India production content. It governs CONTENT
and PROVENANCE only; architecture remains a separate question subject to the
Stage 8 adopt/revise/reject review already recorded (see "Relationship to other
documents" below).

## 1. Restricted MVP scope

- **Initial scope:** ASOC (Restricted) syllabus-topic study practice only —
  topic-organized questions a learner works through at their own pace. No
  other grade or category is in scope for the initial India content slice.
- **Syllabus-topic mapping:** every item must map to a syllabus code/topic
  drawn from the recorded research in
  [INDIA_ASOC_REQUIREMENTS.md](INDIA_ASOC_REQUIREMENTS.md) (its §3 syllabus
  and §7 MVP sections: Part A topics — elementary electricity/magnetism, AC
  theory, semiconductors, receivers, transmitters, propagation, aerials,
  frequency measurement — and Part B radio-regulation topics, per the
  published syllabus document). The topic structure and the syllabus
  document's currency/effective date are recorded there with their evidence
  status; this contract cites that record rather than restating its numbers
  as settled. Items whose topic cannot be mapped to a recorded syllabus topic
  are out of scope until the research is extended.
- **Explicitly deferred:** ASOC (General) content, Morse training or
  assessment, and any exam-faithful mock scoring/selection/timing. The
  product must not claim that a mock exam replicates the official ASOC paper
  — not its question distribution, duration, pass computation, or negative-
  marking behavior — until the unresolved questions recorded in
  INDIA_ASOC_REQUIREMENTS.md §6 are settled (see §7 below). Study-practice
  features may ship under an explicit practice label; exam-faithful features
  may not.

## 2. Question schema

- **Runtime fields, reused unchanged from the US engine:** `id`, `sub`, `q`,
  `choices` (an object with exactly the keys A/B/C/D), `correct` (exactly
  one of "A"/"B"/"C"/"D"), `correctText` (byte-for-byte match of
  `choices[correct]`), and `ref`. The runtime schema is stable: India content
  adds no runtime fields.
- **India authoring metadata, defined separately:** syllabus code, syllabus
  topic, provenance class, source citation, author, reviewer, review status,
  rights status, rationale, and figure status live in a per-item authoring
  sidecar (a metadata object kept alongside the item, e.g. keyed by question
  `id` in a separate authoring file), not in the runtime question object.
  Build or packaging steps may read the sidecar for validation, but the
  shipped question entries carry only the runtime fields above.

## 3. Provenance classes

Every item's authoring metadata must name exactly one provenance class:

- **india-original** — the question and all four choices were written from
  scratch by the named author, informed only by facts (syllabus topics, rule
  provisions), not by the wording, structure, or sequence of any existing
  question or text.
- **ncvec-adapted** — the item derives from a specific NCVEC question in a
  specific pool release covered by that release's public-domain dedication
  (see §4), and was reviewed for Indian syllabus relevance and rewritten to
  remove FCC/NCVEC/US band-plan, US callsign, and US regulatory assumptions.
  The citation must name the source pool release and source question ID.
- **rule-derived** — the item was constructed directly from a cited rule
  provision or other official text (e.g. the Telecommunications (Amateur
  Services) Rules, 2024), paraphrased into original wording, with the rule
  section cited.
- **reference-informed** — the item is india-original, but a specific
  reference (e.g. a Vigyan Prasar book, a society FAQ, a standard text)
  materially informed its topic selection, concept treatment, or difficulty;
  the reference is cited and §4's no-copying rule applies to it.

**Unambiguous statement:** no item produced under this contract is an
official ASOC question, and none may be presented as one. There is no
official public ASOC question pool ("not found in the sources checked" —
INDIA_ASOC_REQUIREMENTS.md §4), so no item can have an official provenance.
The product presents author-curated practice content only.

## 4. Reuse and rights policy

- **NCVEC reuse** is permitted only where the specific pool release's
  public-domain dedication applies, verified per pool and per release before
  use (the dedication's wording was confirmed for the 2026-2030 Technician,
  2023-2027 General, and 2024-2028 Extra releases in
  INDIA_ASOC_REQUIREMENTS.md §5; any future release must be re-verified). The
  dedication covers the question pool's text and does not separately name
  figures/diagrams, so NCVEC figures are never reused under this policy
  without a separate, item-specific rights check.
- **Vigyan Prasar and society/association material** (books, sample papers,
  FAQs, study notes) may inform concepts and topics but must not be copied —
  no wording, question sequence, answer choices, tables, distinctive
  structure, or figures — without permission from the rights holder. A free
  download or mirror is not a licence: neither Vigyan Prasar publication in
  the recorded research states reuse terms, and society-circulated
  collections are treated as all rights reserved unless a society states
  otherwise.
- **Figures** require a separate rights and provenance review of their own;
  no figure enters the MVP. The MVP is figureless (a scope choice, not a
  permanent property — INDIA_ASOC_REQUIREMENTS.md §7).
- **The candidate NCVEC-selection pipeline** recorded in
  [MULTI_EDITION_PLAN.md](MULTI_EDITION_PLAN.md) §"Candidate Stage 8D
  content-selection pipeline (not adopted)" may only *suggest* candidate
  items with provenance notes. It cannot publish, ship, or auto-approve
  anything: a human makes every keep/edit/reject decision, and each decision
  is recorded per §5. The pipeline belongs in a derived `india-hamexam`
  repository or an explicitly isolated authoring tool, never in the US
  release build, and no model or external request may ship in the app.

## 5. Review workflow

Every item, including pipeline-suggested candidates, passes the following
stages, each recorded in its authoring metadata:

1. **Draft** — initial authoring with a declared provenance class and source
   citation.
2. **Syllabus mapping** — mapped to a recorded syllabus code/topic.
3. **Technical review** — checked for correctness against current rules and
   syllabus topics by a reviewer other than the author.
4. **Rights/provenance review** — the citation and rights status are checked
   against §4.
5. **Independent fact review** — a second, independent factual check of the
   question, the keyed answer, and every distractor.
6. **Approval** — the item is accepted for release.

**Rejected and modified candidates must remain traceable:** keep the
candidate record with its decision (kept / edited / rejected) and the reason.
Editing a candidate preserves its original record and the change history;
rejecting one does not silently delete it. Silent deletion of candidates is
a contract violation.

## 6. Validation and release gates

India content fails the authoring/release process unless all of the
following hold:

- Required syllabus mapping: every item carries a valid syllabus code/topic
  from the recorded research.
- Required provenance metadata: provenance class, source citation, author,
  reviewer, review status, rights status, and rationale are present and
  internally consistent (e.g. an ncvec-adapted item must cite a covered
  release).
- Unreviewed model output **must fail**: any item whose authoring metadata
  shows it was generated or triaged by a model without completing the full
  §5 workflow (including human technical and independent fact review) is
  rejected automatically.
- **Practice-content labeling is explicit in the product UI:** the India
  edition's user-facing text identifies the bank as author-curated practice
  content and makes no official, leaked, "real pool," or exam-replica claim.

## 7. Decision gates

The following questions, recorded as unresolved in
INDIA_ASOC_REQUIREMENTS.md §6, are **blockers for any exam-faithful
feature** (mock scoring, selection, timing, negative-marking behavior):

1. Pass-threshold structure: the Rules' own text states only an overall 40%
   threshold, while a letterhead-verified WPC Wing letter (05.12.2024) adds
   a 40% per-part minimum; a chronologically earlier WPC-attributed FAQ
   states only the overall figure. Which document currently governs is
   unresolved.
2. Syllabus document currency/effective date: the readable copies are
   mirrors; a current WPC examination notice should be obtained before
   content is finalized.
3. Negative marking: not found in any source checked; "none" must not be
   encoded as fact.
4. Morse mechanics: three sources describe pass mechanics differently and
   do not corroborate each other (only the 8 wpm figure is confirmed).
5. Official question pool: not found in the sources checked — so no
   official-provenance content exists to target.

Until these are settled, uncertain research must not be silently turned into
production defaults: no exam configuration value ships as an unlabeled
default, and any interim use of the recorded figures must carry its actual
confidence status in the product. Settling a question requires a current
official examination notice or an equivalent primary source, recorded with
the same evidence standards as INDIA_ASOC_REQUIREMENTS.md.

## Relationship to other documents

- [INDIA_ASOC_REQUIREMENTS.md](INDIA_ASOC_REQUIREMENTS.md) — the research
  evidence this contract cites (syllabus topics, exam structure, source and
  reuse inventory, unresolved questions). The contract does not restate its
  findings as new facts.
- [MULTI_EDITION_PLAN.md](MULTI_EDITION_PLAN.md) — the multi-edition
  architecture proposal and the record of the candidate Stage 8D
  content-selection pipeline; the pipeline's decisions and provenance
  obligations are governed by this contract.
- [EDITION_BUILDS_DESIGN.md](EDITION_BUILDS_DESIGN.md) — the adopted
  one-repository edition build design the content would eventually flow
  through. Its Stage 8D2 build scaffold at `editions/india/` (non-buildable
  by design) is where contract-compliant reviewed content will land.
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — delivery status,
  including this contract's execution-log row.

This contract governs content and provenance only. It does not adopt or
revise the architecture, which remains subject to the Stage 8
adopt/revise/reject review, and it authorizes no India content in this
repository.
