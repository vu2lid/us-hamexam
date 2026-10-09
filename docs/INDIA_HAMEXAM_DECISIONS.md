# india-hamexam — decision log (2026-10-09)

Recorded from a discussion with Salim (VU2LID). Decisions are his; research notes are the assistant's.

## Decided

1. **Direction: unified build system.** One shared engine; per-edition builds generate PWAs (and per-edition test runs) for configurations like us-hamexam, india-hamexam. This aligns with the repo's existing Stage 8 multi-edition plan (`docs/MULTI_EDITION_PLAN.md`, experiment stage — implementation not started).

2. **Pass rule (India): 40% in Part A AND 40% in Part B AND 40% overall**, both categories. Basis: Indian administrative practice — once rules are gazetted, officials' clarifying letters govern practice by latest date. The latest dated clarification is the letterheaded WPC FAQ of 05.12.2024 (No. P-14036/02/2023-COP), which states the per-part + overall requirement. The mock-exam scorer must therefore be part-aware. Revisit only if a later WPC clarification appears.

3. **Product positioning: honest practical study tool.** Authored practice questions/answers plus practical exam simulation using the real structure (Part A/Part B split, 25+25 or 50+50 questions, the three 40% gates, real timers). Never presented as official or as an exact replica of the examination. A plain one-line disclaimer lives in Help/About from day one.

4. **Content source: the official syllabus.** The legacy syllabus (still in use per 2025 e-admit cards referencing Part A/B) is the one concrete official content item. Its Part A (Basic Electronics) and Part B (Radio Regulations) topic groups become the study/mock blueprint — the India analogue of the NCVEC subelement/group hierarchy.

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

- Independent ASOC research report: `india-asoc-exam-research-2026-10-09.md` (same directory).
- Repo planning docs: `docs/MULTI_EDITION_PLAN.md`, `docs/EDITIONS.md`, `docs/INDIA_ASOC_REQUIREMENTS.md` (in the us-hamexam repo).
