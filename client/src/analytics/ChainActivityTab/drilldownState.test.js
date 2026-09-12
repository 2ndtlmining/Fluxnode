import { shouldFetchDrilldown, stateAfterCancel } from './drilldownState';

/*
 * Issue #253 -- the block drill-down could get PERMANENTLY stuck on
 * "Loading blocks...".
 *
 * UtilityDrilldown fetches once, guarded by `state.status !== 'idle'`, and its
 * effect cleanup sets `cancelled = true` so a late resolve is ignored. Closing
 * the panel before the fetch resolved therefore left status at 'loading'
 * forever: the resolve was skipped, and the guard then refused to retry on
 * reopen. No further request was ever issued -- confirmed in the browser, where
 * reopening produced zero network calls.
 */
describe('shouldFetchDrilldown', () => {
  it('fetches when opened for the first time', () => {
    expect(shouldFetchDrilldown(true, 'idle')).toBe(true);
  });

  it('does not fetch while closed', () => {
    expect(shouldFetchDrilldown(false, 'idle')).toBe(false);
  });

  it('does not re-fetch what it already has', () => {
    expect(shouldFetchDrilldown(true, 'ready')).toBe(false);
    expect(shouldFetchDrilldown(true, 'loading')).toBe(false);
  });

  it('does not retry an error on its own, so it cannot hammer a failing API', () => {
    expect(shouldFetchDrilldown(true, 'error')).toBe(false);
  });
});

describe('stateAfterCancel', () => {
  it('returns an interrupted load to idle so reopening retries', () => {
    // THE bug: without this, status stays 'loading' and the guard above blocks
    // every future attempt.
    expect(stateAfterCancel({ status: 'loading', data: null })).toEqual({ status: 'idle', data: null });
  });

  it('leaves a completed load alone', () => {
    const ready = { status: 'ready', data: { blocks: [] } };
    expect(stateAfterCancel(ready)).toBe(ready);
  });

  it('leaves an error alone, so the message survives a close', () => {
    const err = { status: 'error', data: null };
    expect(stateAfterCancel(err)).toBe(err);
  });

  it('leaves idle alone', () => {
    const idle = { status: 'idle', data: null };
    expect(stateAfterCancel(idle)).toBe(idle);
  });
});
