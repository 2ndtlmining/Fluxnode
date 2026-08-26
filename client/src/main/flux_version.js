export function fluxos_version_desc(major, minor, patch) {
  return { major, minor, patch };
}

export function fluxos_version_string(desc) {
  return `${desc.major}.${desc.minor}.${desc.patch}`;
}

export function fluxos_version_desc_parse(versionStr) {
  const [major, minor, patch] = versionStr.split('.').map((t) => parseInt(t));
  return fluxos_version_desc(major, minor, patch);
}
window.fluxos_version_desc_parse = fluxos_version_desc_parse;

/**
 * Returns:
 *     1 if descA > descB
 *    -1 if descA < descB
 *     0 if descA == descB
 * */
export function fv_compare(descA, descB) {
  if (descA.major < descB.major) return -1;
  if (descA.major > descB.major) return 1;
  if (descA.minor < descB.minor) return -1;
  if (descA.minor > descB.minor) return 1;
  if (descA.patch < descB.patch) return -1;
  if (descA.patch > descB.patch) return 1;

  return 0;
}

/**
 * The Flux daemon reports its version as a packed integer, inherited from the
 * Zcash/Bitcoin client convention:
 *
 *     CLIENT_VERSION = 1000000*major + 10000*minor + 100*revision + build
 *
 * so 9010050 is 9.1.0 build 50. In that convention a build of 50 marks a final
 * release, so it is omitted; anything else (alpha/beta/rc) is shown.
 *
 * Returns null for a missing or unparseable value so callers can render a dash.
 */
export function daemon_version_string(packed) {
  const n = Number(packed);
  if (!Number.isFinite(n) || n <= 0) return null;

  const major = Math.floor(n / 1000000);
  const minor = Math.floor(n / 10000) % 100;
  const revision = Math.floor(n / 100) % 100;
  const build = n % 100;

  const base = `${major}.${minor}.${revision}`;
  return build === 50 ? base : `${base}.${build}`;
}
