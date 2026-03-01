// App category keyword matching — based on live Flux network data audit.
// Each keyword is checked as a substring of the lowercased app image name.
// Order matters: first match wins.

const CATEGORIES = {
  computing: {
    name: 'Computing',
    keywords: [
      'folding-at-home', 'foldingathome', 'folding@home', 'boinc',
      'gridcoin', 'seti', 'rosetta',
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
    ],
  },
  communication: {
    name: 'Communication',
    keywords: [
      'conduit', 'teamspeak', 'matrix', 'synapse', 'mumble',
      'coturn', 'jitsi', 'rocket.chat', 'mattermost', 'streamr',
      'element-web', 'simplexchat', 'standardnotes',
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
    ],
  },
  blockchain: {
    name: 'Blockchain',
    keywords: [
      'bitcoin', 'ethereum', 'kaspa', 'kadena', 'ergo',
      'monero', 'litecoin', 'dogecoin', 'solana', 'avalanche',
      'alephium', 'blockbook', 'flux-dns', 'flux-foundation',
      'firoorg', 'firod', 'zcash', 'ravencoin', 'dash-node',
      'explorer', 'wanchain', 'timpi',
      'osmosis', 'polkadot', 'fluxcloud', 'ipfs',
      'nostr', 'beldex', 'bitgert', 'fusenet', 'themok',
      'fluxos', 'fusionbalances', 'ironfish', 'sushiswap', 'liquity', 'gmx',
      'aave', 'pangolin', 'factornode', 'zelcash', 'titan',
    ],
  },
  database: {
    name: 'Database',
    keywords: [
      'mysql', 'postgres', 'mongo', 'redis', 'mariadb',
      'sqlite', 'influxdb', 'cassandra', 'couchdb', 'shared-db',
      'rabbitmq',
    ],
  },
  devops: {
    name: 'DevOps / CI',
    keywords: [
      'github-runner', 'gitea', 'drone', 'jenkins', 'act-runner',
      'gitlab', 'woodpecker', 'concourse', 'watchtower', 'orbit',
      'budibase', 'webtop', 'vaultwarden',
      'rustdesk', 'n8n', 'keycloak', 'code-server', 'kanboard',
      'wekan', 'meshcentral', 'jira',
    ],
  },
  media: {
    name: 'Media',
    // 'plex' alone matches 'simplexchat' — use '/plex' and 'plexinc' instead
    keywords: [
      'jellyfin', '/plex', 'plexinc', 'emby', 'navidrome', 'airsonic',
      'kodi', 'subsonic', 'funkwhale', 'owncast', 'viewtube', 'yt-dl',
    ],
  },
  ai: {
    name: 'AI / ML',
    keywords: [
      'ollama', 'stable-diffusion', 'localai', 'whisper', 'comfyui',
      'open-webui', 'text-generation', 'llm', 'tensorflow', 'pytorch',
    ],
  },
  vpn: {
    name: 'VPN / Privacy',
    // 'presearch' is a decentralised search node with 300+ running instances
    keywords: [
      'presearch', 'wireguard', 'wg-easy', 'openvpn',
      'tailscale', 'shadowsocks', 'v2ray', 'xray', 'sing-box', 'i2p',
      'socks5', 'softether', 'hiddenonion', 'vless', 'trojan', 'outline',
      'tor-socks', 'x-ui', '3x-ui', 'http-proxy', 'eifa-proxy',
    ],
  },
  monitoring: {
    name: 'Monitoring',
    keywords: [
      'grafana', 'prometheus', 'uptime-kuma', 'netdata',
      'portainer', '/loki', 'zabbix', 'checkmk', 'glances',
    ],
  },
};

export function categorizeApp(appName) {
  const lower = (appName || '').toLowerCase();
  for (const [cat, { keywords }] of Object.entries(CATEGORIES)) {
    if (keywords.some((k) => lower.includes(k))) return cat;
  }
  return 'other';
}

export function analyzeAppCategories(walletNodes) {
  const categoryMap = {};

  (walletNodes || []).forEach((node) => {
    (node.installedApps || []).forEach((app) => {
      const cat = categorizeApp(app.name);
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

export { CATEGORIES };
