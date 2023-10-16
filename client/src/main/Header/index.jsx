import { calculate_float_number, format_minutes } from 'utils';

import { Classes, Popover2 } from '@blueprintjs/popover2';

import './index.scss';

import { FluxIcon } from 'components/FluxIcon.jsx';
import { InfoCell } from 'main/InfoCell';
// import { LATEST_FLUX_VERSION_DESC } from 'content/index';

import { FiCpu, FiDollarSign, FiHardDrive, FiHash, FiPackage, FiZap } from 'react-icons/fi';
import { FaCrown, FaWallet, FaEuroSign } from 'react-icons/fa';

import { LayoutContext } from 'contexts/LayoutContext';
import { fluxos_version_string } from 'main/flux_version';
import { useContext, useState } from 'react';

import { CircularProgressbar } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { RadialCircularProgressbar } from 'components/RadialCircularProgressbar';

const WALLET_CELL_ATTRIBUTES = {
  richlist: {
    icon: (iconProps) => <FaCrown {...iconProps} />,
    iconWrapperClassName: (suffix) => `dash-cell__amount-usd-in-rich-list${suffix}`
  },
  donate: {
    icon: (iconProps) => <FaWallet {...iconProps} />,
    iconWrapperClassName: (suffix) => `dash-cell__amount-usd-donate${suffix}`
  },
  default: {
    icon: (iconProps) => <FaWallet {...iconProps} />,
    iconWrapperClassName: (suffix) => `dash-cell__amount-usd${suffix}`
  }
};

function WalletTopPercentage({ topPercentage = 0 }) {
  return (
    <div className='d-block mb-0' style={{ fontSize: '0.96rem' }}>
      <p>
        <span style={{ color: '#fff', fontWeight: 600 }}>Top {topPercentage}%</span>
      </p>
    </div>
  );
}

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

function UtilizationView({ utilized, total, suffix = '' }) {
  const displayUtilized = `${calculate_float_number(utilized)} ${suffix}`;
  const displayTotal = total ? `${calculate_float_number(total)} ${suffix}` : 'Not Available';

  return (
    <div className='d-block mb-0 cell-tooltip-box'>
      <p>
        <span className='ct-name'>Utilized: </span>
        <span className='ct-val'>{displayUtilized}</span>
      </p>
      <p>
        <span className='ct-name'>Total: </span>
        <span className='ct-val'>{displayTotal}</span>
      </p>
    </div>
  );
}

