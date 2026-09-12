/*
 * Copying the donation address (issue #294).
 *
 * Extracted from components/Footer's DonateChip, which was the only surface
 * that could do this. The address also appears on the node page's
 * "Support development" chip and in Home's community-support panel, and on
 * both it was text you had to select by hand -- on the node page it was inside
 * a tooltip, so selecting it meant racing the tooltip's own dismissal.
 *
 * Two things are load-bearing here and neither is obvious:
 *
 * 1. `navigator.clipboard` is undefined over plain http, and node operators
 *    reach this site over plain http routinely. Without the execCommand
 *    fallback the copy button would silently do nothing for exactly the
 *    audience being asked to donate.
 *
 * 2. This returns a boolean instead of swallowing errors. The original caught
 *    and discarded (`/* clipboard blocked *\/`), which made a blocked clipboard
 *    indistinguishable from a successful copy -- the button said "Copied" and
 *    the user pasted whatever was there before.
 */
export async function copyTextToClipboard(text) {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or a non-secure context that still exposes the API.
      // Fall through to the textarea path rather than giving up.
    }
  }

  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  document.body.appendChild(el);

  try {
    el.select();
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    // In a finally so a throwing execCommand cannot leave an invisible
    // textarea in the DOM on every click.
    document.body.removeChild(el);
  }
}

/** "t1abcdef…uvwxyz" — keeps a donation address recognisable without eating a whole row. */
export function truncateAddress(address) {
  if (!address || address.length <= 20) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
