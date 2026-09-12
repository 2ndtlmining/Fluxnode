/*
 * Footer text for the machine serving this site (issue #145).
 *
 * Formatting lives here rather than in the component because every field from
 * /api/v1/header is optional -- the geolocation lookup can fail, /proc is
 * unreadable off Linux, and on a static-only deploy the endpoint does not exist
 * at all. The rule throughout is that a missing field REMOVES its segment
 * rather than rendering "Hosted in undefined", and the footer with no data at
 * all must look exactly as it did before this feature.
 */

function clean(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}

export function formatHostLocation(location) {
  const city = clean(location?.city);
  // The provider chain can answer with either a full country name or an ISO
  // code -- ipinfo.io gives "AU", ip-api.com gives "Australia" -- and whichever
  // provider answered first is not knowable here. Prefer the name; the code is
  // still far better than dropping the country.
  const country = clean(location?.country) || clean(location?.countryCode);

  if (city && country) return `${city}, ${country}`;
  return city || country || null;
}

/*
 * Coarsened on purpose: a footer wants "10d 0h", not "10d 0h 5m 12s". The
 * smallest unit shown always matches the largest one present, so the string
 * stays about the same width as the numbers grow.
 */
export function formatUptime(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return '<1m';

  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/*
 * The footer segments, in order, with anything unknown left out.
 *
 * Uses appUptimeSeconds -- how long THIS instance has been serving -- rather
 * than the host's kernel uptime. A redeployed app resets the former while the
 * latter keeps climbing, and "up 40 days" under a site that restarted an hour
 * ago is the sort of number nobody can act on.
 */
export function hostInfoSegments(payload) {
  const host = payload?.host;
  if (!host) return [];

  const segments = [];

  const where = formatHostLocation(host.location);
  if (where) segments.push(`Hosted in ${where}`);

  const uptime = formatUptime(host.appUptimeSeconds);
  if (uptime) segments.push(`Up ${uptime}`);

  return segments;
}
