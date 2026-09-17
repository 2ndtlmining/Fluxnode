import { categorizeDedicatedSiteApp } from './dedicatedSites';

// App category keyword matching — based on live Flux network data audit.
// Each keyword is checked as a substring of the lowercased app image name.
// Order matters: first match wins.
//
// Two rules when adding keywords:
//   1. Prefer image (repotag) matching over app-name matching. App names are
//      user-chosen and collide badly — "FoldingAtFluxCloud..." matched the
//      blockchain keyword 'fluxcloud' when it is really Folding@Home.
//   2. Keep keywords long enough to avoid substring collisions. 'llm' used to
//      match "fu-LLM-ent" in qblocktechnology/fulfillment-engine.

const CATEGORIES = {
  computing: {
    name: 'Computing',
    keywords: [
      'folding-at-home', 'foldingathome', 'folding@home', 'boinc',
      'gridcoin', 'seti@', 'rosetta',
      // Distributed Compute Protocol (issue #369) — a genuine volunteer-compute
      // peer to Folding@Home, not a deployment wrapper.
      'dcp-worker', 'distributivenetwork',
    ],
  },
  gaming: {
    name: 'Gaming',
    keywords: [
      // Game servers — intentionally specific to avoid false positives with Rust-language apps
      'minecraft', 'valheim', 'terraria', 'ark-server', 'ark-survival', 'arkserver',
      'satisfactory', 'quake', 'minetest', 'csgo', 'palworld',
      'vintage-story', 'factorio', 'enshrouded', 'teeworlds', 'wotlk',
      'pacman', 'tetris', 'snake-server', 'supermario',
      // Kept in step with RunOnFlux/fluxview and 2ndtlmining/Fluxtracker,
      // which are the two places the Flux team tracks hosted game servers.
      '7daystodie', 'vrising', 'conan-exiles', 'arma-reforger', 'soulmask',
      'abioticfactor', 'windrose', 'unturned', 'garrysmod', 'rust-server',
      'game-server',
      // RuneScape: Dragonwilds (issue #309). Both spellings: the deployed name
      // is 'dragonwilds', but an image or a hand-named app may well say
      // 'runescape'. Note that neither keyword is what fixes the hosted
      // deployments -- those are encrypted specs, matched by site prefix in
      // dedicatedSites.js.
      'dragonwilds', 'runescape',
      // Browser / indie game images seen on-network
      'pokerth', 'lightbike', 'hexgl', 'os13k', 'civclicker', 'level13',
      'prestigetree', 'progressknight', 'tosios', 'dwarfs', 'minesweeper',
      'memorygame', 'fivem', 'rustrooms', 'posio', 'giftrun', 'bounceback',
      'radiusraid', 'thehouse', 'evolve', 'zomboid', 'openclaw',
      // Issue #369, same littlestache browser-game family as the row above,
      // plus a backgammon bot.
      'devlife', 'spacecompany', 'gammonbot',
    ],
  },
  communication: {
    name: 'Communication',
    keywords: [
      'conduit', 'teamspeak', 'matrix', 'synapse', 'mumble',
      'coturn', 'jitsi', 'rocket.chat', 'mattermost', 'streamr',
      'element-web', 'simplex', 'standardnotes',
      'dexchat', 'spacebar', 'mollysocket', 'revolt', 'zulip',
      // Issue #369. Mail counts as communication; 'mailserver' rather than a
      // bare 'mail', which would sweep up anything with "email" in the name.
      'mailserver', 'cryptalk', 'teams_poster',
    ],
  },
  web: {
    name: 'Web / CMS',
    keywords: [
      'wordpress', 'wp-nginx', 'ghost', 'joomla', 'drupal',
      'nextcloud', 'wiki', 'nginx', 'apache', 'strapi',
      'chaincade', 'webserver', 'whoogle', 'searxng',
      'owncloud', 'onlyoffice', 'nitter', 'etherpad',
      'cors-anywhere', 'yacy', 'drawio', 'flame',
      'collabora', 'writefreely', 'lingva',
      'flux-calculator', 'flux-api', 'libreddit', 'redlib', 'rimgo', 'quetre', 'grocy',
      'wbo',
      // Static sites, docs and alternative frontends seen on-network.
      // NOTE: no bare '-site' keyword — it stole jefke/flux-foundation-site
      // from the deliberate 'flux-foundation' blockchain keyword.
      // NOTE: 'website' is not listed here; it is handled by
      // DEDICATED_SITE_MARKERS below, which runs before all keyword matching.
      'whitepaper', 'blog', 'rustpad', 'libremdb',
      'anonymousoverflow', 'syncpaint', 'synctube', 'privatebin', 'landing',
      'apidocs',
      'filebrowser',
    ],
  },
  blockchain: {
    name: 'Blockchain',
    keywords: [
      'bitcoin', 'ethereum', 'kaspa', 'kadena', 'ergo',
      'monero', 'litecoin', 'dogecoin', 'solana', 'avalanche',
      'alephium', 'blockbook', 'flux-dns', 'flux-foundation',
      'firoorg', 'firod', 'fironode', 'zcash', 'ravencoin', 'dash-node',
      'explorer', 'wanchain', 'timpi',
      'osmosis', 'polkadot', 'fluxcloud', 'ipfs',
      'nostr', 'beldex', 'bitgert', 'fusenet', 'themok',
      'fluxos', 'fusionbalances', 'ironfish', 'sushiswap', 'liquity', 'gmx',
      'aave', 'pangolin', 'factornode', 'zelcash', 'titan',
      'beam105', 'sifchain', 'keep3r', 'keepnetwork', 'steem', 'dlog-node',
      'dibi-fetch',
      // girderworks/edge and /feather are Beldex master nodes. The image name
      // gives no hint, but the image labels do:
      //   org.opencontainers.image.title=beldex-node
      //   "Beldex master node (beldexd + storage + belnet + telemetry API) for Flux"
      // Both bundle beldexd 7.0.2, beldex-storage 2.4.0 and belnet 0.9.8, and
      // run in MODE A/B/C with +0/+100/+200 port offsets so one Flux node can
      // host up to three master nodes. Source: github.com/girderworks/node-docker
      'girderworks',
      /*
       * Issue #369. Flux-ecosystem chain tooling that had no keyword.
       *
       * Every one of these is spelled out in full rather than shortened to
       * 'flux': a bare 'flux' keyword would match most of the network,
       * including runonflux/orbit, which OPAQUE_RUNTIME_IMAGES exists to keep
       * OUT of a category.
       */
      'electrum', 'kasvillage', '2ndtlmining', 'fluxpaoverview', 'fluxexport',
      'dcms-flux',
    ],
  },
  database: {
    name: 'Database',
    keywords: [
      'mysql', 'postgres', 'mongo', 'redis', 'mariadb',
      'sqlite', 'influxdb', 'cassandra', 'couchdb', 'shared-db',
      'rabbitmq',
      'pg-cluster', 'galera', 'clickhouse', 'elasticsearch', 'opensearch',
    ],
  },
  devops: {
    name: 'DevOps / CI',
    keywords: [
      'github-runner', 'gitea', 'drone', 'jenkins', 'act-runner',
      'gitlab', 'woodpecker', 'concourse', 'watchtower',
      'budibase', 'webtop', 'vaultwarden',
      'rustdesk', 'n8n', 'keycloak', 'code-server', 'kanboard',
      'wekan', 'meshcentral', 'jira',
      '/ssh', 'sshd', 'gitliman',
      // Issue #369 — linuxserver's KasmVNC desktop images, which sit with the
      // existing remote-access entries (webtop, code-server) rather than in a
      // productivity category that does not exist.
      'libreoffice', 'inkscape',
      // NOTE: 'orbit' deliberately NOT listed. runonflux/orbit is the Flux git
      // deployment runtime, not a DevOps tool — it hosts arbitrary user apps,
      // so its ~175 containers belong in Other, not DevOps.
    ],
  },
  media: {
    name: 'Media',
    // 'plex' alone matches 'simplexchat' — use '/plex' and 'plexinc' instead
    keywords: [
      'jellyfin', '/plex', 'plexinc', 'emby', 'navidrome', 'airsonic',
      'kodi', 'subsonic', 'funkwhale', 'owncast', 'viewtube', 'yt-dl',
      'qbittorrent', 'transmission', 'sonarr', 'radarr',
      // Issue #369. 'linx-server' in full: the bare '-server' suffix is shared
      // with the game servers above.
      'linx-server', 'titlovi',
    ],
  },
  ai: {
    name: 'AI / ML',
    // 'llm' alone matched "fu-LLM-ent" in fulfillment-engine — anchor it.
    keywords: [
      'ollama', 'stable-diffusion', 'localai', 'whisper', 'comfyui',
      'open-webui', 'text-generation', 'tensorflow', 'pytorch',
      'vllm', '-llm', '/llm', 'llm-', 'llama', 'langchain',
      'doccano', 'duckling', 'rasa/',
    ],
  },
  vpn: {
    name: 'VPN / Privacy',
    // 'presearch' is a decentralised search node with 300+ running instances
    keywords: [
      'presearch', 'wireguard', 'wg-easy', 'openvpn', 'vpn',
      'tailscale', 'shadowsocks', 'v2ray', 'xray', 'sing-box', 'i2p',
      'socks5', 'softether', 'hiddenonion', 'vless', 'trojan', 'outline',
      'tor-socks', 'x-ui', '3x-ui', 'http-proxy', 'eifa-proxy',
      // Bandwidth-sharing / residential proxy agents
      'proxymsg', 'pawns-cli', 'repocket', 'earnapp', 'honeygain',
      'packetstream', 'traffmonetizer', 'bitping', 'mysterium', '/mtg:',
      /*
       * Issue #369. 'brook' and 'n2n' are anchored to the repository separator
       * on purpose — unanchored, three and four characters of common letters
       * sweep up unrelated images (node:22-bookworm-slim contains neither, but
       * only by luck, and the next image along will not be so kind).
       */
      'mkp224o', 'proxyrack', '/brook', '/n2n',
    ],
  },
  monitoring: {
    name: 'Monitoring',
    keywords: [
      'grafana', 'prometheus', 'uptime-kuma', 'netdata',
      'portainer', '/loki', 'zabbix', 'checkmk', 'glances',
      'globalping', 'nettools',
      'node-telemetry', // issue #369
    ],
  },
};

