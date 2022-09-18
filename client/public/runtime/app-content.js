window.gContent = {};

/* Links of social media */
window.gContent.URL_YOUTUBE = 'https://www.youtube.com/channel/UCO-gfYYQL22oibzOjr1SnHA';
window.gContent.URL_TWITTER = 'https://twitter.com/2ndTLMining';
window.gContent.URL_GITHUB = 'https://github.com/2ndtlmining/Fluxnode';

/* Email */
window.gContent.EMAIL = '2ndtlmining@gmail.com';

/* Addresses for donations */
window.gContent.ADDRESS_FLUX = 't1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG';
window.gContent.ADDRESS_BTC = '1MjMuVLEaAd8HJd3mh94L8qQe4cE6tH87V';


// prettier-ignore
{

/**
 * Hardware requirements
 *
 * Here C is requirement value for CUMULUS tier, N for NIMBUS and S for STRATUS.
 * */

window.gContent.REQUIERMENTS = {
  'cores':          { C:   2,  N:   4,  S:    8 },
  'threads':        { C:   4,  N:   8,  S:   16 },
  'ram':            { C:   8,  N:  32,  S:   64 },
  'size':           { C: 220,  N: 440,  S:  880 },
  'dws':            { C: 180,  N: 180,  S:  400 },
  'eps':            { C: 240,  N: 640,  S: 1520 },
  'net_down_speed': { C:  25,  N:  50,  S:  100 },
  'net_up_speed':   { C:  25,  N:  50,  S:  100 },
};


window.gContent.CC_COLLATERAL_CUMULUS = 1000;
window.gContent.CC_COLLATERAL_NIMBUS = 12500;
window.gContent.CC_COLLATERAL_STRATUS = 40000;

}

/* ========================================== */

// The Flux Block Reward
window.gContent.CC_BLOCK_REWARD = 75;

/* ========================================== */
/**
 * Flux Reward Percentages
 *
 * All the values below are in percentages. For example, 7.5 means 7.5 %
 **/

window.gContent.CC_FLUX_REWARD_CUMULUS = 7.5;
window.gContent.CC_FLUX_REWARD_NIMBUS = 12.5;
window.gContent.CC_FLUX_REWARD_STRATUS = 30.0;

/* ========================================== */
/**
 * Parallel Asset reward. It is also in percentage ( 50 means 50 % = 0.5 )
 **/
window.gContent.CC_PA_REWARD = 70.0;


/* ========================================== */

window.gContent.SETUP_VIDEOS = [
  {
    title: 'Flux LightNode Wallet',
    url: 'https://www.youtube.com/embed/RT1uaSrurv4'
  },
  {
    title: 'FluxNode Setup for Raspberry Pi4B',
    url: 'https://www.youtube.com/embed/-lJJyuliR38'
  },
  {
    title: 'Self-Hosted Flux Node Setup Guide',
    url: 'https://www.youtube.com/embed/FITPHv52Fyo'
  },
  {
    title: 'Raspberry Pi FluxNode Setup Guide',
    url: 'https://www.youtube.com/embed/n2CMwfahUBI'
  },
  {
    title: 'Cumulus Mini-PC and other alternatives',
    url: 'https://www.youtube.com/embed/akfV5WhmE-g'
  },
  {
    title: 'FluxNode NVIDIA Jetson Nano',
    url: 'https://www.youtube.com/embed/0gZ89Ppw0dw'
  }
];

window.gContent.GUIDE_VIDEOS = [
  {
    title: `Top 5 Flux Node questions answered`,
    url: 'https://www.youtube.com/embed/44SHKcD1wHY'
  },
  {
    title: `Flux Node Setup Guide (VPS)`,
    url: 'https://www.youtube.com/embed/0mA6d4YZOcA'
  },
  {
    title: `How to setup Flux Watchdog`,
    url: 'https://www.youtube.com/embed/RQRSwpLTMYU'
  },
  {
    title: `How to perform Flux Node patching`,
    url: 'https://www.youtube.com/embed/puL0W0s9eG4'
  },
  {
    title: `10 Tips and Tricks to Help Setup your First Flux Node | Flux Node Setup Guide`,
    url: 'https://www.youtube.com/embed/8RsRfggaVlg'
  },
  {
    title: `How To Start A Flux Node | Beginners Guide`,
    url: 'https://www.youtube.com/embed/znqIqR1WM60'
  }
];
