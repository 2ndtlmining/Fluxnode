import React from 'react';

import './index.scss';

import { FiZap, FiCpu, FiPackage } from 'react-icons/fi';
import { IconContext } from 'react-icons';

import { format_seconds } from 'utils';

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

export class MostHostedDApp extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      mostHostedDAppCount: 0,
      hidden: true,

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

  receiveNode(node) {
    console.log(node);
    this.setState({
      mostHostedDAppCount: node.appCount,
      hidden: false,
      nodeIpDef: node.ip_full,
      nodeIp: node.ip_display,
      nodeTier: node.tier
    });
  }

  render() {
    const { hidden, nodeIp, nodeIpDef, mostHostedDAppCount } = this.state;

    const tMap = tierMapping[this.state.nodeTier] || {};
    const LogoComp = tMap.logo;

    return (
      <>
        <div className='most-hosted-d-app'>
          <div className='most-hosted-d-app-header'>
            <div className='title'>Most Hosted</div>
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
              <span className='adp-text-normal most-hosted-d-app-number'>{hidden ? 0 : mostHostedDAppCount}</span>
              <span className='adp-text-normal most-hosted-d-app-info'>App(s)</span>
            </div>
          </div>
        </div>
      </>
    );
  }
}
