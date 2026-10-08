# India ASOC requirements and source assessment (Stage 8A1)

Recorded: October 2026, with an 8 October 2026 review-correction pass.
Status: research complete, awaiting review; feeds Stage 8A2's architecture
assessment. This document establishes the minimum, source-backed
requirements for an India Amateur Station Operator's Certificate (ASOC)
study app, initially focused on the Restricted grade. It does not adopt the
single-repository architecture (that is Stage 8B/8C's decision), does not
assume Indian examinations follow US pool/grouping/selection/scoring
conventions, and does not copy any source material.

Evidence standards: every material finding carries its source URL and
document title, publication/effective date where available, retrieval date
(sources originally retrieved 7–8 October 2026; the review-correction pass
retrieved additional sources on 8 October 2026, noted individually below),
the relevant rule section, FAQ item, or PDF page, and a status label —
**confirmed**, **inference**, **unresolved**, or **conflicting**. Secondary
sources (amateur societies, training institutes, forums) are labeled; they
were used to locate primary evidence, not as authority where a primary
source was available. No organizations or people were contacted. Two user-
supplied local PDF copies (a draft Gazette notification and a DOT Office
Memorandum) were also inspected this pass and are cited with their local
provenance noted, since they were not independently retrieved from a URL by
this assessment.

**Access caveat (candid):** several Indian government sites
(dot.gov.in PDFs, saralsanchar.gov.in, egazette.gov.in, wpc.dot.gov.in,
indiacode.nic.in) returned HTTP 403, 504, or DNS/network failures during
research, including a second direct re-check of eservices.dot.gov.in's ASOC
page and PDF URLs this pass (both still 403). Official documents were read
via faithful mirrors (qsl.net, India Code index, society-hosted copies of
Gazette text, multiple WPC FAQ copies, a National Institute of Amateur
Radio (NIAR) compilation PDF, and DoT Office Memoranda). Findings resting on
mirrors or consistent secondary reporting are labeled accordingly. **Where a
PDF's text did not extract cleanly, the relevant page was rendered as an
image and read directly** (not concluded unavailable from a failed text
extraction alone) — this is how the governing pass-threshold table in §1/§3
was actually resolved this pass, after a first-pass text extraction of the
same PDF silently skipped the image-rendered pages it was on.

## 1. Findings summary

- The operative rules are the **Telecommunications (Amateur Services) Rules,
  2024** (G.S.R. 675(E), notified 29-10-2024, effective 30-10-2024), made
  under the Telecommunications Act, 2023; they supersede the Indian Wireless
  Telegraphs (Amateur Service) Rules, 1978. — confirmed
- Exactly two certificate categories exist: **ASOC (General)** and **ASOC
  (Restricted)**. Older names (Amateur Wireless Telegraph Station Licence;
  Grade I/II/Advanced) are abolished. — confirmed (Rules 2(e), 3(2))
- Eligibility for both: **Indian citizen, at least 12 years old**, passing
  the Rule 5 examination. No educational qualification appears in the rules.
  Exam fee ₹100. — confirmed (citizenship/age/fee), inference (no education
  clause, by its absence plus consistent secondary reporting)
- The ASOC **merges examination qualification and operating permission into
  one instrument** — there is no separate station licence; the certificate is
  issued with a unique call sign. This differs structurally from the US
  FCC model. — confirmed (Rules 3(1), 5, 6)
- Written exam: one paper, **Part A (Basic Electronics) + Part B (Radio
  Regulations)**; English; **ASOC (General) additionally requires Morse
  proficiency (minimum 8 wpm, both transmission and reception)**. The
  **Rules' own text** (Rule 5(5) final / 5(4) draft) states only **one**
  threshold — "a minimum of forty percent of the total marks in respect of
  each category of ASOC" — with no per-part minimum in the legal text
  itself. A **separate, letterhead-verified WPC Wing administrative letter**
  (No. P-14036/02/2023-COP, dated 05.12.2024, official DOT letterhead,
  signed, Question 8) adds an explicit **dual requirement for both
  categories**: "Minimum 40% in both Part A and Part B of the written exam"
  **and** "40% overall" — i.e. within *this* letter, "part" unambiguously
  means the written paper's Part A/Part B split, not a written-vs-Morse
  split. This reading of the letter is **confirmed, not inferred** (the
  table was read directly off the rendered PDF page after text extraction
  failed). A **separate, WPC-attributed but not letterhead-verified**
  document — a FAQ dated 9 Nov 2024 (qsl.net/vu2jos/FAQ.pdf), chronologically
  *earlier* than the 05.12.2024 letter — states only "a minimum of 40% of
  the total marks," no per-part mention. The two documents' wording
  conflicts, and **which one reflects the currently applicable examination
  policy is a separate, unresolved question this assessment does not
  answer** — not resolved by date order (the earlier document's silence on
  a per-part minimum is not evidence the requirement doesn't apply, and no
  document postdating 05.12.2024 was found either way); see §3 and §6 for
  the full account.
- Question counts and durations — **Restricted: 50 MCQ (25+25 across Part
  A/Part B), 1 hour; General: 100 MCQ (50+50), 2 hours; 100 marks each** —
  now directly confirmed by a WPC Wing FAQ, "Frequently asked questions
  regarding Amateur Radio Examination / License (9 Nov 2024)," Q4 ("The
  Restricted Grade examination consists of 25 Questions each in Part A and
  Part B and is for one hour. The General Grade Examination consists of 50
  Questions each in Part A and Part B and is for two hours."), retrieved via
  qsl.net/vu2jos/FAQ.pdf and extracted directly with `pdftotext` (not a
  search-engine summary). This document does not state a document reference
  number, is not on official DOT/WPC letterhead (no visible letterhead in
  the extracted text), and conflicts with the 05.12.2024 WPC letter on the
  pass-threshold question (above) — treat the counts/duration/format finding
  as **confirmed by a document attributed to WPC** rather than
  gazette-verified. Negative marking: **not found in any source checked**,
  including the 05.12.2024 WPC letter's own Question 8 pass-criteria table,
  which would be the natural place to state it if it existed.
- **No official public question pool was found** ("not found in the sources
  checked" — not proof of absence; wpc.dot.gov.in was unreachable). Any
  Indian question bank in the app is therefore author-curated practice
  content, and practice exams must not be presented as exact replicas of
  official examinations.
- Provenance: the **Vigyan Prasar** book (*A Guide to Ham Radio*, © 2000,
  ISBN 81-7480-068-9) states only "© 2000 by Vigyan Prasar" — **no reuse
  terms**; free mirror downloads are not a licence. A second, distinct
  Vigyan Prasar publication, *A Comprehensive Study Material for the Ham
  Radio Enthusiasts* (created 3 May 2000 per its own PDF metadata; retrieved
  via qsl.net/vu2kyp/hamstudy.pdf), carries **no copyright statement at all**
  in its extracted text (checked directly, not assumed) — treat it the same
  as all-rights-reserved pending contrary evidence, since absence of a
  statement is not a licence either. **vigyanprasar.gov.in does not resolve**
  (re-checked this pass: DNS failure, `ENOTFOUND`) despite appearing in
  search-engine results for a page titled "A Guide To Ham Radio" — the
  official host is unreachable, not merely slow or paywalled. The **NCVEC
  pools carry an explicit public-domain dedication** on each release page
  (confirmed for the 2026-2030 Technician, 2023-2027 General, and 2024-2028
  Extra pools; exact wording re-verified this pass, e.g. "The NCVEC Question
  Pool Committee (QPC) hereby releases the 2026-2030 Technician Class
  (Element 2) Question Pool into the public domain") — **the dedication's
  own wording does not explicitly mention figures/diagrams**, only "the
  Question Pool" generically, so figure reuse is not separately confirmed by
  this statement; adapting NCVEC question wording for universal
  radio/electronics topics is permissible on the stated terms, reproducing
  Vigyan Prasar text or figures is not, absent permission, and reusing any
  NCVEC figure for an India edition would need its own check, not an
  extension of the question-text dedication.

## 2. Categories and eligibility

| Item | Finding | Source (retrieved 7–8 Oct 2026) | Status |
|---|---|---|---|
| Governing instrument | Telecommunications (Amateur Services) Rules, 2024; G.S.R. 675(E) notified 29-10-2024, effective 30-10-2024; under Telecom Act 2023 s.47/56(zi); supersedes the 1978 IWTA Rules | Gazette text via qsl.net/vu2jos/WPC2020.pdf (mirror of DoT gazette copy, incl. CG-DL-E-01112024-258404); India Code index entry | confirmed |
| Categories | ASOC (General), ASOC (Restricted) only (Rule 3(2)); older licence names abolished | 2024 Rules Rules 2(e), 3(2) (gazette mirror) | confirmed |
| Age | ≥ 12 years (Rule 4(1)(a)) | 2024 Rules Rule 4 (gazette mirror) | confirmed |
| Citizenship | Indian citizen; foreign nationals discretionary with MEA clearance (Rules 4(2), 6(3)) | 2024 Rules Rules 4, 6 (gazette mirror) | confirmed |
| Education | No educational qualification in the rules | absence in Rule 4 + consistent secondary club reporting | inference |
| Exam fee | ₹100 (Rule 5(2)) | 2024 Rules Rule 5 (gazette mirror) | confirmed |
| Exam vs. licence | One instrument: ASOC is both qualification and operating authority; call sign issued with the certificate; no separate station licence; grant fee payable within 2 years of results | 2024 Rules Rules 3(1), 5, 6(1), 6(2), 7(3) (gazette mirror); WPC OM P-14036/03/2023-COP 28.02.2025 (Saral Sanchar one-step application, effective March 2025) | confirmed (fee amounts ₹1,000/₹2,000 and 20-yr/lifetime validity: inference from secondary sources; the Rule 6 fee table was image-based and did not extract) |
| Portal | Saral Sanchar (saralsanchar.gov.in); applications, results, and QR-authenticated digital certificate all portal-based (Rule 15) | 2024 Rules Rule 15; DoT e-services ASOC page (eservices.dot.gov.in, updated 2025-05-28); DoT Annual Report 2024-25 | confirmed |
| Minor applicants | "Undertaking certificate (for students between ages 12 and 18)" appears in 2025 admit-card instructions. A second source found this pass, the IIH FAQ (indianhams.com/faq.pdf, Q2), independently and more specifically states: "Applicants between 12-18 years can apply for the RESTRICTED grade examination by providing an Undertaking by the parent/guardian in the prescribed format," with the same for General; applicants over 18 need no undertaking | VU2NXM admit-card notes (secondary); IIH FAQ Q2 (secondary, society-hosted, undated — found and read this pass) | two independent secondary sources now agree on the practice and one gives its exact mechanics; still not found directly in the Rules text itself, so labeled **inference from two independent secondary sources** rather than confirmed |

Implication for the app: newcomer guidance should describe the ASOC as the
single qualification-and-operating certificate, eligibility as citizen + ≥12
years, and the application flow via Saral Sanchar. None of this requires app
features beyond Help content.

## 3. Syllabus and examination structure

### Syllabus

The long-standing official syllabus document — *"Syllabus and details of
examinations for the award of Amateur Station Operator's Licence (Restricted)
and (General)"* (WPC/DoT, undated) — divides the exam into **Part I – Written
Test** (one paper, two sections) and **Part II – Morse (General only)**:

- **Section A: Radio Theory and Practice** — Restricted: elementary
  electricity/magnetism, AC theory, semiconductors, receivers, transmitters,
  propagation, aerials, frequency measurement. General adds communication
  principles/modulation, transformers, power supplies, facsimile/TV,
  ionospheric detail, microwave/satellite aerials, space communications.
- **Section B: Radio Regulations** — same for both grades: the Indian
  amateur rules, ITU Radio Regulations (emission designations, phonetic
  alphabet/figure code, frequency allocations, distress/urgency, Q-codes).
- Degree/diploma holders in electronics/telecommunication are **exempt from
  Section A** (old syllabus document note).

Sources: SIARS mirror (siars.org.in/amateur-radio/licensing/syllabus/);
indianhams.com syllabus PDF — both secondary mirrors of the official
document; wpc.dot.gov.in and eservices.dot.gov.in both still unreachable on
re-check this pass. Status: **confirmed as the published syllabus content;
its currency/effective date unresolved**. Note also that under the 2024
Rules (Rule 5(3)) the Government publishes the syllabus per examination
notification, so there may no longer be a single standing "syllabus
version" — a current WPC examination notice should be obtained before
content is finalized. The term "Section A"/"Section B" in this older
document and "Part A"/"Part B" in the WPC FAQs below (§"Restricted vs.
General examination" and §1) refer to the same two written topics (Basic
Electronics/Radio Theory, then Radio Regulations) under different
documents' own vocabulary — this assessment treats them as the same split,
not two different splits, based on identical topic descriptions across
both, but no single document was found using both words for the same
concept to confirm the equivalence directly.

### Restricted vs. General examination

| Item | ASOC (Restricted) | ASOC (General) | Status |
|---|---|---|---|
| Written parts | Part I only | Part I | confirmed, **WPC-attributed, not letterhead-verified** (WPC-attributed FAQ, 9 Nov 2024, Q8/Q10, and the separate IIH FAQ Q10, both independently describing "Part I and II" with Restricted granted on Part I alone — neither copy shows a reference number or signature, unlike the 05.12.2024 letter) |
| Written sections | Part A (Basic Electronics) + Part B (Radio Regulations) | same | confirmed, **WPC-attributed, not letterhead-verified** (WPC-attributed FAQ, 9 Nov 2024, Q4, exact wording: "The examination consists of two parts; Part A: Basic Electronics and Part B: Radio Regulations") |
| Questions | 50 MCQ — 25 in Part A, 25 in Part B | 100 MCQ — 50 in Part A, 50 in Part B | confirmed, **WPC-attributed, not letterhead-verified** (WPC-attributed FAQ, 9 Nov 2024, Q4, quoted above in §1) — this document names itself as WPC's but carries no visible letterhead or reference number in the retrieved copy, unlike the 05.12.2024 letter |
| Options per question | 4 | 4 | confirmed (IIH FAQ Q5: "25 Objective questions (with four choice)"; sample papers) |
| Duration | 1 hour | 2 hours | confirmed, **WPC-attributed, not letterhead-verified** (WPC-attributed FAQ, 9 Nov 2024, Q4) |
| Total marks | 100 | 100 | confirmed (05.12.2024 WPC letter Q8 table: "the maximum marks will be 100" per the IIH FAQ's parallel wording; sample papers) |
| Language | English | English | confirmed (Rule 5(4): "The language of such examination shall be English") |
| Pass threshold | Rule 5(5)/(4) itself: ≥40% of total marks only. Letterhead-verified WPC Wing letter (05.12.2024, Q8): **additionally** ≥40% in both Part A and Part B | same two-tier structure as Restricted, **plus** Morse | **The ambiguity in what "part"/"40%" means is resolved — within the 05.12.2024 letter itself. Whether that letter is the currently applicable examination policy is a separate, unresolved question**, recorded as such rather than answered. The Rules' own text (both the final G.S.R. 675(E) rule 5(5) and the draft G.S.R. 447(E) rule 5(4), independently checked) states only one number, "forty percent of the total marks," no per-part language. A **letterhead-verified** WPC Wing letter (No. P-14036/02/2023-COP, 05.12.2024, DOT letterhead, signed by name and designation, routed "for uploading on DOT website") answers "What is the passing criteria for the grant of an ASO Certificate?" with a table requiring "Minimum 40% in both Part A and Part B of the written exam" **and** "40% overall," identically for General and Restricted — within this one document, the part/section wording is unambiguous. A **different, WPC-attributed but not letterhead-verified** FAQ, dated 9 Nov 2024 — chronologically *earlier* than the 05.12.2024 letter, not later — states only "a minimum of 40% of the total marks," with no per-part split at all. The two documents' wording conflicts; this assessment records that conflict rather than resolving it by assumption in either direction: it does **not** assume the earlier (9 Nov) document was superseded by the later (05.12) one merely because of date order (an FAQ's existence is not proof of its own completeness, and the 9 Nov document's silence on per-part minimums is not evidence they don't apply), and it equally does **not** assume the 05.12 letter remains the policy today, since no document postdating 05.12.2024 confirming either position was found. Only a current examination notice, or direct access to a document plainly dated after 05.12.2024, would settle which structure currently governs. Separately, neither source, nor the Rules text, states the *older* syllabus document's 50%/60% aggregate figures as still current; this assessment does **not** declare those old figures superseded by inference from a newer overall-only mention (the prior draft of this document did exactly that and has been corrected) — it instead reports that the 05.12.2024 letter, the most specific and most letterhead-verified source found, states 40%-per-part-and-overall for both grades, full stop, and that the old 50%/60% aggregate numbers were not found in any 2024-or-later document. |
| Negative marking | not found in any source | not found in any source | unresolved — checked specifically against the 05.12.2024 WPC letter's own pass-criteria table (the natural place to state it), which is silent on it; do not encode "none" as fact |
| Morse | none | required: minimum 8 wpm, both transmission and reception (WPC letter 05.12.2024 Q8 table: "Minimum 8 words per minute in both transmission and reception"); mechanics unresolved — three sources describe mechanics differently and do not confirm each other: the old syllabus document describes a 200-character plain-language reception passage, 5 minutes, more than 5 errors disqualifying, and 5 consecutive minutes of sending; ARSI's FAQ page (arsi.info/faq/) is reported, via a page-summarization tool rather than raw HTML this assessment read directly, as stating "Morse pass requirement: Receive without mistakes for 1 minute" with no wpm figure on that page — this one quote carries weaker provenance than the PDF-extracted quotes elsewhere in this document and should be re-read directly from the live page before being relied on; the 05.12.2024 WPC letter states only the 8 wpm figure with no duration or error-count mechanics at all | Morse requirement and its 8 wpm figure: confirmed (WPC letter 05.12.2024, official letterhead). Detailed pass mechanics (duration, error tolerance): **unresolved, conflicting** across the three sources above — do not pick one as authoritative without a current examination notice or syllabus document that states mechanics explicitly |
| Practical assessment | none found in rules or syllabus | none found | confirmed (absence in rules) / inference |

GSR citation note: the Rules' own notification header (New Delhi, 29 October
2024, read directly from the gazette-mirror PDF) reads "**G.S.R. 675(E)**,"
and the final rules' own recital cross-references the precursor draft as
"**G.S.R. 447(E)**, dated the 24th July, 2024" — a citation this assessment
independently confirmed by locating and reading the draft notification
itself (a user-supplied local PDF, "Gazette-Notification-of-Draft-
Telecommunications-Amateur-Station-Operator-Rules-2024.pdf," whose own
header reads "G.S.R. 447(E)," New Delhi, 24 July 2024, Gazette of India
Extraordinary Part II Section 3(i), No. 408). The 05.12.2024 WPC letter's
own "Reference" line instead reads "GSR 657(E) dated 29.10.2024." Given two
independent primary documents (the final rules' own header and its own
internal cross-reference to the draft) agree on 675(E)/447(E), this
assessment now treats "GSR 657(E)" on the WPC letter as **very likely a
transposition typo** (657 vs. 675) in that one administrative letter, not
evidence of a second, different notification — upgraded from the prior
draft's "likely a FAQ typo" (unresolved) to this specific, evidenced
conclusion, though confirming it against egazette.gov.in directly remains
the way to close it completely.

Exam administration (procedure, not rules): application online via Saral
Sanchar; the exam itself is conducted by Wireless Monitoring Stations at
notified centres several times a year; current practice is pen-and-paper MCQ
(OMR-style booklets) — the mode is per the session notice (Rule 5(3)) and no
primary source mandates computer-based testing. Sources: DoT e-services ASOC
page (primary, step list); ARCCS guidelines 2018, NBARS, candidate reports
(secondary). Status: application online **confirmed**; offline centre-based
conduct **inference from consistent secondary reports**.

## 4. Question-bank status

**Not found in the sources checked.** No NCVEC-style official public question
pool is published by DoT/WPC in any source reachable during research. The
2024 Rules commit the Government only to publishing the syllabus and
examination arrangements (Rule 5(3)); sample and past-style papers circulate
via amateur societies and training institutes (SIARS, GIAR, AARS, DARTS,
NIAR), and commercial prep sites state they are independent curations.
Sources checked: dot.gov.in (e-services page and static uploads, including
the Annual Report 2024-25), the Gazette text of the 2024 Rules (both the
final G.S.R. 675(E) and the draft G.S.R. 447(E), independently checked this
pass), all three WPC FAQ documents found (9 Nov 2024, 05.12.2024, and the
undated IIH copy — §1/§3), Saral Sanchar references via DoT/NIAR pages,
targeted web searches for DoT/WPC-hosted question banks repeated this pass
(no public pool found), ARSI (arsi.info, re-checked this pass per a direct
tip that it is India's national amateur radio society), and wpc.dot.gov.in
(connection refused on re-check this pass — absence cannot be certified for
that domain).

Implication: any Indian question bank in the app must be **authored
practice content**, labeled as such, and practice exams must not be
presented as exact replicas of official examinations. Authored questions may
reference syllabus topics and official rules; they must not present
themselves as official, leaked, or "the real pool."

## 5. Source and reuse/provenance inventory

| Source | What it is | Reuse terms found | Status |
|---|---|---|---|
| NCVEC question pools (Technician 2026-2030, General 2023-2027, Extra 2024-2028) | Official US question pools, already used by this app | Each pool release page states verbatim that the QPC "releases [the pool] into the public domain" — exact wording re-verified this pass directly from ncvec.org/index.php/2026-2030-technician-question-pool: "The NCVEC Question Pool Committee (QPC) hereby releases the 2026-2030 Technician Class (Element 2) Question Pool into the public domain." Public-domain dedication is per-pool and per-release. **The dedication's own wording covers "the Question Pool" generically and does not separately name figures/diagrams**; the page lists diagram files separately from the dedication statement — treat figure reuse as a distinct, unconfirmed question, not an extension of the question-text dedication. | confirmed (text); **figure coverage not confirmed by this wording — unresolved if figures are ever proposed for reuse** |
| *A Guide to Ham Radio — A comprehensive Guide book for the Ham Radio Enthusiasts*, Vigyan Prasar, © 2000, ISBN 81-7480-068-9, compiled by Sandeep Baruah (VU2MUE) | The user-mentioned Vigyan Prasar amateur-radio ebook; Indian-licensing oriented; contains a rules Q&A section (book pp. 33–41) and a sample ASOC question paper (p. 136 ff.); no statement of the questions' provenance | Title page states only "Copyright : © 2000 by Vigyan Prasar". No public-domain dedication, no Creative Commons, no permission grant found. | confirmed (title/edition/content); **no reuse terms stated — treat as all rights reserved**; authoritative gov.in hosting not located (vigyanprasar.gov.in genuinely does not resolve — re-checked this pass, DNS `ENOTFOUND` — despite appearing in search-engine results; only third-party mirrors live) |
| *A Comprehensive Study Material for the Ham Radio Enthusiasts*, Vigyan Prasar (an autonomous body under the Dept. of Science & Technology per its own foreword), PDF metadata dated 3 May 2000 | A second, distinct Vigyan Prasar publication from the one above — found and confirmed this pass (qsl.net/vu2kyp/hamstudy.pdf; a byte-identical copy was separately supplied locally, `/home/salim/Downloads/hamstudy.pdf`). States the 100-mark/50+50-split exam structure consistent with other sources (its own text, line ~250: "the examination consists of a 100 marks question paper (50 marks related to basic radio/electronics theory as..."), corroborating the longstanding structure though dated 24 years before the 2024 Rules. Contains theory content only, no sample exam paper. | **No copyright statement of any kind found** in the extracted text (checked directly, not assumed from the absence of a search result) — absence of a stated copyright is not a licence; treat identically to all-rights-reserved pending contrary evidence | confirmed (title/date/content/no-statement-found) |
| Amateur-society sample papers (SIARS, GIAR, ARCCS, IIH, etc.) | Unofficial sample/past-style papers and FAQ compilations | No reuse terms; society-circulated. One IIH-hosted FAQ (indianhams.com/faq.pdf) republishes what it labels "FAQ by WPC" with pass-percentage wording that differs from a more official, later-dated WPC letter — see §3; treat society copies of government FAQs as potentially stale, not as independent authority | treat as all rights reserved unless a society states otherwise |
| Circulating question collections (e.g. VU2NXM question-bank notes) | Unofficial compiled study notes | No reuse terms found | unresolved — do not incorporate |
| Syllabus document and 2024 Rules text | Official Indian government works | Indian government works; factual/syllabus topics may be referenced; verbatim question reproduction still requires care | reference facts — permissible; verbatim reproduction — avoid absent confirmation |

Permission tiers, distinguished as required. **Corrected framing this
pass:** permission for Vigyan Prasar or society material is a constraint on
*reproducing or adapting that specific material*, not a blanket blocker on
starting an independently authored practice bank — an authored bank that
only references syllabus topics (not Vigyan Prasar's or a society's actual
wording) needs none of the permissions below.

- **Referencing facts** (syllabus topics, rule provisions, pass marks,
  category names): supported by the sources above; cite them. No permission
  needed — this is not reproduction.
- **Adapting NCVEC question wording** for universal radio/electronics topics:
  permitted by NCVEC's explicit public-domain dedication (verify the
  dedication still appears on any future pool release page before reuse);
  **NCVEC figures are not covered by this dedication's own wording** (see
  the table row above) — a separate check would be needed before reusing
  any NCVEC figure specifically, if one were ever proposed.
- **Reproducing or closely adapting specific Vigyan Prasar wording,
  questions, or figures**: not permitted on the evidence found ("© 2000,"
  no licence, for the first title; no copyright statement found at all for
  the second) — this applies only if such reproduction/adaptation is
  actually planned; it does not block independently authored content that
  merely covers the same syllabus topics. Would require permission from the
  rights holder (Vigyan Prasar's functions now sit with NIScPR per public
  government reorganization reporting — itself not independently verified
  by this assessment) before any such reproduction/adaptation.
- **Reusing society or personal question collections**: no terms found;
  treat as all rights reserved; same "applies only if reproduced/adapted"
  scoping as above.

## 6. Unresolved questions (ordered by what they block)

The prior draft of this section stated "no architecture blockers" as one
blanket conclusion. That framing conflated three genuinely different
questions — whether a provisional schema *shape* is plausible, whether
*exam-faithful* scoring/selection can be implemented today, and whether
content/release claims are supported — and is replaced below with those
three separated out, per this pass's direct reading of `scoreExam()` in
`src/app.js` and `scripts/pool-registry.js`'s validator.

**Permit provisional architecture assessment (Stage 8A2 can reason about
these now, without further evidence):**

- The engine is metadata-driven for pool/group identity (Stage 7E/7G): two
  Indian pools with their own ID scheme and counts are data, not new code,
  for *question selection and grouping* specifically.
- The Stage 7C figureless build path (no manifest, empty embedded figure
  registry, honest gate skip) already supports a figureless edition as
  proposed in §7, without new code.
- The pool-registry validator's US ID-shape/edition-slug policy
  (`scripts/pool-registry.js`'s `QUESTION_ID_RE`/`GROUP_ID_RE`/
  `EDITION_ID_RE`, all hardcoded to T/G/E and `technician|general|extra`)
  is known, scoped, derived-edition work, already recorded in
  `docs/EDITIONS.md` as such — not a new finding, but confirmed still
  accurate by reading the current file this pass.

**Block implementation of exam-faithful scoring or selection (real code
work, not configuration, confirmed by reading the current implementation
this pass):**

- `scoreExam()` (`src/app.js`, function starting at the `scoreExam(session)`
  declaration) computes one `correct` count across every question in the
  session and compares it to one scalar `config.passingScore`
  (`passed: correct >= passingScore`). It builds a `bySubelement` breakdown,
  but that breakdown is read only by the results-review display — nothing
  in `scoreExam()` reads it to decide pass/fail. There is no code path that
  evaluates a per-part/per-section minimum.
- `scripts/pool-registry.js` validates `passingScore` as a single positive
  integer not exceeding `examQuestionCount` (search `passingScore` in that
  file) — the schema has no nested per-part/per-section shape to express
  "40% in Part A and Part B, and 40% overall" even if the exact percentages
  were fully confirmed.
- If per-part minimums are adopted (pending resolution of which pass
  structure is current — see the Pass threshold row in §3), the work spans
  at least four areas, none of them configuration-only: **(a) scoring
  behavior** — `scoreExam()` would need a part/section-aware pass
  computation, not just the aggregate `correct >= passingScore` check;
  **(b) configuration/schema and validation** — the registry would need a
  new field shape (e.g. per-part minimums alongside or instead of a single
  `passingScore`) and `scripts/pool-registry.js` would need new validation
  rules for it, mirroring the care already taken for `groupBlueprint`;
  **(c) results presentation** — the results view (`src/app.js`'s rendering
  of `score.passed`/`exam-score-verdict` and the subelement table) would
  need to show per-part pass/fail, not just the aggregate verdict it shows
  today; **(d) compatibility tests** — `tests/mock-exam.spec.js`'s existing
  scoring assertions pass a US pool with a single `passingScore` today and
  would need new coverage for the per-part path without weakening the
  existing US assertions. None of this was attempted or estimated in
  detail; it is listed to show the shape of the work, not to schedule it.

**Affect content authoring or release claims (evidence gaps, not code
gaps):**

1. The current authoritative syllabus text and its effective date —
   wpc.dot.gov.in and eservices.dot.gov.in were both unreachable again this
   pass; only mirrors were readable. Would be resolved by a current WPC
   examination notice or the hosted syllabus on a reachable government
   domain.
2. **Resolved this pass, with a residual conflict**: question counts
   (25+25 Restricted, 50+50 General), duration (1 h/2 h), and the
   100-mark/4-option format are now confirmed, with WPC-attributed (not
   letterhead-verified) provenance, by a document attributed to WPC Wing
   ("FAQ...9 Nov 2024," Q4 — see §1/§3), not merely the old syllabus
   document. The residual conflict is the pass-threshold structure itself:
   that same 9 Nov 2024 document states only "a minimum of 40% of the
   total marks," while a
   separately-sourced, letterhead-verified WPC Wing letter dated
   05.12.2024 — chronologically later — states a two-tier
   40%-per-part-and-overall requirement (full account in §3). **This is two
   separate questions, not one**: within the 05.12.2024 letter, the
   per-part/overall structure is unambiguous; *whether that letter
   currently governs* is a distinct, unresolved question this assessment
   does not answer. Date order alone does not settle it (the earlier
   document's silence is not evidence the later requirement doesn't apply,
   and no document postdating 05.12.2024 was found). A current per-session
   examination notice is what would resolve it.
3. Negative marking: no source checked — including the 05.12.2024 letter's
   own pass-criteria table, the most specific document found — affirms or
   denies it. Would be resolved by a current examination notice.
4. Morse pass mechanics (duration, error tolerance) beyond the 8 wpm figure:
   three sources describe this differently and do not corroborate each
   other (§3). Would be resolved by a current examination notice or a
   reachable current syllabus document.

**Require permission, or are scoped correctly as not requiring it (§5, with
the blocker wording corrected this pass):**

5. Permission for Vigyan Prasar or society/personal-collection material is
   **not a blanket blocker on an independently authored practice bank** —
   it matters only for whatever specific wording, questions, or figures
   from those sources would actually be reproduced or adapted. An
   authored bank that references syllabus *topics* (not Vigyan Prasar's or
   a society's specific wording) does not need this permission at all; a
   bank that reproduces or closely paraphrases specific Vigyan Prasar
   passages, questions, or figures would. Scope the permission question to
   the actual authoring plan once one exists, rather than treating it as a
   standing block on starting content work.
6. Whether the app may describe its practice exams as aligned with current
   exam rules depends on items 2–4 above; absent full confirmation, UI copy
   must say "practice" and avoid "official"/"replica" claims — unchanged
   from the prior draft's position, still correct.

**Recorded discrepancies:**

- GSR number: **now resolved, evidenced** (§3) — the Rules' own notification
  header and its own internal cross-reference to its draft both read
  G.S.R. 675(E)/447(E); the 05.12.2024 WPC letter's "GSR 657(E)" is treated
  as a transposition typo in that one letter, not a second notification.
  Confirming against egazette.gov.in directly remains the way to close this
  completely, since both numbers were read via mirrors, not the gazette
  itself.
- Rule 6 certificate-fee table: **now confirmed, not merely inferred**
  (corrected from the prior draft, which reported this as a failed
  extraction) — ₹1,000/20-year or ₹2,000/lifetime-to-age-80, identically for
  both ASOC categories, is independently stated in prose (not a garbled
  table) by two FAQ documents (qsl.net/vu2jos/FAQ.pdf Q18; indianhams.com/
  faq.pdf Q19) and corroborated by the Rules' own Rule 6(1) fee table and
  its Explanation clause ("the expression 'lifetime' means till the ASOC
  holder attains the age of eighty years"), read directly from the NIAR
  compilation PDF this pass.

## 7. Proposed Restricted-grade MVP boundary

**Study practice vs. an exam-faithful mock examination — distinguished
explicitly, corrected this pass.** These are different claims with
different evidence bars. *Study practice* means topic-organized questions a
learner works through at their own pace, with no claim to replicate the
official exam's exact structure, timing, or pass computation — this is
supportable now (§3's syllabus-topic findings). An *exam-faithful mock
exam* additionally claims to match the official question distribution,
duration, and pass criteria — this requires the unresolved items in §6
(the pass-threshold conflict, negative marking, a current examination
notice) to be closed first, or it must not be presented as faithful.

**In scope — supported by evidence now, as study practice:**

- Syllabus-based study practice for Restricted: Part A and Part B topics
  from the published syllabus document, as an author-curated,
  clearly-labeled practice bank (no official-pool claims).
- The generic study engine as-is: sequential/random study order, bookmarks,
  progress, themes, scoped study by topic, offline standalone + PWA.
- Newcomer Help content grounded in §2 (two categories, citizen + ≥12 years,
  Saral Sanchar application flow, ASOC-as-licence model, ₹100 exam fee).

**Numbers removed from this section as proposed production defaults —
corrected this pass.** The prior draft proposed shipping the §3 figures (50
questions / 25+25 / 1 hour / 40%+40%) as the Mock Exam shell's *default*
configuration. That is no longer proposed here: those figures remain in
§3's evidence table with their actual confidence status (question
counts/duration: confirmed by a WPC-attributed document, but that same
document conflicts with another WPC-attributed document on the pass
threshold — see §3), not promoted to defaults a production build would
ship silently. Two different uses of these numbers going forward:

- **A synthetic experiment** (Stage 8B's own "clearly synthetic second
  edition," per `docs/MULTI_EDITION_PLAN.md`) may use explicitly fictional
  counts/duration/thresholds that make **no claim** about Indian
  examination behavior at all — its purpose is exercising the build's
  isolation seams, not modeling India's exam. Using real-looking Indian
  numbers there would misrepresent the experiment's own evidence basis;
  fictional numbers avoid that entirely.
- **A real India Mock Exam feature** (later, Stage 8D+) would need its
  configuration values either fully confirmed (closing §6's items) or
  explicitly labeled in-product as provisional/unconfirmed pending a
  current examination notice — not shipped as quiet defaults either way.

**Blocks an exam-faithful mock exam specifically (not study practice):**

- Presenting a mock exam as matching the official examination's exact
  question distribution, timing, or pass computation — blocked by §6's
  still-open pass-threshold conflict and the negative-marking and
  Morse-mechanics gaps.
- Per-part minimums in scoring (40% in each of Part A/Part B, plus 40%
  overall) — confirmed in this pass by the WPC letter's spelled-out
  (05.12.2024) wording, but implementing it is genuine work across four
  areas (scoring, schema/validation, results presentation, compatibility
  tests — the full breakdown is in §6), not a configuration-only change, and
  not attempted or scheduled by this document.

**Deferred scope (General grade; Morse) — not an inherent incapability,
corrected this pass.** The prior draft stated Morse was "outside a
question-bank app's reach." That overstates a scope decision as a technical
limitation: a web app is not inherently incapable of Morse
training/assessment (timed audio playback and timed keyed input are both
ordinary web-platform capabilities); this MVP boundary simply does not
include it, as a scope choice, not a claim about what's technically
possible.

- General-grade content (the General Part A extension topics) and its
  100-question/2-hour configuration — same evidence bar as Restricted,
  deferred to a later slice, not ruled out.
  Deferred, not precluded.

**Figureless as a proposed MVP choice, not a requirement — corrected this
pass.** The prior draft described the India edition as "figureless" in a
way that read as a property of the India edition itself. No evidence
found in this research requires the India edition to be figureless — no
official Indian question pool with figures was found (§4), but that is an
absence-of-evidence finding about content availability, not a requirement
the India edition must have no figures forever. The Stage 7C figureless
build path is available *if* the MVP author chooses not to include
figures (e.g. because no cleared figure source is in hand yet); a later
slice that found or authored a cleared figure source could use the Stage
7C figure pipeline seams instead.

**Requires permission or further provenance review, scoped to actual
reproduction/adaptation (§5, corrected this pass):**

- Reproducing or closely adapting specific Vigyan Prasar text, questions, or
  figures — not a blocker on independently authored content covering the
  same topics.
- Reusing any specific society or personal question collection — same
  scoping.

## 8. Implications for Stage 8A2 (assessment inputs, not design)

- The registry must encode two Indian pools (`restricted`/`general`) with an
  India-specific ID scheme — exercising exactly the pool-registry validator
  boundary Stage 7 left US-specific; parameterizing or replacing that
  validator is real work, not configuration.
- Per-part minimum scoring (40% in each of Part A/Part B, plus 40% overall)
  is confirmed as the WPC letter's stated requirement (§3), but implementing
  it spans scoring behavior, registry schema/validation, results
  presentation, and compatibility tests (§6's four-area breakdown) — not
  schema-only, and not attempted here.
- The India edition **may** be figureless as an MVP *choice* (no cleared
  figure source is in hand yet, §4/§7) — the Stage 7C figureless path (no
  manifest, empty embedded registry) supports that choice, but figurelessness
  is not itself a finding this research established as required.
- Storage/cache namespaces remain unimplemented-by-profile (Stage 7G
  recorded this): an India build needs its own keys, which is code work in
  `src/storage.js` and the PWA files.
- The question bank is authored content with a provenance labeling
  obligation; nothing found permits copying an existing collection, and
  permission questions apply only to material actually reproduced or
  adapted, not as a blanket block (§5/§6).
- Do not encode negative marking, per-part pass minima, Morse pass
  mechanics, or a mock exam's claim of exam-fidelity as settled until §6's
  content-authoring items are resolved; where numbers are used at all
  (e.g. a synthetic Stage 8B experiment), use either explicitly fictional
  values or the §3 figures labeled with their actual confidence status, not
  silent production defaults (§7).
