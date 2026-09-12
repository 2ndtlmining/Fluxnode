import React, { useState, useEffect } from 'react';
import './index.scss';

import { Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { relativeAge, shortTxid, explorerTxUrl } from 'donor/donationTotals';
import { FaHeart } from 'react-icons/fa';
import { BsCheckLg, BsClipboard } from 'react-icons/bs';
import { useCopyAddress } from 'donor/useCopyAddress';

import { useNavigate } from 'react-router-dom';
import { RewardCountdown } from 'rewards/RewardCountdown';
import { hasScheduledReduction } from 'rewards/rewardReduction';
import { CC_BLOCK_REWARD, CC_NEXT_BLOCK_REWARD } from 'content/index';
import { formatDonorCost, donorHighlights } from 'donor/donorPitch';
import { useDonorStatus } from 'contexts/DonorContext';

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function fmtCompact(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toFixed(0);
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function PanelHeader({ title, badge, badgeClassName, badgeContent, right }) {
  return (
    <div className="hov-header">
      <span className="hov-header-title">{title}</span>
      {right}
      {badgeContent ?? (badge != null && (
        <span className={`hov-header-badge${badgeClassName ? ' ' + badgeClassName : ''}`}>
          {fmtNum(badge)}
        </span>
      ))}
    </div>
  );
}

// ── Panel: Community Support ──────────────────────────────────────────────────

/*
 * What the community has actually given, over the same 365-day window the donor
 * benefit uses (issue #258).
 *
 * The honest figure is small -- a few hundred FLUX from single-digit donors --
 * because the one wallet that dwarfs everything is project-owned and excluded
 * (donor/config.js). A panel about transparency that headlined the unfiltered
 * total would imply broad backing the data does not show, so the number here is
 * deliberately the modest true one, and the panel is built to look composed at
 * that size rather than padded out to seem larger.
 *
 * The donation address is part of the panel rather than a link elsewhere: a
 * reader persuaded by the numbers should not then have to go looking.
 */
/*
 * The donation address, as one click rather than something to select by hand
 * (issue #294). Same clipboard path as the footer chip and the node page's
 * donation chip, including the plain-http fallback -- see donor/clipboard.js
 * for why that matters to this audience specifically.
 */
function SupportCta({ address, shortAddress, standalone = false }) {
  const { copied, failed, copy } = useCopyAddress(address);

  const tooltip = copied
    ? 'Donation address copied'
    : failed
      ? `Copy blocked by the browser — ${address}`
      : address
        ? `Click to copy ${address}`
        : 'Donation address unavailable';

  return (
    <div className={`hov-support-cta${standalone ? ' hov-support-cta--standalone' : ''}`}>
      <FaHeart size={11} className="hov-support-cta-icon" aria-hidden="true" />
      <span className="hov-support-cta-text">Keep FluxNode running</span>
      <Tooltip2 content={tooltip} placement="top" hoverOpenDelay={120}>
        <button
          type="button"
          className={`hov-support-address${copied ? ' hov-support-address--copied' : ''}${failed ? ' hov-support-address--failed' : ''}`}
          onClick={copy}
          disabled={!address}
          aria-label="Copy the FluxNode donation address"
        >
          <code>{shortAddress}</code>
          {copied ? <BsCheckLg size={10} aria-hidden="true" /> : <BsClipboard size={10} aria-hidden="true" />}
        </button>
      </Tooltip2>
    </div>
  );
}


/*
 * The donations themselves, not just the total (issue #315).
 *
 * The rows come from the SAME scan the total above is computed from -- see
 * fetch_donation_totals -- so the list cannot disagree with the headline
 * figure about what counted, and it costs no extra explorer traffic (which
 * #314 had just finished making expensive to spend).
 *
 * Project-owned transfers are shown and LABELLED rather than hidden. They stay
 * out of the total, as EXCLUDED_FROM_DONATION_TOTALS has always ensured; but a
 * list that silently omitted them would not reconcile against the address's
 * on-chain balance and nothing on screen would say why. Labelling is what lets
 * the panel be both complete and honest.
 */
const SORTS = {
  block: { label: 'Block', get: (r) => r.blockHeight },
  amount: { label: 'Amount', get: (r) => r.amount },
  donor: { label: 'Donor', get: (r) => r.from },
};

function DonationList({ rows }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('block');
  const [ascending, setAscending] = useState(false);

  if (!rows || rows.length === 0) return null;

  /*
   * Search runs over the WHOLE row set, not the rendered slice -- the list is
   * capped by scroll height, not by count, so there is no hidden tail for a
   * match to fall into.
   */
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.from.toLowerCase().includes(q) ||
          String(r.amount).includes(q) ||
          r.txid.toLowerCase().includes(q)
      )
    : rows;

  const get = SORTS[sortKey].get;
  const sorted = [...filtered].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return ascending ? cmp : -cmp;
  });

  const toggleSort = (key) => {
    if (key === sortKey) {
      setAscending((prev) => !prev);
    } else {
      setSortKey(key);
      // Block and Amount are most useful highest-first; a donor address is not.
      setAscending(key === 'donor');
    }
  };

  const arrow = (key) => (key === sortKey ? (ascending ? ' ↑' : ' ↓') : '');

  return (
    <div className="hov-donations">
      <div className="hov-donations-head">
        <span className="hov-donations-title">
          Donations
          <span className="hov-donations-count">
            {q ? `${sorted.length} / ${rows.length}` : rows.length}
          </span>
        </span>
        <input
          className="hov-donations-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search wallet or amount"
          aria-label="Search donations by wallet or amount"
        />
      </div>

      <div className="hov-donations-row hov-donations-row--header">
        <button type="button" onClick={() => toggleSort('donor')}>Donor{arrow('donor')}</button>
        <span>Transaction</span>
        <button type="button" className="hov-num" onClick={() => toggleSort('amount')}>Amount{arrow('amount')}</button>
        <button type="button" className="hov-num" onClick={() => toggleSort('block')}>Block{arrow('block')}</button>
        <span className="hov-num">When</span>
      </div>

      <div className="hov-donations-list">
        {sorted.length === 0 ? (
          <div className="hov-empty">No donation matches that search</div>
        ) : (
          sorted.map((r) => (
            <div
              key={r.txid}
              className={`hov-donations-row${r.isProjectTransfer ? ' hov-donations-row--project' : ''}`}
            >
              <span className="hov-donations-donor" title={r.from}>
                {shortTxid(r.from)}
                {r.isProjectTransfer && (
                  <span className="hov-donations-tag" title="Sent from a project-owned wallet, so it is not counted in the community total above">
                    project
                  </span>
                )}
              </span>
              <a
                className="hov-donations-tx"
                href={explorerTxUrl(r.txid)}
                target="_blank"
                rel="noopener noreferrer"
                title={r.txid}
              >
                {shortTxid(r.txid)}
              </a>
              <span className="hov-num hov-donations-amount">{fmtNum(r.amount, 2)}</span>
              <span className="hov-num hov-donations-block">{fmtNum(r.blockHeight)}</span>
              <span className="hov-num hov-donations-age">{relativeAge(r.timeSec)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CommunitySupportPanel({ donations, donationRows, donationsSettled, donationsFailed }) {
  if (!donationsSettled) {
    return (
      <div className="hov-panel hov-panel-center hov-panel--support">
        <Spinner size={20} />
      </div>
    );
  }

  if (donationsFailed || !donations) {
    return (
      <div className="hov-panel hov-panel-center hov-panel--support">
        <div className="hov-empty">Couldn&rsquo;t load donation history &mdash; this may be temporary.</div>
      </div>
    );
  }

  const { totalFlux, uniqueDonors, donationCount, lastDonation } = donations;
  const address = (typeof window !== 'undefined' && window.gContent?.ADDRESS_FLUX) || '';
  const shortAddress = address ? `${address.slice(0, 8)}…${address.slice(-6)}` : '—';
  const lastAge = lastDonation ? relativeAge(lastDonation.timeSec) : null;

  return (
    <div className="hov-panel hov-panel--support">
      <PanelHeader title="COMMUNITY SUPPORT" badge={uniqueDonors} />

      {donationCount === 0 ? (
        <div className="hov-empty">No donations recorded in the last year</div>
      ) : (
        <>
          <div className="hov-support-band">
            <div className="hov-support-figure">
              <div className="hov-support-hero">
                <span className="hov-support-total">{fmtNum(totalFlux, 2)}</span>
                <span className="hov-support-unit">FLUX</span>
              </div>
              <div className="hov-support-sub">donated by the community over the last year</div>
            </div>

            <div className="hov-kv-list">
            <div className="hov-kv-row">
              <span className="hov-kv-label">Supporters</span>
              <span className="hov-kv-value">{fmtNum(uniqueDonors)}</span>
            </div>
            <div className="hov-kv-row">
              <span className="hov-kv-label">Donations</span>
              <span className="hov-kv-value">{fmtNum(donationCount)}</span>
            </div>
            {lastDonation && (
              <div className="hov-kv-row">
                <span className="hov-kv-label">Most recent</span>
                <span className="hov-kv-value">
                  {fmtNum(lastDonation.amount, 2)} FLUX &middot; {lastAge}
                </span>
              </div>
            )}
            </div>

            <SupportCta address={address} shortAddress={shortAddress} />
          </div>
        </>
      )}

      {donationCount > 0 && <DonationList rows={donationRows} />}

      {/* With no donations there is no band to hang the address off, so it
          gets its own row rather than disappearing. */}
      {donationCount === 0 && (
        <SupportCta address={address} shortAddress={shortAddress} standalone />
      )}
    </div>
  );
}

/*
 * The next block-reward reduction, as a full-width band above the panels
 * (issue #242).
 *
 * Reuses rewards/RewardCountdown rather than building a second clock -- the
 * same component the Analytics donor tab renders. It sits at the top because
 * it is a network-wide deadline that changes every operator's earnings, and
 * it removes itself once no reduction is scheduled.
 *
 * The band states the two reward figures and deliberately does NOT restate
 * them as a percentage. 14 -> 12.6 is both a 10% cut and 11.1% higher than
 * the new figure depending on which way you read it; rewards/rewardReduction
 * has a long note on that confusion, and Analytics' REWARD REDUCTION IMPACT
 * panel is where the derived numbers belong.
 */
function RewardReductionBand({ gstore }) {
  const currentBlock = gstore?.current_block_height || 0;
  if (!hasScheduledReduction(currentBlock)) return null;

  return (
    <div className="hov-panel hov-panel--reward-band">
      <RewardCountdown currentBlock={currentBlock} compact />
      <div className="hov-reward-delta">
        Block reward falls from <strong>{CC_BLOCK_REWARD}</strong> to{' '}
        <strong>{CC_NEXT_BLOCK_REWARD} FLUX</strong> per block
      </div>
    </div>
  );
}

/*
 * What donating unlocks, with the real cost (issue #242).
 *
 * Informational rather than promotional, per the user's explicit direction --
 * it sits on a public page that is otherwise all data, and reads as "here is
 * what else exists" rather than a sales pitch.
 *
 * Each row shows the SIZE of what is behind the gate without showing the
 * thing itself, using figures Home has already loaded (donor/donorPitch has
 * the reasoning). The cost is converted at the live FLUX price rather than
 * hardcoded, which is the only honest way to state it when FLUX moves.
 *
 * Renders nothing for someone who has already unlocked -- there is nothing
 * left to tell them.
 */
function DonorPitchPanel({ gstore, countryCounts }) {
  const donor = useDonorStatus();
  const navigate = useNavigate();

  if (donor?.isUnlocked) return null;

  const cost = formatDonorCost(gstore?.flux_price_usd);
  const highlights = donorHighlights({ gstore, countryCounts });

  return (
    <div className="hov-panel hov-panel--pitch">
      <PanelHeader
        title="WHAT SUPPORTERS UNLOCK"
        badgeContent={<span className="hov-header-badge hov-pitch-cost-badge">{cost}</span>}
      />

      <div className="hov-pitch-list">
        {highlights.map(({ key, title, teaser }) => (
          <div key={key} className="hov-pitch-row">
            <span className="hov-pitch-title">{title}</span>
            <span className="hov-pitch-teaser">{teaser}</span>
          </div>
        ))}
      </div>

      <div className="hov-pitch-foot">
        <span className="hov-pitch-terms">
          We look for <strong>{cost}</strong> sent to the donation address within the last year.
        </span>
        <button type="button" className="hov-pitch-demo" onClick={() => navigate('/demo')}>
          See it on the demo wallet
        </button>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

/*
 * What Home is, after issue #284.
 *
 * The network-wide panels (FLUX NETWORK, NETWORK RESOURCES, APP ECOSYSTEM,
 * TOP HOSTED APPS, NODE DISTRIBUTION) have moved to /analytics, where the rest
 * of the network-wide figures already live. Two of them -- App Ecosystem and
 * Top Hosted Apps -- were rendering on BOTH pages, so for those this is a
 * deletion rather than a move.
 *
 * What is left is what Home is actually for: look up a wallet, see the deadline
 * that changes everyone's earnings, and see who is keeping the project running.
 * The support panel and the countdown share one row because neither fills a
 * page-width band on its own, and the donor panel sits under them because it is
 * the thing the other two are arguing for.
 */
export function HomeOverview({
  gstore,
  countryCounts,
  donations,
  donationRows,
  donationsSettled,
  donationsFailed
}) {
  return (
    <div className="home-overview">
      <div className="home-overview-row home-overview-row--support">
        <CommunitySupportPanel
          donations={donations}
          donationRows={donationRows}
          donationsSettled={donationsSettled}
          donationsFailed={donationsFailed}
        />
        <RewardReductionBand gstore={gstore} />
      </div>
      <DonorPitchPanel gstore={gstore} countryCounts={countryCounts} />
    </div>
  );
}
