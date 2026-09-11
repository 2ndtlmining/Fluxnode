import { createNewHistoryList, displayedAddress, privacyStatePatch } from './addressInput';

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
