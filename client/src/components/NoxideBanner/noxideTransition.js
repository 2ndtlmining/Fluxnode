/*
 * FluxNode becomes Noxide on 1 November 2026: the Noxide image replaces this
 * one at the same URL. Until then every page carries a banner pointing at the
 * Noxide beta, so people try it with their own wallet before the switch.
 *
 * Pure logic lives here so the dates and URL mapping can be tested without
 * rendering anything.
 */

export const NOXIDE_ORIGIN = 'https://noxide.app.runonflux.io';
export const FEEDBACK_ISSUES_URL = 'https://github.com/2ndtlmining/Fluxnode/issues';

// 00:00 UTC, 1 Nov 2026. Fixed in UTC so the countdown means the same thing
// in every timezone.
export const CUTOVER_AT = Date.UTC(2026, 10, 1, 0, 0, 0);

// In the final week the banner can no longer be dismissed.
export const FINAL_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// A dismissal hides the banner for this long, then it comes back.
export const DISMISS_FOR_MS = 3 * 24 * 60 * 60 * 1000;

export const DISMISSED_AT_KEY = 'noxide-banner-dismissed-at';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** "12 days left", "1 day left", "5 hours left", "less than an hour left". */
export function timeLeftLabel(now, cutoverAt = CUTOVER_AT) {
  const left = cutoverAt - now;
  if (left <= 0) return null;
  if (left >= DAY_MS) {
    const days = Math.floor(left / DAY_MS);
    return `${days} ${days === 1 ? 'day' : 'days'} left`;
  }
  if (left >= HOUR_MS) {
    const hours = Math.floor(left / HOUR_MS);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
  }
  return 'less than an hour left';
}

export function isFinalWeek(now, cutoverAt = CUTOVER_AT) {
  return cutoverAt - now <= FINAL_WEEK_MS;
}

/**
 * Whether the banner shows. Hidden once the cutover has passed (this image is
 * gone by then anyway) and, before the final week, for DISMISS_FOR_MS after a
 * dismissal.
 */
export function shouldShowBanner(now, dismissedAt, cutoverAt = CUTOVER_AT) {
  if (now >= cutoverAt) return false;
  if (isFinalWeek(now, cutoverAt)) return true;
  if (!Number.isFinite(dismissedAt)) return true;
  return now - dismissedAt >= DISMISS_FOR_MS;
}

/**
 * The Noxide URL for the page being viewed, so the link opens the same view
 * with the same wallet. Noxide redirects /nodes, /apps and friends itself;
 * /home and /live are mapped here too so the link works even on a Noxide
 * build that predates those redirects.
 */
export function noxideUrlFor(pathname = '/', search = '', hash = '') {
  const path = pathname === '/home' || pathname === '/live' ? '/' : pathname || '/';
  return `${NOXIDE_ORIGIN}${path}${search || ''}${hash || ''}`;
}

export function readDismissedAt(storage) {
  try {
    const raw = storage?.getItem(DISMISSED_AT_KEY);
    const value = raw == null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDismissedAt(storage, now) {
  try {
    storage?.setItem(DISMISSED_AT_KEY, String(now));
  } catch {
    // Private mode or blocked storage: the banner just comes back next load.
  }
}
