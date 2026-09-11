/*
 * Shared, failing-over access to the Flux block explorer.
 *
 * WHY THIS EXISTS -- the problem was misdiagnosed for a long time.
 *
 * The console fills with:
 *
 *   Access to fetch at 'https://explorer.runonflux.io/api/...' has been blocked
 *   by CORS policy: No 'Access-Control-Allow-Origin' header is present
 *
 * That is not a CORS misconfiguration. Measured 2026-09-11:
 *
 *   explorer.runonflux.io      -> HTTP 429, Retry-After: 31, NO CORS headers
 *   explorer.app.runonflux.io  -> HTTP 200, access-control-allow-origin: *
 *
 * A rate-limited response omits the CORS headers, so the browser refuses to
 * surface the 429 to JS and reports a CORS violation instead. Every one of
 * those errors is a rate limit wearing a CORS costume. Chasing CORS config
 * would have found nothing, because nothing is misconfigured.
 *
 * Both hosts are fallible -- the secondary returned a transient 503 during the
 * same session -- so this is a POOL with bidirectional failover rather than a
 * primary with a spare. A failing host is benched; the next healthy host serves
 * the request; bench windows expire so a recovered host returns to rotation
 * without needing a reload.
 *
 * Benching is the part that actually matters for rate limits. Without it every
 * call would re-attempt the throttled host first, spending a request to be told
 * "no" and making the limit worse -- which is precisely how a rate limit turns
 * into a self-sustaining outage.
 */

export const EXPLORER_HOSTS = [
  'https://explorer.runonflux.io/api',
  'https://explorer.app.runonflux.io/api',
];

// Used when a host fails without telling us for how long (network error, 5xx,
// or a 429 with no Retry-After). Long enough to stop hammering, short enough
// that a blip does not cost minutes of degraded data.
const DEFAULT_BENCH_MS = 30 * 1000;

// Hard ceiling on anything a server asks for. A hostile or mistaken
// `Retry-After: 86400` must not bench a host for the rest of the session.
const MAX_BENCH_MS = 5 * 60 * 1000;

const health = Object.create(null);
for (const host of EXPLORER_HOSTS) {
  health[host] = { benchedUntil: 0, lastError: null };
}

function bench(host, ms, reason) {
  const duration = Math.min(Math.max(ms, 0), MAX_BENCH_MS);
  health[host].benchedUntil = Date.now() + duration;
  health[host].lastError = reason;
}

/*
 * `Retry-After` is defined as either delta-seconds or an HTTP-date. Only the
 * numeric form is honoured: the explorer sends seconds, and mis-parsing a date
 * into a huge bench would be worse than falling back to the default.
 */
function retryAfterMs(response) {
  try {
    const raw = response.headers?.get?.('retry-after');
    if (!raw) return null;
    const seconds = Number(raw);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return seconds * 1000;
  } catch {
    return null;
  }
}

/**
 * GET `path` from the first healthy explorer, returning parsed JSON.
 *
 * Resolves `null` when every host fails. Call sites in this codebase fail soft
 * (donations resolve 0, chain activity returns empty defaults), so throwing
 * here would turn a degraded page into a blank one.
 *
 * @param {string} path e.g. '/blocks?limit=1' (a leading slash is optional)
 * @param {{ signal?: AbortSignal }} [options]
 */
export async function explorerFetchJson(path, options = {}) {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const now = Date.now();

  // Healthy hosts first, in declared order; then benched ones as a last
  // resort. A benched host is still better than no answer at all when every
  // host is benched -- but it is never preferred over a healthy one.
  const healthy = EXPLORER_HOSTS.filter((h) => health[h].benchedUntil <= now);
  const benched = EXPLORER_HOSTS.filter((h) => health[h].benchedUntil > now);
  const order = healthy.length > 0 ? healthy : benched;

  for (const host of order) {
    const url = `${host}${suffix}`;
    let response;
    try {
      response = await fetch(url, { signal: options.signal });
    } catch (error) {
      // A rejected fetch is what a blocked-by-CORS 429 looks like from JS:
      // there is no status to inspect, only a TypeError.
      bench(host, DEFAULT_BENCH_MS, `network: ${error?.message || error}`);
      continue;
    }

    if (response.status === 429) {
      const wait = retryAfterMs(response) ?? DEFAULT_BENCH_MS;
      bench(host, wait, 'rate limited (429)');
      console.log(`[explorer] ${host} rate-limited, benched ${Math.round(wait / 1000)}s`);
      continue;
    }

    if (!response.ok) {
      bench(host, DEFAULT_BENCH_MS, `http ${response.status}`);
      continue;
    }

    try {
      return await response.json();
    } catch (error) {
      // The explorer serves `Loading block index...` as text/plain with a 200
      // while it is starting up. Treat it as a failed host, not as data.
      bench(host, DEFAULT_BENCH_MS, 'non-JSON body');
      continue;
    }
  }

  console.log(`[explorer] all hosts unavailable for ${suffix}`);
  return null;
}

/** Absolute URL on the currently-preferred host, for links and non-JSON uses. */
export function explorerUrl(path) {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const now = Date.now();
  const host = EXPLORER_HOSTS.find((h) => health[h].benchedUntil <= now) || EXPLORER_HOSTS[0];
  return `${host}${suffix}`;
}

// ── test hooks ───────────────────────────────────────────────────────────────
// Exported so the failover logic is testable without waiting out real bench
// windows. Not part of the public surface; nothing in src/ should call these.

export function __resetExplorerHealth() {
  for (const host of EXPLORER_HOSTS) {
    health[host] = { benchedUntil: 0, lastError: null };
  }
}

export function __explorerHealth() {
  return health;
}
