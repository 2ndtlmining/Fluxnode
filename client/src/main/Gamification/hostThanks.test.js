import { shouldThankHost, thanksStorageKey } from './hostThanks';

/*
 * Issue #245 -- a quiet thank-you from the top of the screen for the handful of
 * operators hosting FluxNode itself.
 *
 * The whole risk here is nagging. This sits on a dashboard people leave open
 * all day, so the decision of WHETHER to show it is kept separate from the
 * showing, and pinned down here.
 */
describe('shouldThankHost', () => {
  const base = { address: 't1alice', hostsApp: true, alreadyThanked: false, nodesLoaded: true };

  it('thanks an operator who hosts the app', () => {
    expect(shouldThankHost(base)).toBe(true);
  });

  it('says nothing to an operator who does not host it', () => {
    expect(shouldThankHost({ ...base, hostsApp: false })).toBe(false);
  });

  it('says nothing twice to the same wallet', () => {
    expect(shouldThankHost({ ...base, alreadyThanked: true })).toBe(false);
  });

  it('waits until the fleet has actually loaded', () => {
    // Firing on an empty fleet would mean deciding "not hosting" before the
    // data that answers it has arrived -- and worse, could fire late and
    // surprise someone mid-scroll.
    expect(shouldThankHost({ ...base, nodesLoaded: false })).toBe(false);
  });

  it('says nothing when no wallet is being viewed', () => {
    expect(shouldThankHost({ ...base, address: null })).toBe(false);
    expect(shouldThankHost({ ...base, address: '' })).toBe(false);
  });

  it('survives being called with nothing', () => {
    expect(shouldThankHost()).toBe(false);
    expect(shouldThankHost({})).toBe(false);
  });
});

describe('thanksStorageKey', () => {
  it('is per wallet, so one operator being thanked does not silence another', () => {
    expect(thanksStorageKey('t1alice')).not.toBe(thanksStorageKey('t1bob'));
  });

  it('is stable for the same wallet across visits', () => {
    expect(thanksStorageKey('t1alice')).toBe(thanksStorageKey('t1alice'));
  });

  it('is namespaced so it cannot collide with other stored keys', () => {
    expect(thanksStorageKey('t1alice')).toMatch(/^fluxnodeHostThanked:/);
  });
});
