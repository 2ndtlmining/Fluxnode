import React from 'react';
import { ChevronRight } from 'lucide-react';
import './index.scss';

function truncateAddr(addr) {
  if (!addr) return '—';
  return addr.length > 16 ? `${addr.slice(0, 9)}…${addr.slice(-6)}` : addr;
}

// Spec §15: all four tiers (incl. Dev Fund) with amount + address.
function RewardExpandedBody({ summary }) {
  const { totalFlux, tiers } = summary.rewards;
  return (
    <>
      <div className="live-flow-expanded-total">{totalFlux.toFixed(2)} FLUX total</div>
      {tiers.map((t) => (
        <div key={t.tier} className="live-flow-expanded-row">
          <span className="live-flow-expanded-row-label" style={{ color: t.color }}>{t.label}</span>
          <span className="live-flow-expanded-row-value">{t.amount.toFixed(2)} FLUX</span>
          <span className="live-flow-expanded-row-sub" title={t.address}>{truncateAddr(t.address)}</span>
        </div>
      ))}
    </>
  );
}

// Spec §16: representative apps with resource specs; explicit non-claim
// wording about deployment-vs-block timing (spec §36).
function DeployExpandedBody({ summary }) {
  const { apps } = summary.deployments;
  return (
    <>
      {apps.map((a) => (
        <div key={a.name} className="live-flow-expanded-row live-flow-expanded-row--stacked">
          <div className="live-flow-expanded-row-head">
            <span className="live-flow-expanded-row-label">{a.name}</span>
            {a.instances > 1 && <span className="live-flow-expanded-badge">{a.instances}×</span>}
          </div>
          <span className="live-flow-expanded-row-sub">
            {a.cpuPerInst ?? '—'} vCPU · {a.ramGBPerInst ?? '—'} GB · {a.ssdGBPerInst ?? '—'} GB
          </span>
        </div>
      ))}
      <div className="live-flow-expanded-note">
        Deployment data is observed from the network and may appear shortly after block confirmation.
      </div>
    </>
  );
}

// Spec §17: From → To rows for a representative subset, "View all" for the
// rest — "View all" here just means "see DetailsPanel below" (the full
// scroll/focus wiring is Session C's job, spec §38; this session's affordance
// is honest about that rather than pretending to jump anywhere).
const P2P_EXPANDED_VISIBLE = 3;
function P2pExpandedBody({ summary }) {
  const { totalFlux, transfers } = summary.p2p;
  const visible = transfers.slice(0, P2P_EXPANDED_VISIBLE);
  const remaining = transfers.length - visible.length;
  return (
    <>
      <div className="live-flow-expanded-total">{totalFlux.toFixed(4)} FLUX moved</div>
      {visible.map((t) => (
        <div key={t.id} className="live-flow-expanded-row">
          <span className="live-flow-expanded-row-sub" title={t.from}>{truncateAddr(t.from)}</span>
          <span aria-hidden="true">→</span>
          <span className="live-flow-expanded-row-sub" title={t.to}>{truncateAddr(t.to)}</span>
          <span className="live-flow-expanded-row-value">{t.amount.toFixed(4)} FLUX</span>
        </div>
      ))}
      {remaining > 0 && <div className="live-flow-expanded-note">+{remaining} more — see full details below</div>}
    </>
  );
}

// Spec §18: tier breakdown + a "network reach" line — deliberately not
// dumping all 18+ rows into the card (spec's own instruction); representative
// per-node rows are marked optional by the spec and are skipped here in
// favor of the tier summary, which is the one thing every block has.
function ConfirmExpandedBody({ summary }) {
  const { count, byTier } = summary.confirmations;
  return (
    <>
      {byTier.map((t) => (
        <div key={t.tier} className="live-flow-expanded-row">
          <span className="live-flow-expanded-row-label" style={{ color: t.color }}>{t.label}</span>
          <span className="live-flow-expanded-row-value">{t.count}</span>
        </div>
      ))}
      <div className="live-flow-expanded-note">Network reach: {count} confirmation{count === 1 ? '' : 's'}</div>
    </>
  );
}

const EXPANDED_BODY_COMPONENT = {
  reward: RewardExpandedBody,
  deploy: DeployExpandedBody,
  p2p: P2pExpandedBody,
  confirm: ConfirmExpandedBody,
};

/*
 * One of the four fixed activity nodes around the central block. Real
 * interactive element (spec §51: Tab/Enter/Space/Escape, visible focus) —
 * mirrors ChainRail's ChainBlock role="button"/tabIndex/onKeyDown pattern
 * for consistency with the only other clickable list-item in this page.
 * Escape and click-outside collapse are handled by the caller (Live.jsx /
 * FlowCanvas), not here — this component only owns "clicking *this* card".
 *
 * Expanded content itself (the per-category rows) is built here from
 * `summary`/`categoryKey`, dispatching to one of the four renderer
 * components above (mirrors DetailsPanel's ROW_COMPONENT map). This
 * component owns only the chrome: the quadrant-outward growth, dim/highlight
 * states, and the click/keyboard plumbing (spec §66: "ActivityCard: Owns
 * category summary and expansion presentation").
 */
export const ActivityCard = React.forwardRef(function ActivityCard(
  { quadrant, categoryKey, def, count, primary, secondary, emptyLabel, summary, isExpanded, isDimmed, isPulsing, onToggle },
  ref
) {
  const Icon = def.Icon;
  const isEmpty = !count;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  const handleClick = (e) => {
    // Stops this from also bubbling to FlowCanvas's click-outside-collapses
    // handler (spec §12: "Clicking empty canvas collapses" — a card click is
    // never "empty canvas").
    e.stopPropagation();
    onToggle();
  };

  const classes = [
    'live-flow-card',
    `live-flow-card--${quadrant}`,
    isEmpty && 'live-flow-card--empty',
    isExpanded && 'live-flow-card--expanded',
    isDimmed && 'live-flow-card--dimmed',
    isPulsing && 'live-flow-card--pulse',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      ref={ref}
      style={{ '--card-accent': def.color }}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${def.label}, ${count} — ${isExpanded ? 'expanded, activate to collapse' : 'activate to expand'}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="live-flow-card-header">
        <span className="live-flow-card-icon">
          <Icon size={15} />
        </span>
        <span className="live-flow-card-label">{def.label}</span>
        <span className="live-flow-card-count">{count}</span>
      </div>

      {isExpanded ? (
        <div className="live-flow-card-expanded-body">
          {(() => {
            const ExpandedBody = EXPANDED_BODY_COMPONENT[categoryKey];
            return <ExpandedBody summary={summary} />;
          })()}
        </div>
      ) : isEmpty ? (
        <div className="live-flow-card-empty">{emptyLabel}</div>
      ) : (
        <>
          <div className="live-flow-card-primary">{primary}</div>
          {secondary && <div className="live-flow-card-secondary">{secondary}</div>}
        </>
      )}

      <ChevronRight
        size={14}
        className={`live-flow-card-chevron${isExpanded ? ' live-flow-card-chevron--open' : ''}`}
        aria-hidden="true"
      />
    </div>
  );
});
