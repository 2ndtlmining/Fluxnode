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

export class BestUptime extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      bestUptime: 0,
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
    this.setState({
      bestUptime: node.uptime,
      hidden: false,
      nodeIpDef: node.ip_full,
      nodeIp: node.ip_display,
      nodeTier: node.tier
    });
  }

  render() {
    const { hidden, nodeIp, nodeIpDef, bestUptime } = this.state;

    const tMap = tierMapping[this.state.nodeTier] || {};
    const LogoComp = tMap.logo;

    const [uptime, uptimeUnit] = format_seconds(bestUptime).split(' ');

    return (
      <>
        <div className='best-uptime'>
          <div className='best-uptime-header'>
            <div className='title'>Best Uptime</div>
            <div className={'best-uptime-node-ip adp-text-muted' + (hidden ? ' d-none' : '')}>
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
          <div className='best-uptime-blocks'>
            <div className={'best-uptime-node-logo' + (hidden ? ' d-none' : '')}>
              <div className={'pyt-i-wrap dash-cell__nodes-' + tMap.styleSet}>
                <IconContext.Provider value={{ size: '19px', color: 'currentColor' }}>
                  {LogoComp && <LogoComp />}
                </IconContext.Provider>
              </div>
              <span className='pyt-node-tier'>{tMap.name}</span>
            </div>
            <div className='best-uptime-block'>
              <span className='adp-text-normal best-uptime-number'>{hidden ? 0 : uptime}</span>
              <span className='adp-text-normal best-uptime-info'>{uptimeUnit}</span>
            </div>
          </div>
        </div>
      </>
    );
  }
}
