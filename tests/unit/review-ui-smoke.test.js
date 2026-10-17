'use strict';
// Stage 8E3: browser-level smoke test for the generated review page
// (scripts/review-pipeline.js reviewHtml()), plus hostile-input tests for
// the same function. node:test + the `playwright` library directly (no
// @playwright/test runner, no new config file) so this stays inside the
// existing `npm run test:unit` node --test list. A real Chromium page is
// the only way to prove the generated <script> actually parses and runs; a
// string match on the HTML source (as a prior version of this suite
// effectively did) cannot tell an executed script from inert text that
// merely contains the same substrings -- and it is the only way to prove a
// hostile payload did NOT execute (vs. merely "the regex we wrote didn't
// match it").
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  chromium = null;
}
const p = require('../../scripts/review-pipeline.js');

function mkq(id, sub, q, extra = {}) {
  return Object.assign({id, sub, q, choices: {A: 'a', B: 'b', C: 'c', D: 'd'}, correct: 'A', correctText: 'a', ref: ''}, extra);
}
function fixtureDataDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'review-smoke-'));
  fs.writeFileSync(path.join(d, 'pools.json'), JSON.stringify({pools: {technician: {editionId: 't-1', revisionId: 'r-1', element: 2, displayName: 'Technician', withdrawnIds: []}}}));
  fs.writeFileSync(path.join(d, 'technician.json'), JSON.stringify([
    mkq('T2A01', 'T2A', 'What is a repeater?'),
    mkq('T5A01', 'T5A', 'What is Ohm’s law?', {correctText: 'DISTINCTIVE-ANSWER-TEXT-XYZZY', choices: {A: 'DISTINCTIVE-ANSWER-TEXT-XYZZY', B: 'b', C: 'c', D: 'd'}}),
  ]));
  return d;
}
const model = (id, over = {}) => Object.assign({id, syllabusRelevant: true, indianTopic: 'electronics', recommendation: 'keep', jurisdictionRisk: 'none', figureRightsWarning: 'none', rationale: 'portable topic'}, over);

function buildManifest() {
  const candidates = p.extractCandidates({dataDir: fixtureDataDir(), poolKeys: ['technician']}).candidates;
  return p.createManifest(candidates, [model('T2A01'), model('T5A01')], {model: 'smoke-test'});
}

// Every assertion below runs inside one browser session so the smoke test
// pays Chromium's startup cost once, not once per check.
test('review page: loads clean, renders, accepts a decision, reveals, downloads, and J/K navigates', {skip: !chromium && 'playwright/chromium not available in this environment'}, async () => {
  const manifest = buildManifest();
  const html = p.reviewHtml(manifest, '');
  const pageErrors = [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => pageErrors.push(err));
    await page.setContent(html, {waitUntil: 'load'});

    // 1. No JavaScript parse/runtime error on load.
    assert.deepEqual(pageErrors, [], 'page threw: ' + pageErrors.map(String).join('; '));

    // 2. First candidate renders into #app (not just present in page source).
    const appText = await page.locator('#app').innerText();
    assert.match(appText, /What is a repeater\?/);
    assert.match(appText, /T2A01/);
    assert.match(appText, /Model suggestion/);

    // Reveal is gated: the #answer element exists (so reveal has something
    // to un-hide) but stays hidden until the human clicks Reveal.
    assert.equal(await page.locator('#answer').isHidden(), true);

    // 3. Decision control changes update in-page state.
    await page.selectOption('#a', 'keep');
    const action0 = await page.evaluate(() => manifest.items[0].decision.action);
    assert.equal(action0, 'keep');

    // J/K navigation: move to the second candidate, reveal its answer there.
    await page.keyboard.press('j');
    const appText2 = await page.locator('#app').innerText();
    assert.match(appText2, /T5A01/);
    await page.click('#reveal');
    const revealed = await page.locator('#answer').innerText();
    assert.match(revealed, /DISTINCTIVE-ANSWER-TEXT-XYZZY/);
    await page.keyboard.press('k');
    const back = await page.locator('#app').innerText();
    assert.match(back, /T2A01/);

    // 4. Save/download action works (no saveUrl -> Blob + <a download> path).
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#save'),
    ]);
    assert.equal(download.suggestedFilename(), 'india-review-manifest.json');
    const downloadPath = await download.path();
    const saved = JSON.parse(fs.readFileSync(downloadPath, 'utf8'));
    assert.equal(saved.items[0].decision.action, 'keep');
    assert.equal(saved.items[0].candidate.id, 'T2A01');
  } finally {
    await browser.close();
  }
});

