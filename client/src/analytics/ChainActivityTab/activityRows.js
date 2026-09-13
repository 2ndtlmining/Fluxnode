/*
 * The retained blocks, flattened into the two lists the page is built from
 * (issue #346).
 *
 * The screen used to be inverted: two counts got a 400px chart while the events
 * themselves sat two clicks deep inside a ~200px scroll window, with a third of
 * the viewport empty below. A block is the wrong unit for reading activity --
 * nobody wants to open blocks one at a time to find out what happened. The
 * events are the content, so they become the page and the blocks become a
 * column on each row.
 *
 * Pure and data-only, deliberately: the component renders these, and everything
 * decidable about what a row SAYS is testable without mounting anything.
 */

// 30-second blocks, same figure as the backend's BLOCKS_PER_DAY.
export const BLOCKS_PER_DAY = 2880;

/** Strip a trailing .0 so whole numbers read as "1 cpu", not "1.0 cpu". */
function trim(n) {
  return Number(n.toFixed(2)).toString();
}

/**
 * What a deployment's resources cell should say.
 *
 * THE ENTERPRISE CASE IS THE POINT. 390 of 1,462 live specs (26.7%) encrypt
 * their resources, so the numbers arrive as zeros. Rendering "0 cpu · 0 MB"
 * would state that the app consumes nothing, which is not true of any app --
 * it is a confident wrong number where an honest "we cannot see this" belongs.
 */
export function resourceLabel(deployment) {
  if (!deployment?.resourcesKnown) return deployment?.enterprise ? 'Encrypted' : 'Unknown';
  return `${trim(deployment.cpu)} cpu · ${trim(deployment.ram)} MB · ${trim(deployment.hdd)} GB`;
}

/**
 * One row per app deployment, across every retained block.
 *
 * NO COST FIELD. #346 asked for the FLUX and USD paid per deployment, and an
 * earlier pass at this carried one -- derived from payments to an address that
 * turned out to be a Stratus node collecting block rewards. Those outputs were
 * coinbase: 0.5 dev fund + 1.0 Cumulus + 3.5 Nimbus + 9.0 Stratus = exactly the
 * 14 FLUX block reward, which is why they looked so convincingly uniform.
 * Per-app cost still needs the v9 payment memo, as #270 says.
 */
export function deploymentRows(blocks) {
  if (!Array.isArray(blocks)) return [];

  const rows = [];
  for (const block of blocks) {
    const deployments = Array.isArray(block?.deployments) ? block.deployments : [];
    deployments.forEach((d, i) => {
      rows.push({
        // Index included: several apps legitimately deploy in one block, so
        // height alone is not unique.
        key: `${block.height}-${i}-${d?.name || ''}`,
        height: block.height,
        hash: block.hash || null,
        date: block.date,
        name: d?.name || '',
        owner: d?.owner || '',
        instances: d?.instances || 0,
        repotag: d?.repotag || '',
        cpu: d?.cpu || 0,
        ram: d?.ram || 0,
        hdd: d?.hdd || 0,
        enterprise: !!d?.enterprise,
        resourcesKnown: !!d?.resourcesKnown,
        resources: resourceLabel(d)
      });
    });
  }
  return rows;
}

/** One row per P2P transfer, across every retained block. */
export function transferRows(blocks) {
  if (!Array.isArray(blocks)) return [];

  const rows = [];
  for (const block of blocks) {
    const transfers = Array.isArray(block?.transfers) ? block.transfers : [];
    transfers.forEach((t, i) => {
      rows.push({
        key: `${block.height}-${t?.txid || i}-${i}`,
        height: block.height,
        hash: block.hash || null,
        date: block.date,
        txid: t?.txid || '',
        // null, not '', so the row can say "unknown" rather than render an
        // empty cell that reads as a rendering bug. The explorer genuinely
        // omits `addr` on some inputs.
        from: t?.from || null,
        to: t?.to || '',
        amount: typeof t?.amount === 'number' ? t.amount : 0
      });
    });
  }
  return rows;
}

/**
 * How much of the window was actually read.
 *
 * #346's screenshot headlined "8 UTILITY BLOCKS TODAY" from 199 empty + 8
 * utility = 207 blocks. A Flux day is 2,880, so that was 7% of a day presented
 * as the day. The sync banner explained the shortfall; the number above it did
 * not inherit the caveat.
 *
 * Every day in the rollup is expected to hold a full day of blocks. The
 * newest is legitimately partial simply because it is still in progress --
 * which is exactly why the figure is reported rather than hidden: a reader can
 * see whether "8 today" means eight so far or eight in total.
 */
export function coverageSummary(daily) {
  const days = Array.isArray(daily) ? daily : [];
  const blocksScanned = days.reduce((sum, d) => sum + (d?.utilityBlocks || 0) + (d?.emptyBlocks || 0), 0);
  const blocksExpected = days.length * BLOCKS_PER_DAY;

  return {
    days: days.length,
    blocksScanned,
    blocksExpected,
    pct: blocksExpected > 0 ? Math.round((blocksScanned / blocksExpected) * 100) : 0,
    partial: blocksScanned < blocksExpected || days.length === 0
  };
}

/*
 * Search across the fields a reader would actually type, not every field.
 *
 * Height is matched against the RAW number as well as the grouped form, so
 * "2923431" and "2,923,431" both work -- a reader copying a height off the
 * screen gets the separators.
 */
const SEARCHABLE = ['name', 'owner', 'repotag', 'txid', 'from', 'to'];

export function filterRows(rows, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return Array.isArray(rows) ? rows : [];
  if (!Array.isArray(rows)) return [];

  return rows.filter((row) => {
    if (String(row.height).includes(q.replace(/,/g, ''))) return true;
    if (Number(row.height).toLocaleString().toLowerCase().includes(q)) return true;
    return SEARCHABLE.some((f) => String(row[f] ?? '').toLowerCase().includes(q));
  });
}

/** Sort a copy, never the caller's array — these feed useMemo results. */
export function sortRows(rows, key, ascending) {
  if (!Array.isArray(rows)) return [];

  const sorted = [...rows];
  sorted.sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === 'string' || typeof bv === 'string'
      ? String(av).localeCompare(String(bv))
      : av - bv;
    return ascending ? cmp : -cmp;
  });
  return sorted;
}