// Deployment runtimes that tell us nothing about what the app actually does.
// runonflux/orbit is the git-deployment wrapper — the real workload is whatever
// git repo the user pointed it at, so it stays uncategorized on purpose.
const OPAQUE_RUNTIME_IMAGES = ['runonflux/orbit'];

/*
 * A dedicated website FOR an app is a website — not an instance of that app.
 *
 * runonflux/minecraft-server-website is the landing page that sells Minecraft
 * hosting; it is not a Minecraft server. Matching it on 'minecraft' inflated
 * Gaming with pages that host no game at all. Flux's own tooling reached the
 * same conclusion independently: Fluxtracker carries an explicit
 * CATEGORY_EXCLUDE for '-server-website' (after 47 phantom gaming instances
 * were traced to it), and fluxview renamed its Gaming page to "Dedicated
 * Websites". This marker subsumes both and is checked before every keyword.
 */
const DEDICATED_SITE_MARKERS = ['website'];

export function categorizeApp(appName) {
  const lower = (appName || '').toLowerCase();
  if (DEDICATED_SITE_MARKERS.some((marker) => lower.includes(marker))) return 'web';
  for (const [cat, { keywords }] of Object.entries(CATEGORIES)) {
    if (keywords.some((k) => lower.includes(k))) return cat;
  }
  return 'other';
}

