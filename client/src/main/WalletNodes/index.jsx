import React from 'react';
import './index.scss';

import { Button, Spinner, ProgressBar } from '@blueprintjs/core';

import { isIOS, sleep } from 'utils';

import { Projection } from './Projection';
import {
  getWalletNodes,
  wallet_health_full,
  fill_health,
  fillPartialNode,
  transformRawNode,
  getEnterpriseNodes
} from 'main/apidata';
import { LayoutContext } from 'contexts/LayoutContext';
//import { setGAEvent } from 'g-analytic';
import { NodeGridTable as NodeGridTableV2 } from 'components/NodeGridTable';
import ReactFullscreen from 'react-easyfullscreen';

export class WalletNodes extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      loadingHealth: false,
      loadingNodeList: false,
      loadingWalletNodes: false,

      nodesListProgress: 0,

      nodes: [],
      health: wallet_health_full(),
      gstore: null,
      isFullScreen: false,
      isMaximize: false
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

      this.setState({ nodes: partialNodes.slice(0, i) });

      const lastIndex = Math.min(i, partialNodes.length);

      this.updateNodesListProgress((lastIndex + 1) / partialNodes.length);
      await sleep(1);
    }
    return partialNodes;
  }

  async processAddress(address, gstore, onCalculateNotableNodes) {
    this.setState({
      loadingHealth: true,
      loadingNodeList: true,
      loadingWalletNodes: true,
      nodesListProgress: 0,
      gstore: gstore
    });
    await sleep(1);

    const enterpriseNodesRaw = await getEnterpriseNodes();
    console.log('enterpriseNodesRaw', enterpriseNodesRaw);

    const enterpriseNodesFiltered = enterpriseNodesRaw?.filter((item) => item?.payment_address === address);
    console.log('enterpriseNodesFiltered', enterpriseNodesFiltered);

    const walletNodesRaw = await getWalletNodes(address).then((res) => {
      this.setState({ loadingWalletNodes: false });
      return res;
    });

    let partialNodes = [];

    const health = wallet_health_full();

    partialNodes = walletNodesRaw.map((rawNode) => transformRawNode(rawNode));
    enterpriseNodesFiltered.map((filterNode) => {
      partialNodes = partialNodes.map((pNode) => {
        if (pNode?.id === filterNode?.ip) {
          return {
            ...pNode,
            score: filterNode?.score || 0
          };
        }

        return pNode;
      });
    });

    this.setState({ totalNodeOverviewPages: Math.round(walletNodesRaw.length / 20) });

    let nodes = await this._loadNodes(partialNodes).then((res) => {
      this.setState({ loadingNodeList: false });
      return res;
    });

    let highestRankedNode = null;
    let bestUptimeNode = null;
    let mostHostedNode = null;

    for (const node of nodes) {
      const { tier, thunder } = node;
      switch (tier) {
        case 'CUMULUS':
          // Fractus - Thunder: True | Cumulus - Thunder: False
          //thunder ? health.fractus.node_count++ : health.cumulus.node_count++;
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
      /* Highest rank is the once which has the lowest value */
      if (!highestRankedNode || node.rank < highestRankedNode.rank) highestRankedNode = node;
      if (bestUptimeNode === null || node.uptime > bestUptimeNode.uptime) bestUptimeNode = node;
      if (mostHostedNode === null || node.appCount > mostHostedNode.appCount) mostHostedNode = node;
    }

    health.total_nodes =
      //health.cumulus.node_count + health.nimbus.node_count + health.stratus.node_count + health.fractus.node_count;
        health.cumulus.node_count + health.nimbus.node_count + health.stratus.node_count;
    fill_health(health, gstore);
    this.setState({ loadingHealth: false, health });

    onCalculateNotableNodes({ highestRankedNode, bestUptimeNode, mostHostedNode });
  }

  handleRefreshClick = () => {
    this.props.onRefreshRequest();
    //setGAEvent({ category: 'Refresh Button', action: 'Click refresh button' });
  };

  renderNodeOverview(loadingWalletNodes, loadingNodeList, onToggleFullScreen) {
    const activeAddress = this.props.activeAddress;
    const noAddress = activeAddress == null;
    const { isMaximize, isFullScreen } = this.state;

    if (loadingWalletNodes) {
      return (
        <div className='flex-fill center-everything px-5'>
          <Spinner intent='success' size={150} />
        </div>
      );
    }

    return (
      <>
        <div id='table-header-wrap'>
          {loadingNodeList && (
            <ProgressBar animate intent='success' stripes={true} value={this.state.nodesListProgress} />
          )}
        </div>
        <NodeGridTableV2
          handleRefreshClick={this.handleRefreshClick}
          loadingNodeList={loadingNodeList}
          noAddress={noAddress}
          isMaximize={isMaximize}
          onToggleFullScreen={onToggleFullScreen}
          isFullScreen={isFullScreen}
          data={this.state.nodes}
          gstore={this.state.gstore || this.props.initGStore}
          theme={this.props.theme}
        />
      </>
    );
  }

  render() {
    const { parentLoading } = this.props;

    const loadingHealth = parentLoading || this.state.loadingHealth;
    const loadingNodeList = parentLoading || this.state.loadingNodeList;
    const loadingWalletNodes = parentLoading || this.state.loadingWalletNodes;

    const overviewWrapperClass = this.state.isMaximize ? 'overview-wrapper-expand' : 'overview-wrapper';
    const healthWrapperClass = this.state.isMaximize ? 'health-wrapper-expand' : 'health-wrapper';

    const estimatedEarningsTab = (
      <LayoutContext.Consumer>
        {({ enableEstimatedEarningsTab }) =>
          enableEstimatedEarningsTab ? (
            <div className={`${healthWrapperClass} mb-3 me-1 p-0`}>
              <Projection loading={loadingHealth} health={this.state.health} />
            </div>
          ) : null
        }
      </LayoutContext.Consumer>
    );

    return (
      <div className='wallet-nodes-area'>
        {estimatedEarningsTab}
        {!isIOS() ? (
          <ReactFullscreen onChange={() => this.setState((prev) => ({ isFullScreen: !prev.isFullScreen }))}>
            {({ ref, onToggle: onToggleFullScreen }) => (
              <div
                ref={ref}
                className={`adp-border ${overviewWrapperClass} mb-3 p-0 shadow-lg rounded-3 adp-bg-normal`}
              >
                {this.renderNodeOverview(loadingWalletNodes, loadingNodeList, onToggleFullScreen)}
              </div>
            )}
          </ReactFullscreen>
        ) : (
          <div className={`adp-border ${overviewWrapperClass} mb-3 p-0 shadow-lg rounded-3 adp-bg-normal`}>
            {this.renderNodeOverview(loadingWalletNodes, loadingNodeList)}
          </div>
        )}
      </div>
    );
  }
}
