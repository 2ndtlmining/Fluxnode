import { buildDonorAppRows, tallyRowCategories } from 'analytics/donorAppRows';

/*
 * Tally the donor's own running apps by category.
 *
 * The join this used to do inline now lives in donorAppRows.js, which produces
 * one row per running container; this is a fold over those rows. The Donor tab
 * renders both the category tally and a per-app table off the same list, and
 * when a node filter is applied it narrows the rows once and re-tallies (see
 * tallyRowCategories) — so the two panels cannot drift apart or disagree about
 * which node an app is on.
 *
 * Behaviour is unchanged: one entry per running container, joined to the spec
 * index by name, watchtower excluded by resolved repotag, an unresolvable spec
 * falling back to 'other' rather than being dropped.
 */
export function aggregateDonorAppsByCategory(nodesByIp, donorAddresses, specIndex) {
  return tallyRowCategories(buildDonorAppRows(nodesByIp, donorAddresses, specIndex));
}
