import { useContext } from 'react';
import { Classes, Popover2 } from '@blueprintjs/popover2';
import { calculate_float_number } from 'utils';
import { InfoCell } from 'components/InfoCell';
import { RadialCircularProgressbar } from 'components/RadialCircularProgressbar';
import { LayoutContext } from 'contexts/LayoutContext';

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

export function UtilizationBars({ gstore: gs }) {
  const { normalFontSize } = useContext(LayoutContext);
  const iconSize = normalFontSize ? '28px' : '22px';
  const suffixClassName = normalFontSize ? '' : '-small';

  return (
    <>
      <CellTooltip tooltipContent={<UtilizationView utilized={gs.utilized.nodes} total={gs.node_count.total} />}>
        {(ref, tooltipProps) => (
          <InfoCell
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
                  height: `${8}%`
                }}
              />
            }
            iconWrapClassName={`dash-cell__utilization-percentage${suffixClassName}`}
            small={!normalFontSize}
            suffix={'%'}
            className='dcell'
          />
        )}
      </CellTooltip>

      <CellTooltip
        tooltipContent={<UtilizationView utilized={gs.utilized.cores} total={gs.total.cores} suffix='vCores' />}
      >
        {(ref, tooltipProps) => (
          <InfoCell
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
                  height: `${8}%`
                }}
              />
            }
            iconWrapClassName={`dash-cell__utilization-percentage${suffixClassName}`}
            small={!normalFontSize}
            suffix={'%'}
            className='dcell'
          />
        )}
      </CellTooltip>

      <CellTooltip
        tooltipContent={<UtilizationView utilized={gs.utilized.ram} total={gs.total.ram} suffix='TB' />}
      >
        {(ref, tooltipProps) => (
          <InfoCell
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
                  height: `${8}%`
                }}
              />
            }
            iconWrapClassName={`dash-cell__utilization-percentage${suffixClassName}`}
            small={!normalFontSize}
            suffix={'%'}
            className='dcell'
          />
        )}
      </CellTooltip>

      <CellTooltip
        tooltipContent={<UtilizationView utilized={gs.utilized.ssd} total={gs.total.ssd} suffix='TB' />}
      >
        {(ref, tooltipProps) => (
          <InfoCell
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
                  height: `${8}%`
                }}
              />
            }
            iconWrapClassName={`dash-cell__utilization-percentage${suffixClassName}`}
            small={!normalFontSize}
            suffix={'%'}
            className='dcell'
          />
        )}
      </CellTooltip>
    </>
  );
}
