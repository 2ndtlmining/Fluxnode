/*
 * Shared state logic for the wallet address input that /home and /nodes both
 * render (issue #166).
 *
 * Both pages grew from the same original component and still carry
 * near-identical copies of this logic -- 463 identical lines between them. The
 * copies have since drifted, and the drift caused real bugs rather than merely
 * offending tidiness:
 *
 *   - the privacy-mode toggle masked the address on /nodes but not on /home
 *   - a ?wallet= link left the input visibly blank on /home
 *   - /nodes picked up a donor wallet unlocked elsewhere; /home did not
 *
 * This module holds the parts that are genuinely shared and provable in
 * isolation, so the next fix lands in one place instead of one-and-a-half.
 * The components stay classes: converting them to hooks is a separate, much
 * larger change, and none of these bugs needed it.
 */

import { hide_sensitive_string } from 'utils';

/*
 * The search-history list with `newTop` moved to the end (the UI renders it
 * most-recent-last), de-duplicated, with any previous occurrence removed.
 *
 * Moved verbatim from the two components, which held byte-identical copies.
 * The loose `!=` and `== -1` are deliberate: history loaded from storage can
 * hold non-string values, and tightening the comparisons here would silently
 * change which entries are treated as duplicates.
 */
export function createNewHistoryList(oldValues, newTop) {
  if (!oldValues || oldValues.constructor !== Array) {
    if (!newTop) return [];
    else return [newTop];
  }
  let _historyClone = [];
  for (let i = 0; i < oldValues.length; i++) {
    let val = oldValues[i];
    if (val != newTop && _historyClone.indexOf(val) == -1) _historyClone.push(val);
  }
  if (newTop) _historyClone.push(newTop);
  return _historyClone;
}

/*
 * What the address field and the ?wallet= param should show for a given
 * privacy-mode setting.
 *
 * Falsy addresses pass through untouched so callers can hand this an empty
 * field without getting a masked empty string back.
 */
export function displayedAddress(privacyMode, address) {
  if (!address) return address;
  return privacyMode ? hide_sensitive_string(address) : address;
}

/*
 * The state patch that brings a page's privacy state in line with the layout
 * context, or null when nothing needs to change.
 *
 * Returning null matters: React treats a null from a setState updater as a
 * bail-out, so componentDidUpdate can call this unconditionally without
 * looping. Callers compare against CURRENT state rather than componentDidUpdate's
 * prevState argument -- comparing prevState is what made the old /nodes
 * version mask a render late, leaving a frame of unmasked address after every
 * toggle.
 *
 * `inputAddress` is only rewritten when there is an active address to mask, so
 * a half-typed search the user has not submitted is left alone.
 */
export function privacyStatePatch(privacyMode, prev) {
  if (privacyMode === prev.privacyMode) return null;
  if (!prev.activeAddress) return { privacyMode };
  return { privacyMode, inputAddress: displayedAddress(privacyMode, prev.activeAddress) };
}

/*
 * Whether a value is the OUTPUT of hide_sensitive_string rather than a real
 * address. That function replaces every alphanumeric with 'X', and Flux
 * addresses are alphanumeric throughout, so a masked one is a pure run of X's
 * -- which no genuine address can be.
 */
function isMaskedAddress(value) {
  return /^X+$/.test(value);
}

/*
 * Which wallet a page should hydrate with, and where it came from (issue #249).
 *
 * This decision was duplicated byte-for-byte in Home.jsx and MainApp.jsx, and
 * the duplicate carried the same two defects in both copies:
 *
 *   wallet = this.activeAddress ?? this.state.searchHistory[this.state.searchHistory - 1];
 *
 *   - `this.activeAddress` is never assigned anywhere; the field is
 *     `this.state.activeAddress`, so the left side was always undefined.
 *   - the right side indexes an ARRAY by `array - 1`, i.e. searchHistory[NaN],
 *     so it was always undefined too.
 *
 * Both sides being undefined meant the next line's `wallet.toString()` threw,
 * taking /home and /nodes down to the error boundary on any load with Privacy
 * Mode on and a ?wallet= in the URL.
 *
 * Why the URL param can't just be used when privacy is on: LayoutContext masks
 * ?wallet= to XXXX in place, so by the time this runs the param is a row of
 * X's, not an address. The real address has to come from somewhere the mask
 * hasn't touched -- the active address, or failing that the newest entry in the
 * search history.
 *
 * Returns `{ address: null, source: null }` rather than throwing when nothing
 * can be recovered; callers treat that as "no wallet", which is the same path
 * a visitor with no ?wallet= takes.
 *
 * `inputAddress` is what the search field should SHOW, which is not always the
 * address: with privacy on it is the masked form. Returning both together is
 * deliberate -- hydrateApp writes this straight into state, and handing back
 * only the raw address is what left /nodes' search box in plaintext while the
 * URL, wallet header and IP column were all correctly masked.
 */
export function resolveHydrationTarget({
  urlWallet,
  donorWallet,
  privacyMode,
  activeAddress,
  searchHistory,
} = {}) {
  const fromUrl = urlWallet == null ? '' : String(urlWallet);

  if (fromUrl !== '') {
    // Privacy being ON does not mean this particular param IS masked: following
    // a shared link with the preference enabled hands us a genuine address, and
    // throwing it away would silently ignore the link the user just clicked.
    // Only a value that is actually masked needs recovering from state.
    if (!privacyMode || !isMaskedAddress(fromUrl)) return _target(fromUrl, 'url', privacyMode);

    const history = Array.isArray(searchHistory) ? searchHistory : [];
    const recovered = activeAddress || history[history.length - 1] || null;
    return recovered ? _target(recovered, 'url', privacyMode) : _target(null, null, privacyMode);
  }

  if (donorWallet) return _target(donorWallet, 'donor', privacyMode);

  return _target(null, null, privacyMode);
}

function _target(address, source, privacyMode) {
  return {
    address: address || null,
    source: address ? source : null,
    inputAddress: address ? displayedAddress(privacyMode, address) : ''
  };
}

/*
 * The privacy slice of state as it should look at MOUNT (issue #251).
 *
 * privacyStatePatch above deliberately bails out when the mode has not changed,
 * which is right for componentDidUpdate but wrong for mount: a page loaded with
 * the preference ALREADY on has no transition to catch, so the address field
 * was left showing the wallet in full plaintext while the URL and the wallet
 * header were correctly masked.
 *
 * The stored preference comes from LocalForage and can be anything that was
 * last written -- including undefined -- so it is coerced to a real boolean
 * rather than trusted. `inputAddress` is only included when there is an address
 * to mask, so this never blanks a field the user is midway through typing.
 */
export function initialPrivacyState(privacyMode, activeAddress) {
  const enabled = privacyMode === true;
  if (!activeAddress) return { privacyMode: enabled };
  return { privacyMode: enabled, inputAddress: displayedAddress(enabled, activeAddress) };
}

/*
 * The state a page should hold once it has successfully processed an address
 * (issue #251).
 *
 * onProcessAddress used to end with a bare `inputAddress: address`, which runs
 * AFTER hydrateApp and therefore overwrote the masked value with the raw one --
 * leaving the search box in plaintext on a privacy-enabled load even though the
 * URL, wallet header and IP column were all masked correctly.
 *
 * The distinction this encodes: `activeAddress` must stay the REAL address,
 * because every downstream lookup and join keys on it. Only the displayed value
 * is masked.
 */
export function processedAddressPatch(privacyMode, address) {
  return { activeAddress: address, inputAddress: displayedAddress(privacyMode, address) };
}
