'use strict';
// Stage 8E3 Part B: a deterministic, development-only policy layer that
// runs BEFORE any model-suggested recommendation is trusted. It exists
// because a model can describe a US-specific institution correctly in its
// own rationale and still recommend "keep" for it (observed in the
// 2026-10-14 Qwen pilot: RACES, FCC RF-exposure rules, and a "48 contiguous
// states" band-plan restriction were all described accurately and still
// scored jurisdictionRisk "none"/"low" with recommendation "keep"). This
// guard cannot be overridden by a model result for the same reason a
// regex either matches or doesn't: it runs on the candidate's own text,
// never on the model's output, so there is no model opinion for it to
// defer to in the first place.
//
// Scope: the question text and the correct answer's text, NOT the three
// wrong-answer choices. Exam distractors routinely name an adjacent but
// incorrect US-specific concept on purpose (e.g. one technician-pool
// question's wrong answer mentions "FCC rules on spectral purity" while
// the question itself, and its correct answer, are pure electronics); a
// guard that scanned every choice would reject that question for a
// decoy's sake. Scanning what is actually asked and actually taught is
// both more accurate and strictly conservative: every one of the matches
// below already fires on the question text alone.
//
// Each rule is intentionally narrow and independently testable (see
// tests/unit/jurisdiction-guard.test.js). A 7th, catch-all "mentions FCC
// by name" rule is deliberately broad: there is no legitimate generic use
// of that acronym in this question-pool domain, so matching on it alone
// carries no false-positive risk from homonym confusion, only the
// (intended) effect of catching regulatory content this list's other,
// more specific rules do not already name.
const RULES = [
  {
    id: 'fcc-part-97',
    category: 'Part 97 references',
    test: /\bpart\s*97\b/i,
    reason: 'names FCC Part 97, the US amateur-radio regulations',
  },
  {
    id: 'races-civil-defense',
    category: 'RACES and US civil-defense services',
    test: /\bRACES\b|\bcivil defense\b/i,
    reason: 'names RACES or a civil-defense service, a US-only amateur radio program',
  },
  {
    id: 'band-plan-us',
    category: 'US band-plan restrictions',
    test: (text) => /\bband\s*plan\b/i.test(text) && /\b48\s+contiguous\s+states\b|\bUnited States\b|\bUS stations\b/i.test(text),
    reason: 'describes a US-specific voluntary band-plan restriction',
  },
  {
    id: 'callsign-licensing-us',
    category: 'US call-sign/licensing rules',
    test: /\bUS[- ]licensed\b|\bvanity call sign\b|\bVolunteer Examiner\b|\bVEC\b/i,
    reason: 'describes a US-specific call-sign or licensing requirement',
  },
  {
    id: 'rf-exposure-us',
    category: 'US-specific RF-exposure or operating requirements',
    test: (text) => /\bRF\s+exposure\b/i.test(text) && /\bFCC\b/i.test(text),
    reason: 'describes FCC-specific RF-exposure requirements',
  },
  {
    id: 'us-self-declared',
    category: 'explicit United States framing',
    test: /\bin the united states\b/i,
    reason: 'explicitly frames the question as being about the United States',
  },
  {
    id: 'fcc-reference',
    category: 'FCC-only regulatory references',
    test: /\bFCC\b/i,
    reason: 'names the FCC, a US-only regulatory body with no India ASOC analogue',
  },
];

// Candidate -> {flagged, rule, category, reason, verdict}. verdict is
// always "reject" when flagged: every rule above only fires on a
// conservative, specific signal, so when one does fire the result is
// meant to be acted on, not treated as a soft hint.
function evaluateGuard(candidate) {
  const text = String(candidate.question) + ' ' + String(candidate.correctText);
  for (const rule of RULES) {
    const matched = typeof rule.test === 'function' ? rule.test(text) : rule.test.test(text);
    if (matched) {
      return {flagged: true, rule: rule.id, category: rule.category, reason: rule.reason, verdict: 'reject'};
    }
  }
  return {flagged: false, rule: null, category: null, reason: null, verdict: null};
}

module.exports = {RULES, evaluateGuard};
