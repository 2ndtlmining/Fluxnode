/*
 * The Donor tab's two selections (issue #299), kept out of the component so the
 * rules are testable without rendering.
 *
 * They are deliberately NOT symmetrical. A node selection propagates all the
 * way through — apps, categories and utilisation — because a node is a real
 * machine and every one of those figures can be honestly restated for it. A
 * category selection stops at the app list, because "the capacity behind my
 * gaming apps" is not a quantity that exists: one node's cores serve every app
 * running on it, so there is nothing to divide.
 */

/** Rows matching both selections. A null/absent selection matches everything. */
export function filterAppRows(rows, { node = null, category = null } = {}) {
  return (rows || []).filter(
    (row) => (!node || row.nodeAddress === node) && (!category || row.category === category)
  );
}

/**
 * The addresses the utilisation panel should aggregate over. Takes the category
 * as a third argument only to make its irrelevance explicit at the call site —
 * see the note above, and the test that pins it.
 */
export function utilizationAddresses(allAddresses, node /*, category */) {
  if (node) return [node];
  return allAddresses || [];
}
