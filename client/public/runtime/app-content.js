window.gContent = {};

/* Links of social media */
window.gContent.URL_YOUTUBE = 'https://www.youtube.com/channel/UCO-gfYYQL22oibzOjr1SnHA';
window.gContent.URL_TWITTER = 'https://twitter.com/2ndTLMining';
window.gContent.URL_GITHUB = 'https://github.com/2ndtlmining/Fluxnode';

/* Email */
window.gContent.EMAIL = '2ndtlmining@gmail.com';

/* Address for donations (FLUX only) */
window.gContent.ADDRESS_FLUX = 't1aUmu7HDr7BtwmdR1Y9i2K6KFRZs4Bumbt';


// prettier-ignore
{

/**
 * Hardware requirements
 *
 * Here C is requirement value for CUMULUS tier, N for NIMBUS, S for STRATUS and F for FRACTUS.
 * */

window.gContent.REQUIREMENTS = {
  'threads':        { C:   4,  N:   8,  S:   16, F:     4 },
  'ram':            { C:   8,  N:  32,  S:   64, F:     8 },
  'size':           { C: 220,  N: 440,  S:  880, F:  9000 },
  'dws':            { C: 180,  N: 180,  S:  400, F:    80 },
  'eps':            { C: 240,  N: 640,  S: 1520, F:   240 },
  'net_down_speed': { C:  25,  N:  50,  S:  100, F:   100 },
  'net_up_speed':   { C:  25,  N:  50,  S:  100, F:   100 },
};


window.gContent.CC_COLLATERAL_CUMULUS = 1000;
window.gContent.CC_COLLATERAL_NIMBUS = 12500;
window.gContent.CC_COLLATERAL_STRATUS = 40000;
window.gContent.CC_COLLATERAL_FRACTUS = 1000;

}

/* ========================================== */

// The Flux Block Reward
window.gContent.CC_BLOCK_REWARD = 14;

/* ========================================== */
/**
 * Flux Reward Percentages
 *
 * All the values below are in percentages. For example, 7.5 means 7.5 %
 **/

window.gContent.CC_FLUX_REWARD_CUMULUS = 7.142;
window.gContent.CC_FLUX_REWARD_NIMBUS = 25.0;
window.gContent.CC_FLUX_REWARD_STRATUS = 64.28;
window.gContent.CC_FLUX_REWARD_FRACTUS = 7.142;

/* ========================================== */
/**
 * Parallel Asset reward. It is also in percentage ( 50 means 50 % = 0.5 )
 **/
window.gContent.CC_PA_REWARD = 100.0;
