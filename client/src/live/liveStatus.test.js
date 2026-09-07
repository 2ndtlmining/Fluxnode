import { computeLiveStatus } from './liveStatus';

describe('computeLiveStatus', () => {
  it('is historical whenever not following live, regardless of other flags', () => {
    expect(computeLiveStatus({ isFollowingLive: false, hasEverLoaded: true, unavailable: true })).toBe('historical');
    expect(computeLiveStatus({ isFollowingLive: false, hasEverLoaded: false, unavailable: false })).toBe('historical');
  });

  it('is syncing before the first successful load, while following live', () => {
    expect(computeLiveStatus({ isFollowingLive: true, hasEverLoaded: false, unavailable: false })).toBe('syncing');
  });

  it('is delayed once data has loaded before but polling is currently failing', () => {
    expect(computeLiveStatus({ isFollowingLive: true, hasEverLoaded: true, unavailable: true })).toBe('delayed');
  });

  it('is live once loaded and polling is healthy', () => {
    expect(computeLiveStatus({ isFollowingLive: true, hasEverLoaded: true, unavailable: false })).toBe('live');
  });
});
