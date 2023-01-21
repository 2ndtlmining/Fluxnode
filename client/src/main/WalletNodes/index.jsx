import React from 'react';
import './index.scss';

import { Icon, Button, Tag, Spinner, ProgressBar, NonIdealState, NonIdealStateIconSize } from '@blueprintjs/core';
import { Classes as PClasses, Popover2, Tooltip2 } from '@blueprintjs/popover2';

import { sleep, format_seconds, hide_sensitive_number } from 'utils';

import { Projection } from './Projection';
import { gethelp, getreq, getreq__cumulus, getreq__nimbus, getreq__stratus } from 'content/index';

import { fluxos_version_desc, fluxos_version_string, fv_compare } from 'main/flux_version';
import {
  create_global_store,
  getWalletNodes,
  wallet_health_full,
  normalize_raw_node_tier,
  fill_health,
  fillPartialNode,
  transformRawNode,
  isWalletDOSState,
  calc_mtn_window,
  fetchMostHostedLocalApps
} from 'main/apidata';
import { LayoutContext } from 'contexts/LayoutContext';
import { setGAEvent } from 'g-analytic';

function NodeTierView(tier) {
  if (tier == 'CUMULUS')
    return (
      <Tag large minimal intent='primary'>
        CUMULUS
      </Tag>
    );

  if (tier == 'NIMBUS')
    return (
      <Tag large minimal intent='warning'>
        NIMBUS
      </Tag>
    );

  if (tier == 'STRATUS')
    return (
      <Tag large minimal intent='danger'>
        STRATUS
      </Tag>
    );

  return (
    <Tag large minimal intent='none'>
      UNKNOWN
    </Tag>
  );
}

function NodeStatusView(status, fluxos, is_fluxos_outdated) {
  if (status == 'failed')
    return (
      <Tag round large intent='danger' rightIcon='error'>
        Failed
      </Tag>
    );

  if (status == 'passed') {
    const intent = is_fluxos_outdated(fluxos) ? 'warning' : 'success';
    return (
      <Tag round large intent={intent} rightIcon='tick-circle'>
        Passed
      </Tag>
    );
  }

  if (status == 'offline')
    return (
      <Tag round large minimal intent='warning' rightIcon='warning-sign'>
        Offline
      </Tag>
    );

  if (status == 'running')
    return (
      <Tag round minimal large intent='primary' rightIcon='time'>
        Running
      </Tag>
    );

  return (
    <Tag round large intent='none' rightIcon='lock'>
      Unknown
    </Tag>
  );
}

function NodeMaintenanceStatusView(status, is_mtn_closed) {
  if (is_mtn_closed(status))
    return (
      <Tag className='closed-maintenance-window' round large fill intent='warning' rightIcon='issue' color='white'>
        {status}
      </Tag>
    );

  return (
    <Tag round large fill intent='success' rightIcon='tick-circle'>
      {status}
    </Tag>
  );
}

function NodesPlaceholder() {
  // prettier-ignore
  return (
    <tr>
      <td colSpan='19'>No Nodes</td>
    </tr>
  );
}

function TooltipTableHeader({ name, tooltipContent, ...otherProps }) {
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
  </table>
);

const ColumnHelp = (name, valueSuffix) => (
  <>
    {gethelp(name)}
    {InlineColumnRequirementsHeader()}
    {InlineRequirementsView(name, valueSuffix)}
  </>
);

