import { Tabs, Tab } from '@blueprintjs/core';
import { Helmet } from 'react-helmet';
import { AppsTab } from 'analytics/AppsTab';
import { NetworkTab } from 'analytics/NetworkTab';
import { DonorTab } from 'analytics/DonorTab';
import { ChainActivityTab } from 'analytics/ChainActivityTab';
import { PanelGate } from 'analytics/PanelGate';
import './Analytics.scss';

// Four tabs now (Apps, Network, Donor, Chain Activity) — Session 5 lands the
// last one planned in PREMIUM_FEATURES_PLAN.md Part D.
export default function Analytics({ theme = 'dark' }) {
  return (
    <div className="analytics-page">
      <Helmet>
        <title>Analytics</title>
      </Helmet>

      <div className="analytics-page-header">
        <span className="analytics-page-title">Analytics</span>
        <span className="analytics-page-subtitle">
          Network-wide stats for FluxNode donors.
        </span>
      </div>

      <Tabs id="analytics-tabs" className="analytics-tabs" renderActiveTabPanelOnly>
        <Tab id="apps" title="Apps" panel={<AppsTab />} />
        <Tab id="network" title="Network" panel={<NetworkTab />} />
        <Tab id="donor" title="Donor" panel={
          <PanelGate panelKey="donorTab" feature="the Donor tab">
            <DonorTab />
          </PanelGate>
        } />
        <Tab id="chain-activity" title="Chain Activity" panel={
          <PanelGate panelKey="chainActivity" feature="Chain Activity">
            <ChainActivityTab theme={theme} />
          </PanelGate>
        } />
      </Tabs>
    </div>
  );
}
