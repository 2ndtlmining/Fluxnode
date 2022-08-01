import React from 'react';
import './index.scss';

import { Card, Divider, Icon } from '@blueprintjs/core';

import { gethelp, getreq__cumulus, getreq__nimbus, getreq__stratus } from 'content/index';
import { CC_COLLATERAL_CUMULUS, CC_COLLATERAL_NIMBUS, CC_COLLATERAL_STRATUS } from 'content/index';

/* https://stackoverflow.com/a/2901298 */
function numberWithCommas(x) {
  var parts = x.toString().split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

export function NodeRequirementsBlock({ tierName, fluxAmount, requirementsContent, compat, blockReward }) {
  return (
    <div className='req-block'>
      <h2 className='tier-name'>{tierName}</h2>
      <h2 className='flx-value-highlight center-text-flow'>{numberWithCommas(fluxAmount)} FLUX</h2>
      <p className='req-paragraph margin-t-l'>Hardware Requirements</p>
      <p className='req-paragraph margin-t-l'>{requirementsContent}</p>
      <p className='req-paragraph margin-t-l'>
        <em>{compat}</em>
      </p>
      <Divider />
      <h2 className='block-rew-title center-text-flow margin-t-l'>
        <Icon icon='graph' size={25} className='margin-r-m' /> Deterministic Block Reward
      </h2>
      <h2 className='flx-value-highlight margin-t-xl'>{blockReward}</h2>
    </div>
  );
}

export const RequirementsCumulus = (
  <NodeRequirementsBlock
    tierName='CUMULUS'
    fluxAmount={CC_COLLATERAL_CUMULUS}
    requirementsContent={
      <>
        {getreq__cumulus('cores')} Cores
        <br />
        {getreq__cumulus('threads')} Threads
        <br />
        {getreq__cumulus('ram')} GB RAM
        <br />
        {getreq__cumulus('size')} GB SSD/NVME
        <br />
        {getreq__cumulus('dws')} MB/s DWS
        <br />
        {getreq__cumulus('eps')} EPS Min. Requirements
        <br />
        {getreq__cumulus('net_down_speed')} Mb down/up speed
      </>
    }
    compat='VPS and ARM64 compatible'
    blockReward='7.5%'
  />
);

export const RequirementsNimbus = (
  <NodeRequirementsBlock
    tierName='NIMBUS'
    fluxAmount={CC_COLLATERAL_NIMBUS}
    requirementsContent={
      <>
        {getreq__nimbus('cores')} Cores
        <br />
        {getreq__nimbus('threads')} Threads
        <br />
        {getreq__nimbus('ram')} GB RAM
        <br />
        {getreq__nimbus('size')} GB SSD/NVME
        <br />
        {getreq__nimbus('dws')} MB/s DWS
        <br />
        {getreq__nimbus('eps')} EPS Min. Requirements
        <br />
        {getreq__nimbus('net_down_speed')} Mb down/up speed
      </>
    }
    compat='VPS and ARM64 compatible'
    blockReward='12.5%'
  />
);

export const RequirementsStratus = (
  <NodeRequirementsBlock
    tierName='STRATUS'
    fluxAmount={CC_COLLATERAL_STRATUS}
    requirementsContent={
      <>
        {getreq__stratus('cores')} Cores
        <br />
        {getreq__stratus('threads')} Threads
        <br />
        {getreq__stratus('ram')} GB RAM
        <br />
        {getreq__stratus('size')} GB SSD/NVME
        <br />
        {getreq__stratus('dws')} MB/s DWS
        <br />
        {getreq__stratus('eps')} EPS Min. Requirements
        <br />
        {getreq__stratus('net_down_speed')} Mb down/up speed
      </>
    }
    compat='VPS compatible'
    blockReward='30%'
  />
);