// Loopback /save: with a saveUrl, the save button POSTs the manifest JSON
// instead of downloading it, exactly the path `review-cli.js serve --manifest-write`
// relies on. A relative fetch("/save") needs a real HTTP origin to resolve
// against (page.setContent()'s about:blank has none), so this test runs a
// tiny loopback server itself rather than approximating one.
test('review page: save posts to saveUrl when one is configured', {skip: !chromium && 'playwright/chromium not available in this environment'}, async () => {
  const manifest = buildManifest();
  const html = p.reviewHtml(manifest, '/save');
  const posts = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/save') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        posts.push(JSON.parse(body));
        res.writeHead(204);
        res.end();
      });
      return;
    }
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.selectOption('#a', 'adapt');
    await page.click('#save');
    await page.waitForFunction(() => document.querySelector('#savemsg').textContent.length > 0);
    assert.equal(await page.locator('#savemsg').innerText(), 'Saved locally.');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].items[0].decision.action, 'adapt');
    // The POST body re-attaches the real answer: the manifest round-trips
    // through save() even though the initial render redacted it.
    assert.equal(posts[0].items[0].candidate.correct, 'A');
  } finally {
    await browser.close();
    server.close();
  }
});

// Hostile-input coverage: quotes, backslashes, HTML/script content,
// Unicode line/paragraph separators, and C0 controls, each placed in a
// different field so a failure pinpoints which category broke. The browser
// is the judge of both halves of the claim: the page must still load with
// no parse error (quotes/backslashes/separators/controls did not break the
// generated <script>), AND the hostile HTML/script payload must render as
// literal inert text rather than executing (proven by a dialog handler
// that fails the test if it is ever called, and by the DOM text containing
// the payload's own angle brackets rather than a live child element).
test('review page: survives and round-trips hostile candidate/model text', {skip: !chromium && 'playwright/chromium not available in this environment'}, async () => {
  const QUOTES = 'He said "hello" and she said \'hi\' back.';
  const BACKSLASHES = 'C:\\path\\to\\file and \\n\\t literal backslash-n backslash-t';
  const HTML_PAYLOAD = '<script>window.__pwned="script"</script><img src=x onerror=\'window.__pwned="onerror"\'>';
  const UNICODE_SEPARATORS = 'line one\u2028line two\u2029paragraph three';
  const C0_CONTROLS = 'ctrl:\x00\x01\x07\x1f:end';

  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'review-hostile-'));
  fs.writeFileSync(path.join(d, 'pools.json'), JSON.stringify({pools: {technician: {editionId: 't-1', revisionId: 'r-1', element: 2, displayName: 'Technician', withdrawnIds: []}}}));
  fs.writeFileSync(path.join(d, 'technician.json'), JSON.stringify([
    {id: 'H1', sub: 'T2A', q: QUOTES, choices: {A: BACKSLASHES, B: 'b', C: 'c', D: 'd'}, correct: 'A', correctText: BACKSLASHES, ref: C0_CONTROLS},
  ]));
  const candidates = p.extractCandidates({dataDir: d, poolKeys: ['technician']}).candidates;
  const manifest = p.createManifest(candidates, [model('H1', {rationale: HTML_PAYLOAD, indianTopic: UNICODE_SEPARATORS})], {model: 'hostile-test'});

  // reviewHtml() itself must not throw, and its output's inline script must
  // be syntactically valid on its own (fast, no browser, independently
  // testable without the rest of this test).
  const html = p.reviewHtml(manifest, '');
  const scriptMatch = html.match(/<script>([\s\S]*)<\/scr/);
  assert.ok(scriptMatch, 'no inline <script> found in generated page');
  assert.doesNotThrow(() => new (require('node:vm').Script)(scriptMatch[1]));

  const pageErrors = [];
  const dialogs = [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => pageErrors.push(err));
    page.on('dialog', (dlg) => { dialogs.push(dlg.message()); dlg.dismiss(); });
    await page.setContent(html, {waitUntil: 'load'});
    assert.deepEqual(pageErrors, [], 'page threw: ' + pageErrors.map(String).join('; '));

    // The injected <script>/onerror payload never ran.
    assert.deepEqual(dialogs, []);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);

    // Every hostile field round-trips byte-for-byte through the in-page
    // `manifest` object -- proof the escaping is lossless, not just that
    // it avoided a crash.
    const roundTrip = await page.evaluate(() => {
      const i = manifest.items[0];
      return {
        question: i.candidate.question,
        choiceA: i.candidate.choices.A,
        ref: i.candidate.ref,
        rationale: i.model.rationale,
        indianTopic: i.model.indianTopic,
      };
    });
    assert.equal(roundTrip.question, QUOTES);
    assert.equal(roundTrip.choiceA, BACKSLASHES);
    assert.equal(roundTrip.ref, C0_CONTROLS);
    assert.equal(roundTrip.rationale, HTML_PAYLOAD);
    assert.equal(roundTrip.indianTopic, UNICODE_SEPARATORS);

    // The rendered DOM shows the HTML payload as literal escaped text
    // (its angle brackets visible as text, not interpreted as markup).
    const appHtml = await page.locator('#app').innerHTML();
    assert.ok(appHtml.includes('&lt;script&gt;') || appHtml.includes('&lt;img'), 'HTML payload was not escaped in the rendered DOM');
  } finally {
    await browser.close();
  }
});
