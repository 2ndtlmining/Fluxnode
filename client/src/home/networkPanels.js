/*
 * Render state for the Home panels that describe the NETWORK rather than the
 * wallet being viewed (issue #250).
 *
 * These panels are fed by fetch_country_node_counts() and fetch_gpu_prices(),
 * which used to run only on the no-wallet branch of hydrateApp() and swallowed
 * their own rejections with `.catch(() => {})`. The panel then had exactly two
 * states -- "I have rows" and "spinner" -- so a failed fetch was rendered
 * identically to a slow one and spun forever.
 *
 * Splitting `settled` from `failed` is what makes those distinguishable, and
 * keeping the decision here rather than inline in JSX is what makes it
 * testable without mounting the page.
 */
export function geoPanelState({ countryCounts, failed, settled } = {}) {
  const hasData = Array.isArray(countryCounts) && countryCounts.length > 0;

  // Data already on screen wins over a later failure: a background refresh
  // that rejects must not blank a panel the user is reading.
  if (hasData) return 'ready';
  if (!settled) return 'loading';
  return failed ? 'failed' : 'empty';
}