export function isOpaqueRuntimeImage(image) {
  const lower = (image || '').toLowerCase();
  return OPAQUE_RUNTIME_IMAGES.some((k) => lower.includes(k));
}

/*
 * Supporting cast (issue #369).
 *
 * A database or a reverse proxy sitting in someone's compose file says nothing
 * about what the app IS -- almost every non-trivial app ships one. They are
 * still worth matching, because a standalone MySQL deployment is genuinely a
 * Database app, but they must lose to any component that identifies the actual
 * workload.
 *
 * Measured on live data, treating these as weak is what moves the Flux
 * Explorer out of Database (its compose[0] is alpine-mongo) and the
 * sandmanshiri proxy stacks out of DevOps (their compose[0] is an ssh box).
 */
const WEAK_CATEGORIES = new Set(['database']);
const WEAK_KEYWORDS = new Set(['nginx', 'apache', 'webserver']);

/**
 * The category a single component argues for, and whether that argument is
 * weak. Returns null when the component matches nothing at all.
 */
function componentCategory(repotag) {
  const lower = (repotag || '').toLowerCase();
  const cat = categorizeApp(lower);
  if (cat === 'other') return null;
  const keyword = (CATEGORIES[cat]?.keywords || []).find((k) => lower.includes(k));
  return { cat, weak: WEAK_CATEGORIES.has(cat) || WEAK_KEYWORDS.has(keyword) };
}