function DisplayTotalScore({ value }) {
  return (
    <div className='d-block mb-0 cell-tooltip-box'>
      <p>
        <span className='ct-name'>Total Score: </span>
        <span className='ct-val'>{value}</span>
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

export function DashboardCells({ gstore: gs, total_donations, totalScoreAgainstSearchedWallet }) {
  const [enableFractusNodesCell, setToggleFractusNodesCell] = useState(false);
  const { normalFontSize, enablePrivacyMode } = useContext(LayoutContext);

  const iconSize = normalFontSize ? '28px' : '22px';
  const suffixClassName = normalFontSize ? '' : '-small';

  const walletType = gs.in_rich_list ? 'richlist' : total_donations > 0 ? 'donate' : 'default';

  const walletCellStyles = WALLET_CELL_ATTRIBUTES[walletType];

  // console.log("totalScoreAgainstSearchedWallet", totalScoreAgainstSearchedWallet)
  
  return (
    <div className='dashboard bp4-dark'>
      <LayoutContext.Consumer>
        {({ selectedCurrency }) => (
          <>
            <Cell
              name={`Flux ${selectedCurrency?.currency} Value`}
              value={gs.flux_price_usd * selectedCurrency?.rate}
              icon={
                selectedCurrency?.currency === 'EUR' ? <FaEuroSign size={iconSize} /> : <FiDollarSign size={iconSize} />
              }
              iconWrapClassName={`dash-cell__flux-usd${suffixClassName}`}
              small={!normalFontSize}
              prefix={selectedCurrency?.currency === 'EUR' ? '€' : '$'}
            />
            <CellTooltip tooltipContent={<FluxOSVersionView versionDesc={gs.fluxos_latest_version} />}>
              {(ref, tooltipProps) => (
                <Cell
                  elementRef={ref}
                  {...tooltipProps}
                  name='Total Nodes'
                  value={gs.node_count.total}
                  icon={<FiHash size={iconSize} />}
                  iconWrapClassName={`dash-cell__nodes-total${suffixClassName}`}
                  small={!normalFontSize}
                  cellHover
                />
              )}
            </CellTooltip>
            <CellTooltip
              tooltipContent={
                <TierRewardsProjectionView
                  rewards={enableFractusNodesCell ? gs.reward_projections.fractus : gs.reward_projections.cumulus}
                />
              }
            >
              {(ref, tooltipProps) => {
                const cellProps = enableFractusNodesCell
                  ? {
                      name: 'Fractus Nodes',
                      value: gs.node_count.fractus,
                      icon: <FiHardDrive size={iconSize} />,
                      iconWrapClassName: `dash-cell__nodes-fractus${suffixClassName}`
                    }
                  : {
                      name: 'Cumulus Nodes',
                      value: gs.node_count.cumulus,
                      icon: <FiZap size={iconSize} />,
                      iconWrapClassName: `dash-cell__nodes-cumulus${suffixClassName}`
                    };

                return (
                  <Cell
                    elementRef={ref}
                    {...tooltipProps}
                    {...cellProps}
                    small={!normalFontSize}
                    cellHover
                    toggleBtn={() => setToggleFractusNodesCell((prev) => !prev)}
                  />
                );
              }}
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

            <CellTooltip tooltipContent={<DisplayTotalScore value={totalScoreAgainstSearchedWallet} />}>
              {(ref, tooltipProps) => (
                <Cell
                  elementRef={ref}
                  {...tooltipProps}
                  name='Flux Amount'
                  value={gs.wallet_amount_flux}
                  icon={RenderedFluxIcon({ width: iconSize, height: iconSize })}
                  iconWrapClassName={`dash-cell__amount-flux${suffixClassName}`}
                  small={!normalFontSize}
                  isPrivacy={enablePrivacyMode}
                  cellHover
                />
              )}
            </CellTooltip>
            <CellTooltip tooltipContent={<WalletTopPercentage topPercentage={0} />}>
              {(ref, tooltipProps) => (
                <Cell
                  elementRef={ref}
                  {...tooltipProps}
                  name={`Wallet ${selectedCurrency?.currency}`}
                  value={gs.wallet_amount_flux * gs.flux_price_usd * selectedCurrency?.rate}
                  icon={walletCellStyles.icon({ size: iconSize })}
                  iconWrapClassName={walletCellStyles.iconWrapperClassName(suffixClassName)}
                  small={!normalFontSize}
                  prefix={selectedCurrency?.currency === 'EUR' ? '€' : '$'}
                  isPrivacy={enablePrivacyMode}
                />
              )}
            </CellTooltip>
            <CellTooltip tooltipContent={<UtilizationView utilized={gs.utilized.nodes} total={gs.node_count.total} />}>
              {(ref, tooltipProps) => (
                <Cell
                  elementRef={ref}
                  {...tooltipProps}
                  name='Node Utilisation'
                  value={gs.utilized.nodes_percentage}
                  icon={
                    <RadialCircularProgressbar
                      value={gs.utilized.nodes_percentage}
                      count={20}
                      rootStyles={{
                        pathColor: `#ff4d94`,
                        glowColor: `drop-shadow(0 0 2px #000)
                          drop-shadow(0 0 2px #ff4d94)
                          drop-shadow(0 0 2px #ff0066`,
                        textColor: `#fff`
                      }}
                      radialSeparatorStyles={{
                        background: '#181a1b',
                        width: '2px',
                        // This needs to be equal to props.strokeWidth
                        height: `${8}%`
                      }}
                    />
                  }
                  iconWrapClassName={`dash-cell__utilization-percentage${suffixClassName}`}
                  small={!normalFontSize}
                  suffix={'%'}
                />
              )}
            </CellTooltip>
            <CellTooltip
              tooltipContent={<UtilizationView utilized={gs.utilized.cores} total={gs.total.cores} suffix='vCores' />}
            >
              {(ref, tooltipProps) => (
                <Cell
                  elementRef={ref}
                  {...tooltipProps}
                  name='CPU Utilisation'
                  value={gs.utilized.cores_percentage}
                  icon={
                    <RadialCircularProgressbar
                      value={gs.utilized.cores_percentage}
                      count={20}
                      rootStyles={{
                        pathColor: `#38ef7d`,
                        glowColor: `drop-shadow(0 0 2px #000)
                          drop-shadow(0 0px 1px #11998e)
                          drop-shadow(0 0 1px #38ef7d`,
                        textColor: `#fff`
                      }}
                      radialSeparatorStyles={{
                        background: '#181a1b',
                        width: '2px',
                        // This needs to be equal to props.strokeWidth
                        height: `${8}%`
                      }}
                    />
                  }
                  iconWrapClassName={`dash-cell__utilization-percentage${suffixClassName}`}
                  small={!normalFontSize}
                  suffix={'%'}
                />
              )}
            </CellTooltip>
            <CellTooltip
              tooltipContent={<UtilizationView utilized={gs.utilized.ram} total={gs.total.ram} suffix='TB' />}
            >
              {(ref, tooltipProps) => (
                <Cell
                  elementRef={ref}
                  {...tooltipProps}
                  name='RAM Utilisation'
                  value={gs.utilized.ram_percentage}
                  icon={
                    <RadialCircularProgressbar
                      value={gs.utilized.ram_percentage}
                      count={20}
                      rootStyles={{
                        pathColor: `#8E2DE2`,
                        glowColor: `drop-shadow(0 0 1px #000)
                          drop-shadow(0 0 4px #8E2DE2)
                          drop-shadow(0 0 4px #4A00E0`,
                        textColor: `#fff`
                      }}
                      radialSeparatorStyles={{
                        background: '#181a1b',
                        width: '2px',
                        // This needs to be equal to props.strokeWidth
                        height: `${8}%`
                      }}
                    />
                  }
                  iconWrapClassName={`dash-cell__utilization-percentage${suffixClassName}`}
                  small={!normalFontSize}
                  suffix={'%'}
                />
              )}
            </CellTooltip>
            <CellTooltip
              tooltipContent={<UtilizationView utilized={gs.utilized.ssd} total={gs.total.ssd} suffix='TB' />}
            >
              {(ref, tooltipProps) => (
                <Cell
                  elementRef={ref}
                  {...tooltipProps}
                  name='SSD Utilisation'
                  value={gs.utilized.ssd_percentage}
                  icon={
                    <RadialCircularProgressbar
                      value={gs.utilized.ssd_percentage}
                      count={20}
                      rootStyles={{
                        pathColor: `#36D1DC`,
                        glowColor: `drop-shadow(0 0 2px #000)
                          drop-shadow(0 0 1px #36D1DC)
                          drop-shadow(0 0 1px #5B86E5`,
                        textColor: `#fff`
                      }}
                      radialSeparatorStyles={{
                        background: '#181a1b',
                        width: '2px',
                        // This needs to be equal to props.strokeWidth
                        height: `${8}%`
                      }}
                    />
                  }
                  iconWrapClassName={`dash-cell__utilization-percentage${suffixClassName}`}
                  small={!normalFontSize}
                  suffix={'%'}
                />
              )}
            </CellTooltip>
          </>
        )}
      </LayoutContext.Consumer>
    </div>
  );
}
