/*
 * One definition of what a node tier is called and what colour it wears.
 *
 * There were two, and they disagreed: NetworkTab/regionCards.jsx used
 * #e8a33d / #e05263 for Nimbus and Stratus, home/WorkhorsePanel used
 * #d07e26 / #c92641 for the same two tiers. Nobody chose that — the second
 * copy was written from the first by eye. Issue #301 wants tier names
 * colour-coded in a third place, which is the point at which a third copy
 * stops being affordable.
 *
 * The brighter pair wins: these are read as small text and chips against the
 * dark theme's near-black panels, where #c92641 in particular sits too close
 * to the background to register as a colour at all.
 *
 * FRACTUS has no incumbent colour (neither copy had one) and is given a teal
 * that collides with nothing else here.
 */
export const NODE_TIER_META = {
  CUMULUS: { label: 'Cumulus', color: '#2686d0' },
  NIMBUS:  { label: 'Nimbus',  color: '#e8a33d' },
  STRATUS: { label: 'Stratus', color: '#e05263' },
  FRACTUS: { label: 'Fractus', color: '#2bb3a3' },
};

/*
 * Deliberately a real colour rather than a CSS variable: callers put this
 * straight into an inline `style`, and the tests can only assert that a tier
 * without a colour is visibly neutral if the neutral value is a colour too.
 */
export const TIER_FALLBACK_COLOR = '#8a8f98';

const FALLBACK = { label: 'Unknown', color: TIER_FALLBACK_COLOR };

/**
 * Meta for a tier name, case-insensitively. Feeds disagree on casing — the
 * daemon list is lowercase, transformRawNode upper-cases it, and fluxinfo
 * passes through whatever it was given — so normalising here keeps every call
 * site from having to.
 */
export function tierMeta(tier) {
  if (typeof tier !== 'string') return FALLBACK;
  return NODE_TIER_META[tier.trim().toUpperCase()] || FALLBACK;
}
