import { hide_sensitive_number } from 'utils';

/*
 * Privacy masking for the Donor tab (issue #343).
 *
 * The toggle predates /analytics and every older surface honours it --
 * NodeGridTable's IpCell, AppsSection, BestUptime, the achievements copy.
 * Nothing under analytics/ read `enablePrivacyMode` at all, so the Donor tab
 * showed the donor's node addresses in the clear.
 *
 * That is the tab where it matters most: it is reached by proving ownership of
 * a wallet, and it puts that wallet's whole fleet on one screen.
 *
 * A WRAPPER, NOT A REPLACEMENT. It delegates to utils.js's
 * hide_sensitive_number so the Donor tab masks identically to every other
 * surface -- two masking styles would look like a bug. It exists only because
 * that function calls .toString() with its null guard commented out
 * (utils.js:71-73) and therefore throws on the absent values this tab really
 * has: a node with no payout yet, an app row missing its node address.
 *
 * Fixing the guard in utils.js itself was the other option and was not taken:
 * five other call sites depend on its current behaviour, and quietly changing
 * a shared helper to fix one tab is how the next surprise gets made.
 */
export function maskNodeAddress(address, enabled) {
  if (!address) return '';
  return enabled ? hide_sensitive_number(address) : address;
}
