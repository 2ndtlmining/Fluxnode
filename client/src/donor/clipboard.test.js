import { copyTextToClipboard, truncateAddress } from 'donor/clipboard';

/*
 * Issue #294: donating should be one click from anywhere the address appears.
 *
 * The reason this is a tested unit rather than three inline copies: the
 * fallback path is the one that matters here and is the easiest to drop.
 * navigator.clipboard is undefined over plain http, and node operators reach
 * this site over plain http all the time.
 */
describe('copyTextToClipboard', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    delete document.execCommand;
  });

  function setClipboard(value) {
    Object.defineProperty(navigator, 'clipboard', {
      value,
      configurable: true,
      writable: true,
    });
  }

  test('uses the clipboard API when it is available', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await expect(copyTextToClipboard('t1abc')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('t1abc');
  });

  test('falls back to execCommand when the clipboard API is absent (plain http)', async () => {
    setClipboard(undefined);
    document.execCommand = jest.fn().mockReturnValue(true);

    await expect(copyTextToClipboard('t1abc')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  test('leaves no stray textarea behind after the fallback', async () => {
    setClipboard(undefined);
    document.execCommand = jest.fn().mockReturnValue(true);

    await copyTextToClipboard('t1abc');

    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  test('cleans up the textarea even when the fallback throws', async () => {
    setClipboard(undefined);
    document.execCommand = jest.fn(() => {
      throw new Error('blocked');
    });

    await expect(copyTextToClipboard('t1abc')).resolves.toBe(false);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  /*
   * The old inline version swallowed this into an empty catch, so a blocked
   * clipboard was indistinguishable from a successful copy. Reporting it is the
   * whole point of returning a boolean.
   */
  test('reports failure rather than pretending it worked', async () => {
    setClipboard({ writeText: jest.fn().mockRejectedValue(new Error('denied')) });

    await expect(copyTextToClipboard('t1abc')).resolves.toBe(false);
  });

  test('reports failure when execCommand returns false', async () => {
    setClipboard(undefined);
    document.execCommand = jest.fn().mockReturnValue(false);

    await expect(copyTextToClipboard('t1abc')).resolves.toBe(false);
  });

  test.each(['', null, undefined])('refuses empty input (%p) instead of copying nothing', async (value) => {
    const writeText = jest.fn();
    setClipboard({ writeText });

    await expect(copyTextToClipboard(value)).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('truncateAddress', () => {
  test('keeps both ends so the address stays recognisable', () => {
    expect(truncateAddress('t3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr')).toBe('t3YcVbiQ…u9Zjrr');
  });

  test('leaves a short address alone rather than mangling it', () => {
    expect(truncateAddress('t1short')).toBe('t1short');
  });

  test.each([null, undefined, ''])('passes through empty input (%p)', (value) => {
    expect(truncateAddress(value)).toBe(value);
  });
});
