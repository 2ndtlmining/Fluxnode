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
export const PANEL_ACCESS = {
  // Apps tab
  appsTeamSponsoredStat: 'donor',
  appEcosystem: 'donor',
  topHostedApps: 'donor',
  topNodeOperators: 'donor',
  topAppOwners: 'donor',
  // Network tab
  worldMap: 'donor',
  continentBreakdown: 'donor',
  // Donor tab (whole tab, one unit)
  donorTab: 'donor',
  // Chain Activity tab (whole tab, one unit)
  chainActivity: 'donor',
  // Moving from /home in Session 2 — public per explicit user direction
  topDogs: 'public',
  expiringToday: 'public',
  deployedToday: 'public',
  workhorse: 'public',
};

export function getPanelAccess(panelKey, isUnlocked) {
  if (isUnlocked) return true;
  return PANEL_ACCESS[panelKey] === 'public';
}
