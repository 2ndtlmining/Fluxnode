import { Tooltip2 } from '@blueprintjs/popover2';
import { fluxos_version_string } from 'main/flux_version';
import { gethelp, getreq__cumulus, getreq__nimbus, getreq__stratus, getreq__fractus } from 'content/index';

export const CustomTooltip = ({ componentName, displayName, gstore }) => {
  let Component;
  switch (componentName) {
    case 'rank':
      Component = RankTooltip;
      break;
    case 'last_reward':
      Component = LastRewardTooltip;
      break;
    case 'next_reward':
      Component = NextRewardTooltip;
      break;
    case 'benchmark_status':
      Component = BenchmarkTooltip;
      break;
    case 'last_confirmed_height':
      Component = MaintenanceTooltip;
      break;
    case 'flux_os':
      Component = FluxOSTooltip;
      break;
    case 'bench_version':
      Component = FluxBenchTooltip;
      break;
    case 'eps':
      Component = EPSTooltip;
      break;
    case 'ram':
      Component = RamTooltip;
      break;
    case 'cores':
      Component = CoresTooltip;
      break;
    case 'threads':
      Component = ThreadsTooltip;
      break;
    case 'dws':
      Component = DWSTooltip;
      break;
    case 'total_storage':
      Component = SizeTooltip;
      break;
    case 'down_speed':
      Component = DownloadTooltip;
      break;
    case 'up_speed':
      Component = UploadTooltip;
      break;
    case 'last_benchmark':
      Component = LastBenchmarkTooltip;
      break;
    case 'uptime':
      Component = UptimeTooltip;
      break;
    case 'appCount':
      Component = AppsTooltip;
      break;

    default:
      Component = null;
  }
  return Component ? <Component gstore={gstore} /> : <>{displayName}</>;
}

export const RankTooltip = () => {
  return (
    <TooltipTableHeader
      name='Rank'
      tooltipContent={
        <>
          <strong>Place of the node</strong> in the queue
        </>
      }
    />
  )
}

export const LastRewardTooltip = () => {
  return (<TooltipTableHeader name='Last Reward' tooltipContent={<>Day and Time of the last reward</>} />)
}

export const NextRewardTooltip = () => {
  return (<TooltipTableHeader
    name='Next Reward'
    tooltipContent={
      <>
        <strong>Estimated time</strong> to next reward payment
      </>
    }
  />)
}

export const BenchmarkTooltip = () => {
  return (<TooltipTableHeader
    name='Benchmark'
    tooltipContent={
      <div style={{ maxWidth: 320 }}>
        <div>
          <strong>Status of last performed</strong> benchmark
        </div>
        <hr />
        <div>
          <i>
            Note: This might show "Passed" even when the actual requirements are not met by the node. This
            happens when the Flux benchmarking system for that particular node does not enforce
            requirements compliance.
          </i>
        </div>
      </div>
    }
  />)
}

export const MaintenanceTooltip = () => {
  return (<TooltipTableHeader
    name='Maintenance'
    className='maintenance-tooltip-label'
    tooltipContent={
      <div style={{ maxWidth: 300 }}>
        <div>
          <strong>Maintenance Window: </strong> It shows the amount of time in minutes, a node operator
          must perform maintenance since the last time the node was confirmed on the network. Every node
          is confirmed between 240 – 320 minutes.
        </div>
        <hr />
        <div>
          <i>Closed = Do not perform maintenance, your node will be confirmed soon.</i>
        </div>
      </div>
    }
  />)
}

export const FluxOSTooltip = (props) => {
  return (<TooltipTableHeader
    name='Flux OS'
    tooltipContent={
      <>
        <div>Version of Flux OS running on the node</div>
        <div>
          <strong>Latest version:&nbsp;</strong>
          {fluxos_version_string(props?.gstore.fluxos_latest_version)}
        </div>
      </>
    }
  />)
}

