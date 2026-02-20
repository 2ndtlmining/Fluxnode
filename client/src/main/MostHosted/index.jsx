import React from 'react';

import './index.scss';

import { IconContext } from 'react-icons';
import { tierMapping } from 'content/index';

import { Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { hide_sensitive_number } from 'utils';
import { LayoutContext } from 'contexts/LayoutContext';
import CountUp from 'components/CountUp';


export class MostHosted extends React.Component {
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
      //nodeTier: node.thunder ? 'FRACTUS' : node.tier
    });
  }

  render() {
    const { hidden, nodeIp, nodeIpDef, appCount, dataLoading, installedApps, nodeTier } = this.state;

    const tMap = tierMapping[nodeTier] || {};
    const LogoComp = tMap.logo;

    return (
      <LayoutContext.Consumer>
        {({ enablePrivacyMode, normalFontSize }) => {
          const suffixClassName = normalFontSize ? '' : '-small';
          const iconSize = normalFontSize ? '28px' : '19px';

          return (
            <>
              <div className='most-hosted-app'>
                <div className='most-hosted-app-header'>
                  <div className={`title${suffixClassName}`}>Most Hosted Node</div>

                  <div className={'most-hosted-app-node-ip adp-text-muted' + (hidden ? ' d-none' : '')}>
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
                  <div className='most-hosted-app-blocks'>
                    <div className={'most-hosted-app-node-logo' + (hidden ? ' d-none' : '')}>
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
                        installedApps?.length ? (
                          <div style={{ maxWidth: 300 }}>
                            <div>
                              <strong>{appCount} apps:</strong>
                            </div>
                            {installedApps.map((app) => (
                              <div key={app.hash}>
                                <hr />
                                <strong>{app.name}</strong> - <em>{app.description}</em>
                              </div>
                            ))}
                          </div>
                        ) : null
                      }
                    >
                      <div className={`most-hosted-app-block${suffixClassName}`}>
                        <span className='adp-text-normal most-hosted-app-number'>
                          {hidden ? 0 : <CountUp end={appCount} separator=',' duration={2} />}
                        </span>
                        <span className='adp-text-normal most-hosted-app-info'>App(s)</span>
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
