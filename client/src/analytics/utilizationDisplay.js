/*
 * How a resource row on the Donor tab reads (issue #335).
 *
 * The panel used to show a percentage beside the network average. An operator
 * does not care how they rank; they care how much of what they are paying for
 * is in use. So: "10 / 40 Cores (25%)", summed over their nodes by default and
 * narrowed to one when one is selected.
 *
 * Pure and separate from the component because the edge cases are where this
 * goes wrong, not the markup: a node with no benchmark reading reports a total
 * of zero, and 0/0 reaching the page as "NaN%" is exactly the kind of thing
 * that looks fine in review and wrong on the data.
 */

const NO_CAPACITY = 'No capacity reported';

/** Share of capacity in use, clamped to 0-100 and never NaN. */
export function usagePercent(utilized, total) {
  const used = Number(utilized) || 0;
  const capacity = Number(total) || 0;
  if (capacity <= 0) return 0;
  return Math.min(100, (used / capacity) * 100);
}

/*
 * Up to one decimal, and no trailing zero. Reservations are genuinely
 * fractional -- appsCpusLocked can be half a core -- but "40.0 Cores" reads as
 * false precision on a figure that is usually a whole number.
 */
function fmtAmount(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/*
 * Storage reads in TB once there is enough of it (issue #355).
 *
 * Reported from Discord: the panel said "1,555 / 27,060 GB". Twenty-seven
 * thousand gigabytes is a five-digit number nobody sizes at a glance, and the
 * Network tab was already showing the same quantity as TB two tabs away -- so
 * the site disagreed with itself about how to write a storage figure.
 *
 * 1024 rather than 1000, matching the Network tab's own threshold. That makes
 * this technically TiB labelled TB, which is the established convention here;
 * switching to decimal would be more correct in isolation and would make the
 * two tabs report different numbers for the same bytes, which is worse.
 */
const GB_PER_TB = 1024;

/** TB where it helps, GB where TB would read as 0.0. */
export function formatStorage(gb) {
  const n = Number(gb) || 0;
  if (!n) return '—';
  return n >= GB_PER_TB ? `${fmtAmount(n / GB_PER_TB)} TB` : `${fmtAmount(n)} GB`;
}

/** Whether a unit is a storage quantity, and therefore scales. Cores do not. */
function isStorageUnit(unit) {
  return unit === 'GB';
}

/**
 * "10 / 40 Cores (25%)", or a plain statement when nothing was measured.
 *
 * No capacity is deliberately NOT rendered as "0 / 0 (0%)": that asserts a
 * fact about a node which never reported one, and an operator reading it would
 * reasonably conclude their node has no CPU rather than that we have no
 * benchmark for it.
 *
 * THE UNIT COMES FROM THE TOTAL AND IS APPLIED TO BOTH HALVES. Scaling each
 * value on its own would produce "1,555 GB / 26.4 TB", where the ratio is
 * unreadable because the two numbers are in different units -- which is the
 * only thing a reader is actually doing with them.
 *
 * It scales rather than converting unconditionally because a donor with one
 * Cumulus node has 220 GB, and "0.2 TB" is worse, not better.
 */
export function usageLabel(resource, unit) {
  const total = Number(resource?.total) || 0;
  if (total <= 0) return NO_CAPACITY;

  const used = Number(resource?.utilized) || 0;
  const pct = Math.round(usagePercent(used, total));

  if (isStorageUnit(unit) && total >= GB_PER_TB) {
    return `${fmtAmount(used / GB_PER_TB)} / ${fmtAmount(total / GB_PER_TB)} TB (${pct}%)`;
  }

  return `${fmtAmount(used)} / ${fmtAmount(total)} ${unit} (${pct}%)`;
}
