/*
 * Shapes the backend's daily rollup into Recharts rows. Kept as a pure
 * function in its own file so it is testable without rendering a chart --
 * this repo's 27 test files all test pure logic, none render components, and
 * this task does not change that convention.
 *
 * The label is a bare MM-DD slice rather than a locale-formatted date: the
 * x-axis holds at most RETENTION_DAYS (8) ticks in a narrow panel, and a
 * full date does not fit. A date string that is not in YYYY-MM-DD form is
 * passed through unchanged rather than sliced into nonsense.
 */
export function buildTrendSeries(daily) {
  return (daily || []).map((d) => ({
    date: d.date,
    label: /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') ? d.date.slice(5) : d.date,
    utility: d.utilityBlocks || 0,
    empty: d.emptyBlocks || 0,
  }));
}
