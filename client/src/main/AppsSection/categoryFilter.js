/*
 * Multi-select category filtering for the /nodes Apps tab (issue #332).
 *
 * Kept out of the component because the rules are where this goes wrong, not
 * the markup -- and one of them is subtle enough to be worth stating.
 *
 * THE CHIPS ARE COUNTED FROM THE ROWS. If they are counted from rows that have
 * already been category-filtered, then selecting "Gaming" leaves Gaming as the
 * only chip on screen: every other category now has zero rows, so every other
 * chip vanishes. Multi-select becomes impossible and the only way back is a
 * reset the reader has to go looking for. Chips must always be counted from
 * the TEXT-filtered set and the table narrowed separately, which is why these
 * are two distinct steps rather than one filter.
 *
 * An empty selection means ALL, not none. A filter UI that can reach a state
 * where every chip is off and the table is empty, with nothing on screen
 * explaining why, reads as the page being broken.
 */

/** Rows in the selected categories; every row when nothing is selected. */
export function applyCategoryFilter(rows, selected) {
  const list = Array.isArray(rows) ? rows : [];
  if (!selected || selected.size === 0) return list;
  return list.filter((row) => selected.has(row.category));
}

/** Selection with `category` flipped. Always a new Set, so React re-renders. */
export function toggleCategory(selected, category) {
  const next = new Set(selected || []);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}

/**
 * How a chip should render: 'neutral' while no filter is active, otherwise
 * 'on' or 'off'.
 *
 * Three states rather than two on purpose. With nothing selected, every
 * category IS showing, so dimming them all (or lighting them all) would have
 * the chips asserting something about a filter that is not running.
 */
export function chipState(category, selected) {
  if (!selected || selected.size === 0) return 'neutral';
  return selected.has(category) ? 'on' : 'off';
}