/**
 * Pick one category from a compose file's components by majority vote.
 *
 * Compose ORDER is an authoring detail, so the old first-match-wins rule was
 * reading a property of the author's text editor, not of the app. Counting
 * instead means the five proxy containers in a six-container proxy stack
 * outvote the one ssh box that happened to be typed first.
 *
 * Weak components are held back and only consulted if nothing else matched,
 * which is what keeps a standalone database in Database. Ties go to the
 * earliest component -- with genuinely balanced evidence the author's own
 * ordering is the only signal left, and it is the behaviour that was there
 * before.
 */
function voteOnComponents(composeList) {
  const scored = composeList.map((c) => componentCategory(c?.repotag)).filter(Boolean);

  for (const pool of [scored.filter((s) => !s.weak), scored]) {
    if (pool.length === 0) continue;

    const tally = {};
    const firstSeenAt = {};
    pool.forEach((s, i) => {
      tally[s.cat] = (tally[s.cat] || 0) + 1;
      if (!(s.cat in firstSeenAt)) firstSeenAt[s.cat] = i;
    });

    return Object.keys(tally).sort((a, b) => tally[b] - tally[a] || firstSeenAt[a] - firstSeenAt[b])[0];
  }

  return null;
}

/**
 * The repotag of the component that earned an app its category (issue #369).
 *
 * Once the category comes from a vote rather than from compose[0], compose[0]
 * is no longer a fair label for the app: the Flux Explorer's is alpine-mongo,
 * which would head the Blockchain breakdown with a database. Callers naming an
 * app in a per-category ranking want the component the category actually came
 * from.
 *
 * Returns '' when there is no compose list or nothing in it matches, leaving
 * the caller to fall back to whatever primary repotag it already had.
 */
export function representativeRepotag(composeList, category) {
  if (!Array.isArray(composeList)) return '';
  const match = composeList.find((c) => categorizeApp((c?.repotag || '').toLowerCase()) === category);
  return match?.repotag || '';
}

/**
 * Categorize a global app specification.
 *
 * Prefers the docker repotag over the user-chosen app name: on live data the
 * two disagree for 24% of apps, and the repotag is right in nearly every case.
 *
 * Enterprise apps ship an encrypted compose, so there is no repotag to read.
 * They get their own bucket rather than being dumped in Other — "we are not
 * allowed to see this" is a different fact from "we do not recognise this".
 */
export function categorizeAppSpec(spec) {
  if (!spec) return 'other';

  const composeList = Array.isArray(spec.compose) ? spec.compose : [];

  /*
   * Encrypted enterprise spec: compose is present but empty, details withheld.
   *
   * Before giving up on it, check whether the NAME is one a dedicated hosting
   * site writes (issue #309). Those sites deploy as `${prefix}${Date.now()}`
   * and publish their prefixes, so this is reading a documented convention, not
   * guessing at the encrypted payload. It matters more than it sounds: 103
   * specs / 219 instances of known games were landing here, four of the five
   * games with a keyword that this branch meant they never reached.
   *
   * Anything whose name tells us nothing still gets the enterprise bucket, and
   * the bucket keeps its meaning -- "we are not allowed to see this" rather
   * than "we do not recognise this".
   */
  if (spec.enterprise && composeList.length === 0) {
    return categorizeDedicatedSiteApp(spec.name) || 'enterprise';
  }

  const voted = voteOnComponents(composeList);
  if (voted) return voted;

  if (spec.repotag) {
    const cat = categorizeApp(spec.repotag.toLowerCase());
    if (cat !== 'other') return cat;
  }

  // Fall back to the app name only when no repotag matched anything.
  return categorizeApp((spec.name || '').toLowerCase());
}

export function analyzeAppCategories(walletNodes) {
  const categoryMap = {};

  (walletNodes || []).forEach((node) => {
    (node.installedApps || []).forEach((app) => {
      const cat = categorizeAppSpec(app);
      if (!categoryMap[cat]) categoryMap[cat] = new Set();
      categoryMap[cat].add(app.name);
    });
  });

  return Object.entries(categoryMap).map(([cat, apps]) => ({
    category: cat,
    name: CATEGORIES[cat]?.name || 'Other',
    count: apps.size,
    apps: [...apps],
  }));
}

export { CATEGORIES, OPAQUE_RUNTIME_IMAGES, DEDICATED_SITE_MARKERS };
