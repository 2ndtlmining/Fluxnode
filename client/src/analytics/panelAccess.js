/*
 * Single source of truth for /analytics' per-panel access level, replacing
 * the old whole-route <PremiumGate> (removed in Task 4). 'public' panels
 * render for everyone; 'donor' panels render PanelGate's locked state
 * until DonorContext.isUnlocked is true. Toggling any panel is a one-line
 * edit here — no component changes needed.
 *
 * Every panel currently rendered by AppsTab/NetworkTab/DonorTab/
 * ChainActivityTab has an explicit entry (no silent default) — anything
 * pre-existing in Analytics stays 'donor' per the user's explicit
 * direction during Track 2's brainstorming; DonorTab and ChainActivityTab
 * are each gated as one whole-tab unit (their content is one cohesive
 * dataset, not independently meaningful panels) rather than per-widget.
 * The 4 'public' keys below don't have a real panel wired to them until
 * Session 2 moves the actual components from /home — present now so this
 * config's shape doesn't change again then.
 */
/*
 * Analytics is a donor feature in full (#298), so every entry here is 'donor'
 * and the 'public' branch below is dead for this page by design -- it stays
 * because getPanelAccess is generic and a future surface may want it.
 *
 * Three of these had NO entry and no PanelGate at all until #298:
 * totalNetwork, networkResources and hostedApplications rendered for everyone
 * beside a locked world map, so a visitor could drill into any country's node
 * counts, resource utilisation and hosted apps without donating. They were not
 * public by decision; they were outside the mechanism, which is exactly what
 * the "no silent default" rule below exists to prevent.
 *
 * topDogs, expiringToday, deployedToday and workhorse were previously 'public'
 * on explicit direction when they moved over from /home. That direction was
 * reversed: Analytics is donor-gated as a section.
 */
export const PANEL_ACCESS = {
  // Apps tab
  appsKpis: 'donor',
  appsTeamSponsoredStat: 'donor',
  appEcosystem: 'donor',
  topHostedApps: 'donor',
  topNodeOperators: 'donor',
  topAppOwners: 'donor',
  expiringToday: 'donor',
  deployedToday: 'donor',
  workhorse: 'donor',
  // Network tab
  networkStatus: 'donor',
  worldMap: 'donor',
  totalNetwork: 'donor',
  networkResources: 'donor',
  hostedApplications: 'donor',
  // The scope selector drives the three cards and the map. A usable control
  // over content you cannot see is worse than either gating or showing both.
  networkScope: 'donor',
  topDogs: 'donor',
  // Donor tab (whole tab, one unit)
  donorTab: 'donor',
  // Chain Activity tab (whole tab, one unit)
  chainActivity: 'donor',
  // /nodes page tabs. Gated so a visitor can SEE that achievements and a
  // per-wallet app breakdown exist behind the wall, rather than not knowing
  // they are there at all -- which is the whole point of preview="blur".
  // Both are derived from public, unauthenticated Flux APIs (node benchmarks,
  // running-app lists), so mounting them blurred is a paywall choice, not a
  // data-exposure one. See PanelGate's own note on that distinction.
  nodesAchievements: 'donor',
  nodesApps: 'donor',
};

export function getPanelAccess(panelKey, isUnlocked) {
  if (isUnlocked) return true;
  return PANEL_ACCESS[panelKey] === 'public';
}
