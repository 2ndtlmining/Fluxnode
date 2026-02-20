import React from 'react';

import './index.scss';

import { Spinner } from '@blueprintjs/core';

import { IconContext } from 'react-icons';
import { tierMapping } from 'content/index';

import { format_seconds, hide_sensitive_number } from 'utils';
import { Tooltip2 } from '@blueprintjs/popover2';
import { LayoutContext } from 'contexts/LayoutContext';
import CountUp from 'components/CountUp';


export class BestUptime extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      bestUptime: 0,
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
      bestUptime: node.uptime,
      dataLoading: false,
      hidden: false,
      nodeIpDef: node.ip_full,
      nodeIp: node.ip_display,
      //nodeTier: node.thunder ? 'FRACTUS' : node.tier
    });
  }

  render() {
    const { hidden, nodeIp, nodeIpDef, bestUptime, dataLoading, nodeTier } = this.state;

    const tMap = tierMapping[nodeTier] || {};
    const LogoComp = tMap.logo;

    const [uptime, uptimeUnit] = format_seconds(bestUptime).split(' ');

    return (
      <LayoutContext.Consumer>
        {({ enablePrivacyMode, normalFontSize }) => {
          const suffixClassName = normalFontSize ? '' : '-small';
          const iconSize = normalFontSize ? '28px' : '19px';

          return (
            <>
              <div className='best-uptime'>
                <div className='best-uptime-header'>
                  <div className={`title${suffixClassName}`}>Best Uptime</div>
                  <div className={'best-uptime-node-ip adp-text-muted' + (hidden ? ' d-none' : '')}>
                    <strong>Node IP:&nbsp;</strong>
                    {nodeIp ? (
                      <a target='_blank' href={`http://${nodeIpDef.host}:${nodeIpDef.active_port_os}`}>
                        {enablePrivacyMode ? hide_sensitive_number(nodeIp) : nodeIp}
                      </a>
                    ) : (
                      <i> -Unknown- </i>
                    )}
                  </div>
                </div>
                {dataLoading ? (
                  <Spinner intent='primary' size={90} style={{ margin: 'auto auto 10px auto' }} />
                ) : (
                  <div className='best-uptime-blocks'>
                    <div className={'best-uptime-node-logo' + (hidden ? ' d-none' : '')}>
                      <div className={'pyt-i-wrap dash-cell__nodes-' + tMap.styleSet}>
                        <IconContext.Provider value={{ size: iconSize, color: 'currentColor' }}>
                          {LogoComp && <LogoComp />}
                        </IconContext.Provider>
                      </div>
                      <span className='pyt-node-tier'>{tMap.name}</span>
                    </div>
                    <Tooltip2
                      intent='danger'
                      placement='top'
                      usePortal={true}
                      transitionDuration={100}
                      hoverOpenDelay={60}
                      content={
                        'Uptime is the amount of time this node has been consistently on since the last restart.'
                      }
                    >
                      <div className={`best-uptime-block${suffixClassName}`}>
                        <span className='adp-text-normal best-uptime-number'>
                          {hidden ? 0 : <CountUp separator=',' end={uptime} duration={2} />}
                        </span>
                        <span className='adp-text-normal best-uptime-info'>{uptimeUnit}</span>
                      </div>
                    </Tooltip2>
                  </div>
                )}
              </div>
            </>
          );
        }}
      </LayoutContext.Consumer>
    );
  }
}
