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

/**
 * "10 / 40 Cores (25%)", or a plain statement when nothing was measured.
 *
 * No capacity is deliberately NOT rendered as "0 / 0 (0%)": that asserts a
 * fact about a node which never reported one, and an operator reading it would
 * reasonably conclude their node has no CPU rather than that we have no
 * benchmark for it.
 */
export function usageLabel(resource, unit) {
  const total = Number(resource?.total) || 0;
  if (total <= 0) return NO_CAPACITY;

  const used = Number(resource?.utilized) || 0;
  const pct = Math.round(usagePercent(used, total));

  return `${fmtAmount(used)} / ${fmtAmount(total)} ${unit} (${pct}%)`;
}
