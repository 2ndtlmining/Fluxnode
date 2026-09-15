import React, { useState, useEffect } from 'react';
import './index.scss';

import { Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { relativeAge, shortId } from 'donor/donationTotals';
import { COST_CATEGORY_LABELS } from 'donor/costRows';
import { FaHeart } from 'react-icons/fa';
import { BsCheckLg, BsClipboard } from 'react-icons/bs';
import { useCopyAddress } from 'donor/useCopyAddress';

import { RewardCountdown } from 'rewards/RewardCountdown';
import { BlockPulse } from 'home/BlockPulse';
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

  /*
   * #366: this list can no longer assume it is only mounted when donations
   * exist -- the tab strip's reachability is now donations OR costs (R4), and
   * Donations stays the default tab. A missing/empty rows prop must render an
   * empty state, not bail out from under the tab bar.
   */
  const safeRows = Array.isArray(rows) ? rows : [];

  /*
   * Search runs over the WHOLE row set, not the rendered slice -- the list is
   * capped by scroll height, not by count, so there is no hidden tail for a
   * match to fall into.
   */
  const q = query.trim().toLowerCase();
  /*
   * Wallet, amount and note -- deliberately NOT txid (#322).
   *
   * It used to match txid too, which was defensible while the full id was on
   * screen. It is not now: searching "45" would return a 10 FLUX donation whose
   * transaction id happens to contain "45", and with the id no longer readable
   * there is nothing on the row to explain the match. A search that returns
   * rows the reader cannot connect to their query reads as a bug, so the
   * predicate matches the placeholder.
   *
   * The note is included for exactly that reason and not in spite of it: it IS
   * readable on the row, so a match is always explainable (#367).
   */
  const filtered = q
    ? safeRows.filter(
        (r) =>
          r.from.toLowerCase().includes(q) ||
          String(r.amount).includes(q) ||
          (r.note || '').toLowerCase().includes(q)
      )
    : safeRows;

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
          Donated to the project over the last year
          {q && <span className="hov-donations-count">{sorted.length} / {safeRows.length}</span>}
        </span>
        <input
          className="hov-donations-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search wallet, amount or note"
          aria-label="Search donations by wallet, amount or note"
        />
      </div>

      <div className="hov-donations-row hov-donations-row--header">
        <button type="button" onClick={() => toggleSort('donor')}>Donor{arrow('donor')}</button>
        <span>Transaction</span>
        <span>Note</span>
        <button type="button" className="hov-num" onClick={() => toggleSort('amount')}>Amount{arrow('amount')}</button>
        <button type="button" className="hov-num" onClick={() => toggleSort('block')}>Block{arrow('block')}</button>
        <span className="hov-num">When</span>
      </div>

      <div className="hov-donations-list">
        {sorted.length === 0 ? (
          <div className="hov-empty">
            {safeRows.length === 0
              ? 'No donations recorded in the last year'
              : 'No donation matches that search'}
          </div>
        ) : (
          sorted.map((r) => (
            <div
              key={r.txid}
              className={`hov-donations-row${r.isProjectTransfer ? ' hov-donations-row--project' : ''}`}
            >
              {/*
                #322: no `title` with the full value, and no link. A tooltip
                carrying the whole address, or an href carrying the whole txid,
                republishes exactly what the shortening is here to withhold --
                one is readable on hover, the other in the status bar and on
                copy-link. Shortening the visible text while leaking the full
                value into an attribute would be security theatre.
              */}
              <span className="hov-donations-donor">
                {shortId(r.from, 3, 3)}
                {r.isProjectTransfer && (
                  <span className="hov-donations-tag" title="Sent from a project-owned wallet, so it is not counted in the community total above">
                    project
                  </span>
                )}
              </span>
              <span className="hov-donations-tx">{shortId(r.txid, 4, 4)}</span>
              {/*
                #367. The note is shown in full on hover, which is a deliberate
                exception to #322 rather than an oversight: #322 removed
                tooltips carrying a full ADDRESS or TXID, because a shortened
                identifier with the whole value in an attribute republishes
                exactly what the shortening withholds. A note is not an
                identifier -- it is text the donor chose to write into a public
                transaction, and there is nothing to withhold. donor/txNote.js
                caps and sanitises it on the way in.
              */}
              {r.note ? (
                <Tooltip2
                  content={r.note}
                  placement="top"
                  hoverOpenDelay={200}
                  className="hov-donations-note"
                >
                  <span>{r.note}</span>
                </Tooltip2>
              ) : (
                <span className="hov-donations-note hov-donations-note--empty">&mdash;</span>
              )}
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

/*
 * What the donation address has spent (issue #366).
 *
 * Structurally identical to DonationList on purpose -- same six columns, same
 * widths, same search and sort affordances -- so switching tabs moves the
 * reader between two views of one ledger rather than between two different
 * tables. The category rides as a tag on the recipient rather than taking a
 * column of its own, reusing the styling the "project" tag already uses.
 *
 * Categories come from donor/costRows.js. Flux Cloud is expected to be EMPTY
 * for now: no hosting payment has been made from this address yet. That is why
 * the totals below name the category even at zero instead of hiding it.
 */
const COST_SORTS = {
  block: { label: 'Block', get: (r) => r.blockHeight },
  amount: { label: 'Amount', get: (r) => r.amount },
  to: { label: 'To', get: (r) => r.to },
};

function CostList({ rows, costs }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('block');
  const [ascending, setAscending] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.to.toLowerCase().includes(q) ||
          String(r.amount).includes(q) ||
          (r.note || '').toLowerCase().includes(q) ||
          COST_CATEGORY_LABELS[r.category].toLowerCase().includes(q)
      )
    : rows;

  const get = COST_SORTS[sortKey].get;
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
      setAscending(key === 'to');
    }
  };

  const arrow = (key) => (key === sortKey ? (ascending ? ' ↑' : ' ↓') : '');

  return (
    <div className="hov-donations">
      <div className="hov-donations-head">
        {/*
          The breakdown lives here rather than in the header band, which
          carries only the two figures #366 asked for. Flux Cloud is named even
          at 0 FLUX: a category that appears only once it has data leaves a
          reader wondering where hosting costs went.
        */}
        <span className="hov-costs-breakdown">
          <span><b>{fmtNum(costs?.cloudFlux || 0, 2)}</b> Flux Cloud</span>
          <span><b>{fmtNum(costs?.otherFlux || 0, 2)}</b> other</span>
          <span><b>{fmtNum(costs?.refundFlux || 0, 2)}</b> refunded</span>
          {q && <span className="hov-donations-count">{sorted.length} / {rows.length}</span>}
        </span>
        <input
          className="hov-donations-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address, amount or note"
          aria-label="Search costs by address, amount or note"
        />
      </div>

      <div className="hov-donations-row hov-donations-row--header">
        <button type="button" onClick={() => toggleSort('to')}>To{arrow('to')}</button>
        <span>Transaction</span>
        <span>Note</span>
        <button type="button" className="hov-num" onClick={() => toggleSort('amount')}>Amount{arrow('amount')}</button>
        <button type="button" className="hov-num" onClick={() => toggleSort('block')}>Block{arrow('block')}</button>
        <span className="hov-num">When</span>
      </div>

      <div className="hov-donations-list">
        {sorted.length === 0 ? (
          <div className="hov-empty">
            {rows.length === 0 ? 'Nothing has been spent from the donation address yet' : 'No cost matches that search'}
          </div>
        ) : (
          sorted.map((r) => (
            <div key={r.key} className="hov-donations-row">
              {/* Same #322 reasoning as the donation list: shortened, no full
                  value in an attribute. */}
              <span className="hov-donations-donor">
                {shortId(r.to, 3, 3)}
                <span className={`hov-donations-tag hov-cost-tag--${r.category}`}>
                  {COST_CATEGORY_LABELS[r.category]}
                </span>
              </span>
              <span className="hov-donations-tx">{shortId(r.txid, 4, 4)}</span>
              {r.note ? (
                <Tooltip2
                  content={r.note}
                  placement="top"
                  hoverOpenDelay={200}
                  className="hov-donations-note"
                >
                  <span>{r.note}</span>
                </Tooltip2>
              ) : (
                <span className="hov-donations-note hov-donations-note--empty">&mdash;</span>
              )}
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

function CommunitySupportPanel({ donations, donationRows, costRows = [], costs, donationsSettled, donationsFailed, donationsStatus }) {
  /*
   * Donations is the default tab (#366): it is what the panel has always been
   * about and what a first-time reader came for. Costs is the answer to
   * "where does it go", which is a second question, not a competing one.
   */
  const [tab, setTab] = useState('donations');

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

  /*
   * #366: the panel has something to show if money came IN or went OUT. Gating
   * on donations alone hid the Costs and Refunds figures in the one case that
   * motivated splitting this out -- donationCount comes from aggregateDonations,
   * which excludes project-owned transfers, so it can sit at 0 while the address
   * has demonstrably spent money.
   */
  const hasSupportData = donationCount > 0 || costRows.length > 0;

  return (
    <div className="hov-panel hov-panel--support">
      {/*
        Cached figures say so while the live scan runs (#341). Deliberately
        quiet: these ARE real numbers from a real scan, just not this second's,
        so the marker belongs beside the title rather than over the figures.
        It clears itself when onRefresh lands.
      */}
      <PanelHeader
        title="COMMUNITY SUPPORT"
        badge={uniqueDonors}
        right={donationsStatus === 'cached' ? <span className="hov-header-note">Updating…</span> : null}
      />

      {!hasSupportData ? (
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

            {/*
              Two stat columns rather than five stacked rows (#366). Money in
              on the left, money out on the right, so the pair reads as a
              balance and the band keeps the height it had.
            */}
            <div className="hov-kv-columns">
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

              <div className="hov-kv-list hov-kv-list--out">
                <div className="hov-kv-row">
                  <span className="hov-kv-label">Costs</span>
                  <span className="hov-kv-value">{fmtNum(costs?.costFlux || 0, 2)} FLUX</span>
                </div>
                <div className="hov-kv-row">
                  <span className="hov-kv-label">Refunds</span>
                  <span className="hov-kv-value">{fmtNum(costs?.refundFlux || 0, 2)} FLUX</span>
                </div>
              </div>
            </div>

            <SupportCta address={address} shortAddress={shortAddress} />
          </div>
        </>
      )}

      {(donationRows.length > 0 || costRows.length > 0) && (
        <>
          <div className="hov-tabs" role="tablist" aria-label="Community support detail">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'donations'}
              className={`hov-tab${tab === 'donations' ? ' hov-tab--active' : ''}`}
              onClick={() => setTab('donations')}
            >
              Donations <span className="hov-tab-count">{donationRows.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'costs'}
              className={`hov-tab${tab === 'costs' ? ' hov-tab--active' : ''}`}
              onClick={() => setTab('costs')}
            >
              Costs <span className="hov-tab-count">{costRows.length}</span>
            </button>
          </div>

          {tab === 'donations' ? (
            <DonationList rows={donationRows} />
          ) : (
            <CostList rows={costRows} costs={costs} />
          )}
        </>
      )}

      {/* With no support data there is no band to hang the address off, so it
          gets its own row rather than disappearing. */}
      {!hasSupportData && (
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
      {/*
        #292. Sits here rather than in a band of its own because this panel was
        already leaving ~157px unused below the countdown (measured at 1386px:
        544px tall, 387px inked) -- and because the pairing reads: the countdown
        says when the reward changes, this says the chain is still running.
      */}
      <BlockPulse />
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
  costRows = [],
  costs,
  donationsSettled,
  donationsFailed,
  donationsStatus
}) {
  return (
    <div className="home-overview">
      <div className="home-overview-row home-overview-row--support">
        <CommunitySupportPanel
          donations={donations}
          donationRows={donationRows}
          costRows={costRows}
          costs={costs}
          donationsSettled={donationsSettled}
          donationsFailed={donationsFailed}
          donationsStatus={donationsStatus}
        />
        <RewardReductionBand gstore={gstore} />
      </div>
      <DonorPitchPanel gstore={gstore} countryCounts={countryCounts} />
    </div>
  );
}
