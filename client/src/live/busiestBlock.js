/*
 * The busiest block of the last 24 hours, adapted for the live rail (#286).
 *
 * Two vocabularies meet here. The rail and the details panel speak in
 * `events` -- the shape live/apidata.js builds from a freshly polled block.
 * chain-activity persists `transfers`, because that is what the scanner
 * extracts and stores. This is the only place that translates between them,
 * so a change to either shape breaks in one obvious spot rather than showing
 * the right block with the wrong contents.
 *
 * The block itself comes from the backend, which ranks on transfers plus
 * deployments over a 2,880-block window (24h at the 30-second target). The
 * `activity` figure here is that same sum, restated so the rail can show what
 * the block was picked for.
 */

export const BUSIEST_LABEL = 'BUSIEST BLOCK';

export function busiestBlockToRailBlock(record) {
  if (!record || typeof record.height !== 'number') return null;

  const transfers = Array.isArray(record.transfers) ? record.transfers : [];
  const transferCount = record.transferCount || 0;
  const deploymentCount = record.deploymentCount || 0;

  return {
    height: record.height,
    date: record.date || null,
    isBusiest: true,
    transferCount,
    deploymentCount,
    // What the backend ranked on. Shown on the card so the block does not just
    // assert it is the busiest without saying by what measure.
    activity: transferCount + deploymentCount,
    /*
     * False for anything scanned before #282 started storing transfers. The
     * block is still worth showing -- it genuinely was the busiest -- but the
     * panel has to say the transactions were not recorded rather than render an
     * empty list, which would read as "this block had none".
     */
    transfersAvailable: transfers.length > 0,
    events: transfers.map((t, i) => ({
      /*
       * Index in the id, not just txid. One transaction can pay several
       * addresses and the scanner emits one transfer per output -- block
       * 2,920,896 has twelve sharing a single txid -- so txid alone collides.
       */
      id: `p2p-${t.txid}-${i}`,
      type: 'p2p',
      txid: t.txid,
      from: t.from || null,
      to: t.to,
      amount: t.amount,
    })),
  };
}
