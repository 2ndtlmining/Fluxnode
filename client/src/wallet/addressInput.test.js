import {
  createNewHistoryList,
  displayedAddress,
  initialPrivacyState,
  privacyStatePatch,
  processedAddressPatch,
  resolveHydrationTarget
} from './addressInput';

describe('createNewHistoryList', () => {
  it('returns an empty list when there is nothing to keep', () => {
    expect(createNewHistoryList(null, null)).toEqual([]);
    expect(createNewHistoryList(undefined, null)).toEqual([]);
  });

  it('seeds the list when there is no prior history', () => {
    expect(createNewHistoryList(null, 'addr1')).toEqual(['addr1']);
  });

  it('treats a non-array as absent history rather than throwing', () => {
    // History comes back from LocalForage, which can hand back whatever was
    // last written -- including a value from an older schema.
    expect(createNewHistoryList('not-an-array', 'addr1')).toEqual(['addr1']);
    expect(createNewHistoryList({ 0: 'addr1' }, 'addr2')).toEqual(['addr2']);
  });

  it('appends the newest address last', () => {
    expect(createNewHistoryList(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('moves a repeated address to the end instead of duplicating it', () => {
    expect(createNewHistoryList(['a', 'b', 'c'], 'b')).toEqual(['a', 'c', 'b']);
  });

  it('drops duplicates already present in the stored history', () => {
    expect(createNewHistoryList(['a', 'a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });

  it('preserves the existing list when there is no new address', () => {
    expect(createNewHistoryList(['a', 'b'], null)).toEqual(['a', 'b']);
  });

  it('does not mutate the list it was given', () => {
    const original = ['a', 'b'];
    createNewHistoryList(original, 'c');
    expect(original).toEqual(['a', 'b']);
  });
});

describe('displayedAddress', () => {
  const addr = 't1abc123XYZ';

  it('returns the address unchanged when privacy mode is off', () => {
    expect(displayedAddress(false, addr)).toBe(addr);
  });

  it('masks every alphanumeric character when privacy mode is on', () => {
    expect(displayedAddress(true, addr)).toBe('XXXXXXXXXXX');
  });

  it('passes falsy addresses straight through', () => {
    // An empty field must stay empty, not become a masked empty string.
    expect(displayedAddress(true, '')).toBe('');
    expect(displayedAddress(true, null)).toBe(null);
    expect(displayedAddress(true, undefined)).toBe(undefined);
  });
});

describe('privacyStatePatch', () => {
  const base = { privacyMode: false, activeAddress: 't1abc', inputAddress: 't1abc' };

  it('bails out when privacy mode already matches', () => {
    // null is React's setState bail-out, so componentDidUpdate can call this
    // unconditionally without re-rendering forever.
    expect(privacyStatePatch(false, base)).toBeNull();
    expect(privacyStatePatch(true, { ...base, privacyMode: true })).toBeNull();
  });

  it('masks the input when privacy mode turns on', () => {
    expect(privacyStatePatch(true, base)).toEqual({ privacyMode: true, inputAddress: 'XXXXX' });
  });

  it('restores the address when privacy mode turns off', () => {
    const masked = { privacyMode: true, activeAddress: 't1abc', inputAddress: 'XXXXX' };
    expect(privacyStatePatch(false, masked)).toEqual({ privacyMode: false, inputAddress: 't1abc' });
  });

  it('leaves a half-typed search alone when no address is active', () => {
    const typing = { privacyMode: false, activeAddress: null, inputAddress: 't1part' };
    expect(privacyStatePatch(true, typing)).toEqual({ privacyMode: true });
  });

  it('masks from activeAddress, not from whatever is in the field', () => {
    // The old /nodes code masked the input field's current text, so a toggle
    // mid-edit masked the draft rather than the real address.
    const editing = { privacyMode: false, activeAddress: 't1abc', inputAddress: 'zzz' };
    expect(privacyStatePatch(true, editing)).toEqual({ privacyMode: true, inputAddress: 'XXXXX' });
  });
});

/*
 * Issue #249 -- /home and /nodes both crashed on mount with
 * `undefined.toString()` whenever Privacy Mode was on and a ?wallet= was in the
 * URL. The masked param is not a usable address, so hydrateApp tried to recover
 * the real one and got `undefined` from BOTH sides of its `??`.
 */
describe('resolveHydrationTarget', () => {
  const HIST = ['older', 'newest'];

  it('uses the URL wallet when privacy mode is off', () => {
    expect(
      resolveHydrationTarget({ urlWallet: 't1abc', privacyMode: false, searchHistory: HIST })
    ).toMatchObject({ address: 't1abc', source: 'url' });
  });

  it('recovers the active address when the URL wallet is masked', () => {
    // The ?wallet= param has already been masked to XXXX by LayoutContext, so
    // it must never be fed back in as if it were an address.
    expect(
      resolveHydrationTarget({
        urlWallet: 'XXXXXXXXXXXX',
        privacyMode: true,
        activeAddress: 't1active',
        searchHistory: HIST,
      })
    ).toMatchObject({ address: 't1active', source: 'url' });
  });

  it('falls back to the most recent search-history entry, not searchHistory[NaN]', () => {
    // The old code indexed an ARRAY by `array - 1`, i.e. searchHistory[NaN].
    expect(
      resolveHydrationTarget({
        urlWallet: 'XXXXXXXXXXXX',
        privacyMode: true,
        activeAddress: null,
        searchHistory: HIST,
      })
    ).toMatchObject({ address: 'newest', source: 'url' });
  });

  it('returns no address instead of throwing when nothing can be recovered', () => {
    // This is the #249 crash: both recovery sources empty, then `.toString()`.
    expect(
      resolveHydrationTarget({
        urlWallet: 'XXXXXXXXXXXX',
        privacyMode: true,
        activeAddress: null,
        searchHistory: [],
      })
    ).toMatchObject({ address: null, source: null });
  });

  it('still uses a REAL url wallet when privacy is on', () => {
    // Privacy being on does not mean the param IS masked -- following a shared
    // link with privacy enabled hands us a genuine address, and discarding it
    // would silently ignore the link the user just clicked.
    expect(
      resolveHydrationTarget({
        urlWallet: 't1bAB8f6HykLMtL2mvFZvUU7uBjCaUK7Uwr',
        privacyMode: true,
        activeAddress: null,
        searchHistory: [],
      })
    ).toMatchObject({ address: 't1bAB8f6HykLMtL2mvFZvUU7uBjCaUK7Uwr', source: 'url' });
  });

  it('prefers the real url wallet over stored state when privacy is on', () => {
    expect(
      resolveHydrationTarget({
        urlWallet: 't1real',
        privacyMode: true,
        activeAddress: 't1active',
        searchHistory: HIST,
      })
    ).toMatchObject({ address: 't1real', source: 'url' });
  });

  it('reports the MASKED value to show in the field when privacy is on', () => {
    // hydrateApp writes this straight into state.inputAddress. Returning the
    // raw address here is what left the search box in plaintext on /nodes
    // while the URL, wallet header and IP column were all correctly masked.
    const r = resolveHydrationTarget({
      urlWallet: 't1bAB8f6HykLMtL2mvFZvUU7uBjCaUK7Uwr',
      privacyMode: true,
    });
    expect(r.address).toBe('t1bAB8f6HykLMtL2mvFZvUU7uBjCaUK7Uwr');
    expect(r.inputAddress).toBe('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
  });

  it('shows the address as-is when privacy is off', () => {
    const r = resolveHydrationTarget({ urlWallet: 't1abc', privacyMode: false });
    expect(r.inputAddress).toBe('t1abc');
  });

  it('masks a donor wallet in the field too', () => {
    const r = resolveHydrationTarget({ urlWallet: '', donorWallet: 't1donor', privacyMode: true });
    expect(r.address).toBe('t1donor');
    expect(r.inputAddress).toBe('XXXXXXX');
  });

  it('falls back to an unlocked donor wallet only when no URL wallet is present', () => {
    expect(
      resolveHydrationTarget({ urlWallet: '', donorWallet: 't1donor' })
    ).toMatchObject({ address: 't1donor', source: 'donor' });

    expect(
      resolveHydrationTarget({ urlWallet: 't1url', donorWallet: 't1donor', privacyMode: false })
    ).toMatchObject({ address: 't1url', source: 'url' });
  });

  it('reports no target when there is neither a URL wallet nor a donor wallet', () => {
    expect(resolveHydrationTarget({})).toMatchObject({ address: null, source: null });
    expect(resolveHydrationTarget({ urlWallet: '', donorWallet: null })).toMatchObject({
      address: null,
      source: null,
    });
  });

  it('tolerates a missing or non-array search history', () => {
    expect(
      resolveHydrationTarget({ urlWallet: 'XXXX', privacyMode: true, searchHistory: undefined })
    ).toMatchObject({ address: null, source: null });
    expect(
      resolveHydrationTarget({ urlWallet: 'XXXX', privacyMode: true, searchHistory: 'nope' })
    ).toMatchObject({ address: null, source: null });
  });
});

/*
 * Issue #251 -- privacyStatePatch only fires on a TRANSITION, so a page loaded
 * with Privacy Mode ALREADY on never masked the address field. The mask has to
 * be derivable at mount, when there is no previous value to differ from.
 */
describe('initialPrivacyState', () => {
  it('masks the address when privacy is already on at mount', () => {
    expect(initialPrivacyState(true, 't1abc')).toEqual({
      privacyMode: true,
      inputAddress: displayedAddress(true, 't1abc'),
    });
  });

  it('leaves the address alone when privacy is off at mount', () => {
    expect(initialPrivacyState(false, 't1abc')).toEqual({
      privacyMode: false,
      inputAddress: 't1abc',
    });
  });

  it('sets the flag without inventing an address when there is none yet', () => {
    expect(initialPrivacyState(true, null)).toEqual({ privacyMode: true });
    expect(initialPrivacyState(true, '')).toEqual({ privacyMode: true });
  });

  it('coerces a stored non-boolean preference to a real boolean', () => {
    // LocalForage hands back whatever was written, including undefined.
    expect(initialPrivacyState(undefined, 't1abc').privacyMode).toBe(false);
    expect(initialPrivacyState(null, 't1abc').privacyMode).toBe(false);
  });
});

/*
 * Issue #251, second half -- onProcessAddress ran AFTER hydrateApp and wrote
 * `inputAddress: address` unconditionally, overwriting the masked value with
 * the raw one. That is what kept /nodes' search box in plaintext even once
 * hydrateApp was masking correctly.
 */
describe('processedAddressPatch', () => {
  it('keeps the real address active while showing the masked one', () => {
    expect(processedAddressPatch(true, 't1abc')).toEqual({
      activeAddress: 't1abc',
      inputAddress: 'XXXXX',
    });
  });

  it('shows the address unchanged when privacy is off', () => {
    expect(processedAddressPatch(false, 't1abc')).toEqual({
      activeAddress: 't1abc',
      inputAddress: 't1abc',
    });
  });

  it('never masks the address used for lookups, only the displayed one', () => {
    // A masked activeAddress would break every downstream join.
    expect(processedAddressPatch(true, 't1abc').activeAddress).toBe('t1abc');
  });
});
