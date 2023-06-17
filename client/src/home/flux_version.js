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
