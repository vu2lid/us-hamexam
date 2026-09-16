"use strict";

// Stage 5B1: the single authority for the user-facing release-status label
// derived from package.json's semantic version. Both the standalone/PWA
// build (scripts/build.js, which embeds the RESULT of this function once as
// window.HAM_EXAM_VERSION_DISPLAY) and this module's own direct unit tests
// exercise the exact same function -- the browser runtime never re-parses
// the version itself; it only reads the precomputed string.
//
// Accepted shape: the same "core[-prerelease]" shape scripts/build.js already
// validates before calling this (`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`) -- no
// build-metadata (`+...`) support. This is not a claim of full SemVer
// compliance, only of the subset the project actually accepts.
//
// Policy:
//   "0.3.0"           -> "0.3.0"
//   "0.3.0-beta.1"    -> "0.3.0-beta.1 (beta)"
//   "0.3.0-beta.2"    -> "0.3.0-beta.2 (beta)"
//   "0.3.0-rc.1"      -> "0.3.0-rc.1 (prerelease)"   (chosen policy for any
//                        non-beta prerelease -- informative without being
//                        mislabeled "(beta)")
//
// Beta classification looks at the parsed prerelease identifier's first
// dot-separated segment (must be exactly "beta"), not merely at whether the
// version string contains a hyphen -- so "0.3.0-rc.1" is never mislabeled.
const VERSION_RE = /^\d+\.\d+\.\d+(?:-([0-9A-Za-z.-]+))?$/;

function deriveVersionDisplay(version) {
  const match = typeof version === "string" ? VERSION_RE.exec(version) : null;
  if (!match) {
    throw new Error(`deriveVersionDisplay: not a valid semantic version: ${JSON.stringify(version)}`);
  }
  const prerelease = match[1];
  if (!prerelease) return version;
  const firstIdentifier = prerelease.split(".")[0];
  return version + (firstIdentifier === "beta" ? " (beta)" : " (prerelease)");
}

module.exports = { deriveVersionDisplay, VERSION_RE };
