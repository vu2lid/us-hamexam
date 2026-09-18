"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { optimizeCss } = require("../../scripts/css-optimizer");

test("CSS optimizer preserves strings and escaped content", () => {
  const source = String.raw` /* discard */ .x { content: "a  b /* keep */"; url: url("https://example.test/a b"); --literal: '  spaced  '; } `;
  const optimized = optimizeCss(source);
  assert.match(optimized, /content:"a  b \/\* keep \*\//);
  assert.match(optimized, /url\("https:\/\/example\.test\/a b"\)/);
  assert.match(optimized, /--literal:'  spaced  '/);
  assert.doesNotMatch(optimized, /discard/);
});

test("CSS optimizer is deterministic and trims only safe syntax whitespace", () => {
  const source = "  /* one */ .a > .b, .c ~ .d { color : red ; content: 'x  y'; }  ";
  const expected = ".a>.b,.c~.d{color:red;content:'x  y';}";
  assert.equal(optimizeCss(source), expected);
  assert.equal(optimizeCss(source), optimizeCss(source));
});

test("CSS optimizer rejects non-string input", () => {
  assert.throws(() => optimizeCss(null), /expects a string/);
});
