'use strict';

// Unit tests for scripts/figure-manifest.js (Stage 2B — figure manifest
// contract and asset validation).
//
// Every fixture below is SYNTHETIC, non-official test content: tiny hand-written
// SVG strings, programmatically built PNG buffers, and manifests assembled in
// memory or under a throwaway temp directory. No test reads a production asset
// or mutates tracked data.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const fm = require('../../scripts/figure-manifest.js');
const fr = require('../../scripts/figure-references.js');

const NS = 'http://www.w3.org/2000/svg';
const HEX64 = 'a'.repeat(64);

// --------------------------------------------------------------------------
// fixture builders
// --------------------------------------------------------------------------

// A minimal valid SVG in the accepted subset.
const VALID_SVG =
  `<svg xmlns="${NS}" viewBox="0 0 20 20">` +
  `<title>Synthetic test schematic</title>` +
  `<g transform="translate(1,1)">` +
  `<rect x="0" y="0" width="18" height="18" fill="none" stroke="#000" stroke-width="1"/>` +
  `<line x1="0" y1="0" x2="18" y2="18"/>` +
  `<circle cx="9" cy="9" r="4"/>` +
  `<path d="M2 2 L16 2 L16 16 Z"/>` +
  `<text x="1" y="19" font-size="3">1</text>` +
  `</g></svg>`;

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(fm.crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

// Build a structurally valid static PNG (truecolor+alpha, non-interlaced).
function buildPng(opts) {
  const o = Object.assign(
    { width: 12, height: 8, colorType: 6, bitDepth: 8, interlace: 0, extraChunks: [], omitIend: false, trailing: null, truncateTail: 0 },
    opts || {}
  );
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(o.width, 0);
  ihdr.writeUInt32BE(o.height, 4);
  ihdr[8] = o.bitDepth;
  ihdr[9] = o.colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = o.interlace;
  const channels = o.colorType === 6 ? 4 : o.colorType === 2 ? 3 : 1;
  const raw = Buffer.alloc((o.width * channels + 1) * o.height, 0);
  const idat = zlib.deflateSync(raw);
  const parts = [sig, pngChunk('IHDR', ihdr), ...o.extraChunks, pngChunk('IDAT', idat)];
  if (!o.omitIend) parts.push(pngChunk('IEND', Buffer.alloc(0)));
  let out = Buffer.concat(parts);
  if (o.truncateTail) out = out.subarray(0, out.length - o.truncateTail);
  if (o.trailing) out = Buffer.concat([out, o.trailing]);
  return Buffer.from(out);
}

// A throwaway repo-shaped directory. Returns { root, write, symlink, cleanup }.
function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'us-hamexam-figtest-'));
  fs.mkdirSync(path.join(root, 'assets/figures/technician'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets/figures/general'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets/figures/extra'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data/pool-sources'), { recursive: true });
  return {
    root,
    write(rel, buf) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, buf);
      return abs;
    },
    symlink(targetAbs, rel) {
      fs.symlinkSync(targetAbs, path.join(root, rel));
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

function loadBanks() {
  const dir = path.join(__dirname, '../../data');
  return {
    technician: JSON.parse(fs.readFileSync(path.join(dir, 'technician.json'), 'utf8')),
    general: JSON.parse(fs.readFileSync(path.join(dir, 'general.json'), 'utf8')),
    extra: JSON.parse(fs.readFileSync(path.join(dir, 'extra.json'), 'utf8'))
  };
}

// Assemble an in-memory manifest that covers every mapped figure in `banks`.
function manifestForBanks(banks, overrides) {
  const sources = {
    'technician-src': { pool: 'technician', pdf: 'data/pool-sources/technician.pdf', url: 'https://www.ncvec.org/t.pdf', edition: '2026-2030 Technician, 2026-02-19 errata', sha256: HEX64 },
    'general-src': { pool: 'general', pdf: 'data/pool-sources/general.pdf', url: 'https://www.ncvec.org/g.pdf', edition: '2023-2027 General, 6th errata', sha256: HEX64 },
    'extra-src': { pool: 'extra', pdf: 'data/pool-sources/extra.pdf', url: 'https://www.ncvec.org/e.pdf', edition: '2024-2028 Extra, 4th errata', sha256: HEX64 }
  };
  const srcKey = { technician: 'technician-src', general: 'general-src', extra: 'extra-src' };
  const figures = [];
  let page = 10;
  for (const pool of ['technician', 'general', 'extra']) {
    for (const id of [...fr.validatePoolFigures(banks[pool], pool).figureIds].sort()) {
      figures.push({
        id,
        pool,
        file: `assets/figures/${pool}/${id.toLowerCase()}.svg`,
        source: srcKey[pool],
        sourcePage: page++,
        extractionMethod: 'direct-vector-export',
        alt: `Synthetic schematic ${id} showing several labelled components to identify`,
        sha256: HEX64
      });
    }
  }
  return Object.assign({ schemaVersion: 1, sources, figures }, overrides || {});
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

// --------------------------------------------------------------------------

describe('checksums', () => {
  test('crc32 matches known PNG-chunk vectors', () => {
    // CRC-32 of the ASCII bytes "IEND" is 0xAE426082 (PNG spec appendix).
    assert.equal(fm.crc32(Buffer.from('IEND', 'latin1')) >>> 0, 0xae426082);
    assert.equal(fm.crc32(Buffer.alloc(0)) >>> 0, 0x00000000);
    assert.equal(fm.crc32(Buffer.from('123456789', 'latin1')) >>> 0, 0xcbf43926);
  });

  test('sha256Hex is lowercase hex of the exact bytes', () => {
    const h = fm.sha256Hex(Buffer.from('abc'));
    assert.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.match(h, /^[0-9a-f]{64}$/);
  });
});

describe('checkSafeRelativePath', () => {
  const good = [
    'assets/figures/technician/t-1.svg',
    'data/pool-sources/extra-2024-2028.pdf',
    'assets/figures/general/g7-1.png'
  ];
  const bad = {
    'absolute': '/etc/passwd',
    'drive letter': 'C:/Users/x/t.svg',
    'backslash': 'assets\\figures\\t.svg',
    'parent traversal': 'assets/figures/../../etc/passwd',
    'single dot segment': 'assets/./figures/t.svg',
    'url form': 'https://evil/t.svg',
    'file scheme': 'file:///t.svg',
    'colon / ADS': 'assets/figures/t.svg:stream',
    'empty segment': 'assets//figures/t.svg',
    'trailing space': 'assets/figures/t.svg ',
    'control char': 'assets/figures/t\u0001.svg',
    'empty string': ''
  };

  test('accepts clean repo-relative forward-slash paths', () => {
    for (const p of good) {
      assert.equal(fm.checkSafeRelativePath(p, 'path'), null, p);
      assert.equal(fm.isSafeRelativePath(p), true, p);
    }
  });

  test('rejects unsafe path shapes with a specific reason', () => {
    for (const [label, p] of Object.entries(bad)) {
      const reason = fm.checkSafeRelativePath(p, 'path');
      assert.ok(reason, `${label} (${JSON.stringify(p)}) should be rejected`);
      assert.equal(fm.isSafeRelativePath(p), false, label);
    }
  });

  test('assertSafeRelativePath throws on unsafe input, returns the path otherwise', () => {
    assert.throws(() => fm.assertSafeRelativePath('../x', 'p'), /parent traversal/);
    assert.equal(fm.assertSafeRelativePath('assets/figures/technician/t-1.svg', 'p'), 'assets/figures/technician/t-1.svg');
  });
});

describe('validateSvg — accepted subset', () => {
  test('a minimal static schematic passes', () => {
    assert.deepEqual(fm.validateSvg(VALID_SVG).errors, []);
    assert.deepEqual(fm.validateSvg(Buffer.from(VALID_SVG, 'utf8')).errors, []);
  });

  test('single-quoted attributes are accepted', () => {
    const s = `<svg xmlns='${NS}'><rect x='1' y='1' width='2' height='2'/></svg>`;
    assert.deepEqual(fm.validateSvg(s).errors, []);
  });

  test('whitespace and newlines inside tags are accepted', () => {
    const s = `<svg\n  xmlns="${NS}"\n  viewBox="0 0 4 4"\n><rect\tx="1"\ty="1"\twidth="2"\theight="2"\t/></svg>`;
    assert.deepEqual(fm.validateSvg(s).errors, []);
  });

  test('predefined and numeric entities in text are accepted', () => {
    const s = `<svg xmlns="${NS}"><desc>A &amp; B &lt; C &#65; &#x42;</desc></svg>`;
    assert.deepEqual(fm.validateSvg(s).errors, []);
  });

  test('title/desc/tspan and self-closing shapes are accepted', () => {
    const s = `<svg xmlns="${NS}"><desc>d</desc><text x="0" y="0">a<tspan dx="1">b</tspan></text><polyline points="0,0 1,1"/></svg>`;
    assert.deepEqual(fm.validateSvg(s).errors, []);
  });
});

describe('validateSvg — rejected constructs', () => {
  const cases = {
    'script element': `<svg xmlns="${NS}"><script>alert(1)</script></svg>`,
    'style element': `<svg xmlns="${NS}"><style>*{fill:red}</style></svg>`,
    'foreignObject': `<svg xmlns="${NS}"><foreignObject><b>x</b></foreignObject></svg>`,
    'embedded image': `<svg xmlns="${NS}"><image href="x.png"/></svg>`,
    'use element': `<svg xmlns="${NS}"><use href="#a"/></svg>`,
    'anchor element': `<svg xmlns="${NS}"><a href="http://x"><rect x="0" y="0" width="1" height="1"/></a></svg>`,
    'animate element': `<svg xmlns="${NS}"><rect x="0" y="0" width="1" height="1"><animate attributeName="x" to="5"/></rect></svg>`,
    'event handler attr': `<svg xmlns="${NS}" onload="x()"></svg>`,
    'style attribute': `<svg xmlns="${NS}"><rect style="fill:red" x="0" y="0" width="1" height="1"/></svg>`,
    'class attribute': `<svg xmlns="${NS}"><rect class="c" x="0" y="0" width="1" height="1"/></svg>`,
    'href attribute': `<svg xmlns="${NS}"><rect href="#a" x="0" y="0" width="1" height="1"/></svg>`,
    'xlink:href attribute': `<svg xmlns="${NS}"><rect xlink:href="#a" x="0" y="0" width="1" height="1"/></svg>`,
    'url() in value': `<svg xmlns="${NS}"><rect fill="url(#g)" x="0" y="0" width="1" height="1"/></svg>`,
    'data: URI in value': `<svg xmlns="${NS}"><rect fill="data:image/png;base64,AA" x="0" y="0" width="1" height="1"/></svg>`,
    'javascript: URI in value': `<svg xmlns="${NS}"><rect fill="javascript:1" x="0" y="0" width="1" height="1"/></svg>`,
    'DOCTYPE': `<!DOCTYPE svg><svg xmlns="${NS}"></svg>`,
    'entity declaration': `<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="${NS}"><desc>&x;</desc></svg>`,
    'CDATA section': `<svg xmlns="${NS}"><desc><![CDATA[hi]]></desc></svg>`,
    'processing instruction': `<?xml version="1.0"?><svg xmlns="${NS}"></svg>`,
    'XML comment': `<svg xmlns="${NS}"><!-- note --></svg>`,
    'custom named entity': `<svg xmlns="${NS}"><desc>&nbsp;</desc></svg>`,
    'bare ampersand': `<svg xmlns="${NS}"><desc>Tom & Jerry</desc></svg>`,
    'namespaced element': `<svg xmlns="${NS}"><svg:rect x="0" y="0" width="1" height="1"/></svg>`,
    'xmlns:xlink declaration': `<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>`,
    'wrong xmlns value': `<svg xmlns="http://example.test/ns"></svg>`,
    'unknown attribute': `<svg xmlns="${NS}"><rect data-x="1" x="0" y="0" width="1" height="1"/></svg>`,
    'unquoted attribute value': `<svg xmlns="${NS}"><rect x=1 y="0" width="1" height="1"/></svg>`,
    'valueless attribute': `<svg xmlns="${NS}"><rect x y="0" width="1" height="1"/></svg>`,
    'duplicate attribute': `<svg xmlns="${NS}"><rect x="0" x="1" y="0" width="1" height="1"/></svg>`,
    'mismatched end tag': `<svg xmlns="${NS}"><g></rect></svg>`,
    'unclosed element': `<svg xmlns="${NS}"><g><rect x="0" y="0" width="1" height="1"/></svg>`,
    '< inside attribute value': `<svg xmlns="${NS}"><rect x="0<1" y="0" width="1" height="1"/></svg>`,
    'text outside text/desc': `<svg xmlns="${NS}"><g>loose text</g></svg>`,
    'root is not svg': `<rect xmlns="${NS}" x="0" y="0" width="1" height="1"/>`,
    'nested svg': `<svg xmlns="${NS}"><svg></svg></svg>`,
    'NUL byte': Buffer.from(`<svg xmlns="${NS}"><desc>\u0000</desc></svg>`, 'utf8')
  };

  for (const [label, input] of Object.entries(cases)) {
    test(`rejects: ${label}`, () => {
      const errs = fm.validateSvg(input).errors;
      assert.ok(errs.length > 0, `expected rejection, got none for ${label}`);
      for (const e of errs) assert.match(e, /^SVG: /);
    });
  }

  test('oversize SVG is rejected by the byte limit', () => {
    const big = `<svg xmlns="${NS}">` + '<g></g>'.repeat(60000) + '</svg>';
    const errs = fm.validateSvg(big, { maxBytes: 1024 }).errors;
    assert.match(errs.join('\n'), /over the 1024-byte limit/);
  });

  test('excessive element count is rejected', () => {
    const many = `<svg xmlns="${NS}">` + '<g></g>'.repeat(50) + '</svg>';
    const errs = fm.validateSvg(many, { maxElements: 10 }).errors;
    assert.match(errs.join('\n'), /more than 10 elements/);
  });

  test('excessive nesting depth is rejected', () => {
    const deep = `<svg xmlns="${NS}">` + '<g>'.repeat(40) + '</g>'.repeat(40) + '</svg>';
    const errs = fm.validateSvg(deep, { maxDepth: 8 }).errors;
    assert.match(errs.join('\n'), /nesting deeper than 8/);
  });

  test('invalid UTF-8 bytes are rejected', () => {
    const bad = Buffer.concat([Buffer.from(`<svg xmlns="${NS}"><desc>`, 'utf8'), Buffer.from([0xff, 0xfe]), Buffer.from('</desc></svg>', 'utf8')]);
    assert.match(fm.validateSvg(bad).errors.join('\n'), /NUL byte|not valid UTF-8/);
  });
});

// --------------------------------------------------------------------------
// Security-review regressions (Stage 2B follow-up): three SVG-validator
// defects that let encoded/inherited/invalid content past the checks.
// --------------------------------------------------------------------------

describe('validateSvg — encoded external references (defect 1)', () => {
  const wrap = (attrs) => `<svg xmlns="${NS}"><path ${attrs} d="M0 0h10v10z"/></svg>`;

  test('exact reproduction: XML-entity-encoded url() and scheme is rejected', () => {
    const svg =
      `<svg xmlns="${NS}">\n` +
      `  <path fill="&#117;rl(&#104;ttps://example.test/a.svg#x)" d="M0 0h10v10z"/>\n` +
      `</svg>`;
    const errs = fm.validateSvg(svg).errors;
    assert.ok(errs.length > 0, 'expected rejection');
    assert.match(errs.join('\n'), /url\(\.\.\.\)|not an accepted static paint value/);
  });

  test('decimal and hexadecimal entity encodings of "url(" are rejected', () => {
    for (const enc of ['&#117;rl(#g)', '&#x75;rl(#g)', '&#0117;rl(#g)', 'ur&#x6C;(#g)']) {
      const errs = fm.validateSvg(wrap(`fill="${enc}"`)).errors;
      assert.ok(errs.length > 0, `expected rejection for ${enc}`);
      for (const e of errs) assert.match(e, /^SVG: /);
    }
  });

  test('decimal/hex-encoded external scheme in a non-paint attribute is rejected', () => {
    // transform is not a paint attribute, so this exercises the decoded
    // generic scheme check rather than the paint allowlist.
    const errs = fm.validateSvg(
      `<svg xmlns="${NS}"><g transform="&#x68;ttps://evil.test/x"><rect x="0" y="0" width="1" height="1"/></g></svg>`
    ).errors;
    assert.match(errs.join('\n'), /URI scheme in attribute "transform"/);
  });

  test('CSS-escaped resource syntax is rejected', () => {
    for (const enc of ['\\75 rl(#g)', '\\000075rl(#g)', 'u\\72 l(#g)', 'url\\28 #g\\29 ']) {
      const errs = fm.validateSvg(wrap(`fill="${enc}"`)).errors;
      assert.ok(errs.length > 0, `expected rejection for ${JSON.stringify(enc)}`);
      for (const e of errs) assert.match(e, /^SVG: /);
    }
  });

  test('protocol-relative and plain url() paint references are rejected', () => {
    for (const v of ['url(//evil.test/a#x)', 'url(#g)', 'URL( #g )', 'url(https://evil.test/a#x) red']) {
      const errs = fm.validateSvg(wrap(`fill="${v}"`)).errors;
      assert.ok(errs.length > 0, `expected rejection for ${v}`);
    }
  });

  test('ordinary static fill/stroke/color values still pass', () => {
    const ok = [
      'fill="none"', 'fill="#000"', 'fill="#abcdef"', 'fill="#abcdef80"',
      'stroke="red"', 'stroke="currentColor"', 'fill="rebeccapurple"',
      'fill="rgb(12, 34, 56)"', 'stroke="rgba(0,0,0,0.5)"', 'fill="hsl(120, 50%, 40%)"',
      'fill="TRANSPARENT"', 'color="steelblue"'
    ];
    for (const attrs of ok) {
      assert.deepEqual(fm.validateSvg(wrap(`${attrs}`)).errors, [], attrs);
    }
  });

  test('benign encoded text and entities are preserved', () => {
    const svg = `<svg xmlns="${NS}"><text x="0" y="0">R&#8202;&#215;C is &lt; &#189; &amp; &#x3A9;</text>` +
      `<desc>Ohm &#937; &#8734;</desc></svg>`;
    assert.deepEqual(fm.validateSvg(svg).errors, []);
  });

  test('a bare identifier or CSS-ish payload in a paint value is rejected fail-closed', () => {
    for (const v of ['expression(1)', 'attr(x)', 'var(--y)', 'somecolor', '-moz-anything']) {
      const errs = fm.validateSvg(wrap(`fill="${v}"`)).errors;
      assert.ok(errs.length > 0, `expected rejection for ${v}`);
      assert.match(errs.join('\n'), /not an accepted static paint value/);
    }
  });
});

describe('validateSvg — inherited element names (defect 2)', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    test(`<${name}> is a descriptive validation error, with no attributes`, () => {
      const errs = fm.validateSvg(`<svg><${name}/></svg>`).errors;
      assert.deepEqual(errs, [`SVG: <${name}> is not in the allowed element subset`]);
    });

    test(`<${name} fill="red"/> is a descriptive validation error, not a thrown TypeError`, () => {
      let errs;
      assert.doesNotThrow(() => { errs = fm.validateSvg(`<svg><${name} fill="red"/></svg>`).errors; });
      assert.deepEqual(errs, [`SVG: <${name}> is not in the allowed element subset`]);
    });

    test(`<${name}> with a full attribute set and a close tag still fails safely`, () => {
      let errs;
      assert.doesNotThrow(() => {
        errs = fm.validateSvg(`<svg xmlns="${NS}"><${name} id="a" fill="url(#x)" onload="x()"></${name}></svg>`).errors;
      });
      assert.ok(errs.length > 0);
      assert.match(errs.join('\n'), new RegExp(`<${name}> is not in the allowed element subset`));
    });
  }

  test('a genuinely allowed element is unaffected by the own-property check', () => {
    assert.deepEqual(fm.validateSvg(`<svg xmlns="${NS}"><g><rect x="0" y="0" width="1" height="1"/></g></svg>`).errors, []);
  });
});

describe('validateSvg — invalid XML characters (defect 3)', () => {
  test('exact reproductions are rejected', () => {
    assert.ok(fm.validateSvg(`<svg><text>&#0;</text></svg>`).errors.length > 0);
    assert.ok(fm.validateSvg(`<svg><text>${String.fromCharCode(1)}</text></svg>`).errors.length > 0);
  });

  test('out-of-range, surrogate, and non-character numeric references are rejected', () => {
    for (const ref of ['&#0;', '&#x1;', '&#x8;', '&#xB;', '&#xC;', '&#x1F;', '&#xD800;', '&#xDFFF;', '&#xFFFE;', '&#xFFFF;', '&#x110000;', '&#1114112;']) {
      const inText = fm.validateSvg(`<svg xmlns="${NS}"><text x="0" y="0">${ref}</text></svg>`).errors;
      assert.ok(inText.length > 0, `expected text rejection for ${ref}`);
      assert.match(inText.join('\n'), /XML character range/);
      const inAttr = fm.validateSvg(`<svg xmlns="${NS}"><rect id="a${ref}b" x="0" y="0" width="1" height="1"/></svg>`).errors;
      assert.ok(inAttr.length > 0, `expected attribute rejection for ${ref}`);
      assert.match(inAttr.join('\n'), /XML character range/);
    }
  });

  test('literal control characters in text and in attribute values are rejected', () => {
    for (const cc of [0x00, 0x01, 0x07, 0x0b, 0x0c, 0x1f]) {
      const ch = String.fromCharCode(cc);
      assert.ok(fm.validateSvg(`<svg xmlns="${NS}"><text x="0" y="0">a${ch}b</text></svg>`).errors.length > 0, `text U+${cc}`);
      assert.ok(fm.validateSvg(`<svg xmlns="${NS}"><rect id="a${ch}b" x="0" y="0" width="1" height="1"/></svg>`).errors.length > 0, `attr U+${cc}`);
    }
  });

  test('a literal U+FFFE non-character (valid UTF-8) is rejected', () => {
    const buf = Buffer.from(`<svg xmlns="${NS}"><text x="0" y="0">a￾b</text></svg>`, 'utf8');
    assert.match(fm.validateSvg(buf).errors.join('\n'), /invalid XML character U\+FFFE/);
  });

  test('permitted whitespace, predefined entities, and valid numeric references pass', () => {
    const svg = `<svg xmlns="${NS}">\n\t<text x="0" y="0">Tab\tNL\nCR\r end &#65; &#x1F600; &amp; &lt;</text>\n</svg>`;
    assert.deepEqual(fm.validateSvg(svg).errors, []);
  });

  test('valid non-ASCII diagram labels pass (string and Buffer)', () => {
    const svg = `<svg xmlns="${NS}"><title>Ω · µF · 50Ω — π/2 · ✓ 日本語 😀</title>` +
      `<text x="0" y="0">Frequenz → Résumé</text></svg>`;
    assert.deepEqual(fm.validateSvg(svg).errors, []);
    assert.deepEqual(fm.validateSvg(Buffer.from(svg, 'utf8')).errors, []);
  });

  test('an unpaired surrogate in a string input is rejected', () => {
    assert.match(
      fm.validateSvg(`<svg xmlns="${NS}"><text x="0" y="0">\uD800</text></svg>`).errors.join('\n'),
      /unpaired surrogate|invalid XML character/
    );
  });

  test('invalid UTF-8 buffers are rejected by the strict decoder', () => {
    const cases = [
      Buffer.from([0xc0, 0xaf]),             // overlong "/"
      Buffer.from([0xe0, 0x80, 0x80]),        // overlong NUL
      Buffer.from([0xed, 0xa0, 0x80]),        // encoded lone surrogate U+D800
      Buffer.from([0xf4, 0x90, 0x80, 0x80]),  // > U+10FFFF
      Buffer.from([0x80])                     // lone continuation byte
    ];
    for (const mid of cases) {
      const buf = Buffer.concat([Buffer.from(`<svg xmlns="${NS}"><desc>`, 'utf8'), mid, Buffer.from('</desc></svg>', 'utf8')]);
      assert.match(fm.validateSvg(buf).errors.join('\n'), /not valid UTF-8|NUL byte/, mid.toString('hex'));
    }
  });

  test('rejected inputs always return an errors array, never throw', () => {
    const inputs = [
      `<svg><constructor fill="url(#x)"/></svg>`,
      `<svg xmlns="${NS}"><path fill="&#117;rl(&#104;ttps://x/a#y)" d="M0 0"/></svg>`,
      `<svg><text>&#0;</text></svg>`,
      Buffer.from([0xff, 0xfe, 0xfd]),
      `<svg xmlns="${NS}"><rect fill="\\75 rl(#g)" x="0" y="0" width="1" height="1"/></svg>`
    ];
    for (const input of inputs) {
      let res;
      assert.doesNotThrow(() => { res = fm.validateSvg(input); });
      assert.ok(Array.isArray(res.errors) && res.errors.length > 0);
    }
  });
});

describe('validateSvg — invalid controls used as markup whitespace (defect 3 follow-up)', () => {
  const VT = String.fromCharCode(0x0b); // vertical tab: JS \s but not XML S / not a valid XML char
  const FF = String.fromCharCode(0x0c); // form feed: same

  test('exact reproductions: a bare control as start-tag whitespace is rejected', () => {
    for (const c of [VT, FF]) {
      const errs = fm.validateSvg(`<svg${c}/>`).errors;
      assert.ok(errs.length > 0, `expected rejection for U+${c.charCodeAt(0).toString(16)}`);
      assert.match(errs.join('\n'), /invalid XML character/);
    }
  });

  test('a control between attributes is rejected (string and Buffer)', () => {
    for (const c of [VT, FF]) {
      const svg = `<svg xmlns="${NS}"${c}viewBox="0 0 4 4"><rect x="0" y="0" width="1" height="1"/></svg>`;
      assert.match(fm.validateSvg(svg).errors.join('\n'), /invalid XML character/);
      assert.match(fm.validateSvg(Buffer.from(svg, 'utf8')).errors.join('\n'), /invalid XML character/);
    }
  });

  test('a control around the attribute "=" is rejected', () => {
    for (const c of [VT, FF]) {
      assert.match(fm.validateSvg(`<svg xmlns${c}="${NS}"/>`).errors.join('\n'), /invalid XML character/);
      assert.match(fm.validateSvg(`<svg xmlns=${c}"${NS}"/>`).errors.join('\n'), /invalid XML character/);
    }
  });

  test('a control inside a closing tag is rejected', () => {
    for (const c of [VT, FF]) {
      assert.match(fm.validateSvg(`<svg xmlns="${NS}"><g></g${c}></svg>`).errors.join('\n'), /invalid XML character/);
      assert.match(fm.validateSvg(`<svg xmlns="${NS}"><g></${c}g></svg>`).errors.join('\n'), /invalid XML character/);
    }
  });

  test('a control after the start-tag name is rejected', () => {
    assert.match(fm.validateSvg(`<svg${VT} xmlns="${NS}"/>`).errors.join('\n'), /invalid XML character/);
  });

  test('rejected controls-as-whitespace inputs return errors, never throw', () => {
    for (const svg of [`<svg${VT}/>`, `<svg xmlns="${NS}"${FF}viewBox="0 0 1 1"/>`, `<svg xmlns="${NS}"><g></g${VT}></svg>`]) {
      let res;
      assert.doesNotThrow(() => { res = fm.validateSvg(svg); });
      assert.ok(res.errors.length > 0);
    }
  });

  test('legitimate XML whitespace (space, tab, CR, LF) in every markup position still passes', () => {
    const svg =
      `<svg\n\txmlns = "${NS}"\r\n\tviewBox="0 0 4 4"\n>` +
      `\n\t<rect\tx="1" y="1"\twidth="2" height="2" />\r\n` +
      `\t<g >\n<circle cx="2" cy="2" r="1"/>\n</g\n>\r\n</svg >`;
    assert.deepEqual(fm.validateSvg(svg).errors, []);
  });
});

describe('validatePng — accepted subset', () => {
  test('a minimal static truecolor PNG passes and reports dimensions', () => {
    const png = buildPng({ width: 12, height: 8 });
    const res = fm.validatePng(png);
    assert.deepEqual(res.errors, []);
    assert.equal(res.info.width, 12);
    assert.equal(res.info.height, 8);
    assert.equal(res.info.interlace, 0);
  });

  test('palette PNG with PLTE passes', () => {
    const plte = pngChunk('PLTE', Buffer.from([0, 0, 0, 255, 255, 255]));
    const png = buildPng({ colorType: 3, bitDepth: 8, extraChunks: [plte] });
    assert.deepEqual(fm.validatePng(png).errors, []);
  });

  test('allowed ancillary chunks (pHYs, sRGB) pass', () => {
    const phys = pngChunk('pHYs', Buffer.from([0, 0, 11, 0, 0, 0, 11, 0, 1]));
    const srgb = pngChunk('sRGB', Buffer.from([0]));
    const png = buildPng({ extraChunks: [srgb, phys] });
    assert.deepEqual(fm.validatePng(png).errors, []);
  });
});

describe('validatePng — rejected', () => {
  test('bad signature', () => {
    const png = buildPng({});
    const bad = Buffer.concat([Buffer.from('garbage!!'), png.subarray(9)]);
    assert.match(fm.validatePng(bad).errors.join('\n'), /invalid 8-byte signature/);
  });

  test('truncated chunk header and body', () => {
    assert.match(fm.validatePng(buildPng({ truncateTail: 6 })).errors.join('\n'), /truncated/);
    assert.match(fm.validatePng(buildPng({ truncateTail: 30 })).errors.join('\n'), /truncated|missing/);
  });

  test('missing IEND / trailing bytes after IEND', () => {
    assert.match(fm.validatePng(buildPng({ omitIend: true })).errors.join('\n'), /missing its terminal IEND/);
    assert.match(fm.validatePng(buildPng({ trailing: Buffer.from('xx') })).errors.join('\n'), /trailing byte/);
  });

  test('interlaced PNG is rejected', () => {
    assert.match(fm.validatePng(buildPng({ interlace: 1 })).errors.join('\n'), /interlaced PNG is not in the accepted subset/);
  });

  test('dimension limits are enforced', () => {
    assert.match(fm.validatePng(buildPng({ width: 0 })).errors.join('\n'), /width 0 is outside/);
    assert.match(fm.validatePng(buildPng({ width: 5000 })).errors.join('\n'), /width 5000 is outside/);
    assert.match(fm.validatePng(buildPng({ height: 9000 })).errors.join('\n'), /height 9000 is outside/);
  });

  test('byte-size limit is enforced', () => {
    const png = buildPng({ width: 64, height: 64 });
    assert.match(fm.validatePng(png, { limits: { maxPngBytes: 64 } }).errors.join('\n'), /over the 64-byte limit/);
  });

  test('text-metadata chunk (tEXt) is rejected', () => {
    const text = pngChunk('tEXt', Buffer.from('Comment\u0000hello', 'latin1'));
    assert.match(fm.validatePng(buildPng({ extraChunks: [text] })).errors.join('\n'), /tEXt.*not in the accepted static-PNG subset/);
  });

  test('APNG animation chunks are rejected', () => {
    const actl = pngChunk('acTL', Buffer.from([0, 0, 0, 2, 0, 0, 0, 0]));
    assert.match(fm.validatePng(buildPng({ extraChunks: [actl] })).errors.join('\n'), /animation chunk acTL/);
  });

  test('CRC mismatch in a chunk is detected', () => {
    const png = buildPng({ width: 10, height: 10 });
    // Flip one byte inside the IHDR *data* (offset 8 sig + 8 framing = 16).
    const tampered = Buffer.from(png);
    tampered[16] ^= 0x20;
    assert.match(fm.validatePng(tampered).errors.join('\n'), /chunk IHDR CRC mismatch/);
  });

  test('palette color type without PLTE is rejected', () => {
    const png = buildPng({ colorType: 3, bitDepth: 8 });
    assert.match(fm.validatePng(png).errors.join('\n'), /colour type 3 requires a PLTE chunk/);
  });

  test('too many chunks is rejected', () => {
    const filler = [];
    for (let i = 0; i < 70; i++) filler.push(pngChunk('pHYs', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 0])));
    const errs = fm.validatePng(buildPng({ extraChunks: filler })).errors.join('\n');
    assert.match(errs, /more than 64 chunks/);
  });

  test('non-buffer input is rejected', () => {
    assert.match(fm.validatePng('not a buffer').errors.join('\n'), /must be a Buffer/);
  });
});

