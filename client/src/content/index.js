import * as r from './internal/req_helpers';
import { fluxos_version_desc_parse } from 'main/flux_version';
export { gethelp, getreq, getreq__cumulus, getreq__nimbus, getreq__stratus, getreq__fractus } from './internal/req_helpers';

export const URL_YOUTUBE = window.gContent.URL_YOUTUBE;
export const URL_TWITTER = window.gContent.URL_TWITTER;
export const URL_GITHUB = window.gContent.URL_GITHUB;
export const EMAIL = window.gContent.EMAIL;
export const ADDRESS_FLUX = window.gContent.ADDRESS_FLUX;
export const ADDRESS_BTC = window.gContent.ADDRESS_BTC;

// prettier-ignore

{
const _reqsObj = window.gContent.REQUIERMENTS;
r.defreq_wrap('cores',          _reqsObj['cores']);
r.defreq_wrap('threads',        _reqsObj['threads']);
r.defreq_wrap('ram',            _reqsObj['ram']);
r.defreq_wrap('size',           _reqsObj['size']);
r.defreq_wrap('dws',            _reqsObj['dws']);
r.defreq_wrap('eps',            _reqsObj['eps']);
r.defreq_wrap('net_down_speed', _reqsObj['net_down_speed']);
r.defreq_wrap('net_up_speed',   _reqsObj['net_up_speed']);
}

export const CC_COLLATERAL_CUMULUS = window.gContent.CC_COLLATERAL_CUMULUS;
export const CC_COLLATERAL_NIMBUS = window.gContent.CC_COLLATERAL_NIMBUS;
export const CC_COLLATERAL_STRATUS = window.gContent.CC_COLLATERAL_STRATUS;
export const CC_COLLATERAL_FRACTUS = window.gContent.CC_COLLATERAL_FRACTUS;

export const CC_BLOCK_REWARD = window.gContent.CC_BLOCK_REWARD;
export const CC_FLUX_REWARD_CUMULUS = window.gContent.CC_FLUX_REWARD_CUMULUS;
export const CC_FLUX_REWARD_NIMBUS = window.gContent.CC_FLUX_REWARD_NIMBUS;
export const CC_FLUX_REWARD_STRATUS = window.gContent.CC_FLUX_REWARD_STRATUS;
export const CC_FLUX_REWARD_FRACTUS = window.gContent.CC_FLUX_REWARD_FRACTUS;
export const CC_PA_REWARD = window.gContent.CC_PA_REWARD;

// export const LATEST_FLUX_VERSION_DESC = fluxos_version_desc_parse(window.gContent.LATEST_FLUX_VERSION);

export const setupVideos = window.gContent.SETUP_VIDEOS;
export const guideVideos = window.gContent.GUIDE_VIDEOS;