function NodeGridTable(nodes, gstore) {
  const nodeRowBuilder = _CreateNodeBuilder(gstore);

  return (
    <>
      <div className='table-wrapper' id='gtable'>
        <div className='table-responsive'>
          <table className='table adp-table'>
            <thead>
              <tr className=''>
                <th className='al'>IP</th>
                <th>Tier</th>
                <TooltipTableHeader
                  name='Rank'
                  tooltipContent={
                    <>
                      <strong>Place of the node</strong> in the queue
                    </>
                  }
                />
                <TooltipTableHeader name='Last Reward' tooltipContent={<>Day and Time of the last reward</>} />
                <TooltipTableHeader
                  name='Next Reward'
                  tooltipContent={
                    <>
                      <strong>Estimated time</strong> to next reward payment
                    </>
                  }
                />
                <TooltipTableHeader
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
                />
                <TooltipTableHeader
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
                />
                <TooltipTableHeader
                  name='Flux OS'
                  tooltipContent={
                    <>
                      <div>Version of Flux OS running on the node</div>
                      <div>
                        <strong>Latest version:&nbsp;</strong>
                        {fluxos_version_string(gstore.fluxos_latest_version)}
                      </div>
                    </>
                  }
                />
                <TooltipTableHeader
                  name='Flux Bench version'
                  tooltipContent={
                    <>
                      <div>Version of the Flux Benchmark that your node is currently running</div>
                      <div>
                        <strong>Latest version:&nbsp;</strong>
                        {fluxos_version_string(gstore.bench_latest_version)}
                      </div>
                    </>
                  }
                />
                <TooltipTableHeader name='EPS' tooltipContent={ColumnHelp('eps')} />
                <TooltipTableHeader name='RAM' tooltipContent={ColumnHelp('ram', ' GB')} />
                <TooltipTableHeader name='Cores' tooltipContent={ColumnHelp('cores')} />
                <TooltipTableHeader name='Threads' tooltipContent={ColumnHelp('threads')} />
                <TooltipTableHeader name='DWS' tooltipContent={ColumnHelp('dws', ' MB/s')} />
                <TooltipTableHeader name='Size' tooltipContent={ColumnHelp('size', ' GB')} />
                <TooltipTableHeader name='Download' tooltipContent={ColumnHelp('net_down_speed', ' Mb')} />
                <TooltipTableHeader name='Upload' tooltipContent={ColumnHelp('net_up_speed', ' Mb')} />
                <TooltipTableHeader name='Last Benchmark' tooltipContent={<>Last time benchmarks was updated</>} />
                <TooltipTableHeader
                  name='Uptime'
                  tooltipContent={
                    <div style={{ maxWidth: 300 }}>
                      <div>
                        Uptime is the amount of time Flux OS has been up. If Flux OS updates or restarts will reset the
                        timer.
                      </div>
                    </div>
                  }
                />
                <TooltipTableHeader
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
                />
              </tr>
            </thead>
            <tbody>
              {nodes.length == 0 ? NodesPlaceholder() : nodes.map((node) => (!node ? null : nodeRowBuilder(node)))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function _fs_compare(node, req, keyNode, keyReq = null) {
  if (keyReq == null) keyReq = keyNode;
  return !node[keyNode] || !req[keyReq] || node[keyNode] < req[keyReq];
}

function _failed_specs(node) {
  const tier = node.tier;
  let reqObj = {};
  if (tier == 'CUMULUS') reqObj = getreq('cumulus', true);
  else if (tier == 'NIMBUS') reqObj = getreq('nimbus', true);
  else if (tier == 'STRATUS') reqObj = getreq('stratus', true);

  const failed = {};
  // prettier-ignore
  {
    failed.cores = _fs_compare(node, reqObj, 'cores');
    failed.threads = _fs_compare(node, reqObj, 'threads');
    // Allow a difference of 3 GB since RAM sizes are mosty a few gigs short when reported
    failed.ram = !node.ram || !reqObj.ram || reqObj.ram - node.ram > 3.0;
    failed.dws = _fs_compare(node, reqObj, 'dws');
    failed.eps = _fs_compare(node, reqObj, 'eps');

    failed.total_storage = _fs_compare(node, reqObj, 'total_storage', 'size');
    failed.down_speed = _fs_compare(node, reqObj, 'down_speed', 'net_down_speed');
    failed.up_speed = _fs_compare(node, reqObj, 'up_speed', 'net_up_speed');
  }

  return failed;
}

const _FAILED_PROPS = { className: 'text-danger fw-bolder' };
const MarkIfFailed = (failureInfo) => (name) => failureInfo[name] ? _FAILED_PROPS : {};

function _CreateNodeBuilder(gstore) {
  const is_fluxos_outdated = (fluxos) => fv_compare(fluxos, gstore.fluxos_latest_version) == -1;
  const is_bench_outdated = (bench_version) => fv_compare(bench_version, gstore.bench_latest_version) == -1;
  const is_mtn_closed = (mtn) => typeof mtn === 'string' && mtn.toLowerCase() === 'closed';

  return function (node) {
    let dashboardUrl = `http://${node.ip_full.host}:${node.ip_full.active_port_os}`;

    // = "failed node props"
    const flp = MarkIfFailed(_failed_specs(node));

    const mtn_value = calc_mtn_window(node.last_confirmed_height, gstore.current_block_height);

    return (
      <tr key={node.id}>
        <LayoutContext.Consumer>
          {({ enablePrivacyMode }) => (
            <td className='al'>
              {node.ip_display ? (
                <a target='_blank' href={dashboardUrl}>
                  {!enablePrivacyMode ? node.ip_display : hide_sensitive_number(node.ip_display)}
                </a>
              ) : (
                '-'
              )}
            </td>
          )}
        </LayoutContext.Consumer>
        <td>{NodeTierView(node.tier)}</td>
        <td>{node.rank}</td>
        <td>{node.last_reward}</td>
        <td>{node.next_reward}</td>
        <td>{NodeStatusView(node.benchmark_status, node.flux_os, is_fluxos_outdated)}</td>
        <td>{NodeMaintenanceStatusView(mtn_value, is_mtn_closed)}</td>
        <td className={is_fluxos_outdated(node.flux_os) ? 'fw-bolder outdated-flux-ver' : ''}>
          {fluxos_version_string(node.flux_os)}
        </td>
        <td className={is_bench_outdated(node.bench_version) ? 'fw-bolder outdated-flux-ver' : ''}>
          {fluxos_version_string(node.bench_version)}
        </td>
        <td {...flp('eps')}>{node.eps.toFixed(2)}</td>
        <td {...flp('ram')}>{node.ram.toFixed(2)} GB</td>
        <td {...flp('cores')}>{node.cores}</td>
        <td {...flp('threads')}>{node.threads}</td>
        <td {...flp('dws')}>{node.dws.toFixed(2)}</td>
        <td {...flp('total_storage')}>{node.total_storage.toFixed(2)} GB</td>
        <td {...flp('down_speed')}>{node.down_speed.toFixed(2)} Mb/s</td>
        <td {...flp('up_speed')}>{node.up_speed.toFixed(2)} Mb/s</td>
        <td>{node.last_benchmark}</td>
        <td> {format_seconds(node.uptime)} </td>
        <td>
          <a target='_blank' href={`${dashboardUrl}/apps/localapps`}>
            <Tag round minimal large interactive intent={node.appCount == 0 ? 'none' : 'success'}>
              {node.appCount}
            </Tag>
          </a>
        </td>
      </tr>
    );
  };
}

/*
function _NodeRow(node, is_fluxos_outdated) {
  let dashboardUrl = `http://${node.ip_full.host}:${node.ip_full.active_port_os}`;

  // = "failed node props"
  const flp = MarkIfFailed(_failed_specs(node));

  return (
    <tr key={node.id}>
      <td className='al'>
        {node.ip_display ? (
          <a target='_blank' href={dashboardUrl}>
            {node.ip_display}
          </a>
        ) : (
          '-'
        )}
      </td>
      <td>{NodeTierView(node.tier)}</td>
      <td>{node.rank}</td>
      <td>{node.last_reward}</td>
      <td>{node.next_reward}</td>
      <td>{NodeStatusView(node.benchmark_status, node.flux_os, is_fluxos_outdated)}</td>
      <td className={is_fluxos_outdated(node.flux_os) ? 'fw-bolder outdated-flux-ver' : ''}>
        {fluxos_version_string(node.flux_os)}
      </td>
      <td {...flp('eps')}>{node.eps.toFixed(2)}</td>
      <td {...flp('ram')}>{node.ram.toFixed(2)} GB</td>
      <td {...flp('cores')}>{node.cores}</td>
      <td {...flp('threads')}>{node.threads}</td>
      <td {...flp('dws')}>{node.dws.toFixed(2)}</td>
      <td {...flp('total_storage')}>{node.total_storage.toFixed(2)} GB</td>
      <td {...flp('down_speed')}>{node.down_speed.toFixed(2)} Mb/s</td>
      <td {...flp('up_speed')}>{node.up_speed.toFixed(2)} Mb/s</td>
      <td>{node.last_benchmark}</td>
      <td>
        <a target='_blank' href={`${dashboardUrl}/apps/localapps`}>
          <Tag round minimal large interactive intent={node.appCount == 0 ? 'none' : 'success'}>
            {node.appCount}
          </Tag>
        </a>
      </td>
    </tr>
  );
}
*/

export class WalletNodes extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      loadingHealth: false,
      loadingNodeList: false,

      nodesListProgress: 0,

      nodes: [],
      health: wallet_health_full(),
      gstore: null
    };
  }

  updateNodesListProgress(value) {
    this.setState({ nodesListProgress: Math.max(0.05, value) });
  }

  async _loadNodes(partialNodes) {
    this.updateNodesListProgress(0);
    await sleep(1);

    const batchSize = 20;
    for (let i = 0; i < partialNodes.length; ) {
      const batch = [];

      let batchActualSize = 0;

      while (batchActualSize < batchSize) {
        const rawIndex = i + batchActualSize;
        if (rawIndex >= partialNodes.length) break;

        ++batchActualSize;
        const raw = partialNodes[rawIndex];
        batch.push(fillPartialNode(raw));
      }

      if (batchActualSize == 0)
        // Weird behaviour for Promise.allSettled when list is empty
        break;

      // fillPartialNode() modifies the node in place
      await Promise.allSettled(batch);

      i += batchSize;

      const lastIndex = Math.min(i, partialNodes.length);

      this.updateNodesListProgress((lastIndex + 1) / partialNodes.length);
      console.log('Processed batch nodes upto count ' + lastIndex);
      await sleep(1);
    }
    return partialNodes;
  }

  async processAddress(address, gstore, onCalculateHighestRankNodes, onCalculateBestUptimeAndMostHostedNodes) {
    this.setState({
      loadingHealth: true,
      loadingNodeList: true,
      nodesListProgress: 0,
      gstore: gstore
    });
    await sleep(1);

    const walletNodesRaw = await getWalletNodes(address);

    let partialNodes = [];

    let highestRankedNode = null;

    const health = wallet_health_full();

    for (const walletNodeRaw of walletNodesRaw) {
      const pNode = transformRawNode(walletNodeRaw);

      partialNodes.push(pNode);

      /* Highest rank is the once which has the lowest value */
      if (!highestRankedNode || pNode.rank < highestRankedNode.rank) highestRankedNode = pNode;

      switch (pNode.tier) {
        case 'CUMULUS':
          health.cumulus.node_count++;
          break;
        case 'NIMBUS':
          health.nimbus.node_count++;
          break;
        case 'STRATUS':
          health.stratus.node_count++;
          break;

        default:
          break;
      }
    }

    if (highestRankedNode != null) onCalculateHighestRankNodes(highestRankedNode);

    health.total_nodes = health.cumulus.node_count + health.nimbus.node_count + health.stratus.node_count;
    fill_health(health, gstore);
    this.setState({ loadingHealth: false, health });

    let nodes = await this._loadNodes(partialNodes);
    this.setState({ loadingNodeList: false, nodes });

    let bestUptimeNode = null;

    let mostHostedNode = null;

    for (const node of nodes) {
      if (bestUptimeNode === null || node.uptime > bestUptimeNode.uptime) bestUptimeNode = node;
      if (mostHostedNode === null || node.appCount > mostHostedNode.appCount) mostHostedNode = node;
    }

    onCalculateBestUptimeAndMostHostedNodes({ bestUptimeNode, mostHostedNode });
  }

  handleRefreshClick = () => {
    this.props.onRefreshRequest();
    setGAEvent({ category: 'Refresh Button', action: 'Click refresh button'});
  };

  renderNodeOverview(loadingHealth, loadingNodeList) {
    const activeAddress = this.props.activeAddress;
    const noAddress = activeAddress == null;

    if (loadingNodeList) {
      return (
        <div className='flex-fill center-everything px-5'>
          {loadingHealth ? (
            <Spinner intent='success' size={150} />
          ) : (
            <ProgressBar animate intent='success' stripes={true} value={this.state.nodesListProgress} />
          )}
        </div>
      );
    }

    return (
      <>
        <div id='table-header-wrap'>
          <div className='table-header'>
            <span className='title adp-text-normal'>
              Nodes Overview
              <br />
              <span className='adp-text-muted overview-info-subtitle'>
                Hover mouse over a column header to see more information.
              </span>
            </span>
            <Button
              text='Refresh'
              rightIcon='refresh'
              intent='success'
              onClick={this.handleRefreshClick}
              disabled={loadingNodeList || noAddress}
              outlined={true}
            />
          </div>
        </div>
        {NodeGridTable(this.state.nodes, this.state.gstore || this.props.initGStore)}
      </>
    );
  }

  render() {
    const { parentLoading } = this.props;

    const loadingHealth = parentLoading || this.state.loadingHealth;
    const loadingNodeList = parentLoading || this.state.loadingNodeList;

    const estimatedEarningsTab = (
      <LayoutContext.Consumer>
        {({ enableEstimatedEarningsTab }) =>
          enableEstimatedEarningsTab ? (
            <div className='health-wrapper mb-3 mx-1 p-0'>
              <Projection loading={loadingHealth} health={this.state.health} />
            </div>
          ) : null
        }
      </LayoutContext.Consumer>
    );

    return (
      <div className='wallet-nodes-area'>
        {estimatedEarningsTab}
        <div className='adp-border overview-wrapper mb-3 p-0 shadow-lg rounded-3 adp-bg-normal'>
          {this.renderNodeOverview(loadingHealth, loadingNodeList)}
        </div>
      </div>
    );
  }
}
