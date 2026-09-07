"use strict";

// Dependency-free CommonJS validator for the figure-asset manifest contract
// (Stage 2B). It defines and enforces the schema for `data/figures.json`, the
// restricted SVG/PNG subsets, source provenance, filesystem safety, and the
// cross-check against the Stage 2A question-to-figure mappings.
//
// This module is pure library code: requiring it runs no CLI and touches no
// files. Every exported function either works on in-memory values or takes an
// injected repo root and `fs` implementation, so unit tests use temporary
// fixture trees and never depend on production assets or mutate tracked data.
//
// Stage 2B scope: contract + validator + tests only. No official manifest, no
// official assets, and no wiring into `scripts/build.js`. The asset-acquisition
// slice supplies the real PDFs/assets/manifest and makes this validation a
// mandatory build gate (see docs/FIGURE_PIPELINE.md).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const figureRefs = require("./figure-references");

// ---------------------------------------------------------------------------
// Contract constants
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = 1;

// The complete self-contained standalone budget. This is a *contract* value
// used to reason about asset sizing; the finished `dist/index.html` size is
// enforced by the packaging stage, not here (see docs/FIGURE_PIPELINE.md).
const STANDALONE_BUDGET_BYTES = 1048576; // 1 MiB

// Documented finite set of extraction methods.
const EXTRACTION_METHODS = Object.freeze([
  "direct-vector-export", // vector graphics lifted straight from the source PDF
  "raster-export",        // page region exported as a raster image (PNG)
  "vectorization",        // automated raster-to-vector conversion, then reviewed
  "hand-tracing"          // manually redrawn; requires a second content review
]);

const POOLS = Object.freeze(["technician", "general", "extra"]);

// Where assets and source PDFs must live, relative to the repository root.
const ASSET_DIR = "assets/figures";
const SOURCE_DIR = "data/pool-sources";

const ASSET_LIMITS = Object.freeze({
  maxSvgBytes: 256 * 1024,       // 262144 - generous for reviewed schematic line art
  maxPngBytes: 512 * 1024,       // 524288
  maxPngChunkBytes: 512 * 1024,  // a single chunk may not exceed the whole budget
  maxPngChunks: 64,
  minPngWidth: 1,
  minPngHeight: 1,
  maxPngWidth: 4096,
  maxPngHeight: 4096,
  maxSvgElements: 5000,
  maxSvgDepth: 32,
  maxAltChars: 300,
  minAltChars: 12,
  maxSourcePage: 4000
});

// ---------------------------------------------------------------------------
// Restricted SVG subset (element + attribute allowlist)
// ---------------------------------------------------------------------------
//
// The security boundary is this allowlist plus the fail-closed grammar below --
// NOT a blacklist of dangerous strings. Anything the grammar does not
// explicitly recognise, or any element/attribute not listed here, is rejected.

// Element name -> element-specific attributes it may carry (in addition to the
// common presentation/geometry set below).
const SVG_ELEMENTS = Object.freeze({
  svg: ["xmlns", "viewBox", "width", "height", "preserveAspectRatio", "version"],
  g: [],
  path: ["d", "pathLength"],
  line: ["x1", "y1", "x2", "y2"],
  polyline: ["points"],
  polygon: ["points"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  text: ["x", "y", "dx", "dy", "text-anchor", "font-size", "font-family", "font-weight", "font-style", "letter-spacing"],
  tspan: ["x", "y", "dx", "dy", "text-anchor", "font-size", "font-family", "font-weight", "font-style", "letter-spacing"],
  title: [],
  desc: []
});

// Presentation / geometry / accessibility attributes allowed on any element.
const SVG_COMMON_ATTRS = Object.freeze([
  "id",
  "transform",
  "fill", "fill-rule", "fill-opacity",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
  "stroke-opacity", "opacity",
  "color", "visibility", "vector-effect", "shape-rendering"
]);

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SVG_TEXT_PARENTS = Object.freeze(["text", "tspan", "title", "desc"]);

// Control characters disallowed anywhere in an accepted SVG (tab/newline/CR are
// tolerated in text and between attributes).
const SVG_CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
const PATH_CONTROL_CHARS = /[\x00-\x1f\x7f]/;

// The XML `S` (whitespace) production is space, tab, CR, and LF only.
// JavaScript's `\s` additionally matches vertical tab, form feed, and assorted
// Unicode spaces -- none of which are XML whitespace (vertical tab and form
// feed are not even valid XML characters), so the tokenizer must never treat
// them as an insignificant separator.
const XML_WS = /[ \t\r\n]/;

// Resource-capable presentation attributes. Their values can name a paint
// server (`url(#id)`) or an external reference, so instead of blacklisting
// dangerous substrings the validator accepts only the static colour forms this
// figure pipeline actually needs (see `isAllowedPaintValue`).
const SVG_PAINT_ATTRS = new Set(["fill", "stroke", "color"]);
const SVG_PAINT_KEYWORDS = new Set(["none", "currentcolor", "transparent", "inherit"]);
const SVG_HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
// rgb()/rgba()/hsl()/hsla() restricted to numeric components (no nested
// functions, no identifiers, no url()); 3 or 4 comma- or slash-separated parts.
const SVG_COLOR_FN_RE = /^(?:rgb|rgba|hsl|hsla)\(\s*[-+0-9.]+%?(?:\s*[,/]\s*[-+0-9.]+%?){2,3}\s*\)$/;
// The CSS/SVG named-colour keywords (CSS Color 4 <named-color> set, lowercased).
const SVG_NAMED_COLORS = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque",
  "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood",
  "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
  "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray",
  "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
  "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
  "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue",
  "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro",
  "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
  "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
  "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
  "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
  "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
  "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen",
  "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue",
  "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
  "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace",
  "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
  "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff",
  "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red",
  "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen",
  "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray",
  "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle",
  "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen"
]);

