import fs from 'fs';
import path from 'path';

/*
 * The site's economic constants exist in TWO hand-maintained copies:
 *
 *   client/public/runtime/app-content.js  -- what production actually serves
 *   client/src/setupTests.js              -- what every Jest test sees
 *
 * Nothing enforced that they agree. That is a live trap, not a hypothetical
 * one: issue #202 records that the first PoN subsidy reduction lands at block
 * 3,071,200 (~2026-10-25) and takes CC_BLOCK_REWARD from 14 to 12.6. If only
 * app-content.js is updated on that date, every test keeps passing against the
 * stale 14 -- and apidata.test.js derives its expected values FROM these
 * constants, so it would not merely miss the change, it would actively certify
 * the wrong arithmetic as correct.
 *
 * This test makes that drift impossible to merge quietly. It is also load-
 * bearing for the audit harness: d1AppSide.test.js runs the app's real
 * functions under Jest, so it reads setupTests.js's values rather than
 * production's. Its output is only meaningful while these two agree.
 *
 * Deliberately compares only the CC_* economic constants. URLs, e-mail and the
 * REQUIREMENTS block are presentation, drift harmlessly, and pinning them here
 * would produce failures nobody should have to care about.
 */

const CLIENT_SRC = path.join(__dirname, '..');
const APP_CONTENT = path.join(CLIENT_SRC, '..', 'public', 'runtime', 'app-content.js');
const SETUP_TESTS = path.join(CLIENT_SRC, 'setupTests.js');

// `window.gContent.CC_NAME = 12.5;`
function parseAppContent(source) {
  const found = {};
  const re = /window\.gContent\.(CC_[A-Z_]+)\s*=\s*([0-9.]+)\s*;/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    found[match[1]] = Number(match[2]);
  }
  return found;
}

// `CC_NAME: 12.5,` inside the setupTests object literal.
function parseSetupTests(source) {
  const found = {};
  const re = /(CC_[A-Z_]+)\s*:\s*([0-9.]+)\s*,/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    found[match[1]] = Number(match[2]);
  }
  return found;
}

const production = parseAppContent(fs.readFileSync(APP_CONTENT, 'utf8'));
const testDoubles = parseSetupTests(fs.readFileSync(SETUP_TESTS, 'utf8'));

describe('economic constant parity: setupTests.js vs app-content.js', () => {
  it('finds constants in both files (guards the parser itself)', () => {
    // If a regex silently matched nothing, every assertion below would pass
    // vacuously and this test would be theatre.
    expect(Object.keys(production).length).toBeGreaterThan(5);
    expect(Object.keys(testDoubles).length).toBeGreaterThan(5);
  });

  it('every production CC_* constant is mirrored in setupTests.js', () => {
    const missing = Object.keys(production).filter((name) => !(name in testDoubles));
    expect(missing).toEqual([]);
  });

  it('every constant holds the same value in both files', () => {
    const drifted = Object.keys(production)
      .filter((name) => name in testDoubles && production[name] !== testDoubles[name])
      .map((name) => `${name}: production=${production[name]} tests=${testDoubles[name]}`);

    // Listing the drifted names rather than asserting per-constant, so one run
    // reports everything that moved instead of only the first.
    expect(drifted).toEqual([]);
  });

  it('setupTests.js declares no CC_* constant production does not have', () => {
    // A stale test double for a deleted constant is dead weight that can make
    // a removed feature look alive in tests.
    const orphans = Object.keys(testDoubles).filter((name) => !(name in production));
    expect(orphans).toEqual([]);
  });
});
