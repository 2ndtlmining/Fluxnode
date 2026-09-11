/*
 * Filtering and ordering for the EXPIRING TODAY / DEPLOYED TODAY panels
 * (issue #247).
 *
 * Both panels were static lists. DEPLOYED TODAY routinely carries 80+ rows, so
 * finding a particular app meant scrolling and reading every line.
 *
 * Kept out of the component deliberately: ordering rules are exactly the kind
 * of thing that looks right in a screenshot and is wrong on the data (a string
 * sort putting 11.72 GB below 3.91 GB, for instance), and here they are
 * provable without mounting the Analytics page.
 */

// Fields the user can order by. `timeBlocks` is normalised by the caller from
// expiresInBlocks / deployedAgeBlocks so both panels share one implementation.
const NUMERIC_KEYS = new Set(['instances', 'cpuPerInst', 'ramGBPerInst', 'ssdGBPerInst', 'timeBlocks']);

/*
 * The query matches name OR category, so typing "gaming" narrows to a category
 * without needing a second control. Case-insensitive because the real data
 * mixes cases freely -- "PALWORLD178" and "palworld178" are both live app names.
 */
function matches(spec, needle) {
  const name = String(spec?.name ?? '').toLowerCase();
  const category = String(spec?.category ?? '').toLowerCase();
  return name.includes(needle) || category.includes(needle);
}

function compare(a, b, sortKey) {
  if (NUMERIC_KEYS.has(sortKey)) {
    // A missing measurement sorts as lowest rather than throwing. Specs really
    // do arrive without cpu/ram/ssd -- the panels already render those as "—".
    const av = typeof a?.[sortKey] === 'number' ? a[sortKey] : -Infinity;
    const bv = typeof b?.[sortKey] === 'number' ? b[sortKey] : -Infinity;
    return av - bv;
  }
  return String(a?.[sortKey] ?? '').localeCompare(String(b?.[sortKey] ?? ''), undefined, { sensitivity: 'base' });
}

export function filterAndSortSpecs(specs, { query, sortKey, sortDir } = {}) {
  if (!Array.isArray(specs)) return [];

  const needle = String(query ?? '').trim().toLowerCase();
  const filtered = needle ? specs.filter((s) => matches(s, needle)) : specs;

  if (!sortKey || !sortDir) return filtered === specs ? specs.slice() : filtered;

  // slice() first: this must never reorder the caller's array, which is state.
  const sorted = filtered.slice().sort((a, b) => compare(a, b, sortKey));
  return sortDir === 'desc' ? sorted.reverse() : sorted;
}

/*
 * Header clicks cycle asc -> desc -> unsorted. The third state matters: the
 * panels' natural order is meaningful (soonest to expire, most recently
 * deployed), so there has to be a way back to it without reloading.
 */
export function nextSortState({ sortKey, sortDir } = {}, clickedKey) {
  if (sortKey !== clickedKey) return { sortKey: clickedKey, sortDir: 'asc' };
  if (sortDir === 'asc') return { sortKey: clickedKey, sortDir: 'desc' };
  return { sortKey: null, sortDir: null };
}
