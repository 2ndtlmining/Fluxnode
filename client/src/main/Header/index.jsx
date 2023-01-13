import * as dayjs from 'dayjs';

import { format_minutes } from 'utils';

import React from 'react';
import { Button } from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';

import './index.scss';

import { Container, Row, Col } from 'react-grid-system';

import { InfoCell } from 'main/InfoCell';
import { FluxIcon } from 'components/FluxIcon.jsx';
// import { LATEST_FLUX_VERSION_DESC } from 'content/index';

import {
  FiFolder,
  FiBox,
  FiDollarSign,
  FiDatabase,
  FiCodesandbox,
  FiHash,
  FiHexagon,
  FiOctagon,
  FiPackage,
  FiZap,
  FiCpu,
  FiLayers
} from 'react-icons/fi';

import { fluxos_version_string } from 'main/flux_version';
import { LayoutContext } from 'contexts/LayoutContext';
import { useContext } from 'react';

function TierRewardsProjectionView({ rewards }) {
  return (
    <div className='d-block mb-0 cell-tooltip-box'>
      <p>
        <span className='ct-name'>Pay Frequency: </span>
        <span className='ct-val'>{format_minutes(rewards.pay_frequency)}</span>
      </p>
      <p>
        <span className='ct-name'>Flux a day: </span>
        <span className='ct-val'>
          {rewards.payment_amount.toFixed(3)} + <small>{rewards.pa_amount.toFixed(3)} PA</small>
        </span>
      </p>
      <p>
        <span className='ct-name'>APR: </span>
        <span className='ct-val'>{rewards.apy.toFixed(2)} %</span>
      </p>
    </div>
  );
}

function FluxOSVersionView({ versionDesc }) {
  return (
    <div className='d-block mb-0' style={{ fontSize: '0.96rem' }}>
      <p>
        <span style={{ color: '#ced1db', fontWeight: 500 }}>FluxOS Latest Version: </span>
        <span style={{ color: '#fff', fontWeight: 600 }}>{fluxos_version_string(versionDesc)}</span>
      </p>
    </div>
  );
}

function Cell({ name, value, icon, iconColor, iconColorAlt, small, cellHover, elementRef, ...otherProps }) {
  return (
    <InfoCell
      {...otherProps}
      name={name}
      value={value}
      icon={icon}
      iconColor={iconColor}
      iconColorAlt={iconColorAlt}
      small={small}
      elementRef={elementRef}
      className={'dcell' + (!!cellHover ? ' dcell-hover' : '')}
    />
  );
}

function CellTooltip({ children, tooltipContent }) {
  return (
    <Popover2
      interactionKind='hover'
      usePortal={true}
      transitionDuration={50}
      hoverOpenDelay={0}
      hoverCloseDelay={0}
      popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
      placement='bottom'
      content={tooltipContent}
      renderTarget={({ isOpen, ref, ...targetProps }) => children(ref, targetProps)}
    />
  );
}

const RenderedFluxIcon = ({ width, height }) => <FluxIcon width={32} height={32} viewBox='6 6 18.71 18.71' />;

export function DashboardCells({ gstore: gs }) {
  const { normalFontSize } = useContext(LayoutContext);

  const iconSize = normalFontSize ? '28px' : '22px';
  const smallIconWrapper = normalFontSize ? '' : '-small';

  return (
    <div className='dashboard bp4-dark'>
      <Cell
        name='Flux USD Value'
        value={'$' + gs.flux_price_usd.toFixed(3)}
        icon={<FiDollarSign size={iconSize} />}
        iconWrapClassName={'dash-cell__flux-usd' + smallIconWrapper}
        small={!normalFontSize}
      />
      <CellTooltip tooltipContent={<FluxOSVersionView versionDesc={gs.fluxos_latest_version} />}>
        {(ref, tooltipProps) => (
          <Cell
            elementRef={ref}
            {...tooltipProps}
            name='Total Nodes'
            value={gs.node_count.total}
            icon={<FiHash size={iconSize} />}
            iconWrapClassName={'dash-cell__nodes-total' + smallIconWrapper}
            small={!normalFontSize}
            cellHover
          />
        )}
      </CellTooltip>
      <CellTooltip tooltipContent={<TierRewardsProjectionView rewards={gs.reward_projections.cumulus} />}>
        {(ref, tooltipProps) => (
          <Cell
            elementRef={ref}
            {...tooltipProps}
            name='Cumulus Nodes'
            value={gs.node_count.cumulus}
            icon={<FiZap size={iconSize} />}
            iconWrapClassName={'dash-cell__nodes-cumulus' + smallIconWrapper}
            small={!normalFontSize}
            cellHover
          />
        )}
      </CellTooltip>
      <CellTooltip tooltipContent={<TierRewardsProjectionView rewards={gs.reward_projections.nimbus} />}>
        {(ref, tooltipProps) => (
          <Cell
            elementRef={ref}
            {...tooltipProps}
            name='Nimbus Nodes'
            value={gs.node_count.nimbus}
            icon={<FiCpu size={iconSize} />}
            iconWrapClassName={'dash-cell__nodes-nimbus' + smallIconWrapper}
            small={!normalFontSize}
            cellHover
          />
        )}
      </CellTooltip>
      <CellTooltip tooltipContent={<TierRewardsProjectionView rewards={gs.reward_projections.stratus} />}>
        {(ref, tooltipProps) => (
          <Cell
            elementRef={ref}
            {...tooltipProps}
            name='Stratus Nodes'
            value={gs.node_count.stratus}
            icon={<FiPackage size={iconSize} />}
            iconWrapClassName={'dash-cell__nodes-stratus' + smallIconWrapper}
            small={!normalFontSize}
            cellHover
          />
        )}
      </CellTooltip>
      <Cell
        name='Flux Amount'
        value={gs.wallet_amount_flux}
        icon={RenderedFluxIcon({ width: iconSize, height: iconSize })}
        iconWrapClassName={'dash-cell__amount-flux' + smallIconWrapper}
        small={!normalFontSize}
      />
      <Cell
        name='Wallet USD'
        value={format_flux_usd(gs.wallet_amount_flux, gs.flux_price_usd)}
        icon={<FiFolder size={iconSize} />}
        iconWrapClassName={'dash-cell__amount-usd' + smallIconWrapper}
        small={!normalFontSize}
      />
    </div>
  );
}

function format_flux_usd(wallet_amount_flux, usd_price) {
  return `\$${(wallet_amount_flux * usd_price).toFixed(3)}`;
}
