import React, { useContext, useMemo } from 'react';
import './index.scss';

import { Button, Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { IconContext } from 'react-icons';
import { FaLock, FaGamepad } from 'react-icons/fa';
import {
  FiCpu,
  FiDatabase,
  FiLink,
  FiBox,
  FiZap,
} from 'react-icons/fi';

import ReactCountryFlag from 'react-country-flag';
import { LayoutContext } from 'contexts/LayoutContext';
import { computeAchievements, TIER } from './achievements';
import { analyzeAppCategories } from './appCategories';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_COLORS = {
  [TIER.BRONZE]: '#cd7f32',
  [TIER.SILVER]: '#C0C0C0',
  [TIER.GOLD]: '#FFD700',
  [TIER.PLATINUM]: '#E5E4E2',
};

const FILTER_LABELS = { all: 'All', earned: 'Earned', locked: 'Locked' };

const CATEGORY_LABELS = {
  all: 'All',
  nodes: 'Nodes',
  network: 'Network',
  performance: 'Performance',
  apps: 'Apps',
  geo: 'Geographic',
};

const APP_CATEGORY_ICONS = {
  computing: FiCpu,
  gaming: FaGamepad,
  communication: FiLink,
  web: FiBox,
  blockchain: FiLink,
  database: FiDatabase,
  devops: FiBox,
  media: FiZap,
  ai: FiCpu,
  other: FiBox,
};

const APP_CATEGORY_DISPLAY = {
  computing: 'Computing',
  gaming: 'Gaming',
  communication: 'Communication',
  web: 'Web / CMS',
  blockchain: 'Blockchain',
  database: 'Database',
  devops: 'DevOps / CI',
  media: 'Media',
  ai: 'AI / ML',
  other: 'Other',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function TierPill({ tier }) {
  return (
    <span className={`gami-tier-pill gami-tier-${tier}`}>
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}

function AchievementCard({ achievement }) {
  const { Icon: AchIcon, name, description, hint, tier, earned, progress, progressLabel, countryCode } =
    achievement;
  const color = TIER_COLORS[tier];

  return (
    <Tooltip2
      usePortal
      placement='top'
      transitionDuration={100}
      hoverOpenDelay={80}
      content={
        <div style={{ maxWidth: 210, padding: '2px 0' }}>
          <div>
            <strong>{name}</strong>
          </div>
          <div style={{ marginTop: 4, fontSize: '0.84em' }}>
            {earned ? description : hint}
          </div>
          {progressLabel && (
            <div style={{ marginTop: 4, fontSize: '0.78em', opacity: 0.7 }}>
              {progressLabel}
            </div>
          )}
        </div>
      }
    >
      <div
        className={earned ? 'gami-card--earned' : 'gami-card--locked'}
        style={earned ? { borderColor: `${color}66`, boxShadow: `0 0 10px ${color}28` } : undefined}
      >
        <div className='gami-card-icon' style={{ color: earned ? color : undefined }}>
          {countryCode ? (
            <ReactCountryFlag
              countryCode={countryCode}
              svg
              style={{ width: '26px', height: '20px', borderRadius: 2 }}
              title={countryCode}
            />
          ) : (
            <IconContext.Provider value={{ size: earned ? '22px' : '18px' }}>
              {earned ? <AchIcon /> : <FaLock />}
            </IconContext.Provider>
          )}
        </div>
        <TierPill tier={tier} />
        <div className='gami-card-name'>{name}</div>
        {progress !== null && (
          <div className='gami-card-progress'>
            <div className='gami-progress-bar'>
              <div
                className='gami-progress-fill'
                style={{
                  width: `${progress}%`,
                  background: `linear-gradient(90deg, ${color}99, ${color})`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Tooltip2>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function GamificationSection({ gstore, walletNodes, walletPASummary, totalDonations, globalRankings }) {
  const { enablePrivacyMode } = useContext(LayoutContext);

  const [filter, setFilter] = React.useState('all');
  const [categoryFilter, setCategoryFilter] = React.useState('all');

  const achievements = useMemo(
    () => computeAchievements(gstore, walletNodes, walletPASummary, totalDonations, globalRankings, enablePrivacyMode),
    [gstore, walletNodes, walletPASummary, totalDonations, globalRankings, enablePrivacyMode]
  );

  const appCategories = useMemo(() => analyzeAppCategories(walletNodes), [walletNodes]);

  const totalApps = useMemo(
    () => appCategories.reduce((sum, c) => sum + c.count, 0),
    [appCategories]
  );

  const filteredAchievements = useMemo(() => {
    return achievements
      .filter((a) => {
        if (filter === 'earned') return a.earned;
        if (filter === 'locked') return !a.earned;
        return true;
      })
      .filter((a) => categoryFilter === 'all' || a.category === categoryFilter);
  }, [achievements, filter, categoryFilter]);

  // Geo footprint: sourced exclusively from globalRankings.nodeGeoMap (Flux geo API)
  const geoLoading = globalRankings === null;
  const geoFootprint = useMemo(() => {
    const nodeGeoMap = globalRankings?.nodeGeoMap || {};
    const cm = {};
    (walletNodes || []).forEach((n) => {
      const ip = n.ip_full?.host;
      if (!ip) return;
      const geo = nodeGeoMap[ip];
      if (!geo?.countryCode) return;
      const { country, countryCode } = geo;
      if (!cm[countryCode]) cm[countryCode] = { country, countryCode, count: 0 };
      cm[countryCode].count++;
    });
    return Object.values(cm).sort((a, b) => b.count - a.count);
  }, [walletNodes, globalRankings]);

  const totalNodeCount = (walletNodes || []).length;
  const geoKnownCount = useMemo(
    () => geoFootprint.reduce((sum, f) => sum + f.count, 0),
    [geoFootprint]
  );
  const unknownGeoCount = !geoLoading ? totalNodeCount - geoKnownCount : 0;

  return (
    <div className='gami-area'>
      {/* ── Header: top rows + filter buttons ── */}
      <div className='gami-header border-bottom adp-border-color'>

        {/* App categories row */}
        {appCategories.length > 0 && (
          <div className='gami-top-row'>
            <span className='gami-section-title adp-text-muted' style={{ marginBottom: 0 }}>Apps ({totalApps}):</span>
            <div className='gami-chips'>
              {appCategories.map(({ category, name, count }) => {
                const CatIcon = APP_CATEGORY_ICONS[category] || FiBox;
                return (
                  <span key={category} className='gami-chip'>
                    <IconContext.Provider value={{ size: '13px' }}>
                      <CatIcon />
                    </IconContext.Provider>
                    {APP_CATEGORY_DISPLAY[category] || name} ×{count}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Network Footprint row — compact flags only */}
        {!enablePrivacyMode && (
          <div className='gami-top-row'>
            <span className='gami-section-title adp-text-muted' style={{ marginBottom: 0 }}>
              Footprint ({totalNodeCount}):
              {geoLoading && <Spinner size={13} />}
            </span>
            {geoFootprint.length === 0 ? (
              <span className='adp-text-muted' style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
                {geoLoading ? 'Loading…' : 'No location data.'}
              </span>
            ) : (
              <div className='gami-chips'>
                {geoFootprint.map(({ country, countryCode, count }) => (
                  <span key={countryCode} className='gami-chip gami-chip--compact' title={country}>
                    <ReactCountryFlag
                      countryCode={countryCode}
                      svg
                      style={{ width: '1.1em', height: '1.1em', borderRadius: 2 }}
                      title={country}
                    />
                    {count}
                  </span>
                ))}
                {unknownGeoCount > 0 && (
                  <span
                    className='gami-chip gami-chip--compact adp-text-muted'
                    title={`${unknownGeoCount} node(s) with no location data in the Flux geo index yet`}
                  >
                    ? {unknownGeoCount}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Filter buttons */}
        <div className='gami-filters'>
          <div className='gami-filter-group'>
            {Object.entries(FILTER_LABELS).map(([f, label]) => (
              <Button
                key={f}
                small
                minimal={filter !== f}
                active={filter === f}
                intent={filter === f ? 'primary' : 'none'}
                onClick={() => setFilter(f)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className='gami-filter-group'>
            {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
              <Button
                key={cat}
                small
                minimal={categoryFilter !== cat}
                active={categoryFilter === cat}
                intent={categoryFilter === cat ? 'primary' : 'none'}
                onClick={() => setCategoryFilter(cat)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Achievement grid ── */}
      <div className='gami-grid'>
        {filteredAchievements.length === 0 ? (
          <div className='gami-empty adp-text-muted'>
            No achievements match the current filter.
          </div>
        ) : (
          filteredAchievements.map((a) => <AchievementCard key={a.id} achievement={a} />)
        )}
      </div>
    </div>
  );
}
