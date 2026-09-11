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
