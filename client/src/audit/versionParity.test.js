import fs from 'fs';
import path from 'path';

/*
 * Issue #271 -- client/package.json and api/Cargo.toml are two hand-maintained
 * copies of the same number, and they had already drifted: the client was 1.2.0
 * while the API was still the 0.1.0 it was created with.
 *
 * That was invisible until #145 added GET /api/v1/header, which publishes
 * CARGO_PKG_VERSION as `app.version` -- so the endpoint reported 0.1.0 while the
 * footer, reading package.json, rendered v1.2.0.
 *
 * This is the same shape of problem constantsParity.test.js catches for the CC_*
 * constants: nothing enforced agreement, so they silently diverged. Checking it
 * here means a future version bump cannot land in only one file.
 */
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function clientVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'client', 'package.json'), 'utf8'));
  return pkg.version;
}

function apiVersion() {
  const cargo = fs.readFileSync(path.join(repoRoot, 'api', 'Cargo.toml'), 'utf8');
  // The FIRST `version =` under [package]; dependency versions follow later and
  // matching those would make this test pass for the wrong reason.
  const packageSection = cargo.split(/^\[/m).find((section) => section.startsWith('package]'));
  const match = /^version\s*=\s*"([^"]+)"/m.exec(packageSection || '');
  return match ? match[1] : null;
}

describe('app version parity', () => {
  it('reads a version from both manifests', () => {
    expect(clientVersion()).toMatch(/^\d+\.\d+\.\d+/);
    expect(apiVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('keeps client/package.json and api/Cargo.toml on the same version', () => {
    // If this fails you bumped one and not the other. /api/v1/header publishes
    // the Cargo one; the footer publishes the package.json one. They are the
    // same application and must not disagree about what it is.
    expect(apiVersion()).toBe(clientVersion());
  });
});
