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
      'minecraft', 'valheim', 'terraria', 'ark-server', 'ark-survival',
      'satisfactory', 'quake', 'minetest', 'csgo', 'palworld',
      'vintage-story', 'factorio',
    ],
  },
  communication: {
    name: 'Communication',
    keywords: [
      'conduit', 'teamspeak', 'matrix', 'synapse', 'mumble',
      'coturn', 'jitsi', 'rocket.chat', 'mattermost',
    ],
  },
  web: {
    name: 'Web / CMS',
    keywords: [
      'wordpress', 'wp-nginx', 'ghost', 'joomla', 'drupal',
      'nextcloud', 'wiki', 'nginx', 'apache', 'strapi',
      'chaincade', 'webserver', 'whoogle', 'searxng',
    ],
  },
  blockchain: {
    name: 'Blockchain',
    keywords: [
      'bitcoin', 'ethereum', 'kaspa', 'kadena', 'ergo',
      'monero', 'litecoin', 'dogecoin', 'solana', 'avalanche',
      'alephium', 'blockbook', 'flux-dns', 'flux-foundation',
    ],
  },
  database: {
    name: 'Database',
    keywords: [
      'mysql', 'postgres', 'mongo', 'redis', 'mariadb',
      'sqlite', 'influxdb', 'cassandra', 'couchdb', 'shared-db',
    ],
  },
  devops: {
    name: 'DevOps / CI',
    keywords: [
      'github-runner', 'gitea', 'drone', 'jenkins', 'act-runner',
      'gitlab', 'woodpecker', 'concourse', 'watchtower',
    ],
  },
  media: {
    name: 'Media',
    keywords: [
      'jellyfin', 'plex', 'emby', 'navidrome', 'airsonic',
      'kodi', 'subsonic', 'funkwhale',
    ],
  },
  ai: {
    name: 'AI / ML',
    keywords: [
      'ollama', 'stable-diffusion', 'localai', 'whisper', 'comfyui',
      'open-webui', 'text-generation', 'llm', 'tensorflow', 'pytorch',
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
