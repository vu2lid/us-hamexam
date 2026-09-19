"use strict";

// Conservative packaging pass for the inline JS modules: comments only.
// Modeled directly on scripts/css-optimizer.js (same scanner shape, same
// conservatism). Applied ONLY to the generated inline copy; the source files
// under src/ keep their full comments, so maintainability is unaffected.
//
// Contract/limitations, by design (a violation throws rather than silently
// corrupting the bundle):
// - Single- and double-quoted strings, including escapes, are copied
//   byte-for-byte. A string that runs into a newline is rejected.
// - Template literals are NOT supported: a backtick outside a string throws.
//   (No src/ module currently uses them; a future adopter must extend the
//   scanner or opt out of stripping for that file.)
// - Regex literals ARE parsed: a "/" in code mode begins a regex literal
//   when the previous significant token cannot end an expression (absent, or
//   not an identifier character, digit, ")", "]", or "}", and not one of the
//   expression-incapable keywords return/typeof/case/in/of/do/else/new/
//   delete/void/throw/yield/await). Otherwise the "/" is division and is
//   copied as-is. Inside a regex literal, escapes ("/\/", "\\", ...) and
//   character classes ("[/]/": a "/" or "/*" inside [...] is literal) are
//   handled byte-for-byte; the literal ends at the closing unescaped "/" not
//   inside a class. A regex that hits end-of-input or a newline unterminated
//   throws. After the closing slash (and any flag letters, which normal mode
//   consumes as ordinary identifier characters) the previous-token state is
//   expression-ending, so a following "/" is division ("var x = /a/ / b;"),
//   never a new regex. The one residual ambiguity -- a regex immediately
//   after ")", "]",
//   "}", or an identifier (e.g. "x / /re/" or "split(/\/\//)") where division
//   is also legal -- is resolved as division; sources must not rely on that
//   shape (a "/" sequence inside such a regex would be misparsed). Keep the
//   src/ modules free of it, as the packaging-guard test enforces
//   strippability on the real files.
// - Line comments are removed through end of line but the terminating
//   newline IS emitted, so line structure (and ASI behavior) is preserved:
//   the next line always starts on its own line. Block comments become a
//   single space, or a single newline when they contained one -- never zero
//   width, so removing a comment can never merge two tokens (e.g. `a/*x*/b`
//   must not become `ab`).
const REGEX_KEYWORDS = new Set([
  "return", "typeof", "case", "in", "of", "do", "else", "new",
  "delete", "void", "throw", "yield", "await", "instanceof"
]);

function isIdentChar(c) {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") ||
         (c >= "0" && c <= "9") || c === "_" || c === "$";
}

function stripJsComments(source) {
  if (typeof source !== "string") {
    throw new TypeError("stripJsComments expects a string");
  }
  let output = "", mode = "normal", quote = "", escaped = false;
  // Previous significant (emitted, non-whitespace) character, and the
  // identifier token it ends when it is an identifier character -- used to
  // decide whether a "/" opens a regex literal or is division.
  let prevSig = "", prevIdent = "";
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (mode === "string") {
      if (c === "\n") {
        throw new Error("stripJsComments: unterminated string literal");
      }
      output += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) mode = "normal";
      continue;
    }
    if (mode === "regex") {
      output += c;
      if (escaped) { escaped = false; continue; }
      if (c === "\\") { escaped = true; continue; }
      if (c === "\n") {
        throw new Error("stripJsComments: unterminated regex literal");
      }
      if (quote === "class") {
        if (c === "]") quote = "regex";
        continue;
      }
      if (c === "[") { quote = "class"; continue; }
      if (c === "/") {
        // Closing slash. A regex literal ENDS an expression, so record the
        // previous significant token as expression-ending (same class as
        // ")" / "]" / "}" / identifier / number): a following "/" is then
        // division ("var x = /a/ / b;"), not a new regex. Any flag letters
        // (/a/gi) are consumed by normal mode as ordinary identifier
        // characters and leave that state intact.
        mode = "normal"; prevSig = ")"; prevIdent = "";
      }
      continue;
    }
    if (c === "'" || c === '"') {
      mode = "string"; quote = c; escaped = false; output += c;
      continue;
    }
    if (c === "`") {
      throw new Error(
        "stripJsComments: template literals are not supported by the comment stripper"
      );
    }
    if (c === "/" && source[i + 1] === "/") {
      // Line comment: consume through end of line, but EMIT the terminating
      // newline (the loop's i += 1 then steps past it) unless the output
      // already ends with one (e.g. a run of whole-line comments), so line
      // structure and ASI behavior are preserved: the next line always
      // starts on its own line. Dropping the newline instead would join the
      // next line onto the current one and change semantics ("b // c\nin d"
      // would become "b in d").
      while (i < source.length && source[i] !== "\n") i += 1;
      if (i < source.length && !output.endsWith("\n")) output += "\n";
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      let hadNewline = false;
      i += 2;
      while (i < source.length &&
             !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") hadNewline = true;
        i += 1;
      }
      if (i >= source.length) {
        throw new Error("stripJsComments: unterminated block comment");
      }
      i += 1; // consume the closing '/'; the loop's i += 1 handles the rest
      output += hadNewline ? "\n" : " ";
      continue;
    }
    if (c === "/") {
      // Regex literal vs division: a "/" opens a regex when the previous
      // significant token cannot end an expression. An identifier token
      // ends an expression only when it is NOT an expression-incapable
      // keyword (e.g. "return /re/" is a regex).
      const identEndsExpr = isIdentChar(prevSig) && prevIdent !== "" &&
        !REGEX_KEYWORDS.has(prevIdent);
      const canEndExpr = identEndsExpr || prevSig === ")" ||
        prevSig === "]" || prevSig === "}";
      if (prevSig === "" || !canEndExpr) {
        mode = "regex"; quote = "regex"; escaped = false; output += c;
        continue;
      }
      output += c; prevSig = c; prevIdent = "";
      continue;
    }
    output += c;
    if (/\s/.test(c)) continue; // emitted, but not significant for regex/division
    prevSig = c;
    if (isIdentChar(c)) prevIdent += c;
    else prevIdent = "";
  }
  if (mode === "string") {
    throw new Error("stripJsComments: unterminated string literal");
  }
  if (mode === "regex") {
    throw new Error("stripJsComments: unterminated regex literal");
  }
  // Final pass: trim trailing spaces/tabs per line (JS is never sensitive to
  // end-of-line whitespace) so removed comments do not leave trailing
  // whitespace or whitespace-only lines in the generated bundle.
  return output.replace(/[ \t]+$/gm, "");
}

module.exports = { stripJsComments };
