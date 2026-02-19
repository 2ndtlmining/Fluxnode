import React from 'react';
import './index.scss';

import { Button, Card, Icon, Tag } from '@blueprintjs/core';

import { Container, Row, Col } from 'react-grid-system';

import { InfoCell } from 'components/InfoCell';
import { FiDollarSign, FiAward, FiShoppingBag, FiLayers } from 'react-icons/fi';

import { pa_summary_full } from 'main/apidata';
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

function PASummary(summary) {
  return (
    <div className='pa-summary adp-border-color'>
      <div id='title'>Parallel Assets Summary</div>
      <div className='ps-row adp-border-color'>
        <InfoCell
          name='Total Claimable'
          value={summary.total_claimable}
          icon={<FiShoppingBag />}
          iconColor='#000'
          iconColorAlt='#eeeeee'
          className='ps-cell-new adp-border-color'
          id='cell-1'
        />
        <InfoCell
          name={<>Total Claimed to date</>}
          value={summary.total_claimed_to_date}
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

function PAssetCard({ assetName, blockStyle, logoUrl, paInfo, placeholder }) {
  return (
    <div className={'adp-text-normal pa-card' + ` pa-grad-${blockStyle}`}>
      <div className='logo-wrapper'>
        <div className='logo adp-bg-normal'>
          {logoUrl && <img src={logoUrl} alt={assetName + ' logo'} />}
        </div>
      </div>
      <div className='border-bottom adp-border-color pa-name'>{assetName}</div>
      <div className='info-area'>
        <div className='border-bottom adp-border-color pt-2 pb-2'>
          <div className='text-center fs-6 text-wrap'>
            <span className='fw-bold'>{placeholder ? 'TBC' : `${paInfo.possible_claimable.toFixed(2)} Possible
            Claimable`}</span>
          </div>
        </div>
        <div className='border-bottom adp-border-color pt-2 pb-2'>
          <div className='text-center fs-6 text-wrap'>
            <span className='fw-bold'>{placeholder ? 'TBC' : `${paInfo.amount_claimed.toFixed(2)} Claimed Amount`}</span>
          </div>
        </div>

        <div className='border-bottom adp-border-color pt-2 pb-2'>
          <div className='text-center fs-6 text-wrap'>
            <span className='fw-bold'>{placeholder ? 'TBC' : `${paInfo.fusion_fee.toFixed(2)} Fusion Fee`}</span>
          </div>
        </div>

        <div className='border-bottom adp-border-color pt-2 pb-2'>
          <div className='text-center fs-6 text-wrap'>
            <span className='fw-bold'>{placeholder ? 'TBC' : `${paInfo.paid.toFixed(2)} Fees Paid`}</span>
          </div>
        </div>

        <div className='pt-2 pb-2'>
          <div className='text-center fs-6 text-wrap'>
            <span className='fw-bold'>{placeholder ? 'TBC' : `${paInfo.amount_received.toFixed(2)} Received Amount`}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ParallelAssets({ summary, theme }) {

  return (
    <Container fluid>
      <Row>
        <Col className='margin-b-xl' offset={{}} lg={7}>
          {PASummary(summary)}
        </Col>
        <Col className='margin-b-xl' lg={17}>
          <div className='parallel-assets-list'>
            <PAssetCard
              paInfo={summary.assets.kda}
              blockStyle='kda'
              logoUrl={KDALogo}
              //logoUrl='https://cryptologos.cc/logos/kadena-kda-logo.png?v=026'
              assetName={'KDA'}
            />
            <PAssetCard
              paInfo={summary.assets.eth}
              blockStyle='eth'
              logoUrl={ETHLogo}
              //logoUrl='https://cryptologos.cc/logos/ethereum-eth-logo.png?v=026'
              assetName={'Ethereum'}
            />
            <PAssetCard
              paInfo={summary.assets.bsc}
              blockStyle='bsc'
              logoUrl={BNBLogo}
              //logoUrl='https://cryptologos.cc/logos/bnb-bnb-logo.png?v=026'
              assetName={'BSC'}
            />
            <PAssetCard
              paInfo={summary.assets.trn}
              blockStyle='trn'
              logoUrl={TRNLogo}
              //logoUrl='https://cryptologos.cc/logos/tron-trx-logo.png?v=026'
              assetName={'Tron'}
            />
            <PAssetCard
              paInfo={summary.assets.sol}
              blockStyle='sol'
              logoUrl={SOLLogo}
              //logoUrl='https://cryptologos.cc/logos/solana-sol-logo.png?v=026'
              assetName={'Solana'}
            />
            <PAssetCard
              paInfo={summary.assets.avx}
              blockStyle='avx'
              logoUrl={AVXLogo}
              //logoUrl='https://cryptologos.cc/logos/avalanche-avax-logo.png?v=026'
              assetName={'AVAX'}
            />
            <PAssetCard
              paInfo={summary.assets.erg}
              blockStyle='erg'
              logoUrl={ErgoLogo}
              // logoUrl='https://cryptologos.cc/logos/ergo-erg-logo.png'
              assetName={'Ergo'}
            />
            <PAssetCard
              paInfo={summary.assets.algo}
              blockStyle='alg'
              logoUrl={theme === 'light' ? ArgoblackLogo : ArgoLogo}
              assetName={'Algorand'}
            />
            <PAssetCard
              paInfo={summary.assets.matic}
              blockStyle='matic'
              logoUrl={MATICLogo}
              //logoUrl='https://cryptologos.cc/logos/polygon-matic-logo.png'
              assetName={'Polygon'}
            />
            <PAssetCard
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