describe('validateManifestShape', () => {
  const banks = loadBanks();

  test('a complete synthetic manifest passes shape validation', () => {
    assert.deepEqual(fm.validateManifestShape(manifestForBanks(banks)).errors, []);
  });

  test('wrong schemaVersion is rejected', () => {
    const bad = manifestForBanks(banks, { schemaVersion: 2 });
    assert.match(fm.validateManifestShape(bad).errors.join('\n'), /schemaVersion must be 1/);
  });

  test('empty figures / sources are rejected', () => {
    assert.match(fm.validateManifestShape({ schemaVersion: 1, sources: {}, figures: [] }).errors.join('\n'), /"figures" must be a non-empty array/);
    assert.match(fm.validateManifestShape({ schemaVersion: 1, sources: {}, figures: [] }).errors.join('\n'), /"sources" must be a non-empty object/);
  });

  test('unknown keys are rejected at every level', () => {
    const m = manifestForBanks(banks);
    m.extra = true;
    m.figures[0].color = 'red';
    m.sources['technician-src'].note = 'x';
    const errs = fm.validateManifestShape(m).errors.join('\n');
    assert.match(errs, /unknown top-level key\(s\): extra/);
    assert.match(errs, /unknown key\(s\): color/);
    assert.match(errs, /unknown key\(s\): note/);
  });

  test('malformed figure id and pool/prefix disagreement are rejected', () => {
    const m = manifestForBanks(banks);
    m.figures[0].id = 't-1';            // not normalized
    m.figures[1].id = 'E9-1';           // valid form but wrong pool (technician)
    const errs = fm.validateManifestShape(m).errors.join('\n');
    assert.match(errs, /"id" must be a normalized figure ID/);
    assert.match(errs, /does not match pool "technician"/);
  });

  test('duplicate figure id and duplicate file path are rejected', () => {
    const m = manifestForBanks(banks);
    m.figures[1].id = m.figures[0].id;
    m.figures[2].file = m.figures[0].file;
    const errs = fm.validateManifestShape(m).errors.join('\n');
    assert.match(errs, /duplicate figure id/);
    assert.match(errs, /duplicates the path at index/);
  });

  test('file must sit under assets/figures/<pool>/ with an svg/png extension', () => {
    const m = manifestForBanks(banks);
    m.figures[0].file = 'assets/figures/general/t-1.svg'; // wrong pool dir
    m.figures[1].file = 'assets/figures/general/g7-1.gif'; // wrong extension
    const errs = fm.validateManifestShape(m).errors.join('\n');
    assert.match(errs, /must be under "assets\/figures\/technician\/"/);
    assert.match(errs, /must end in "\.svg" or "\.png"/);
  });

  test('unknown or cross-pool source reference is rejected', () => {
    const m = manifestForBanks(banks);
    m.figures[0].source = 'does-not-exist';
    m.figures.find((f) => f.pool === 'general').source = 'extra-src'; // general figure -> extra source
    const errs = fm.validateManifestShape(m).errors.join('\n');
    assert.match(errs, /is not defined in manifest\.sources/);
    assert.match(errs, /is registered for pool "extra", not "general"/);
  });

  test('sourcePage must be a positive bounded integer', () => {
    const m = manifestForBanks(banks);
    m.figures[0].sourcePage = 0;
    m.figures[1].sourcePage = 1.5;
    m.figures[2].sourcePage = 999999;
    const errs = fm.validateManifestShape(m).errors.join('\n');
    assert.equal((errs.match(/sourcePage must be a 1-based PDF page index/g) || []).length, 3);
  });

  test('extraction method must be from the documented set', () => {
    const m = manifestForBanks(banks);
    m.figures[0].extractionMethod = 'screenshot';
    assert.match(fm.validateManifestShape(m).errors.join('\n'), /extractionMethod must be one of: direct-vector-export, raster-export, vectorization, hand-tracing/);
  });

  test('alt text must be present, single-line, bounded, and not name the answer', () => {
    const m = manifestForBanks(banks);
    m.figures[0].alt = '   ';
    m.figures[1].alt = 'too short';
    m.figures[2].alt = 'The correct answer is point 4 on the Smith chart diagram shown here';
    const errs = fm.validateManifestShape(m).errors.join('\n');
    assert.match(errs, /alt must be a non-blank/);
    assert.match(errs, /alt is too short/);
    assert.match(errs, /alt appears to reference the answer/);
  });

  test('sha256 must be 64 lowercase hex', () => {
    const m = manifestForBanks(banks);
    m.figures[0].sha256 = 'ABC';
    m.figures[1].sha256 = 'g'.repeat(64);
    const errs = fm.validateManifestShape(m).errors.join('\n');
    assert.equal((errs.match(/sha256 must be 64 lowercase hexadecimal/g) || []).length, 2);
  });

  test('hand-traced figures require a review block; bad review shapes are rejected', () => {
    const m = manifestForBanks(banks);
    m.figures[0].extractionMethod = 'hand-tracing'; // no review
    m.figures[1].review = { reviewer: '', date: '09/30/2026' };
    const errs = fm.validateManifestShape(m).errors.join('\n');
    assert.match(errs, /hand-traced assets require a "review" object/);
    assert.match(errs, /review\.reviewer must name the independent reviewer/);
    assert.match(errs, /review\.date must be an ISO date/);
  });

  test('a source not referenced by any figure is reported', () => {
    const m = manifestForBanks(banks);
    m.sources['orphan-src'] = { pool: 'extra', pdf: 'data/pool-sources/orphan.pdf', url: 'https://x/o.pdf', edition: 'x', sha256: HEX64 };
    assert.match(fm.validateManifestShape(m).errors.join('\n'), /manifest\.sources\["orphan-src"\] is not referenced by any figure/);
  });

  test('source registry entries validate their own fields', () => {
    const m = manifestForBanks(banks);
    m.sources['technician-src'].url = 'http://insecure.example/t.pdf';
    m.sources['general-src'].pdf = 'somewhere/g.pdf';
    m.sources['extra-src'].sha256 = 'nope';
    const errs = fm.validateManifestShape(m).errors.join('\n');
    assert.match(errs, /url must be an "https:\/\/" URL/);
    assert.match(errs, /pdf must be under "data\/pool-sources\/"/);
    assert.match(errs, /sha256 must be 64 lowercase hexadecimal/);
  });
});

