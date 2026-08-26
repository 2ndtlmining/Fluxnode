/*
 * Jest setup, picked up automatically by react-scripts.
 *
 * In the browser, public/runtime/app-content.js runs before the bundle and
 * defines window.gContent. Jest never loads it, so content/index.js — which
 * reads window.gContent.URL_YOUTUBE at module scope — throws on import, and
 * with it anything that transitively imports content, which includes
 * apidata.js and most of the app.
 *
 * The values below mirror public/runtime/app-content.js. Only the constants
 * that code actually reads are duplicated; the video lists and social links are
 * present because content/index.js destructures them at import time, not
 * because any test asserts on them.
 *
 * If a test depends on one of these numbers, assert against the import from
 * 'content' rather than hardcoding it here, so the two cannot drift apart
 * silently.
 */

window.gContent = {
  URL_YOUTUBE: 'https://www.youtube.com/channel/UCO-gfYYQL22oibzOjr1SnHA',
  URL_TWITTER: 'https://twitter.com/2ndTLMining',
  URL_GITHUB: 'https://github.com/2ndtlmining/Fluxnode',
  EMAIL: '2ndtlmining@gmail.com',

  ADDRESS_FLUX: 't1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG',
  ADDRESS_BTC: '1MjMuVLEaAd8HJd3mh94L8qQe4cE6tH87V',

  REQUIREMENTS: {
    threads: { C: 4, N: 8, S: 16, F: 4 },
    ram: { C: 8, N: 32, S: 64, F: 8 },
    size: { C: 220, N: 440, S: 880, F: 9000 },
    dws: { C: 180, N: 180, S: 400, F: 80 },
    eps: { C: 240, N: 640, S: 1520, F: 240 },
    net_down_speed: { C: 25, N: 50, S: 100, F: 100 },
    net_up_speed: { C: 25, N: 50, S: 100, F: 100 },
  },

  CC_COLLATERAL_CUMULUS: 1000,
  CC_COLLATERAL_NIMBUS: 12500,
  CC_COLLATERAL_STRATUS: 40000,
  CC_COLLATERAL_FRACTUS: 1000,

  CC_BLOCK_REWARD: 14,

  CC_FLUX_REWARD_CUMULUS: 7.142,
  CC_FLUX_REWARD_NIMBUS: 25.0,
  CC_FLUX_REWARD_STRATUS: 64.28,
  CC_FLUX_REWARD_FRACTUS: 7.142,

  CC_PA_REWARD: 100.0,

  SETUP_VIDEOS: [],
  GUIDE_VIDEOS: [],
};
