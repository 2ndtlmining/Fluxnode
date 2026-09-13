import { maskNodeAddress } from './privacy';

/*
 * Issue #343: privacy mode does nothing on the Donor tab.
 *
 * The toggle has existed since long before /analytics, and every older surface
 * honours it -- NodeGridTable's IpCell, AppsSection, BestUptime, the
 * achievements copy. Nothing under analytics/ reads `enablePrivacyMode` at all,
 * so the Donor tab renders the donor's node addresses in the clear: the nodes
 * list, both payout captions, and the Node column of the apps table.
 *
 * That is the tab where it matters most. It is reached by proving ownership of
 * a wallet, and it puts that wallet's entire node fleet on one screen -- which
 * is exactly the screenshot someone would share to show off their setup.
 *
 * This wraps utils.js's hide_sensitive_number rather than replacing it, so the
 * Donor tab masks identically to every other surface. The wrapper exists for
 * one reason: hide_sensitive_number calls .toString() on its argument with the
 * null guard COMMENTED OUT (utils.js:71-73), so it throws on the absent values
 * the Donor tab genuinely has -- a node with no payout yet, an app row whose
 * node address is missing.
 */

describe('maskNodeAddress', () => {
  it('masks every digit of an address, keeping its shape', () => {
    expect(maskNodeAddress('82.66.83.104:16127', true)).toBe('XX.XX.XX.XXX:XXXXX');
  });

  it('returns the address untouched when privacy is off', () => {
    expect(maskNodeAddress('82.66.83.104:16127', false)).toBe('82.66.83.104:16127');
  });

  /*
   * The reason this wrapper exists. hide_sensitive_number(null) throws
   * "Cannot read properties of null (reading 'toString')", and the Donor tab
   * has real absent values: a node that has never been paid has no payout
   * address to caption.
   */
  it('survives an absent address rather than throwing', () => {
    for (const missing of [null, undefined, '']) {
      expect(() => maskNodeAddress(missing, true)).not.toThrow();
      expect(maskNodeAddress(missing, true)).toBe('');
    }
  });

  it('leaves non-digits alone, so a masked address is still recognisably one', () => {
    // Dots and the port colon survive; only the digits go. A reader can still
    // see that this is an address and not, say, a wallet.
    expect(maskNodeAddress('1.2.3.4:16127', true)).toBe('X.X.X.X:XXXXX');
  });

  it('masks a bare host with no port', () => {
    expect(maskNodeAddress('192.168.0.1', true)).toBe('XXX.XXX.X.X');
  });
});
