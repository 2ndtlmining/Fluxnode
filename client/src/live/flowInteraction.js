/*
 * Pure state-transition logic for the flow canvas's single-expanded-card
 * model (spec §12: "Only one card can be expanded at a time... Clicking the
 * same card again collapses. Clicking another card switches expansion.").
 * Kept free of React so it's cheap to unit test — the actual state lives in
 * Live.jsx (spec §68's suggested `expandedCategory` state), which calls this
 * on every card click. Escape/click-outside/block-change collapse are a
 * direct `setExpandedCategory(null)` at the call site, not routed through
 * here — there's no decision to make in that case, just a reset.
 */
export function toggleExpandedCategory(current, clicked) {
  return current === clicked ? null : clicked;
}
