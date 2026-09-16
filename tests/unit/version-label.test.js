'use strict';

// Direct unit tests for scripts/version-label.js -- the single derivation
// point for the user-facing release-status label (Stage 5B1). This is the
// exact function scripts/build.js calls once to compute
// window.HAM_EXAM_VERSION_DISPLAY; real-build fixture coverage proving it is
// actually wired into both generated documents lives in
// tests/unit/build-gate.test.js.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { deriveVersionDisplay } = require('../../scripts/version-label');

describe('deriveVersionDisplay', () => {
  test('a stable version has no suffix', () => {
    assert.equal(deriveVersionDisplay('0.3.0'), '0.3.0');
    assert.equal(deriveVersionDisplay('1.0.0'), '1.0.0');
  });

  test('a beta prerelease gets the "(beta)" suffix', () => {
    assert.equal(deriveVersionDisplay('0.3.0-beta.1'), '0.3.0-beta.1 (beta)');
    assert.equal(deriveVersionDisplay('0.3.0-beta.2'), '0.3.0-beta.2 (beta)');
    assert.equal(deriveVersionDisplay('0.3.0-beta'), '0.3.0-beta (beta)');
  });

  test('a non-beta prerelease gets the "(prerelease)" suffix, never "(beta)"', () => {
    assert.equal(deriveVersionDisplay('0.3.0-rc.1'), '0.3.0-rc.1 (prerelease)');
    assert.equal(deriveVersionDisplay('0.3.0-alpha.3'), '0.3.0-alpha.3 (prerelease)');
  });

  test('classification looks at the parsed prerelease identifier, not merely the hyphen', () => {
    // "betaish" starts with "beta" as a substring but is NOT the identifier
    // "beta" -- must not be classified as beta.
    assert.equal(deriveVersionDisplay('0.3.0-betaish.1'), '0.3.0-betaish.1 (prerelease)');
    // "beta" must be the FIRST dot-separated identifier, not a later one.
    assert.equal(deriveVersionDisplay('0.3.0-rc.beta'), '0.3.0-rc.beta (prerelease)');
  });

  test('throws a descriptive error for a non-semver string', () => {
    for (const bad of ['', 'v1.2.3', '1.2', '1.2.3.4', 'not-a-version', null, undefined, 42]) {
      assert.throws(() => deriveVersionDisplay(bad), /not a valid semantic version/);
    }
  });
});
