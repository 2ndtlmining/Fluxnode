import preval from 'preval.macro';

// export const COMPILE_STAMP = preval`
const result = preval`
const dayjs = require('dayjs');
let buildDate = dayjs(new Date());
let expiryDate = buildDate.add(18, 'day');
module.exports = {
    compile: buildDate.valueOf(),
    last: expiryDate.valueOf()
};
`;

export const { compile: COMPILE_STAMP, last: LAST_STAMP } = result;

export const APP_VERSION = process.env.REACT_APP_VERSION || '0.0.0';

export const IS_PROD = process.env.NODE_ENV === 'production';
export const IS_DEV = !IS_PROD;
export const IS_TEST_BUILD = process.env.REACT_APP_TEST_BUILD === 'yes';

export let FLUXNODE_INFO_API_MODE = (function () {
  let mode = process.env.REACT_APP_FLUXNODE_INFO_API_MODE;
  return ['debug', 'proxy'].indexOf(mode) == -1 ? 'debug' : mode;
})();

export let FLUXNODE_INFO_API_URL = (function () {
  if (FLUXNODE_INFO_API_MODE != 'proxy') return '';

  let url = process.env.REACT_APP_FLUXNODE_INFO_API_URL;

  // The API is hosted on the same domain and port as this frontend
  if (url === 'self') {
    console.log('Received FLUXNODE_INFO_API_URL=self');
    return '';
  }

  if (url && url.length) {
    return url.trim().replace(/\/+$/, '');
  }

  console.warn(
    'Invalid config: FLUXNODE_INFO_API_MODE=proxy without specifiying FLUXNODE_INFO_API_URL.\n' +
      'Falling back to FLUXNODE_INFO_API_MODE=debug'
  );

  FLUXNODE_INFO_API_MODE = 'debug';
  return '';
})();

window.FLUXNODE_INFO_API_MODE = FLUXNODE_INFO_API_MODE;
window.FLUXNODE_INFO_API_URL = FLUXNODE_INFO_API_URL;
