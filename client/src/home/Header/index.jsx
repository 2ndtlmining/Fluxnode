import { format_minutes } from 'utils';

import { Classes, Popover2 } from '@blueprintjs/popover2';

import './index.scss';
import { InfoCell } from 'components/InfoCell';

import { FiCpu, FiPackage, FiZap } from 'react-icons/fi';
import { FaWallet, FaWordpress, FaRocket, FaHive } from 'react-icons/fa';

import { LayoutContext } from 'contexts/LayoutContext';
import { useContext } from 'react';

import 'react-circular-progressbar/dist/styles.css';
import { RadialCircularProgressbar } from 'components/RadialCircularProgressbar';
import { UtilizationBars } from 'components/UtilizationBars';

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

function ArcaneOSView({ arcaneData }) {
  return (
    <div className='d-block mb-0 cell-tooltip-box'>
      <p>
        <span className='ct-name'>ArcaneOS Nodes: </span>
        <span className='ct-val'>{arcaneData.arcane_nodes}</span>
      </p>
      <p>
        <span className='ct-name'>Total Nodes: </span>
        <span className='ct-val'>{arcaneData.total_nodes}</span>
      </p>
      <p>
        <span className='ct-name'>Percentage: </span>
        <span className='ct-val'>{arcaneData.percentage.toFixed(2)}%</span>
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

export function DashboardCells({ gstore: gs, total_donations }) {
  const { normalFontSize } = useContext(LayoutContext);

  const iconSize = normalFontSize ? '28px' : '22px';
  const suffixClassName = normalFontSize ? '' : '-small';

  return (
    <div className='dashboard bp4-dark'>
      <LayoutContext.Consumer>
        {({ selectedCurrency }) => (
          <>
            <Cell
              name={`Unique Wallets`}
              value={gs.uniqueWalletAddressesCount}
              icon={<FaWallet size={iconSize} />}
              iconWrapClassName={`dash-cell__nodes-total${suffixClassName}`}
              small={!normalFontSize}
            />

            <Cell
              name={`Total Running Apps instances`}
              value={gs.totalRunningApps}
              icon={<FaRocket size={iconSize} />}
              iconWrapClassName={`dash-cell__nodes-nimbus${suffixClassName}`}
              small={!normalFontSize}
            />

            <Cell
              name={`Presearch Running Apps`}
              value={gs.presearchRunningApps}
              icon={<FaRocket size={iconSize} />}
              iconWrapClassName={`dash-cell__nodes-cumulus${suffixClassName}`}
              small={!normalFontSize}
            />

            <Cell
              name={`Streamr Running Apps`}
              value={gs.kadenaRunningApps}
              icon={<FaRocket size={iconSize} />}
              iconWrapClassName={`dash-cell__nodes-cumulus${suffixClassName}`}
              small={!normalFontSize}
            />

            <Cell
              name={`Wordpress Instances`}
              value={gs.wordpressCount}
              icon={<FaWordpress size={iconSize} />}
              iconWrapClassName={`dash-cell__flux-usd${suffixClassName}`}
              small={!normalFontSize}
            />

            <CellTooltip tooltipContent={<ArcaneOSView arcaneData={gs.arcane_os} />}>
              {(ref, tooltipProps) => (
                <Cell
                  elementRef={ref}
                  {...tooltipProps}
                  name='ArcaneOS Adoption'
                  value={gs.arcane_os.percentage}
                  icon={
                    <RadialCircularProgressbar
                      value={gs.arcane_os.percentage}
                      count={20}
                      rootStyles={{
                        pathColor: `#FF6B35`,
                        glowColor: `drop-shadow(0 0 2px #000)
                          drop-shadow(0 0 1px #FF6B35)
                          drop-shadow(0 0 1px #FF4500`,
                        textColor: `#fff`
                      }}
                      radialSeparatorStyles={{
                        background: '#181a1b',
                        width: '2px',
                        height: `${8}%`
                      }}
                    />
                  }
                  iconWrapClassName={`dash-cell__utilization-percentage${suffixClassName}`}
                  small={!normalFontSize}
                  suffix={'%'}
                  cellHover
                />
              )}
            </CellTooltip>

            {/* Cumulus Node Cell - No longer toggleable */}
            <CellTooltip tooltipContent={<TierRewardsProjectionView rewards={gs.reward_projections.cumulus} />}>
              {(ref, tooltipProps) => (
                <Cell
                  elementRef={ref}
                  {...tooltipProps}
                  name='Cumulus Nodes'
                  value={gs.node_count.cumulus}
                  icon={<FiZap size={iconSize} />}
                  iconWrapClassName={`dash-cell__nodes-cumulus${suffixClassName}`}
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
                  iconWrapClassName={`dash-cell__nodes-nimbus${suffixClassName}`}
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
                  iconWrapClassName={`dash-cell__nodes-stratus${suffixClassName}`}
                  small={!normalFontSize}
                  cellHover
                />
              )}
            </CellTooltip>

            <UtilizationBars gstore={gs} />

            <Cell
              name={`Current block height`}
              value={gs.fluxBlockHeight}
              icon={<FaHive size={iconSize} />}
              iconWrapClassName={`dash-cell__nodes-cumulus${suffixClassName}`}
              small={!normalFontSize}
            />
          </>
        )}
      </LayoutContext.Consumer>
    </div>
  );
}