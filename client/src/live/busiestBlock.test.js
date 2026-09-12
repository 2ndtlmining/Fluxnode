import { busiestBlockToRailBlock, BUSIEST_LABEL } from 'live/busiestBlock';

/*
 * Issue #286 part 3: the busiest block of the last 24 hours, shown apart from
 * the live rail and openable like any other block.
 *
 * The bridge that needs testing is the shape change. The rail and the details
 * panel speak in `events`; chain-activity persists `transfers`. Getting that
 * mapping wrong shows the right block with the wrong contents, which looks
 * entirely plausible on screen.
 */
const record = {
  height: 2920896,
  date: '2026-09-04',
  transferCount: 12,
  deploymentCount: 2,
  transfers: [
    { txid: 'aaa', from: 't1alice', to: 't1bob', amount: 6.25 },
    { txid: 'aaa', from: 't1alice', to: 't1carol', amount: 2.87 },
  ],
};

describe('busiestBlockToRailBlock', () => {
  test('carries the height and the activity counts through', () => {
    const b = busiestBlockToRailBlock(record);
    expect(b.height).toBe(2920896);
    expect(b.transferCount).toBe(12);
    expect(b.deploymentCount).toBe(2);
    expect(b.isBusiest).toBe(true);
  });

  test('ranks on transfers plus deployments, matching the backend', () => {
    expect(busiestBlockToRailBlock(record).activity).toBe(14);
  });

  test('turns stored transfers into p2p events the details panel understands', () => {
    const [first, second] = busiestBlockToRailBlock(record).events;
    expect(first).toMatchObject({ type: 'p2p', txid: 'aaa', from: 't1alice', to: 't1bob', amount: 6.25 });
    expect(second).toMatchObject({ type: 'p2p', to: 't1carol', amount: 2.87 });
  });

  /*
   * One transaction paying several addresses produces several transfers with
   * the SAME txid -- seen live on block 2,920,896, twelve outputs sharing one
   * txid. Ids keyed on txid alone would collide in the rendered list.
   */
  test('gives same-txid outputs distinct ids', () => {
    const ids = busiestBlockToRailBlock(record).events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /*
   * Records scanned before #282 carry a count but no stored transfers. The
   * block is still worth showing -- it really was the busiest -- but the panel
   * must not imply it had no transactions.
   */
  test('marks a block whose transfers were never stored', () => {
    const b = busiestBlockToRailBlock({ ...record, transfers: [] });
    expect(b.events).toEqual([]);
    expect(b.transfersAvailable).toBe(false);
    expect(b.transferCount).toBe(12);
  });

  test('a block with its transfers stored reports them as available', () => {
    expect(busiestBlockToRailBlock(record).transfersAvailable).toBe(true);
  });

  test('returns null for a missing record rather than a half-built block', () => {
    expect(busiestBlockToRailBlock(null)).toBeNull();
    expect(busiestBlockToRailBlock(undefined)).toBeNull();
    expect(busiestBlockToRailBlock({})).toBeNull();
  });

  test('has a label, so the rail and the tests cannot drift apart', () => {
    expect(BUSIEST_LABEL).toMatch(/busiest/i);
  });
});
