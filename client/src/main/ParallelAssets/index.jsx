import React from 'react';
import './index.scss';

import { Button, Card, Icon, Tag } from '@blueprintjs/core';

import { Container, Row, Col } from 'react-grid-system';

import { InfoCell } from 'components/InfoCell';
import { FiDollarSign, FiAward, FiShoppingBag, FiLayers, FiAlertTriangle } from 'react-icons/fi';

import { pa_summary_full } from 'apidata';
import { hide_sensitive_number } from 'utils';
import ErgoLogo from 'assets/Ergo_Orange.png'
import KDALogo from 'assets/kadena-kda-logo.png'
import ETHLogo from 'assets/ethereum-eth-logo.png'
import BNBLogo from 'assets/bnb-bnb-logo.png'
import TRNLogo from 'assets/tron-trx-logo.png'
import ArgoLogo from 'assets/Algo_white.png'
import ArgoblackLogo from 'assets/algorand-algo-logo-black.png'
import SOLLogo from 'assets/solana-sol-logo.png'
import AVXLogo from 'assets/avalanche-avax-logo.png'
import MATICLogo from 'assets/polygon-matic-logo.png'
import BaseLogo_white from 'assets/Base_Symbol_White.png'
import BaseLogo_black from 'assets/Base_Symbol_Black.png'

/*
 * Privacy Mode promises no wallet data is on screen. Parallel Assets had no
 * privacy handling at all, so every claimable / claimed / mined figure stayed
 * visible with it on (issue #142).
 */
function maskAmount(value, enablePrivacyMode, decimals = 2) {
  const fixed = Number(value ?? 0).toFixed(decimals);
  return enablePrivacyMode ? hide_sensitive_number(fixed) : fixed;
}

/*
 * Flux ended the Flux-Ergo bridge on 22 Sep 2026 (issue #375). The snapshot is
 * Ergo block 1,878,291; balances held then are claimable 1:1 inside Fusion and
 * mining rewards stay claimable on the Flux main chain. The Ergo card keeps its
 * figures, since they are still owed, but is marked as retired.
 */
export const ERGO_SUPPORT_ENDED = {
  snapshotBlock: '1,878,291',
  snapshotDate: '21 Sep 2026',
  checkerUrl: 'https://ergo.runonflux.com',
  announcementUrl: 'https://github.com/RunOnFlux/flux-ergo-claims/blob/main/content/announcement.md',
};

export function ErgoSupportBanner() {
  return (
    <div className='pa-ergo-banner' role='alert'>
      <FiAlertTriangle className='pa-ergo-banner-icon' aria-hidden='true' />
      <div>
        <div className='pa-ergo-banner-title'>Flux support for the Ergo parallel asset has ended</div>
        <p>
          The Flux&ndash;Ergo bridge is closed permanently. FLUX held on Ergo at the snapshot (block{' '}
          {ERGO_SUPPORT_ENDED.snapshotBlock}, {ERGO_SUPPORT_ENDED.snapshotDate}) is honoured 1:1 and is claimed{' '}
          <strong>inside Fusion only</strong>, with the claim window opening in early October. Ergo mining rewards
          remain claimable on the Flux main chain. Any Flux&ndash;Ergo claim portal outside Fusion is a scam.
        </p>
        <p className='pa-ergo-banner-links'>
          <a href={ERGO_SUPPORT_ENDED.checkerUrl} target='_blank' rel='noopener noreferrer'>
            Check your snapshot balance
          </a>
          {' · '}
          <a href={ERGO_SUPPORT_ENDED.announcementUrl} target='_blank' rel='noopener noreferrer'>
            Read the announcement
          </a>
        </p>
      </div>
    </div>
  );
}

function PASummary(summary, enablePrivacyMode) {
  return (
    <div className='pa-summary adp-border-color'>
      <div id='title'>Parallel Assets Summary</div>
      <div className='ps-row adp-border-color'>
        <InfoCell
          name='Total Claimable'
          value={summary.total_claimable}
          isPrivacy={enablePrivacyMode}
          icon={<FiShoppingBag />}
          iconColor='#000'
          iconColorAlt='#eeeeee'
          className='ps-cell-new adp-border-color'
          id='cell-1'
        />
        <InfoCell
          name={<>Total Claimed to date</>}
          value={summary.total_claimed_to_date}
          isPrivacy={enablePrivacyMode}
          icon={<FiAward />}
          iconColor='#000'
          iconColorAlt='#eeeeee'
          className='ps-cell-new adp-border-color'
          id='cell-2'
        />
      </div>
      <div className='ps-row adp-border-color'>
        <InfoCell
          name='Total mined'
          value={summary.total_mined}
          isPrivacy={enablePrivacyMode}
          icon={<FiLayers />}
          iconColor='#000'
          iconColorAlt='#eeeeee'
          className='ps-cell-new adp-border-color'
          id='cell-3'
          large
        />
      </div>
    </div>
  );
}