describe('validateManifestAgainstQuestions', () => {
  const banks = loadBanks();

  test('the full 14-figure manifest resolves every mapped question with no leftovers', () => {
    assert.deepEqual(fm.validateManifestAgainstQuestions(manifestForBanks(banks), banks).errors, []);
  });

  test('a missing manifest entry is reported per affected question', () => {
    const m = manifestForBanks(banks);
    m.figures = m.figures.filter((f) => !(f.pool === 'technician' && f.id === 'T-1'));
    const errs = fm.validateManifestAgainstQuestions(m, banks).errors;
    assert.ok(errs.length >= 1);
    assert.ok(errs.every((e) => /maps to figure T-1 but the manifest has no technician entry/.test(e)));
  });

  test('an unused manifest entry is reported', () => {
    const m = manifestForBanks(banks);
    m.figures.push({
      id: 'T-9', pool: 'technician', file: 'assets/figures/technician/t-9.svg',
      source: 'technician-src', sourcePage: 200, extractionMethod: 'direct-vector-export',
      alt: 'An orphan synthetic figure with a sufficiently long description', sha256: HEX64
    });
    assert.match(fm.validateManifestAgainstQuestions(m, banks).errors.join('\n'), /manifest figure T-9 \(technician\) is not referenced by any question/);
  });

  test('a manifest entry filed under the wrong pool no longer satisfies its questions', () => {
    const m = manifestForBanks(banks);
    const g = m.figures.find((f) => f.id === 'G7-1');
    g.pool = 'extra';
    g.file = 'assets/figures/extra/g7-1.svg';
    g.source = 'extra-src';
    const errs = fm.validateManifestAgainstQuestions(m, banks).errors.join('\n');
    assert.match(errs, /\[general\] question G7A09 maps to figure G7-1 but the manifest has no general entry/);
    assert.match(errs, /manifest figure G7-1 \(extra\) is not referenced by any question/);
  });

  test('accepts the build-style { pool: { questions } } banks shape', () => {
    const shaped = {
      technician: { questions: banks.technician },
      general: { questions: banks.general },
      extra: { questions: banks.extra }
    };
    assert.deepEqual(fm.validateManifestAgainstQuestions(manifestForBanks(banks), shaped).errors, []);
  });
});

