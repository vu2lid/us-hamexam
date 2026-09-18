"use strict";

const TRIM_WHITESPACE_AROUND = new Set(["{", "}", ":", ";", ",", ">", "~"]);

// Conservative packaging pass: comments and insignificant whitespace only.
// Quoted strings, including escapes, are copied byte-for-byte.
function optimizeCss(css) {
  if (typeof css !== "string") throw new TypeError("optimizeCss expects a string");
  let output = "", mode = "normal", quote = "", escaped = false, pending = false;
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (mode === "comment") {
      if (c === "*" && css[i + 1] === "/") { i += 1; mode = "normal"; pending = true; }
      continue;
    }
    if (mode === "string") {
      output += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) mode = "normal";
      continue;
    }
    if (c === "/" && css[i + 1] === "*") { i += 1; mode = "comment"; pending = true; continue; }
    if (c === '"' || c === "'") {
      if (pending && output && !TRIM_WHITESPACE_AROUND.has(output.at(-1))) output += " ";
      pending = false; mode = "string"; quote = c; output += c; continue;
    }
    if (/\s/.test(c)) { pending = true; continue; }
    if (pending && output && !TRIM_WHITESPACE_AROUND.has(output.at(-1)) && !TRIM_WHITESPACE_AROUND.has(c)) output += " ";
    pending = false; output += c;
  }
  return output.trim();
}

module.exports = { optimizeCss };
