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
      // Browser / indie game images seen on-network
      'pokerth', 'lightbike', 'hexgl', 'os13k', 'civclicker', 'level13',
      'prestigetree', 'progressknight', 'tosios', 'dwarfs', 'minesweeper',
      'memorygame', 'fivem', 'rustrooms', 'posio', 'giftrun', 'bounceback',
      'radiusraid', 'thehouse', 'evolve', 'zomboid', 'openclaw',
    ],
  },
  communication: {
    name: 'Communication',
    keywords: [
      'conduit', 'teamspeak', 'matrix', 'synapse', 'mumble',
      'coturn', 'jitsi', 'rocket.chat', 'mattermost', 'streamr',
      'element-web', 'simplex', 'standardnotes',
      'dexchat', 'spacebar', 'mollysocket', 'revolt', 'zulip',
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
    ],
  },
  monitoring: {
    name: 'Monitoring',
    keywords: [
      'grafana', 'prometheus', 'uptime-kuma', 'netdata',
      'portainer', '/loki', 'zabbix', 'checkmk', 'glances',
      'globalping', 'nettools',
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

  // Encrypted enterprise spec: compose is present but empty, details withheld.
  if (spec.enterprise && composeList.length === 0) return 'enterprise';

  for (const component of composeList) {
    const cat = categorizeApp((component.repotag || '').toLowerCase());
    if (cat !== 'other') return cat;
  }

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
