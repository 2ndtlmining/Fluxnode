/*
 * Whether to quietly thank an operator for hosting FluxNode itself (issue #245).
 *
 * The only real risk in this feature is nagging: it sits on a dashboard people
 * leave open all day. So the decision lives here, away from the rendering, and
 * every condition that could cause a repeat or a mistimed appearance is
 * explicit and tested.
 *
 * Shown ONCE PER WALLET, ever, on this browser. A daily user is thanked on the
 * day they first look and never interrupted again -- the alternative,
 * once-per-session, means a message every morning for something they already
 * know.
 */

const KEY_PREFIX = 'fluxnodeHostThanked:';

export function thanksStorageKey(address) {
  return `${KEY_PREFIX}${address}`;
}

export function shouldThankHost({ address, hostsApp, alreadyThanked, nodesLoaded } = {}) {
  if (!address) return false;
  // Deciding before the fleet has loaded would read "not hosting" from data
  // that has not arrived yet, and could fire late, surprising someone
  // mid-scroll.
  if (!nodesLoaded) return false;
  if (!hostsApp) return false;
  return !alreadyThanked;
}

/*
 * localStorage access, wrapped. Private windows and blocked site data throw on
 * access rather than returning null, and a thank-you must never be the thing
 * that breaks the page.
 *
 * Failing to READ falls back to "not yet thanked", so the worst case in a
 * private window is seeing the message once per visit rather than never.
 */
export function hasBeenThanked(address) {
  try {
    return window.localStorage.getItem(thanksStorageKey(address)) === '1';
  } catch {
    return false;
  }
}

export function markThanked(address) {
  try {
    window.localStorage.setItem(thanksStorageKey(address), '1');
  } catch {
    // Nothing to do: the message simply may appear again next visit.
  }
}