function PAssetCard({ assetName, blockStyle, logoUrl, paInfo, placeholder, enablePrivacyMode, retired }) {
  return (
    <div className={'adp-text-normal pa-card' + ` pa-grad-${blockStyle}` + (retired ? ' pa-card-retired' : '')}>
      <div className='logo-wrapper'>
        {retired && <div className='pa-retired-badge'>Support ended</div>}
        <div className='logo adp-bg-normal'>
          {logoUrl && <img src={logoUrl} alt={assetName + ' logo'} />}
        </div>
      </div>
      <div className='border-bottom adp-border-color pa-name'>{assetName}</div>
      <div className='info-area'>
        <div className='border-bottom adp-border-color pt-2 pb-2'>
          <div className='text-center fs-6 text-wrap'>
            <span className='fw-bold'>{placeholder ? 'TBC' : `${maskAmount(paInfo.possible_claimable, enablePrivacyMode)} Possible
            Claimable`}</span>
          </div>
        </div>
        <div className='border-bottom adp-border-color pt-2 pb-2'>
          <div className='text-center fs-6 text-wrap'>
            <span className='fw-bold'>{placeholder ? 'TBC' : `${maskAmount(paInfo.amount_claimed, enablePrivacyMode)} Claimed Amount`}</span>
          </div>
        </div>

        <div className='border-bottom adp-border-color pt-2 pb-2'>
          <div className='text-center fs-6 text-wrap'>
            <span className='fw-bold'>{placeholder ? 'TBC' : `${maskAmount(paInfo.fusion_fee, enablePrivacyMode)} Fusion Fee`}</span>
          </div>
        </div>

        <div className='border-bottom adp-border-color pt-2 pb-2'>
          <div className='text-center fs-6 text-wrap'>
            <span className='fw-bold'>{placeholder ? 'TBC' : `${maskAmount(paInfo.paid, enablePrivacyMode)} Fees Paid`}</span>
          </div>
        </div>

        <div className='pt-2 pb-2'>
          <div className='text-center fs-6 text-wrap'>
            <span className='fw-bold'>{placeholder ? 'TBC' : `${maskAmount(paInfo.amount_received, enablePrivacyMode)} Received Amount`}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ParallelAssets({ summary, theme, enablePrivacyMode = false }) {

  return (
    <Container fluid>
      <Row>
        <Col className='margin-b-xl' lg={24}>
          <ErgoSupportBanner />
        </Col>
      </Row>
      <Row>
        <Col className='margin-b-xl' offset={{}} lg={7}>
          {PASummary(summary, enablePrivacyMode)}
        </Col>
        <Col className='margin-b-xl' lg={17}>
          <div className='parallel-assets-list'>
            <PAssetCard
              enablePrivacyMode={enablePrivacyMode}
              paInfo={summary.assets.kda}
              blockStyle='kda'
              logoUrl={KDALogo}
              //logoUrl='https://cryptologos.cc/logos/kadena-kda-logo.png?v=026'
              assetName={'KDA'}
            />
            <PAssetCard
              enablePrivacyMode={enablePrivacyMode}
              paInfo={summary.assets.eth}
              blockStyle='eth'
              logoUrl={ETHLogo}
              //logoUrl='https://cryptologos.cc/logos/ethereum-eth-logo.png?v=026'
              assetName={'Ethereum'}
            />
            <PAssetCard
              enablePrivacyMode={enablePrivacyMode}
              paInfo={summary.assets.bsc}
              blockStyle='bsc'
              logoUrl={BNBLogo}
              //logoUrl='https://cryptologos.cc/logos/bnb-bnb-logo.png?v=026'
              assetName={'BSC'}
            />
            <PAssetCard
              enablePrivacyMode={enablePrivacyMode}
              paInfo={summary.assets.trn}
              blockStyle='trn'
              logoUrl={TRNLogo}
              //logoUrl='https://cryptologos.cc/logos/tron-trx-logo.png?v=026'
              assetName={'Tron'}
            />
            <PAssetCard
              enablePrivacyMode={enablePrivacyMode}
              paInfo={summary.assets.sol}
              blockStyle='sol'
              logoUrl={SOLLogo}
              //logoUrl='https://cryptologos.cc/logos/solana-sol-logo.png?v=026'
              assetName={'Solana'}
            />
            <PAssetCard
              enablePrivacyMode={enablePrivacyMode}
              paInfo={summary.assets.avx}
              blockStyle='avx'
              logoUrl={AVXLogo}
              //logoUrl='https://cryptologos.cc/logos/avalanche-avax-logo.png?v=026'
              assetName={'AVAX'}
            />
            <PAssetCard
              enablePrivacyMode={enablePrivacyMode}
              paInfo={summary.assets.erg}
              blockStyle='erg'
              logoUrl={ErgoLogo}
              // logoUrl='https://cryptologos.cc/logos/ergo-erg-logo.png'
              assetName={'Ergo'}
              retired
            />
            <PAssetCard
              enablePrivacyMode={enablePrivacyMode}
              paInfo={summary.assets.algo}
              blockStyle='alg'
              logoUrl={theme === 'light' ? ArgoblackLogo : ArgoLogo}
              assetName={'Algorand'}
            />
            <PAssetCard
              enablePrivacyMode={enablePrivacyMode}
              paInfo={summary.assets.matic}
              blockStyle='matic'
              logoUrl={MATICLogo}
              //logoUrl='https://cryptologos.cc/logos/polygon-matic-logo.png'
              assetName={'Polygon'}
            />
            <PAssetCard
              enablePrivacyMode={enablePrivacyMode}
              paInfo={summary.assets.base}
              blockStyle='base'
              logoUrl={theme === 'light' ? BaseLogo_black : BaseLogo_white}
              assetName={'Base'}
            />
          </div>
        </Col>
      </Row>
    </Container>
  );
}
