// Same tier colors used elsewhere on the site (see home/HomeOverview's
// TopDogsPanel), duplicated here rather than imported since that constant
// isn't exported and the two pages are otherwise independent. DEVFUND is
// live/-only — the network's Dev Fund treasury output, not a node tier —
// but reuses this same lookup everywhere tier labels/colors are rendered
// (live/apidata.js's extractRewardsFromCoinbase, DetailsPanel's RewardRow,
// live/blockFlowSummary.js). Color matches --accent-indigo in
// styles/_global.scss — can't reference the CSS custom property directly
// from a JS style object, so the hex is duplicated here by design, same as
// every other tier color in this file.
export const TIER_META = {
  CUMULUS: { label: 'Cumulus', color: '#2686d0' },
  NIMBUS: { label: 'Nimbus', color: '#d07e26' },
  STRATUS: { label: 'Stratus', color: '#c92641' },
  DEVFUND: { label: 'Dev Fund', color: '#6366f1' },
};
