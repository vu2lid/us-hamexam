"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { stripJsComments } = require("../../scripts/strip-js-comments");

test("stripJsComments removes line comments and preserves line structure", () => {
  const source = "var a = 1; // trailing note\n// whole line\nvar b = 2;\n";
  const stripped = stripJsComments(source);
  assert.equal(stripped, "var a = 1;\nvar b = 2;\n");
});

// Review regression: dropping the newline after a removed line comment
// joined the next line onto the current one, changing semantics ("b // c\nin
// d" became "b in d") or re-reading a leading "/re/" line as division.
test("stripJsComments preserves line structure after trailing comments", () => {
  const source = "var a = b // why\nin c ? 1 : 2;\nfoo() // call\n/g/.test(x);\n";
  const stripped = stripJsComments(source);
  assert.equal(stripped, "var a = b\nin c ? 1 : 2;\nfoo()\n/g/.test(x);\n");
  // The first two lines parse unchanged (no "b in c" merge):
  assert.doesNotThrow(
    () => new Function("var a = b\nin c ? 1 : 2;"),
    "line structure must be preserved"
  );
});

test("stripJsComments keeps a regex on the line after a comment line intact", () => {
  const source = "// a comment line\nvar r = /^x+/;\n";
  const stripped = stripJsComments(source);
  assert.equal(stripped, "\nvar r = /^x+/;\n");
  assert.doesNotThrow(() => new Function(stripped), "stripped output must parse");
});

test("stripJsComments removes block comments without merging tokens", () => {
  const source = "a/*x*/b; /* multi\nline */ c;";
  const stripped = stripJsComments(source);
  assert.equal(stripped, "a b;\n c;");
});

test("stripJsComments preserves strings byte-for-byte", () => {
  const source = String.raw`var u = "https://example.test/a//b/*c"; var s = 'it\'s // not a comment';`;
  const stripped = stripJsComments(source);
  assert.equal(
    stripped,
    String.raw`var u = "https://example.test/a//b/*c"; var s = 'it\'s // not a comment';`
  );
});

test("stripJsComments rejects template literals, unterminated strings, and bad input", () => {
  assert.throws(() => stripJsComments("var t = `x`;"), /template literals/);
  assert.throws(() => stripJsComments('var s = "unterminated\nnext();'), /unterminated string/);
  assert.throws(() => stripJsComments("/* never closed"), /unterminated block comment/);
  assert.throws(() => stripJsComments(null), /expects a string/);
});

test("stripJsComments is deterministic", () => {
  const source = "// a\nvar x = 1; /* b */\n";
  assert.equal(stripJsComments(source), stripJsComments(source));
});

// Regression tests for the review finding that the scanner never parsed
// regex literals: `var r = /\//;` was corrupted to `var r = /\`. Every
// positive case must also remain syntactically valid JavaScript.
function assertStripsToValidJs(source, expected) {
  const stripped = stripJsComments(source);
  assert.equal(stripped, expected);
  assert.doesNotThrow(() => new Function(stripped), "stripped output must parse");
}

test("regex literals with escaped slashes survive (review regression case)", () => {
  assertStripsToValidJs("var r = /\\//; // slash\n", "var r = /\\//;\n");
  assertStripsToValidJs("var r = /\\/\\//; // doubled\n", "var r = /\\/\\//;\n");
});

test("regex literals with character classes survive", () => {
  assertStripsToValidJs("var r = /[/]/; // class\n", "var r = /[/]/;\n");
  assertStripsToValidJs("var r = /[/\\]]/; // class with escape\n", "var r = /[/\\]]/;\n");
  assertStripsToValidJs("var r = /[a/]b/; // slash inside class\n", "var r = /[a/]b/;\n");
});

test("regex literals containing comment-looking sequences survive", () => {
  // A regex whose body contains the literal "/*": only escape-awareness
  // keeps this from starting block-comment mode.
  assertStripsToValidJs("var r = /\\/\\*/.source; // literal star\n",
    "var r = /\\/\\*/.source;\n");
  assertStripsToValidJs("var r = /[/]+/; // greedy class\n", "var r = /[/]+/;\n");
  assertStripsToValidJs("var r = /^https?:\\/\\//; // url prefix\n",
    "var r = /^https?:\\/\\//;\n");
});

test("division is not mistaken for a regex", () => {
  assertStripsToValidJs("var x = a / b; // divide\n", "var x = a / b;\n");
  assertStripsToValidJs("x /= 2; // compound assign\n", "x /= 2;\n");
  assertStripsToValidJs("var y = a / b / c;\n", "var y = a / b / c;\n");
  assertStripsToValidJs("var z = (a) / b; // after paren\n", "var z = (a) / b;\n");
});

// Review regression: after closing a regex the previous-token state was "/",
// so "var x = /a/ / b;" made the scanner treat the division slash as a new
// regex and throw "unterminated regex literal". A regex ends an expression:
// division after it (with or without flags) must be copied as-is.
test("division after a regex literal is not a new regex", () => {
  assertStripsToValidJs("var x = /a/ / b; // div after regex\n", "var x = /a/ / b;\n");
  assertStripsToValidJs("var x = /a/g / b; // flags then div\n", "var x = /a/g / b;\n");
  assertStripsToValidJs("var x = /a/gi / b; // multi-flag div\n", "var x = /a/gi / b;\n");
});

test("regex method and property access still works", () => {
  assertStripsToValidJs("var t = /a/.test(x); // method\n", "var t = /a/.test(x);\n");
  assertStripsToValidJs("var s = /a/gi.source; // property after flags\n",
    "var s = /a/gi.source;\n");
  assertStripsToValidJs("var r = /[/]/.lastIndex; // class then property\n",
    "var r = /[/]/.lastIndex;\n");
  assertStripsToValidJs("var m = /a/.exec(s) || /b/; // regex after regex-ish\n",
    "var m = /a/.exec(s) || /b/;\n");
});

test("regex after expression-incapable keywords and punctuation", () => {
  assertStripsToValidJs("function f(x) { return /\\d+/; } // digits\n",
    "function f(x) { return /\\d+/; }\n");
  assertStripsToValidJs("var t = typeof /x/; // typeof\n", "var t = typeof /x/;\n");
  assertStripsToValidJs("f(/a/, /b/); // args\n", "f(/a/, /b/);\n");
  assertStripsToValidJs("var r = (/x/).source; // grouped\n", "var r = (/x/).source;\n");
});

test("unterminated regex literal throws", () => {
  assert.throws(() => stripJsComments("var r = /abc;"), /unterminated regex/);
  assert.throws(() => stripJsComments("var r = /ab\nc/;"), /unterminated regex/);
  assert.throws(() => stripJsComments("var r = /[ab/;"), /unterminated regex/);
});


// Packaging guard: the four modules inlined by scripts/build.js must remain
// strippable by this scanner (no template literals; no regex literal in the
// ambiguous after-")"/identifier division position containing "//" or "/*").
// If this test fails after a source edit, extend the scanner or opt that
// module out in build.js -- never weaken this fixture to silence it.
test("all inlined src modules are comment-strippable and stay comment-free of hazards", () => {
  const srcDir = path.join(__dirname, "..", "..", "src");
  for (const file of ["app.js", "storage.js", "study-scope.js", "exam-engine.js"]) {
    const source = fs.readFileSync(path.join(srcDir, file), "utf8");
    const stripped = stripJsComments(source);
    assert.ok(
      stripped.length < source.length,
      `${file} should shrink when comments are stripped`
    );
    assert.doesNotMatch(stripped, /\/\/|\/\*/, `${file}: no comments may remain`);
  }
});
