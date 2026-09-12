/*
 * Apps deployed through RunOnFlux's dedicated hosting websites, recognised by
 * the app-name prefix each site writes (issue #309).
 *
 * WHY THIS EXISTS -- the keyword list alone cannot see these apps.
 *
 * A game ordered from https://runonflux.com/games/<slug> ships an ENCRYPTED
 * specification: `enterprise` is set and `compose` is empty. categorizeAppSpec
 * returns 'enterprise' for that shape and stops, so no keyword is ever
 * consulted. Measured on live data (1,452 specs) the cost was 103 specs / 219
 * instances of KNOWN games sitting outside Gaming:
 *
 *     Valheim          74 specs    ('valheim' was already a keyword)
 *     FiveM            13 specs    ('fivem' was already a keyword)
 *     Rust             11 specs
 *     Project Zomboid   4 specs    ('zomboid' was already a keyword)
 *     Dragonwilds       1 spec     (the game #309 was actually filed about)
 *
 * Note that four of those five ALREADY had a matching keyword. Adding
 * 'dragonwilds' to the keyword list -- the obvious reading of #309 -- would
 * have changed nothing at all.
 *
 * This is not guessing at an encrypted payload. The prefix is the deploying
 * site's own published convention: every site builds the app name as
 * `${prefix}${Date.now()}`, and RunOnFlux/fluxview maintains the same table in
 * src/constants/dedicatedSites.js for exactly this reason. The enterprise
 * bucket keeps its meaning -- "we are not allowed to see this" -- for every
 * encrypted spec whose name tells us nothing.
 *
 * KEEPING THIS IN SYNC: the prefixes cannot be inferred from deployed names,
 * so they are hand-maintained upstream too, read out of each site's
 * DeploymentDialog. A new site, or a new PLAN on an existing site (Minecraft
 * java/bedrock, Rust vanilla/oxide), means a new entry both there and here.
 * fluxview's file is the place to check.
 *
 * Only the games are listed. The non-game sites (Hermes, n8n, WordPress,
 * OpenClaw) have the same problem -- about 20 more specs -- but #309 is about
 * games, and widening the table is a separate call to make.
 */
export const DEDICATED_SITE_PREFIXES = {
  palworld: 'gaming',
  // The Minecraft site picks its prefix from the plan.
  minecraftj: 'gaming',
  minecraftb: 'gaming',
  minecraftserver: 'gaming',
  minecraftbedrockserver: 'gaming',
  projectzomboid: 'gaming',
  windrose: 'gaming',
  enshrouded: 'gaming',
  // As does the Rust site: vanilla and oxide.
  rustserver: 'gaming',
  rustserveroxide: 'gaming',
  fivem: 'gaming',
  valheim: 'gaming',
  terraria: 'gaming',
  // RuneScape: Dragonwilds. The prefix is the marketplace app name lowercased,
  // which is "DragonWilds" -- there is no "runescape" anywhere in the deployed
  // name, so that is not the string to match on.
  dragonwilds: 'gaming',
};

/*
 * `${prefix}${Date.now()}`. Date.now() is 13 digits and stays that way for
 * centuries, so anchoring on the digits is what keeps a hand-named app out:
 * "palworld16slots" is somebody's own server, not a deployment from the
 * Palworld site, and only the anchor tells them apart. It is also what makes
 * the overlapping prefixes safe -- "rustserveroxide1787..." cannot be read as
 * "rustserver" followed by junk.
 *
 * Sorted longest-first so the most specific prefix is tried first. With the
 * anchor that is belt-and-braces, but it costs nothing and stops the ordering
 * from being load-bearing on object key order.
 */
const MATCHERS = Object.entries(DEDICATED_SITE_PREFIXES)
  .sort(([a], [b]) => b.length - a.length)
  .map(([prefix, category]) => ({ category, pattern: new RegExp(`^${prefix}\\d{13,}$`) }));

/**
 * The category for an app deployed through a dedicated site, or null when the
 * name is not one of theirs — so callers fall through to normal categorisation.
 *
 * Case-insensitive, and that is a deliberate difference from fluxview. They
 * match case-sensitively to tell a site deployment (always lowercase) from the
 * same app ordered straight off the marketplace (original casing). We have no
 * use for that distinction: a Valheim server is Gaming either way.
 */
export function categorizeDedicatedSiteApp(appName) {
  if (typeof appName !== 'string' || !appName) return null;
  const lower = appName.toLowerCase();
  const match = MATCHERS.find(({ pattern }) => pattern.test(lower));
  return match ? match.category : null;
}