export const FluxBenchTooltip = (props) => {
  return (<TooltipTableHeader
    name='Flux Bench version'
    tooltipContent={
      <>
        <div>Version of the Flux Benchmark that your node is currently running</div>
        <div>
          <strong>Latest version:&nbsp;</strong>
          {fluxos_version_string(props?.gstore.bench_latest_version)}
        </div>
      </>
    }
  />)
}

export const EPSTooltip = () => {
  return (<TooltipTableHeader name='EPS' tooltipContent={ColumnHelp('eps')} />)
}

export const RamTooltip = () => {
  return (<TooltipTableHeader name='RAM' tooltipContent={ColumnHelp('ram', ' GB')} />)
}

export const CoresTooltip = () => {
  return (<TooltipTableHeader name='Cores' tooltipContent={ColumnHelp('cores')} />)
}

export const ThreadsTooltip = () => {
  return (<TooltipTableHeader name='Threads' tooltipContent={ColumnHelp('threads')} />)
}

export const DWSTooltip = () => {
  return (<TooltipTableHeader name='DWS' tooltipContent={ColumnHelp('dws', ' MB/s')} />)
}

export const SizeTooltip = () => {
  return (<TooltipTableHeader name='Size' tooltipContent={ColumnHelp('size', ' GB')} />)
}

export const DownloadTooltip = () => {
  return (<TooltipTableHeader name='Download' tooltipContent={ColumnHelp('net_down_speed', ' Mb')} />)
}

export const UploadTooltip = () => {
  return (<TooltipTableHeader name='Upload' tooltipContent={ColumnHelp('net_up_speed', ' Mb')} />)
}

export const LastBenchmarkTooltip = () => {
  return (<TooltipTableHeader name='Last Benchmark' tooltipContent={<>Last time benchmarks was updated</>} />)
}

export const UptimeTooltip = () => {
  return (<TooltipTableHeader
    name='Uptime'
    tooltipContent={
      <div style={{ maxWidth: 300 }}>
        <div>
          Uptime is the amount of time since the Node has been started in Zelcore. If node is Offline or DOS in Zelcore the time will reset.
        </div>
      </div>
    }
  />)
}

export const AppsTooltip = () => {
  return (<TooltipTableHeader
    name='Apps'
    tooltipContent={
      <>
        <div>
          <strong>Number of applications</strong> deployed on this node
        </div>
        <div>
          <i>Click on the number to see the apps</i>
        </div>
      </>
    }
  />)
}


const TooltipTableHeader = ({ name, tooltipContent, ...otherProps }) => {
  return (
    <Tooltip2
      intent='danger'
      placement='top'
      usePortal={true}
      transitionDuration={100}
      hoverOpenDelay={60}
      targetTagName='th'
      content={tooltipContent}
      {...otherProps}
    >
      {name}
    </Tooltip2>
  );
}

const ColumnHelp = (name, valueSuffix) => (
  <>
    {gethelp(name)}
    {InlineColumnRequirementsHeader()}
    {InlineRequirementsView(name, valueSuffix)}
  </>
);

const InlineColumnRequirementsHeader = () => (
  <div className='mt-1'>
    <strong>Requirements:</strong>
  </div>
);

const InlineRequirementsView = (name, suffix) => (
  <table className='ms-4 mini-req-table'>
    <tr>
      <th className='rq-name'>Cumulus</th>
      <td>
        {getreq__cumulus(name)}
        {suffix}
      </td>
    </tr>
    <tr>
      <th className='rq-name'>Nimbus</th>
      <td>
        {getreq__nimbus(name)}
        {suffix}
      </td>
    </tr>
    <tr>
      <th className='rq-name'>Stratus</th>
      <td>
        {getreq__stratus(name)}
        {suffix}
      </td>
    </tr>
    <tr>
      <th className='rq-name'>Fractus</th>
      <td>
        {getreq__fractus(name)}
        {suffix}
      </td>
    </tr>
  </table>
);