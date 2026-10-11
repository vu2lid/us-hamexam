# india-hamexam — decision log (2026-10-09)

Recorded from a discussion with Salim (VU2LID). Decisions are his; research notes are the assistant's.

## Decided

1. **Direction: unified build system.** One shared engine; per-edition builds generate PWAs (and per-edition test runs) for configurations like us-hamexam, india-hamexam. This aligns with the repo's existing Stage 8 multi-edition plan (`docs/MULTI_EDITION_PLAN.md`, experiment stage — implementation not started).

2. **Working pass-rule model (India): 40% in Part A AND 40% in Part B AND 40% overall**, both categories. Basis: the letterheaded WPC FAQ of 05.12.2024 (No. P-14036/02/2023-COP) states the per-part + overall requirement. This is a project decision for practice simulation, not an independently settled legal conclusion: the Gazette states an overall 40% threshold and another WPC-attributed FAQ states only the overall threshold. The mock-exam scorer should be part-aware if this model is adopted; revisit when later official clarification or examination evidence settles applicability.

3. **Product positioning: honest practical study tool.** Authored practice questions/answers plus a configurable practice simulation using the current working model (Part A/Part B split, provisional 25+25 or 50+50 questions, provisional timers, and the three 40% gates). Never presented as official or as an exact replica of the examination. A plain one-line disclaimer lives in Help/About from day one.

4. **Content source: the published syllabus as a provisional blueprint.** The legacy syllabus is the concrete topic reference currently available, and 2025 e-admit cards still reference Part A/B. Its Part A (Basic Electronics) and Part B (Radio Regulations) topic groups may seed the study/mock blueprint, subject to replacement when a current official syllabus is located.

5. **NCVEC question reuse: permitted.** The public-domain dedication was verified live on ncvec.org on 2026-10-09 for the Technician 2026–2030 and General 2023–2027 pools ("The NCVEC Question Pool Committee hereby releases ... into the public domain"). It covers the question text; figures/diagrams are not named by the dedication and stay out. A filtered subset may be reused for india-hamexam:
   - Drop all figure-referencing questions.
   - Drop US-specific questions (FCC Part 97 refs, US band plans/privileges, US license-class structure, US-specific organizations).
   - Re-ID into the India question-ID scheme; replace FCC `ref` values with syllabus-topic refs.
   - Human review pass on regulatory-flavored questions (power limits, third-party traffic, reciprocal operation, etc.) — US answers may differ under the 2024 Rules. Pure theory transfers directly.
   - Record pool version + release date per reused question (trivial: NCVEC questions and diagrams are clearly versioned and labeled).
   - Note the NCVEC public-domain source in docs/Help as good practice.

## Still open

- **Architecture gate:** green-light the Stage 8B synthetic-edition build experiment, or review the India requirements research (`docs/INDIA_ASOC_REQUIREMENTS.md`) first.
- **Engine changes required for the India edition:** Part A/Part B selection blueprint (replacing the US subelement/group scheme); part-aware scoring with three simultaneous gates; 3600s/7200s timer values (profile data only); figure pipeline off.
- **Content work:** syllabus-topic → NCVEC-subelement mapping with the filter rules above (scriptable as a first pass); Part B largely authored; General-grade Morse is written-exam-only in the mock with an explicit disclaimer (any Morse trainer is a separate practice feature).
- **Deferred:** repository naming, Pages deployment paths, installed-PWA continuity (Stage 8E).

## Reference

- Independent ASOC research report: `INDIA_ASOC_INDEPENDENT_RESEARCH.md` (same directory).
- Repo planning docs: `docs/MULTI_EDITION_PLAN.md`, `docs/EDITIONS.md`, `docs/INDIA_ASOC_REQUIREMENTS.md` (in the us-hamexam repo).
