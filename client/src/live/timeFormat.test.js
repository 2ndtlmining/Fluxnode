import { relativeTime, exactTimestamp } from './timeFormat';

describe('relativeTime', () => {
  it('returns an empty string for a missing timestamp', () => {
    expect(relativeTime(null)).toBe('');
    expect(relativeTime(undefined)).toBe('');
    expect(relativeTime(0)).toBe('');
  });

  it('reports "just now" for a timestamp within the last few seconds', () => {
    expect(relativeTime(Date.now())).toBe('just now');
  });

  it('reports whole seconds for anything under a minute', () => {
    expect(relativeTime(Date.now() - 45 * 1000)).toMatch(/^\d+s ago$/);
  });

  it('reports whole minutes for a minute or more', () => {
    expect(relativeTime(Date.now() - 125 * 1000)).toMatch(/^\d+m ago$/);
  });
});

describe('exactTimestamp', () => {
  it('returns an em dash for a missing timestamp', () => {
    expect(exactTimestamp(null)).toBe('—');
    expect(exactTimestamp(undefined)).toBe('—');
  });

  it('returns a non-empty formatted string for a real timestamp', () => {
    const result = exactTimestamp(Date.UTC(2026, 8, 5, 17, 3, 42));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });
});
