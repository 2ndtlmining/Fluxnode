import React from 'react';

import './index.scss';

import { FiZap, FiCpu, FiPackage } from 'react-icons/fi';
import { IconContext } from 'react-icons';

import { Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';

const tierMapping = {
  CUMULUS: {
    styleSet: 'cumulus',
    name: 'Cumulus',
    logo: FiZap
  },
  NIMBUS: {
    styleSet: 'nimbus',
    name: 'Nimbus',
    logo: FiCpu
  },
  STRATUS: {
    styleSet: 'stratus',
    name: 'Stratus',
    logo: FiPackage
  }
};

export class MostHostedApp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      installedApps: [],
      appCount: 0,
      hidden: true,
      dataLoading: false,
      nodeIpDef: {},
      nodeIp: '',
      nodeTier: ''
    };

    this.mounted = false;
  }

  componentDidMount() {
    if (this.mounted) return;

    this.mounted = true;
  }

  loading() {
    this.setState({ dataLoading: true, hidden: true });
  }

  receiveNode(node) {
    this.setState({
      installedApps: node.installedApps,
      appCount: node.appCount,
      hidden: false,
      dataLoading: false,
      nodeIpDef: node.ip_full,
      nodeIp: node.ip_display,
      nodeTier: node.tier
    });
  }

  render() {
    const { hidden, nodeIp, nodeIpDef, appCount, dataLoading, installedApps } = this.state;

    const tMap = tierMapping[this.state.nodeTier] || {};
    const LogoComp = tMap.logo;

    const mostHostedApp = installedApps.length
      ? installedApps.reduce((prev, current) =>
          !prev.instances || prev.instances < current.instances ? current : prev
        )
      : { instances: 0 };

    return (
      <>
        <div className='most-hosted-d-app'>
          <div className='most-hosted-d-app-header'>
            <Tooltip2
              intent='danger'
              placement='top'
              usePortal={true}
              transitionDuration={100}
              hoverOpenDelay={60}
              content={
                mostHostedApp && (
                  <div style={{ maxWidth: 300 }}>
                    <div>
                      <strong>Description:</strong>
                    </div>
                    <hr />
                    <div>
                      <em>{mostHostedApp.description}</em>
                    </div>
                  </div>
                )
              }
            >
              <div className='title'>Most Hosted App: {mostHostedApp.name}</div>
            </Tooltip2>

            <div className={'most-hosted-d-app-node-ip adp-text-muted' + (hidden ? ' d-none' : '')}>
              <strong>Node IP:&nbsp;</strong>
              {nodeIp ? (
                <a target='_blank' href={`http://${nodeIpDef.host}:${nodeIpDef.active_port_os}`}>
                  {nodeIp}
                </a>
              ) : (
                <i> -Unknown- </i>
              )}
            </div>
          </div>
          {dataLoading ? (
            <Spinner intent='primary' size={90} style={{ margin: 'auto auto 10px auto' }} />
          ) : (
            <div className='most-hosted-d-app-blocks'>
              <div className={'most-hosted-d-app-node-logo' + (hidden ? ' d-none' : '')}>
                <div className={'pyt-i-wrap dash-cell__nodes-' + tMap.styleSet}>
                  <IconContext.Provider value={{ size: '19px', color: 'currentColor' }}>
                    {LogoComp && <LogoComp />}
                  </IconContext.Provider>
                </div>
                <span className='pyt-node-tier'>{tMap.name}</span>
              </div>

              <div className='most-hosted-d-app-block'>
                <span className='adp-text-normal most-hosted-d-app-number'>{hidden ? 0 : mostHostedApp.instances}</span>
                <span className='adp-text-normal most-hosted-d-app-info'>Instances(s)</span>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }
}