describe('validateManifestAssets — filesystem, temp fixture roots', () => {
  const banks = loadBanks();
  let repo;
  const svgBuf = Buffer.from(VALID_SVG, 'utf8');
  const pdfBuf = Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.alloc(64, 0x20)]);

  function writeAllValid() {
    const m = manifestForBanks(banks);
    for (const fig of m.figures) {
      repo.write(fig.file, svgBuf);
      fig.sha256 = fm.sha256Hex(svgBuf);
    }
    for (const key of Object.keys(m.sources)) {
      repo.write(m.sources[key].pdf, pdfBuf);
      m.sources[key].sha256 = fm.sha256Hex(pdfBuf);
    }
    return m;
  }

  before(() => { repo = makeRepo(); });
  after(() => { repo.cleanup(); });

  test('a fully materialized valid manifest passes asset validation', () => {
    const m = writeAllValid();
    assert.deepEqual(fm.validateManifestAssets(m, { repoRoot: repo.root }).errors, []);
    // orchestrator agrees
    assert.deepEqual(fm.validateFigurePipeline(m, { banks, repoRoot: repo.root }).errors, []);
  });

  test('missing asset file is reported', () => {
    const m = writeAllValid();
    fs.rmSync(path.join(repo.root, m.figures[0].file));
    assert.match(fm.validateManifestAssets(m, { repoRoot: repo.root }).errors.join('\n'), /asset file ".*" is missing/);
  });

  test('sha256 mismatch between manifest and file is reported', () => {
    const m = writeAllValid();
    m.figures[0].sha256 = 'd'.repeat(64);
    assert.match(fm.validateManifestAssets(m, { repoRoot: repo.root }).errors.join('\n'), /figure T-1: sha256 mismatch/);
  });

  test('disguised file types are caught (svg ext / png bytes and vice versa)', () => {
    const m = writeAllValid();
    const png = buildPng({ width: 8, height: 8 });
    repo.write(m.figures[0].file, png);              // .svg path, PNG bytes
    m.figures[0].sha256 = fm.sha256Hex(png);
    repo.write(m.figures[1].file, svgBuf);
    const pngFig = m.figures.find((f) => f.pool === 'general');
    const renamed = pngFig.file.replace(/\.svg$/, '.png');
    fs.rmSync(path.join(repo.root, pngFig.file));
    repo.write(renamed, svgBuf);                     // .png path, SVG bytes
    pngFig.file = renamed;
    pngFig.sha256 = fm.sha256Hex(svgBuf);
    const errs = fm.validateManifestAssets(m, { repoRoot: repo.root }).errors.join('\n');
    assert.match(errs, /figure T-1: file extension is \.svg but the bytes are a PNG/);
    assert.match(errs, /file extension is \.png but no <svg>|bytes are not a PNG/);
  });

  test('a prohibited element in a real on-disk SVG is reported through the asset check', () => {
    const m = writeAllValid();
    const evil = Buffer.from(`<svg xmlns="${NS}"><script>1</script></svg>`, 'utf8');
    repo.write(m.figures[0].file, evil);
    m.figures[0].sha256 = fm.sha256Hex(evil);
    assert.match(fm.validateManifestAssets(m, { repoRoot: repo.root }).errors.join('\n'), /figure T-1: SVG: <script> is not in the allowed element subset/);
  });

  test('an entity-encoded external reference in a real on-disk SVG is rejected through the asset check', () => {
    const m = writeAllValid();
    const evil = Buffer.from(
      `<svg xmlns="${NS}"><path fill="&#117;rl(&#104;ttps://example.test/a.svg#x)" d="M0 0h10v10z"/></svg>`,
      'utf8'
    );
    repo.write(m.figures[0].file, evil);
    m.figures[0].sha256 = fm.sha256Hex(evil);
    const errs = fm.validateManifestAssets(m, { repoRoot: repo.root }).errors.join('\n');
    assert.match(errs, /figure T-1: SVG: .*(url\(\.\.\.\)|not an accepted static paint value)/);
    // orchestrator surfaces it too
    assert.match(
      fm.validateFigurePipeline(m, { banks, repoRoot: repo.root }).errors.join('\n'),
      /figure T-1: SVG: /
    );
  });

  test('a truncated PNG on disk is reported through the asset check', () => {
    const m = writeAllValid();
    const genFig = m.figures.find((f) => f.pool === 'general');
    const badPng = buildPng({ truncateTail: 20 });
    const p = genFig.file.replace(/\.svg$/, '.png');
    fs.rmSync(path.join(repo.root, genFig.file));
    repo.write(p, badPng);
    genFig.file = p;
    genFig.sha256 = fm.sha256Hex(badPng);
    assert.match(fm.validateManifestAssets(m, { repoRoot: repo.root }).errors.join('\n'), /PNG: .*(truncated|missing)/);
  });

  test('an unlisted supported asset under the figure root is reported', () => {
    const m = writeAllValid();
    repo.write('assets/figures/extra/e9-99.svg', svgBuf);
    assert.match(fm.validateManifestAssets(m, { repoRoot: repo.root }).errors.join('\n'), /assets\/figures\/extra\/e9-99\.svg" exists under "assets\/figures\/" but is not listed/);
    fs.rmSync(path.join(repo.root, 'assets/figures/extra/e9-99.svg'));
  });

  test('a manifest path with parent traversal is rejected before any read', () => {
    const m = writeAllValid();
    m.figures[0].file = 'assets/figures/technician/../../../etc/passwd';
    assert.match(fm.validateManifestAssets(m, { repoRoot: repo.root }).errors.join('\n'), /parent traversal/);
  });

  test('a symlinked asset path that escapes the root is rejected outright', () => {
    const m = writeAllValid();
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'us-hamexam-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'leak.svg'), svgBuf);
      fs.symlinkSync(outside, path.join(repo.root, 'assets/figures/link'));
      m.figures.push({
        id: 'T-8', pool: 'technician', file: 'assets/figures/link/leak.svg',
        source: 'technician-src', sourcePage: 120, extractionMethod: 'direct-vector-export',
        alt: 'A symlink-escape probe fixture with a long enough description', sha256: fm.sha256Hex(svgBuf)
      });
      assert.match(fm.validateManifestAssets(m, { repoRoot: repo.root }).errors.join('\n'), /traverses symbolic link "link"; symlinks are rejected outright/);
      fs.rmSync(path.join(repo.root, 'assets/figures/link'));
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('source PDF must exist, be a PDF, and match its checksum', () => {
    const m = writeAllValid();
    fs.rmSync(path.join(repo.root, m.sources['technician-src'].pdf));
    assert.match(fm.validateManifestAssets(m, { repoRoot: repo.root }).errors.join('\n'), /source PDF ".*technician\.pdf" is missing/);

    const m2 = writeAllValid();
    repo.write(m2.sources['general-src'].pdf, Buffer.from('NOTPDF', 'latin1'));
    assert.match(fm.validateManifestAssets(m2, { repoRoot: repo.root }).errors.join('\n'), /is not a PDF/);

    const m3 = writeAllValid();
    m3.sources['extra-src'].sha256 = 'e'.repeat(64);
    assert.match(fm.validateManifestAssets(m3, { repoRoot: repo.root }).errors.join('\n'), /source "extra-src" sha256 does not match/);
  });
});

describe('validateFigurePipeline / assertFigurePipeline', () => {
  const banks = loadBanks();

  test('aggregates and de-duplicates errors from every layer, sorted', () => {
    const m = manifestForBanks(banks, { schemaVersion: 9 });
    const { errors } = fm.validateFigurePipeline(m, { banks });
    assert.ok(errors.length >= 1);
    const sorted = errors.slice().sort();
    assert.deepEqual(errors, sorted);
    assert.deepEqual(errors, Array.from(new Set(errors)));
  });

  test('assertFigurePipeline throws one multi-line error listing problems', () => {
    const m = manifestForBanks(banks);
    m.figures[0].id = 'bogus';
    assert.throws(
      () => fm.assertFigurePipeline(m, { banks }),
      (err) => /Figure pipeline validation failed:/.test(err.message) && /"id" must be a normalized figure ID/.test(err.message)
    );
  });

  test('assertFigurePipeline is silent for a clean in-memory manifest (shape + questions only)', () => {
    assert.doesNotThrow(() => fm.assertFigurePipeline(manifestForBanks(banks), { banks }));
  });

  test('validators do not mutate their inputs', () => {
    const m = manifestForBanks(banks);
    const snapshot = JSON.stringify(m);
    fm.validateManifestShape(m);
    fm.validateManifestAgainstQuestions(m, banks);
    fm.validateFigurePipeline(m, { banks });
    fm.validateSvg(VALID_SVG);
    const png = buildPng({});
    const pngCopy = Buffer.from(png);
    fm.validatePng(png);
    assert.equal(JSON.stringify(m), snapshot, 'manifest was mutated');
    assert.ok(png.equals(pngCopy), 'png buffer was mutated');
  });
});

describe('contract constants', () => {
  test('the 1 MiB standalone budget is exact', () => {
    assert.equal(fm.STANDALONE_BUDGET_BYTES, 1048576);
  });
  test('schema version and extraction methods are the documented set', () => {
    assert.equal(fm.SCHEMA_VERSION, 1);
    assert.deepEqual(fm.EXTRACTION_METHODS, ['direct-vector-export', 'raster-export', 'vectorization', 'hand-tracing']);
  });
  test('SVG element allowlist is exactly the documented drawing subset', () => {
    assert.deepEqual(
      Object.keys(fm.SVG_ELEMENTS).sort(),
      ['circle', 'desc', 'ellipse', 'g', 'line', 'path', 'polygon', 'polyline', 'rect', 'svg', 'text', 'title', 'tspan']
    );
  });
});