// ---------------------------------------------------------------------------
// Restricted PNG subset
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Chunks the static subset accepts. Everything else (text metadata, colour
// profiles beyond sRGB/gAMA, private chunks, APNG) is rejected.
const PNG_ALLOWED_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "pHYs", "sRGB", "gAMA"]);
const PNG_ANIMATION_CHUNKS = new Set(["acTL", "fcTL", "fdAT"]);
const PNG_COLOR_BIT_DEPTHS = Object.freeze({
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16]
});

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

let CRC_TABLE = null;
function crc32(buffer) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let n = 0; n < buffer.length; n++) {
    c = CRC_TABLE[(c ^ buffer[n]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function toHex32(n) {
  return "0x" + (n >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// XML character range + value decoding (used by the SVG subset validator)
// ---------------------------------------------------------------------------

// The XML 1.0 `Char` production. Returns true for code points that must never
// appear in accepted content -- whether written literally or as a numeric
// character reference: C0 controls other than tab/LF/CR, the surrogate range,
// the U+FFFE/U+FFFF non-characters, and anything above the Unicode maximum.
function isInvalidXmlChar(cp) {
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return false;
  if (cp >= 0x20 && cp <= 0xd7ff) return false;
  if (cp >= 0xe000 && cp <= 0xfffd) return false;
  if (cp >= 0x10000 && cp <= 0x10ffff) return false;
  return true;
}

// Resolve the exact character references the SVG subset permits (the five
// predefined entities plus well-formed numeric references) to their literal
// characters. `checkEntities` has already rejected every other or out-of-range
// form before this runs; an unresolvable match is left untouched.
function decodeXmlCharRefs(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/g, (m, body) => {
    if (body === "amp") return "&";
    if (body === "lt") return "<";
    if (body === "gt") return ">";
    if (body === "quot") return "\"";
    if (body === "apos") return "'";
    const cp = (body[1] === "x" || body[1] === "X")
      ? parseInt(body.slice(2), 16)
      : parseInt(body.slice(1), 10);
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return m;
    try {
      return String.fromCodePoint(cp);
    } catch (e) {
      return m;
    }
  });
}

// Resolve CSS escape sequences (`\26 `, `\000026`, `\&`, trailing-backslash line
// continuations) the way a lenient style engine would before interpreting a
// value. Presentation attributes in this subset are not CSS, but decoding here
// keeps the paint-value and reference checks fail-closed against renderers that
// treat them as such. Out-of-range / NUL / surrogate escapes collapse to U+FFFD
// so they cannot reconstruct a forbidden character.
function decodeCssEscapes(s) {
  return s.replace(/\\([0-9A-Fa-f]{1,6}[ \t\n\r\f]?|[\s\S])/g, (m, body) => {
    if (/^[0-9A-Fa-f]/.test(body)) {
      const cp = parseInt(body, 16);
      if (!Number.isFinite(cp) || cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
        return "\uFFFD";
      }
      try {
        return String.fromCodePoint(cp);
      } catch (e) {
        return "\uFFFD";
      }
    }
    if (body === "\n" || body === "\r" || body === "\f") return ""; // line continuation
    return body; // escaped literal character
  });
}

// Fail-closed value policy for the resource-capable paint attributes
// (`fill`, `stroke`, `color`). The value has already had character references
// and CSS escapes decoded. Only the static colour forms this figure pipeline
// needs are accepted; every `url(...)` paint reference and every bare
// identifier is rejected.
function isAllowedPaintValue(decodedValue) {
  const v = decodedValue.trim().toLowerCase();
  if (v === "") return false;
  if (SVG_PAINT_KEYWORDS.has(v)) return true;
  if (SVG_HEX_COLOR_RE.test(v)) return true;
  if (SVG_NAMED_COLORS.has(v)) return true;
  if (SVG_COLOR_FN_RE.test(v)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Filesystem-path safety
// ---------------------------------------------------------------------------
//
// Policy for asset and source paths, all relative to the repository root:
//   * reject absolute paths, drive-letter paths, backslashes, any ":" (URL,
//     scheme and NTFS ADS forms), control characters, and "."/".." segments;
//   * require lexical containment under the designated directory;
//   * reject symlinked path segments OUTRIGHT (strict policy - the validator
//     never resolves a symlink to decide whether its target is "safe").
// The validator never opens URLs or follows external references.

function checkSafeRelativePath(p, label) {
  const what = label || "path";
  if (typeof p !== "string" || p.length === 0) return `${what} must be a non-empty string`;
  if (p !== p.trim()) return `${what} "${p}" has leading or trailing whitespace`;
  if (PATH_CONTROL_CHARS.test(p)) return `${what} "${p}" contains a control character`;
  if (p.includes("\\")) return `${what} "${p}" contains a backslash`;
  if (/^[A-Za-z]:/.test(p)) return `${what} "${p}" looks like a Windows drive-letter path`;
  if (p.includes(":")) return `${what} "${p}" contains ":" (URL, scheme and ADS forms are rejected)`;
  if (p.startsWith("/") || path.isAbsolute(p)) return `${what} "${p}" is an absolute path`;
  const segments = p.split("/");
  for (const seg of segments) {
    if (seg === "") return `${what} "${p}" has an empty path segment`;
    if (seg === "." || seg === "..") return `${what} "${p}" contains a "${seg}" segment (parent traversal)`;
  }
  return null;
}

function isSafeRelativePath(p) {
  return checkSafeRelativePath(p, "path") === null;
}

function assertSafeRelativePath(p, label) {
  const reason = checkSafeRelativePath(p, label);
  if (reason) throw new Error(reason);
  return p;
}

function safeRealpath(p, fsMod) {
  try {
    return fsMod.realpathSync(p);
  } catch (e) {
    return null;
  }
}

// Return an error string if `relPath` (already lexically safe) is not contained
// under `<repoRoot>/<mustBeUnder>`, or if any existing path segment is a
// symlink. Missing files are not an error here (reported separately).
function checkContainedNoSymlink(repoRoot, relPath, mustBeUnder, fsMod, label) {
  const what = label || "path";
  const under = mustBeUnder.split("/");
  const rel = relPath.split("/");
  for (let i = 0; i < under.length; i++) {
    if (rel[i] !== under[i]) {
      return `${what} "${relPath}" must be located under "${mustBeUnder}/"`;
    }
  }
  if (rel.length <= under.length) {
    return `${what} "${relPath}" must name a file inside "${mustBeUnder}/"`;
  }

  const rootReal = safeRealpath(repoRoot, fsMod);
  let current = repoRoot;
  for (const seg of rel) {
    current = path.join(current, seg);
    let stat;
    try {
      stat = fsMod.lstatSync(current);
    } catch (e) {
      if (e && e.code === "ENOENT") return null; // missing - handled by caller
      return `${what} "${relPath}" could not be inspected: ${e.message}`;
    }
    if (stat.isSymbolicLink()) {
      return `${what} "${relPath}" traverses symbolic link "${seg}"; symlinks are rejected outright`;
    }
  }
  // Defence in depth: the fully realpath-resolved file must still sit under the
  // realpath-resolved root even though no individual segment was a link.
  const abs = path.resolve(repoRoot, relPath);
  const absReal = safeRealpath(abs, fsMod);
  if (rootReal && absReal) {
    const relFromRoot = path.relative(rootReal, absReal);
    if (relFromRoot === "" || relFromRoot.startsWith("..") || path.isAbsolute(relFromRoot)) {
      return `${what} "${relPath}" resolves outside the repository root`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// SVG subset validator
// ---------------------------------------------------------------------------

class SvgAbort extends Error {}

// Validate a Buffer or string against the restricted SVG grammar and
// element/attribute allowlist. Returns { errors: string[] } (empty === valid).
// Never rewrites or sanitises the input.
function validateSvg(input, options) {
  const opts = options || {};
  const maxBytes = opts.maxBytes || ASSET_LIMITS.maxSvgBytes;
  const maxElements = opts.maxElements || ASSET_LIMITS.maxSvgElements;
  const maxDepth = opts.maxDepth || ASSET_LIMITS.maxSvgDepth;
  const errors = [];
  const push = (m) => errors.push("SVG: " + m);

  let text;
  if (Buffer.isBuffer(input)) {
    if (input.length > maxBytes) {
      push(`file is ${input.length} bytes, over the ${maxBytes}-byte limit`);
      return { errors };
    }
    if (input.includes(0x00)) {
      push("contains a NUL byte");
      return { errors };
    }
    // Strict decode: TextDecoder in fatal mode rejects overlong encodings,
    // truncated sequences, lone continuation bytes, and encoded surrogates --
    // none of which a decoded-byte-length comparison reliably catches.
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    } catch (e) {
      push("is not valid UTF-8");
      return { errors };
    }
  } else if (typeof input === "string") {
    text = input;
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      push(`content is over the ${maxBytes}-byte limit`);
      return { errors };
    }
    // A JS string can hold unpaired surrogate code units that no UTF-8 byte
    // stream could represent; reject them so string and Buffer inputs share
    // one character policy.
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp >= 0xd800 && cp <= 0xdfff) {
        push("contains an unpaired surrogate code unit");
        return { errors };
      }
    }
  } else {
    push("input must be a Buffer or string");
    return { errors };
  }

  // Whole categories rejected up front (fail-closed).
  const forbidden = [
    [/<!doctype/i, "a DOCTYPE declaration"],
    [/<!entity/i, "an entity declaration"],
    [/<!\[cdata\[/i, "a CDATA section"],
    [/<\?/, "a processing instruction or XML declaration"],
    [/<!--/, "an XML comment"],
    [/\]\]>/, "a CDATA close delimiter"]
  ];
  for (const [re, label] of forbidden) {
    if (re.test(text)) push(`contains ${label}, which the accepted subset forbids`);
  }
  if (errors.length) return { errors };

  // Every code point in the decoded document must be a valid XML 1.0 `Char`.
  // Doing this once, over the whole string, also covers the positions the
  // tokenizer skips as insignificant whitespace (between attributes, around
  // "=", inside end tags) -- JavaScript `\s` would otherwise let a vertical
  // tab or form feed through there.
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (isInvalidXmlChar(cp)) {
      const hex = cp.toString(16).toUpperCase().padStart(4, "0");
      push(`contains an invalid XML character U+${hex}`);
      return { errors };
    }
  }

  const N = text.length;
  let i = 0;
  const stack = [];
  let rootSeen = false;
  let rootClosed = false;
  let elementCount = 0;

  const fail = (m) => { push(m); throw new SvgAbort(); };

  function checkEntities(s, ctx) {
    for (let k = 0; k < s.length; k++) {
      if (s[k] !== "&") continue;
      const m = /^&(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/.exec(s.slice(k, k + 32));
      if (!m) fail(`unsupported or malformed entity in ${ctx}`);
      const body = m[1];
      if (body[0] === "#") {
        const cp = (body[1] === "x" || body[1] === "X")
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        if (!Number.isFinite(cp) || cp > 0x10ffff || isInvalidXmlChar(cp)) {
          fail(`numeric character reference "&${body};" is outside the valid XML character range in ${ctx}`);
        }
      }
      k += m[0].length - 1;
    }
  }

  function readStartTag(start) {
    let j = start + 1;
    const nm = /^[A-Za-z_][A-Za-z0-9_.:-]*/.exec(text.slice(j));
    if (!nm) fail("malformed start tag");
    const name = nm[0];
    j += name.length;
    const attrs = [];
    for (;;) {
      const wsStart = j;
      while (j < N && XML_WS.test(text[j])) j++;
      if (text[j] === ">") return { name, attrs, selfClose: false, end: j + 1 };
      if (text[j] === "/" && text[j + 1] === ">") return { name, attrs, selfClose: true, end: j + 2 };
      if (j >= N) fail(`unterminated start tag <${name}>`);
      if (j === wsStart) fail(`malformed start tag <${name}> (missing separator before an attribute)`);
      const an = /^[A-Za-z_:][A-Za-z0-9_.:-]*/.exec(text.slice(j));
      if (!an) fail(`malformed attribute in <${name}>`);
      const aname = an[0];
      j += aname.length;
      while (j < N && XML_WS.test(text[j])) j++;
      if (text[j] !== "=") fail(`attribute "${aname}" in <${name}> has no value (value-less attributes are rejected)`);
      j++;
      while (j < N && XML_WS.test(text[j])) j++;
      const q = text[j];
      if (q !== '"' && q !== "'") fail(`attribute "${aname}" in <${name}> must use a quoted value`);
      const close = text.indexOf(q, j + 1);
      if (close === -1) fail(`unterminated quoted value for "${aname}" in <${name}>`);
      const value = text.slice(j + 1, close);
      if (value.includes("<")) fail(`"<" character in the value of attribute "${aname}"`);
      attrs.push({ name: aname, value });
      j = close + 1;
    }
  }

  function validateElement(tag) {
    elementCount++;
    if (elementCount > maxElements) fail(`more than ${maxElements} elements`);
    if (stack.length + 1 > maxDepth) fail(`nesting deeper than ${maxDepth} levels`);

    if (!rootSeen) {
      rootSeen = true;
      if (tag.name !== "svg") fail(`root element must be <svg>, found <${tag.name}>`);
    } else if (tag.name === "svg") {
      fail("a nested <svg> element is not allowed");
    }

    if (tag.name.includes(":")) fail(`namespaced element name "${tag.name}" is not supported`);
    // Own-property check only: inherited names such as "constructor",
    // "toString", and "__proto__" resolve on a plain object's prototype and
    // must be treated as ordinary unknown elements, not as accepted entries
    // (and must never reach a property access that throws).
    if (!Object.prototype.hasOwnProperty.call(SVG_ELEMENTS, tag.name)) {
      fail(`<${tag.name}> is not in the allowed element subset`);
    }
    const elementAttrs = SVG_ELEMENTS[tag.name];

    const seenAttr = new Set();
    for (const { name, value } of tag.attrs) {
      const lname = name.toLowerCase();
      if (seenAttr.has(lname)) fail(`duplicate attribute "${name}" on <${tag.name}>`);
      seenAttr.add(lname);

      if (name.includes(":")) fail(`namespaced attribute "${name}" on <${tag.name}> is not supported`);
      if (/^on/i.test(name)) fail(`event-handler attribute "${name}" on <${tag.name}> is not allowed`);
      if (lname === "href" || lname === "xlink:href") fail(`resource attribute "${name}" is not allowed`);
      if (lname === "style") fail(`inline "style" attribute is not allowed`);
      if (lname === "class") fail(`"class" attribute is not allowed (no stylesheet support)`);

      const allowed = elementAttrs.indexOf(name) !== -1 || SVG_COMMON_ATTRS.indexOf(name) !== -1;
      if (!allowed) fail(`attribute "${name}" is not allowed on <${tag.name}>`);

      if (SVG_CONTROL_CHARS.test(value)) fail(`control character in attribute "${name}"`);
      checkEntities(value, `attribute "${name}"`);

      if (name === "xmlns") {
        // The one attribute whose value is legitimately a URI: it must be
        // exactly the SVG namespace, compared literally with no decoding.
        if (value !== SVG_NAMESPACE) fail(`xmlns must be "${SVG_NAMESPACE}", found "${value}"`);
        continue;
      }

      // Inspect the *effective* value: resolve the character references the
      // subset permits and the CSS escapes a lenient engine would collapse,
      // so an encoded "url(...)" or URI scheme cannot slip past these checks.
      const decoded = decodeCssEscapes(decodeXmlCharRefs(value));
      if (/url\s*\(/i.test(decoded)) fail(`"url(...)" reference in attribute "${name}"`);
      if (/(?:javascript|vbscript|data|file|blob|https?|ftp):/i.test(decoded)) fail(`URI scheme in attribute "${name}"`);

      // Resource-capable paint attributes get a fail-closed value allowlist:
      // only the static colour forms this pipeline needs are accepted.
      if (SVG_PAINT_ATTRS.has(name) && !isAllowedPaintValue(decoded)) {
        fail(`attribute "${name}" value "${value}" is not an accepted static paint value ` +
          `(allowed: none, currentColor, transparent, a hex colour, numeric rgb()/hsl(), or a CSS colour name)`);
      }
    }
  }

  try {
    while (i < N) {
      if (text[i] === "<") {
        if (rootClosed) fail("markup after the root element closed");
        if (text[i + 1] === "/") {
          const m = /^<\/[ \t\r\n]*([^ \t\r\n>]*)[ \t\r\n]*>/.exec(text.slice(i));
          if (!m) fail("malformed end tag");
          const name = m[1];
          if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(name)) fail(`invalid element name "${name}" in an end tag`);
          const top = stack.pop();
          if (top !== name) fail(`end tag </${name}> does not match <${top || "?"}>`);
          if (stack.length === 0) rootClosed = true;
          i += m[0].length;
        } else if (/[A-Za-z_]/.test(text[i + 1] || "")) {
          const tag = readStartTag(i);
          i = tag.end;
          validateElement(tag);
          if (tag.selfClose) {
            if (stack.length === 0) rootClosed = true;
          } else {
            stack.push(tag.name);
          }
        } else {
          fail("unexpected '<'");
        }
      } else {
        const next = text.indexOf("<", i);
        const chunk = next === -1 ? text.slice(i) : text.slice(i, next);
        if (chunk.trim() !== "") {
          const parent = stack[stack.length - 1];
          if (SVG_TEXT_PARENTS.indexOf(parent) === -1) {
            fail(`text content is only allowed inside <text>/<tspan>/<title>/<desc> (found under <${parent || "root"}>)`);
          }
          checkEntities(chunk, "text content");
        }
        i = next === -1 ? N : next;
      }
    }
  } catch (e) {
    if (!(e instanceof SvgAbort)) throw e;
    return { errors };
  }

  if (!rootSeen) push("has no <svg> root element");
  else if (stack.length) push(`has unclosed element(s): ${stack.join(", ")}`);
  return { errors };
}

// ---------------------------------------------------------------------------
// PNG subset validator
// ---------------------------------------------------------------------------

// Verify the documented static PNG subset with bounded chunk parsing and CRC
// checks. Returns { errors, info } where `info` carries width/height/colorType
// when IHDR parsed. Structural only: this is NOT full image decoding or any
// guarantee of visual fidelity.
function validatePng(input, options) {
  const opts = options || {};
  const L = Object.assign({}, ASSET_LIMITS, opts.limits || {});
  const errors = [];
  const info = {};
  const push = (m) => errors.push("PNG: " + m);

  if (!Buffer.isBuffer(input)) {
    push("input must be a Buffer");
    return { errors, info };
  }
  const buf = input;
  if (buf.length > L.maxPngBytes) {
    push(`file is ${buf.length} bytes, over the ${L.maxPngBytes}-byte limit`);
    return { errors, info };
  }
  if (buf.length < 8 + 12 + 12) {
    push("file is too small to be a valid PNG");
    return { errors, info };
  }
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    push("has an invalid 8-byte signature");
    return { errors, info };
  }

  let off = 8;
  let chunkCount = 0;
  let sawIHDR = false;
  let sawIDAT = false;
  let sawIEND = false;
  let sawPLTE = false;
  let colorType = -1;

  while (off < buf.length) {
    if (sawIEND) {
      push(`has ${buf.length - off} trailing byte(s) after IEND`);
      break;
    }
    if (off + 8 > buf.length) {
      push("ends with a truncated chunk header");
      break;
    }
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) {
      push(`has an invalid chunk type at byte ${off}`);
      break;
    }
    if (len > L.maxPngChunkBytes) {
      push(`chunk ${type} declares length ${len}, over the ${L.maxPngChunkBytes}-byte limit`);
      break;
    }
    const dataStart = off + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buf.length) {
      push(`chunk ${type} is truncated (declared ${len} data bytes)`);
      break;
    }
    const data = buf.subarray(dataStart, dataEnd);
    const declaredCrc = buf.readUInt32BE(dataEnd);
    const actualCrc = crc32(buf.subarray(off + 4, dataEnd));
    if (declaredCrc !== actualCrc) {
      push(`chunk ${type} CRC mismatch (declared ${toHex32(declaredCrc)}, computed ${toHex32(actualCrc)})`);
    }

    chunkCount++;
    if (chunkCount > L.maxPngChunks) {
      push(`has more than ${L.maxPngChunks} chunks`);
      break;
    }

    if (PNG_ANIMATION_CHUNKS.has(type)) {
      push(`contains animation chunk ${type} (APNG is not supported)`);
    } else if (!PNG_ALLOWED_CHUNKS.has(type)) {
      push(`contains chunk ${type}, which is not in the accepted static-PNG subset`);
    }

    if (type === "IHDR") {
      if (sawIHDR) push("has a duplicate IHDR");
      if (chunkCount !== 1) push("IHDR is not the first chunk");
      if (len !== 13) {
        push(`IHDR length is ${len} (expected 13)`);
      } else {
        const width = data.readUInt32BE(0);
        const height = data.readUInt32BE(4);
        const bitDepth = data[8];
        colorType = data[9];
        const compression = data[10];
        const filterMethod = data[11];
        const interlace = data[12];
        info.width = width;
        info.height = height;
        info.bitDepth = bitDepth;
        info.colorType = colorType;
        info.interlace = interlace;
        if (width < L.minPngWidth || width > L.maxPngWidth) {
          push(`width ${width} is outside the allowed ${L.minPngWidth}..${L.maxPngWidth}`);
        }
        if (height < L.minPngHeight || height > L.maxPngHeight) {
          push(`height ${height} is outside the allowed ${L.minPngHeight}..${L.maxPngHeight}`);
        }
        const depths = PNG_COLOR_BIT_DEPTHS[colorType];
        if (!depths) push(`invalid colour type ${colorType}`);
        else if (depths.indexOf(bitDepth) === -1) push(`bit depth ${bitDepth} is invalid for colour type ${colorType}`);
        if (compression !== 0) push(`unsupported compression method ${compression}`);
        if (filterMethod !== 0) push(`unsupported filter method ${filterMethod}`);
        if (interlace !== 0) push(`interlaced PNG is not in the accepted subset (interlace method ${interlace})`);
      }
      sawIHDR = true;
    } else if (type === "PLTE") {
      sawPLTE = true;
    } else if (type === "IDAT") {
      sawIDAT = true;
    } else if (type === "IEND") {
      sawIEND = true;
      if (len !== 0) push("IEND has a non-zero length");
    }

    off = dataEnd + 4;
  }

  if (!sawIHDR) push("is missing its IHDR chunk");
  if (!sawIDAT) push("is missing image data (no IDAT chunk)");
  if (!sawIEND) push("is missing its terminal IEND chunk");
  if (colorType === 3 && !sawPLTE) push("colour type 3 requires a PLTE chunk");

  return { errors, info };
}

// ---------------------------------------------------------------------------
// Manifest shape validation (pure - no filesystem)
// ---------------------------------------------------------------------------

const MANIFEST_ROOT_KEYS = new Set(["schemaVersion", "sources", "figures"]);
const FIGURE_KEYS = new Set(["id", "pool", "file", "source", "sourcePage", "extractionMethod", "alt", "sha256", "review"]);
const SOURCE_KEYS = new Set(["pool", "pdf", "url", "edition", "sha256"]);
const REVIEW_KEYS = new Set(["reviewer", "date", "notes"]);
const SHA256_RE = /^[0-9a-f]{64}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function unknownKeys(object, allowed) {
  return Object.keys(object).filter((k) => !allowed.has(k));
}

function validateManifestShape(manifest) {
  const errors = [];
  const push = (m) => errors.push(m);

  if (!isPlainObject(manifest)) {
    return { errors: ["manifest: root must be a JSON object"] };
  }
  const extraRoot = unknownKeys(manifest, MANIFEST_ROOT_KEYS);
  if (extraRoot.length) push(`manifest: unknown top-level key(s): ${extraRoot.join(", ")}`);
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    push(`manifest: schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(manifest.schemaVersion)}`);
  }
  if (!isPlainObject(manifest.sources) || Object.keys(manifest.sources).length === 0) {
    push('manifest: "sources" must be a non-empty object (the source registry)');
  }
  if (!Array.isArray(manifest.figures) || manifest.figures.length === 0) {
    push('manifest: "figures" must be a non-empty array');
  }
  if (!Array.isArray(manifest.figures) || !isPlainObject(manifest.sources)) {
    errors.sort();
    return { errors };
  }

  // ---- sources registry ----
  for (const key of Object.keys(manifest.sources)) {
    const src = manifest.sources[key];
    const at = `manifest.sources["${key}"]`;
    if (!isNonBlankString(key)) push(`${at}: source key must be a non-blank string`);
    if (!isPlainObject(src)) {
      push(`${at}: must be an object`);
      continue;
    }
    const extra = unknownKeys(src, SOURCE_KEYS);
    if (extra.length) push(`${at}: unknown key(s): ${extra.join(", ")}`);
    if (POOLS.indexOf(src.pool) === -1) push(`${at}: "pool" must be one of ${POOLS.join(", ")}`);
    const pdfReason = checkSafeRelativePath(src.pdf, `${at}.pdf`);
    if (pdfReason) push(pdfReason);
    else if (!/\.pdf$/i.test(src.pdf)) push(`${at}.pdf must end in ".pdf"`);
    else if (src.pdf.split("/").slice(0, 2).join("/") !== SOURCE_DIR) push(`${at}.pdf must be under "${SOURCE_DIR}/"`);
    if (typeof src.url !== "string" || !/^https:\/\/[^\s"'<>]+$/.test(src.url)) {
      push(`${at}.url must be an "https://" URL (it is never fetched, only recorded)`);
    }
    if (!isNonBlankString(src.edition)) push(`${at}.edition must record the pool edition / errata identity`);
    if (typeof src.sha256 !== "string" || !SHA256_RE.test(src.sha256)) {
      push(`${at}.sha256 must be 64 lowercase hexadecimal characters`);
    }
  }

  // ---- figure entries ----
  const idsSeen = new Map();
  const filesSeen = new Map();
  const referencedSources = new Set();

  manifest.figures.forEach((fig, index) => {
    const at = `manifest.figures[${index}]` + (fig && fig.id ? ` (${fig.id})` : "");
    if (!isPlainObject(fig)) {
      push(`${at}: must be an object`);
      return;
    }
    const extra = unknownKeys(fig, FIGURE_KEYS);
    if (extra.length) push(`${at}: unknown key(s): ${extra.join(", ")}`);

    // id
    if (typeof fig.id !== "string" || !figureRefs.isValidFigureId(fig.id)) {
      push(`${at}: "id" must be a normalized figure ID such as T-1, G7-1, E9-3`);
    } else {
      const prev = idsSeen.get(fig.id);
      if (prev !== undefined) push(`${at}: duplicate figure id "${fig.id}" (also at index ${prev})`);
      else idsSeen.set(fig.id, index);
    }

    // pool + prefix agreement
    if (POOLS.indexOf(fig.pool) === -1) {
      push(`${at}: "pool" must be one of ${POOLS.join(", ")}`);
    } else if (typeof fig.id === "string" && figureRefs.isValidFigureId(fig.id) &&
               fig.id[0] !== figureRefs.poolPrefix(fig.pool)) {
      push(`${at}: id "${fig.id}" does not match pool "${fig.pool}" (prefix ${figureRefs.poolPrefix(fig.pool)}-*)`);
    }

    // file
    const fileReason = checkSafeRelativePath(fig.file, `${at}.file`);
    if (fileReason) {
      push(fileReason);
    } else {
      if (!/\.(svg|png)$/i.test(fig.file)) push(`${at}.file must end in ".svg" or ".png"`);
      const wantPrefix = `${ASSET_DIR}/${fig.pool}`;
      if (POOLS.indexOf(fig.pool) !== -1 && fig.file.split("/").slice(0, 3).join("/") !== wantPrefix) {
        push(`${at}.file must be under "${wantPrefix}/"`);
      }
      const key = fig.file.toLowerCase();
      const prev = filesSeen.get(key);
      if (prev !== undefined) push(`${at}.file "${fig.file}" duplicates the path at index ${prev}`);
      else filesSeen.set(key, index);
    }

    // source registry reference
    if (!isNonBlankString(fig.source)) {
      push(`${at}.source must name an entry in the source registry`);
    } else if (!Object.prototype.hasOwnProperty.call(manifest.sources, fig.source)) {
      push(`${at}.source "${fig.source}" is not defined in manifest.sources`);
    } else {
      referencedSources.add(fig.source);
      const src = manifest.sources[fig.source];
      if (isPlainObject(src) && POOLS.indexOf(fig.pool) !== -1 && src.pool !== fig.pool) {
        push(`${at}.source "${fig.source}" is registered for pool "${src.pool}", not "${fig.pool}"`);
      }
    }

    // sourcePage
    if (!Number.isInteger(fig.sourcePage) || fig.sourcePage < 1 || fig.sourcePage > ASSET_LIMITS.maxSourcePage) {
      push(`${at}.sourcePage must be a 1-based PDF page index (1..${ASSET_LIMITS.maxSourcePage})`);
    }

    // extractionMethod
    if (EXTRACTION_METHODS.indexOf(fig.extractionMethod) === -1) {
      push(`${at}.extractionMethod must be one of: ${EXTRACTION_METHODS.join(", ")}`);
    }

    // alt
    if (!isNonBlankString(fig.alt)) {
      push(`${at}.alt must be a non-blank accessible description`);
    } else {
      const alt = fig.alt.trim();
      if (alt.length < ASSET_LIMITS.minAltChars) push(`${at}.alt is too short (< ${ASSET_LIMITS.minAltChars} chars)`);
      if (alt.length > ASSET_LIMITS.maxAltChars) push(`${at}.alt is too long (> ${ASSET_LIMITS.maxAltChars} chars)`);
      if (/[\r\n]/.test(fig.alt)) push(`${at}.alt must be a single line`);
      if (/\b(answer|correct choice|correct answer)\b/i.test(alt)) {
        push(`${at}.alt appears to reference the answer; describe only what the diagram shows`);
      }
    }

    // sha256
    if (typeof fig.sha256 !== "string" || !SHA256_RE.test(fig.sha256)) {
      push(`${at}.sha256 must be 64 lowercase hexadecimal characters`);
    }

    // review (required for hand-tracing)
    if (fig.extractionMethod === "hand-tracing" && !isPlainObject(fig.review)) {
      push(`${at}: hand-traced assets require a "review" object with an independent second reviewer`);
    }
    if (fig.review !== undefined) {
      if (!isPlainObject(fig.review)) {
        push(`${at}.review must be an object`);
      } else {
        const extraR = unknownKeys(fig.review, REVIEW_KEYS);
        if (extraR.length) push(`${at}.review: unknown key(s): ${extraR.join(", ")}`);
        if (!isNonBlankString(fig.review.reviewer)) push(`${at}.review.reviewer must name the independent reviewer`);
        if (typeof fig.review.date !== "string" || !ISO_DATE_RE.test(fig.review.date)) {
          push(`${at}.review.date must be an ISO date (YYYY-MM-DD)`);
        }
      }
    }
  });

  // unused sources
  for (const key of Object.keys(manifest.sources)) {
    if (!referencedSources.has(key)) push(`manifest.sources["${key}"] is not referenced by any figure`);
  }

  errors.sort();
  return { errors };
}

// ---------------------------------------------------------------------------
// Manifest <-> question cross-check (pure - reuses Stage 2A)
// ---------------------------------------------------------------------------

function normalizeBanks(banks) {
  const out = {};
  for (const pool of POOLS) {
    const entry = banks && banks[pool];
    if (Array.isArray(entry)) out[pool] = entry;
    else if (entry && Array.isArray(entry.questions)) out[pool] = entry.questions;
    else out[pool] = [];
  }
  return out;
}

// Every mapped question must resolve to exactly one manifest entry in its own
// pool, and every manifest entry must be referenced by at least one question.
function validateManifestAgainstQuestions(manifest, banks) {
  const errors = [];
  const push = (m) => errors.push(m);
  if (!isPlainObject(manifest) || !Array.isArray(manifest.figures)) {
    return { errors: ["manifest: cannot cross-check questions without a figures array"] };
  }
  const pools = normalizeBanks(banks);

  const manifestByKey = new Map();
  for (const fig of manifest.figures) {
    if (!isPlainObject(fig) || typeof fig.id !== "string" || POOLS.indexOf(fig.pool) === -1) continue;
    manifestByKey.set(fig.pool + "|" + fig.id, fig);
  }

  const referenced = new Set();
  for (const pool of POOLS) {
    const { errors: refErrors, mapped } = figureRefs.validatePoolFigures(pools[pool], pool);
    for (const e of refErrors) push(`question-mapping ${e}`);
    for (const { id: qid, figure } of mapped) {
      const key = pool + "|" + figure;
      if (!manifestByKey.has(key)) {
        push(`[${pool}] question ${qid} maps to figure ${figure} but the manifest has no ${pool} entry with that id`);
      } else {
        referenced.add(key);
      }
    }
  }

  for (const fig of manifest.figures) {
    if (!isPlainObject(fig) || typeof fig.id !== "string" || POOLS.indexOf(fig.pool) === -1) continue;
    const key = fig.pool + "|" + fig.id;
    if (!referenced.has(key)) {
      push(`manifest figure ${fig.id} (${fig.pool}) is not referenced by any question`);
    }
  }

  errors.sort();
  return { errors };
}

// ---------------------------------------------------------------------------
// Manifest <-> on-disk assets (filesystem - injected root + fs)
// ---------------------------------------------------------------------------

function listAssetFiles(repoRoot, fsMod) {
  const root = path.join(repoRoot, ASSET_DIR);
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fsMod.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      if (e && e.code === "ENOENT") return;
      throw e;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile() && /\.(svg|png)$/i.test(ent.name)) {
        out.push(path.relative(repoRoot, abs).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return out.sort();
}

// Verify each figure's asset file: containment + no symlinks, extension/content
// agreement, restricted-subset validity, and exact sha256 match. Also verify
// referenced source PDFs exist with a matching checksum, and that no supported
// asset under the figure root is missing from the manifest.
function validateManifestAssets(manifest, options) {
  const opts = options || {};
  const repoRoot = opts.repoRoot;
  const fsMod = opts.fs || fs;
  const errors = [];
  const push = (m) => errors.push(m);

  if (typeof repoRoot !== "string" || repoRoot.length === 0) {
    return { errors: ["validateManifestAssets: a repoRoot option is required"] };
  }
  if (!isPlainObject(manifest) || !Array.isArray(manifest.figures)) {
    return { errors: ["manifest: cannot validate assets without a figures array"] };
  }

  const listedFiles = new Set();

  manifest.figures.forEach((fig, index) => {
    if (!isPlainObject(fig)) return;
    const at = `figure ${fig.id || "[" + index + "]"}`;

    if (typeof fig.file === "string") {
      const pathReason = checkSafeRelativePath(fig.file, `${at} file`);
      if (pathReason) {
        push(pathReason);
      } else {
        listedFiles.add(fig.file);
        const contained = checkContainedNoSymlink(repoRoot, fig.file, ASSET_DIR, fsMod, `${at} file`);
        if (contained) {
          push(contained);
        } else {
          const abs = path.resolve(repoRoot, fig.file);
          let bytes = null;
          try {
            bytes = fsMod.readFileSync(abs);
          } catch (e) {
            if (e && e.code === "ENOENT") push(`${at}: asset file "${fig.file}" is missing`);
            else push(`${at}: asset file "${fig.file}" could not be read: ${e.message}`);
          }
          if (bytes) {
            const ext = fig.file.toLowerCase().replace(/^.*\./, "");
            const head = bytes.toString("utf8", 0, Math.min(bytes.length, 4096));
            const looksPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE);
            const looksSvg = /<svg[\s>]/i.test(head);
            if (ext === "png") {
              if (!looksPng) push(`${at}: file extension is .png but the bytes are not a PNG`);
              else errors.push(...validatePng(bytes).errors.map((e) => `${at}: ${e}`));
            } else if (ext === "svg") {
              if (looksPng) push(`${at}: file extension is .svg but the bytes are a PNG`);
              else if (!looksSvg) push(`${at}: file extension is .svg but no <svg> root element was found`);
              else errors.push(...validateSvg(bytes).errors.map((e) => `${at}: ${e}`));
            } else {
              push(`${at}: unsupported file extension ".${ext}"`);
            }
            if (typeof fig.sha256 === "string" && SHA256_RE.test(fig.sha256)) {
              const actual = sha256Hex(bytes);
              if (actual !== fig.sha256) {
                push(`${at}: sha256 mismatch (manifest ${fig.sha256}, file ${actual})`);
              }
            }
          }
        }
      }
    }

    // source PDF existence + checksum
    const src = isPlainObject(manifest.sources) ? manifest.sources[fig.source] : undefined;
    if (isPlainObject(src) && typeof src.pdf === "string") {
      const pdfReason = checkSafeRelativePath(src.pdf, `${at} source pdf`);
      if (!pdfReason) {
        const contained = checkContainedNoSymlink(repoRoot, src.pdf, SOURCE_DIR, fsMod, `${at} source pdf`);
        if (contained) {
          push(contained);
        } else {
          const absPdf = path.resolve(repoRoot, src.pdf);
          try {
            const pdfBytes = fsMod.readFileSync(absPdf);
            if (pdfBytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
              push(`${at}: source "${fig.source}" file "${src.pdf}" is not a PDF`);
            }
            if (typeof src.sha256 === "string" && SHA256_RE.test(src.sha256) && sha256Hex(pdfBytes) !== src.sha256) {
              push(`${at}: source "${fig.source}" sha256 does not match "${src.pdf}"`);
            }
          } catch (e) {
            if (e && e.code === "ENOENT") push(`${at}: source PDF "${src.pdf}" is missing`);
            else push(`${at}: source PDF "${src.pdf}" could not be read: ${e.message}`);
          }
        }
      }
    }
  });

  // Every supported asset present under the figure root must be listed.
  let onDisk = [];
  try {
    onDisk = listAssetFiles(repoRoot, fsMod);
  } catch (e) {
    push(`could not enumerate "${ASSET_DIR}/": ${e.message}`);
  }
  for (const rel of onDisk) {
    if (!listedFiles.has(rel)) {
      push(`asset file "${rel}" exists under "${ASSET_DIR}/" but is not listed in the manifest`);
    }
  }

  errors.sort();
  return { errors };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

function validateFigurePipeline(manifest, options) {
  const opts = options || {};
  const errors = [];
  const shape = validateManifestShape(manifest);
  errors.push(...shape.errors);

  const shapeUsable = shape.errors.length === 0 || opts.continueOnShapeErrors === true;
  if (shapeUsable) {
    if (opts.banks) errors.push(...validateManifestAgainstQuestions(manifest, opts.banks).errors);
    if (opts.repoRoot) errors.push(...validateManifestAssets(manifest, { repoRoot: opts.repoRoot, fs: opts.fs }).errors);
  }

  const unique = Array.from(new Set(errors)).sort();
  return { errors: unique };
}

function assertFigurePipeline(manifest, options) {
  const { errors } = validateFigurePipeline(manifest, options);
  if (errors.length > 0) {
    throw new Error("Figure pipeline validation failed:\n  " + errors.join("\n  "));
  }
}

// ---------------------------------------------------------------------------

module.exports = {
  // constants / contract
  SCHEMA_VERSION,
  STANDALONE_BUDGET_BYTES,
  EXTRACTION_METHODS,
  ASSET_LIMITS,
  ASSET_DIR,
  SOURCE_DIR,
  SVG_ELEMENTS,
  SVG_COMMON_ATTRS,
  SVG_PAINT_ATTRS,
  SVG_NAMESPACE,
  PNG_ALLOWED_CHUNKS,
  // primitives
  sha256Hex,
  crc32,
  isAllowedPaintValue,
  isSafeRelativePath,
  assertSafeRelativePath,
  checkSafeRelativePath,
  // asset validators
  validateSvg,
  validatePng,
  // manifest validators
  validateManifestShape,
  validateManifestAgainstQuestions,
  validateManifestAssets,
  validateFigurePipeline,
  assertFigurePipeline,
  // helpers used by tooling/tests
  listAssetFiles
};
