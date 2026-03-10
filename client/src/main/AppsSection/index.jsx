import React, { useState, useEffect, useContext, useMemo } from 'react';
import './index.scss';

import { Spinner, Button } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { IconContext } from 'react-icons';
import { FiBox } from 'react-icons/fi';
import { FaGithub, FaDocker, FaLock } from 'react-icons/fa';
import { LayoutContext } from 'contexts/LayoutContext';
import { APP_CATEGORY_META, CATEGORY_TOOLTIPS } from 'content/appCategoryMeta';
import { categorizeApp } from 'main/Gamification/appCategories';
import { fetch_global_app_specs } from 'main/apidata';
import { hide_sensitive_number, blocksToHumanLong } from 'utils';

export function AppsSection({ walletNodes, gstore }) {
  const { enablePrivacyMode } = useContext(LayoutContext);
  const [appSpecs, setAppSpecs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch_global_app_specs(gstore).then((result) => {
      if (!cancelled) {
        setAppSpecs(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [gstore]);

  const specMap = useMemo(() => {
    if (!appSpecs?.rawSpecs) return new Map();
    const map = new Map();
    const currentBlock = gstore?.current_block_height || gstore?.fluxBlockHeight || 0;

    for (const spec of appSpecs.rawSpecs) {
      const isCompose = Array.isArray(spec.compose);

      let cpuPerInst, ramGBPerInst, ssdGBPerInst, repotag;
      if (isCompose) {
        cpuPerInst = spec.compose.reduce((s, c) => s + (c.cpu || 0), 0);
        ramGBPerInst = spec.compose.reduce((s, c) => s + (c.ram || 0), 0) / 1024;
        ssdGBPerInst = spec.compose.reduce((s, c) => s + (c.hdd || 0), 0);
        repotag = spec.compose[0]?.repotag || '';
      } else {
        cpuPerInst = spec.cpu || 0;
        ramGBPerInst = (spec.ram || 0) / 1024;
        ssdGBPerInst = spec.hdd || 0;
        repotag = spec.repotag || '';
      }

      const specHeight = spec.height || 0;
      let expiresInBlocks = null;
      let hasExpire = !!spec.expire;
      if (spec.expire && currentBlock > 0) {
        expiresInBlocks = (specHeight + spec.expire) - currentBlock;
      }

      const isEnterprise = !!(spec.enterprise);

      // Collect all repotags for git detection (compose apps may have orbit in any component)
      let allRepotags = repotag;
      if (isCompose) {
        allRepotags = spec.compose.map((c) => c.repotag || '').join(' ');
      }
      const deployType = isEnterprise ? 'enterprise' : allRepotags.includes('runonflux/orbit') ? 'git' : 'docker';

      map.set(spec.name, { cpuPerInst, ramGBPerInst, ssdGBPerInst, repotag, expiresInBlocks, hasExpire, isEnterprise, deployType });
    }
    return map;
  }, [appSpecs, gstore]);

  const rows = useMemo(() => {
    if (!walletNodes || walletNodes.length === 0) return [];
    const result = [];
    for (const node of walletNodes) {
      const ip = node.ip_full?.host || '';
      const port = node.ip_full?.port || 16126;
      for (const app of (node.installedApps || [])) {
        const spec = specMap.get(app.name);
        const isEnterprise = spec?.isEnterprise || false;
        const category = categorizeApp(app.name);
        result.push({
          ip,
          port,
          appName: app.name,
          category,
          isEnterprise,
          deployType: spec?.deployType || 'docker',
          repotag: spec?.repotag || '',
          cpuPerInst: spec?.cpuPerInst ?? null,
          ramGBPerInst: spec?.ramGBPerInst ?? null,
          ssdGBPerInst: spec?.ssdGBPerInst ?? null,
          expiresInBlocks: spec?.expiresInBlocks ?? null,
          hasExpire: spec?.hasExpire ?? false,
        });
      }
    }
    return result;
  }, [walletNodes, specMap]);

  const filteredRows = useMemo(() => {
    if (!filter) return rows;
    const lower = filter.toLowerCase();
    return rows.filter((r) => r.ip.toLowerCase().includes(lower) || r.appName.toLowerCase().includes(lower));
  }, [rows, filter]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return mul * av.localeCompare(bv);
      return mul * (av - bv);
    });
  }, [filteredRows, sortKey, sortDir]);

  const categoryChips = useMemo(() => {
    const catMap = {};
    const seenApps = {};
    for (const row of sortedRows) {
      if (!seenApps[row.appName]) {
        seenApps[row.appName] = true;
        catMap[row.category] = (catMap[row.category] || 0) + 1;
      }
    }
    return Object.entries(catMap)
      .map(([cat, count]) => ({ cat, count }))
      .sort((a, b) => b.count - a.count);
  }, [sortedRows]);

  const uniqueAppCount = useMemo(() => {
    const seen = new Set();
    for (const row of sortedRows) seen.add(row.appName);
    return seen.size;
  }, [sortedRows]);

  const sortArrow = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  return (
    <div className="apps-section">
      <div className="apps-summary">
        <span className="apps-summary__title adp-text-muted">Apps ({uniqueAppCount}):</span>
        <div className="apps-summary__chips">
          {categoryChips.map(({ cat, count }) => {
            const meta = APP_CATEGORY_META[cat] || APP_CATEGORY_META.other;
            const CatIcon = meta.Icon || FiBox;
            return (
              <Tooltip2 key={cat} content={CATEGORY_TOOLTIPS[cat] || cat} placement="top" hoverOpenDelay={200}>
                <span className="apps-summary__chip" style={{ borderColor: `${meta.color}44` }}>
                  <IconContext.Provider value={{ size: '12px' }}>
                    <span style={{ color: meta.color }}><CatIcon /></span>
                  </IconContext.Provider>
                  {meta.label} <span className="apps-summary__chip-count">{count}</span>
                </span>
              </Tooltip2>
            );
          })}
        </div>
      </div>

      <div className="apps-filter">
        <span className="apps-filter__label">Filter:</span>
        <input
          className="apps-filter__input"
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="IP or App Name"
          size={20}
        />
        <Button text="Clear" intent="primary" rightIcon="filter" small onClick={() => setFilter('')} />
      </div>

      {loading ? (
        <div className="apps-section__loading"><Spinner size={24} /></div>
      ) : sortedRows.length === 0 ? (
        <div className="apps-section__empty adp-text-muted">
          {filter ? 'No apps match the current filter.' : 'No apps installed on any node.'}
        </div>
      ) : (
        <div className="apps-table-outer">
          <div className="apps-table-header-wrap">
            <table className="apps-table">
              <thead>
                <tr>
                  <th className="apps-th--left apps-th--sort" onClick={() => toggleSort('ip')}>Node{sortArrow('ip')}</th>
                  <th className="apps-th--sort" onClick={() => toggleSort('deployType')}>Type{sortArrow('deployType')}</th>
                  <th className="apps-th--left apps-th--sort" onClick={() => toggleSort('appName')}>App Name{sortArrow('appName')}</th>
                  <th className="apps-th--sort" onClick={() => toggleSort('category')}>Cat{sortArrow('category')}</th>
                  <th className="apps-th--left apps-th--repo apps-th--sort" onClick={() => toggleSort('repotag')}>Repo{sortArrow('repotag')}</th>
                  <th className="apps-th--right apps-th--sort" onClick={() => toggleSort('cpuPerInst')}>Cores{sortArrow('cpuPerInst')}</th>
                  <th className="apps-th--right apps-th--sort" onClick={() => toggleSort('ramGBPerInst')}>Ram(GB){sortArrow('ramGBPerInst')}</th>
                  <th className="apps-th--right apps-th--sort" onClick={() => toggleSort('ssdGBPerInst')}>SSD(GB){sortArrow('ssdGBPerInst')}</th>
                  <th className="apps-th--right apps-th--sort" onClick={() => toggleSort('expiresInBlocks')}>Expire{sortArrow('expiresInBlocks')}</th>
                </tr>
              </thead>
            </table>
          </div>
          <div className="apps-table-body-wrap">
            <table className="apps-table">
              <tbody>
                {sortedRows.map((row, i) => {
                  const meta = APP_CATEGORY_META[row.category] || APP_CATEGORY_META.other;
                  const CatIcon = meta.Icon || FiBox;
                  const displayIp = enablePrivacyMode ? hide_sensitive_number(row.ip) : row.ip;

                  return (
                    <tr key={`${row.ip}-${row.appName}-${i}`}>
                      <td className="apps-td--ip">
                        {enablePrivacyMode ? (
                          <span className="adp-text-muted">{displayIp}</span>
                        ) : (
                          <a href={`http://${row.ip}:${row.port}`} target="_blank" rel="noopener noreferrer">{displayIp}</a>
                        )}
                      </td>
                      <td className="apps-td--type">
                        <Tooltip2
                          content={row.deployType === 'git' ? 'Git Deployment' : row.deployType === 'enterprise' ? 'Enterprise App' : 'Docker Deployment'}
                          placement="top"
                          hoverOpenDelay={200}
                        >
                          <span className={`apps-type-icon apps-type-icon--${row.deployType}`}>
                            {row.deployType === 'git' ? <FaGithub /> : row.deployType === 'enterprise' ? <FaLock /> : <FaDocker />}
                          </span>
                        </Tooltip2>
                      </td>
                      <td className="apps-td--name">{row.appName}</td>
                      <td className="apps-td--cat">
                        <Tooltip2 content={CATEGORY_TOOLTIPS[row.category] || row.category} placement="top" hoverOpenDelay={200}>
                          <span style={{ color: meta.color }}>
                            <IconContext.Provider value={{ size: '13px' }}><CatIcon /></IconContext.Provider>
                          </span>
                        </Tooltip2>
                      </td>
                      <td className="apps-td--repo">
                        {row.isEnterprise
                          ? <span className="apps-badge--enterprise">ENTERPRISE</span>
                          : (row.repotag || '\u2014')}
                      </td>
                      <td className="apps-td--num">{row.cpuPerInst != null ? row.cpuPerInst.toFixed(2) : '\u2014'}</td>
                      <td className="apps-td--num">{row.ramGBPerInst != null ? row.ramGBPerInst.toFixed(2) : '\u2014'}</td>
                      <td className="apps-td--num">{row.ssdGBPerInst != null ? row.ssdGBPerInst.toFixed(2) : '\u2014'}</td>
                      <td className="apps-td--expire">
                        {row.expiresInBlocks != null && row.expiresInBlocks > 0
                          ? blocksToHumanLong(row.expiresInBlocks)
                          : row.hasExpire ? 'Expired' : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
