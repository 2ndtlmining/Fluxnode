# Analytics Rework — Session 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the donor-unlock foundation Track 2 depends on: a reusable
donor-verification check usable from both function and class components,
an inline unlock UI replacing the modal dialog everywhere, per-panel gating
for `/analytics` (replacing today's single whole-route gate), and
cross-page donor auto-detection wired into Home's and the Nodes page's
existing wallet searches.

**Architecture:** The verification logic lives in one plain (non-hook)
async function so it's callable from both a new React hook (for function
components: `PremiumUnlock`) and a plain helper (for the two legacy class
components: `Home.jsx`, `MainApp.jsx`, neither of which can call hooks).
`DonorContext`'s `setDonorWallet` reaches those class components via a
prop bridge in `Application.jsx` (extending the `<DonorContext.Consumer>`
pattern `MainApp` already uses for `donorWallet`), not via `contextType`
(already claimed by `LayoutContext` on both classes). `/analytics` moves
from one route-level `<PremiumGate>` to per-panel `<PanelGate>`, driven by
a single `panelAccess.js` config.

**Tech Stack:** React 18 (function + legacy class components), Blueprint.js,
existing `DonorContext`/`donorStatus.js` verification logic (unchanged).

**Spec:** `docs/superpowers/specs/2026-09-10-analytics-rework-design.md`
(Parts A and B — this session does not touch Part C's panel moves or Part
D's visual refresh; those are Sessions 2-4).

## Global Constraints

- **Hard testing requirement (user-mandated, non-negotiable):** this
  session edits `Home.jsx`'s and `MainApp.jsx`'s existing
  `onProcessAddress` methods — the exact code path that computes every
  number the Nodes page shows for a real wallet. **Task 8 is a mandatory
  live before/after comparison on a real wallet** (not just unit tests) —
  do not skip it, do not mark this session done without it. This mirrors
  the manual-comparison discipline that caught 2 real duplicate-ip ranking
  bugs (`rankInGroup`, `lookupNodeInfo`) during the 2026-09-09
  accuracy/reliability work.
- **Deviation from the spec's literal wording, with reason:** the spec
  describes one `useDonorWalletCheck` hook. A hook cannot be called from
  `Home.jsx`/`MainApp.jsx` — both are class components (rules of hooks).
  This plan splits the spec's intent into: a plain `checkDonorWallet`
  function (the real logic, framework-agnostic, directly unit-testable), a
  thin `useDonorWalletCheck` hook wrapping it for function components, and
  a thin `runDonorAutoDetect` helper wrapping it for the two class
  components. Same behavior the spec describes, just factored so it
  actually compiles everywhere it's needed.
- **Repo test convention:** this codebase has zero React-Testing-Library
  component tests anywhere (`@testing-library/react` is an installed
  dependency but unused) — every existing test is a pure-logic unit test
  (see `donor/donorStatus.test.js`). Follow that convention: unit-test the
  extracted pure functions; verify components (`PremiumUnlock`,
  `PanelGate`, the two wallet-search flows) via live manual QA, not new
  RTL tests. Don't introduce a new testing paradigm this repo doesn't use.
- **Worktree convention:** create `worktrees/analytics-session1` via plain
  `git worktree add` (this repo's established convention) — **not** the
  harness's native `EnterWorktree` tool, which places worktrees under
  `.claude/worktrees/` and breaks CRA/Jest's `testMatch` glob resolution
  (confirmed in a prior session — 0 of 125 test files matched, no error).
- **Baseline before starting:** run
  `cd client && CI=true npx react-scripts test --watchAll=false` on `main`
  first and record the actual current pass count — the last recorded
  baseline (317 tests, PR #185) is 3 sessions stale; more has merged since
  (PR #188/#190/#191/#192/#193). Every task's "tests pass" step means
  *this session's* real baseline plus whatever that task added, not the
  stale number.
- **`client/public/runtime/app-content.js`'s `TESTING` flag**: flip to
  `true` for local manual QA (bypasses the donor paywall), **always revert
  to `false` before committing** — confirm `git status` shows it clean
  before every commit that touches this repo's tracked files.

---

### Task 1: `checkDonorWallet` — the pure verification function

**Files:**
- Create: `client/src/donor/donorWalletCheck.js`
- Test: `client/src/donor/donorWalletCheck.test.js`

**Interfaces:**
- Consumes: `validateAddress` (from `apidata`), `fetch_donor_status` (from
  `donor/donorStatus`) — both already exist, unchanged.
- Produces: `export const CHECK_STATUS = { IDLE, CHECKING, SUCCESS,
  FAILURE, INVALID, UNVERIFIED }` (string enum, same 5 non-idle values
  `DonorUnlockDialog`'s local `STATUS` already uses) and `export async
  function checkDonorWallet(address)` returning
  `{ status: CHECK_STATUS, result: <fetch_donor_status's return shape> | null }`.
  Later tasks (2, 6, 7) import both from this module.

This is a straight behavioral port of `DonorUnlockDialog`'s existing
`handleCheck` (`client/src/donor/DonorUnlockDialog/index.jsx:25-47`), minus
the React state and minus the `setDonorWallet` call — callers decide what
to do with the result themselves (Task 2's hook calls `setDonorWallet` on
success and shows UI state; Task 6/7's class-component helper calls
`setDonorWallet` via a prop and fires a toast).

- [ ] **Step 1: Write the failing tests**

```js
// client/src/donor/donorWalletCheck.test.js
import { checkDonorWallet, CHECK_STATUS } from './donorWalletCheck';
import { validateAddress } from 'apidata';
import { fetch_donor_status } from './donorStatus';

jest.mock('apidata', () => ({ validateAddress: jest.fn() }));
jest.mock('./donorStatus', () => ({ fetch_donor_status: jest.fn() }));

describe('checkDonorWallet', () => {
  beforeEach(() => {
    validateAddress.mockReset();
    fetch_donor_status.mockReset();
  });

  it('returns INVALID without calling fetch_donor_status when the address fails validation', async () => {
    validateAddress.mockResolvedValue(false);
    const { status, result } = await checkDonorWallet('not-a-real-address');
    expect(status).toBe(CHECK_STATUS.INVALID);
    expect(result).toBeNull();
    expect(fetch_donor_status).not.toHaveBeenCalled();
  });

  it('returns SUCCESS with the real result when the wallet qualifies', async () => {
    validateAddress.mockResolvedValue(true);
    const donorResult = { isDonor: true, totalInWindow: 25, expiresAt: 123, daysLeft: 10, verified: true };
    fetch_donor_status.mockResolvedValue(donorResult);
    const { status, result } = await checkDonorWallet('t1RealAddress');
    expect(status).toBe(CHECK_STATUS.SUCCESS);
    expect(result).toBe(donorResult);
  });

  it('returns FAILURE when verified but below threshold', async () => {
    validateAddress.mockResolvedValue(true);
    const donorResult = { isDonor: false, totalInWindow: 2, expiresAt: null, daysLeft: 0, verified: true };
    fetch_donor_status.mockResolvedValue(donorResult);
    const { status, result } = await checkDonorWallet('t1RealAddress');
    expect(status).toBe(CHECK_STATUS.FAILURE);
    expect(result).toBe(donorResult);
  });

  it('returns UNVERIFIED when the scan could not complete and did not qualify', async () => {
    validateAddress.mockResolvedValue(true);
    const donorResult = { isDonor: false, totalInWindow: 0, expiresAt: null, daysLeft: 0, verified: false };
    fetch_donor_status.mockResolvedValue(donorResult);
    const { status, result } = await checkDonorWallet('t1RealAddress');
    expect(status).toBe(CHECK_STATUS.UNVERIFIED);
    expect(result).toBe(donorResult);
  });

  it('trims whitespace before validating', async () => {
    validateAddress.mockResolvedValue(true);
    fetch_donor_status.mockResolvedValue({ isDonor: true, totalInWindow: 25, expiresAt: 1, daysLeft: 1, verified: true });
    await checkDonorWallet('  t1RealAddress  ');
    expect(validateAddress).toHaveBeenCalledWith('t1RealAddress');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && CI=true npx react-scripts test donorWalletCheck --watchAll=false`
Expected: FAIL — `donor/donorWalletCheck` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```js
// client/src/donor/donorWalletCheck.js
import { validateAddress } from 'apidata';
import { fetch_donor_status } from './donorStatus';

/*
 * Framework-agnostic verification core, extracted from what
 * DonorUnlockDialog's handleCheck used to do inline. Deliberately not a
 * hook and doesn't touch DonorContext itself — every caller (the
 * useDonorWalletCheck hook for function components, the
 * runDonorAutoDetect helper for the two legacy class components) decides
 * what to do with the result, including whether/how to call
 * setDonorWallet. This is what makes the same verification logic usable
 * from Home.jsx/MainApp.jsx, which can't call hooks.
 */
export const CHECK_STATUS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  SUCCESS: 'success',
  FAILURE: 'failure',
  INVALID: 'invalid',
  UNVERIFIED: 'unverified',
};

export async function checkDonorWallet(address) {
  const trimmed = (address || '').trim();
  if (!trimmed) return { status: CHECK_STATUS.INVALID, result: null };

  const looksReal = await validateAddress(trimmed);
  if (!looksReal) return { status: CHECK_STATUS.INVALID, result: null };

  const result = await fetch_donor_status(trimmed);
  if (result.isDonor) return { status: CHECK_STATUS.SUCCESS, result };
  if (!result.verified) return { status: CHECK_STATUS.UNVERIFIED, result };
  return { status: CHECK_STATUS.FAILURE, result };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && CI=true npx react-scripts test donorWalletCheck --watchAll=false`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/donor/donorWalletCheck.js client/src/donor/donorWalletCheck.test.js
git commit -m "feat(donor): extract checkDonorWallet as a framework-agnostic verification function"
```

---

### Task 2: `useDonorWalletCheck` hook + `PremiumUnlock` component (replaces `DonorUnlockDialog` everywhere)

**Files:**
- Create: `client/src/donor/useDonorWalletCheck.js`
- Create: `client/src/donor/PremiumUnlock/index.jsx`
- Create: `client/src/donor/PremiumUnlock/index.scss`
- Modify: `client/src/donor/PremiumGate/index.jsx`
- Modify: `client/src/analytics/DonorTab/index.jsx` (its `NoWalletState` also
  opens `DonorUnlockDialog` today — found during investigation, not
  originally named in the spec's file list, but directly required by the
  spec's "DonorUnlockDialog is removed ... everywhere" instruction)
- Delete: `client/src/donor/DonorUnlockDialog/index.jsx`,
  `client/src/donor/DonorUnlockDialog/index.scss`

**Interfaces:**
- Consumes: `checkDonorWallet`, `CHECK_STATUS` (Task 1); `useDonorStatus`
  (existing `contexts/DonorContext`).
- Produces: `useDonorWalletCheck()` → `{ status, result, check(address) }`
  (function-component hook). `<PremiumUnlock />` — no required props; it's
  fully self-contained (reads `setDonorWallet` via `useDonorStatus()`
  itself). Later tasks (4) render it wherever `DonorUnlockDialog` used to
  be opened.

- [ ] **Step 1: Write the hook**

```js
// client/src/donor/useDonorWalletCheck.js
import { useCallback, useState } from 'react';
import { useDonorStatus } from 'contexts/DonorContext';
import { checkDonorWallet, CHECK_STATUS } from './donorWalletCheck';

/*
 * Function-component wrapper around checkDonorWallet. On a qualifying
 * result, hands it straight to DonorContext.setDonorWallet so the caller
 * (DonorContext already has its own fresh result — Task 1's docstring)
 * doesn't re-fetch what this just fetched.
 */
export function useDonorWalletCheck() {
  const { setDonorWallet } = useDonorStatus();
  const [status, setStatus] = useState(CHECK_STATUS.IDLE);
  const [result, setResult] = useState(null);

  const check = useCallback(async (address) => {
    setStatus(CHECK_STATUS.CHECKING);
    setResult(null);
    const { status: nextStatus, result: nextResult } = await checkDonorWallet(address);
    setResult(nextResult);
    setStatus(nextStatus);
    if (nextStatus === CHECK_STATUS.SUCCESS) setDonorWallet(address.trim(), nextResult);
    return { status: nextStatus, result: nextResult };
  }, [setDonorWallet]);

  const reset = useCallback(() => {
    setStatus(CHECK_STATUS.IDLE);
    setResult(null);
  }, []);

  return { status, result, check, reset };
}
```

- [ ] **Step 2: Write `PremiumUnlock`**, porting `DonorUnlockDialog`'s body
  markup (`client/src/donor/DonorUnlockDialog/index.jsx:56-121`) without
  the `Dialog` wrapper:

```jsx
// client/src/donor/PremiumUnlock/index.jsx
import { useState } from 'react';
import { Button, InputGroup, Spinner } from '@blueprintjs/core';
import { DONOR_THRESHOLD_FLUX } from 'donor/config';
import { ADDRESS_FLUX } from 'content/index';
import { DonateChip } from 'components/Footer';
import { useDonorWalletCheck } from 'donor/useDonorWalletCheck';
import { CHECK_STATUS } from 'donor/donorWalletCheck';
import './index.scss';

/*
 * Inline replacement for the old DonorUnlockDialog modal — same
 * verification flow and messages, rendered directly wherever a locked
 * surface needs an unlock affordance (PremiumGate, PanelGate, DonorTab's
 * NoWalletState) instead of behind a click-to-open dialog.
 */
export function PremiumUnlock() {
  const { status, result, check } = useDonorWalletCheck();
  const [address, setAddress] = useState('');

  const handleCheck = () => {
    if (!address.trim() || status === CHECK_STATUS.CHECKING) return;
    check(address);
  };

  return (
    <div className="premium-unlock">
      <p className="premium-unlock-intro">
        Send at least {DONOR_THRESHOLD_FLUX} FLUX to our donation address within the
        last year, then enter the wallet you sent it from below.
      </p>

      <div className="premium-unlock-input-row">
        <InputGroup
          placeholder="t1... or t3..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={status === CHECK_STATUS.CHECKING}
          fill
        />
        <Button
          text={status === CHECK_STATUS.CHECKING ? 'Checking…' : 'Check wallet'}
          icon={status === CHECK_STATUS.CHECKING ? <Spinner size={16} /> : 'search'}
          onClick={handleCheck}
          disabled={!address.trim() || status === CHECK_STATUS.CHECKING}
          intent="primary"
        />
      </div>

      {status === CHECK_STATUS.INVALID && (
        <div className="premium-unlock-message premium-unlock-message--error">
          That doesn't look like a real Flux wallet address.
        </div>
      )}

      {status === CHECK_STATUS.SUCCESS && result && (
        <div className="premium-unlock-message premium-unlock-message--success">
          Unlocked — donor status active, {result.daysLeft} days left.
        </div>
      )}

      {status === CHECK_STATUS.UNVERIFIED && (
        <div className="premium-unlock-message premium-unlock-message--error">
          Couldn't reach the Flux explorer right now — try again in a moment.
        </div>
      )}

      {status === CHECK_STATUS.FAILURE && result && (
        <div className="premium-unlock-message premium-unlock-message--error">
          <span>
            This wallet has sent {result.totalInWindow.toFixed(2)} FLUX in the last
            year — needs at least {DONOR_THRESHOLD_FLUX}.
          </span>
          <DonateChip label="FLUX" address={ADDRESS_FLUX} />
        </div>
      )}
    </div>
  );
}
```

```scss
// client/src/donor/PremiumUnlock/index.scss
// Same visual language as the old .donor-unlock-* classes it replaces
// (client/src/donor/DonorUnlockDialog/index.scss) minus the Dialog-portal
// theming concerns — this renders inline, as a real descendant of .App,
// so it inherits dark-mode custom properties with no extra plumbing.
.premium-unlock {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 420px;
}

.premium-unlock-intro {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-tertiary);
  text-align: center;
}

.premium-unlock-input-row {
  display: flex;
  gap: 8px;
  align-items: center;

  .bp4-input {
    background: var(--surface-inset);
    color: var(--text-primary);

    &::placeholder {
      color: var(--text-tertiary);
    }
  }

  .bp4-button {
    flex-shrink: 0;
    white-space: nowrap;
  }
}

.premium-unlock-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.85rem;
  padding: 10px 12px;
  border-radius: var(--radius-md);

  &--success {
    color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
  }

  &--error {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }
}
```

- [ ] **Step 3: Swap `PremiumGate` onto `PremiumUnlock`** — replace the
  dialog-open button with `PremiumUnlock` rendered directly:

```jsx
// client/src/donor/PremiumGate/index.jsx (full replacement)
import { Lock } from 'lucide-react';
import { useDonorStatus } from 'contexts/DonorContext';
import { PremiumUnlock } from 'donor/PremiumUnlock';
import './index.scss';

/*
 * Wraps a premium route. Shows a locked explainer with the inline
 * PremiumUnlock unlock UI in place of real content when not unlocked.
 * Deliberately kept here rather than in the Navbar's click handler, so
 * any future premium route gets a working unlock affordance for free
 * just by wrapping it in this same component.
 */
export function PremiumGate({ feature, children }) {
  const { isUnlocked } = useDonorStatus();

  if (isUnlocked) return children;

  return (
    <div className="premium-gate-locked">
      <Lock size={28} className="premium-gate-locked-icon" />
      <span className="premium-gate-locked-title">{feature} is a premium feature</span>
      <span className="premium-gate-locked-body">
        Send FLUX to our donation address to unlock it.
      </span>
      <PremiumUnlock />
    </div>
  );
}
```

(`index.scss` is unchanged — same class names still used.)

- [ ] **Step 4: Swap `DonorTab`'s `NoWalletState` onto `PremiumUnlock`** —
  in `client/src/analytics/DonorTab/index.jsx`, replace the import and the
  component body:

```js
// Remove this line (5):
import { DonorUnlockDialog } from 'donor/DonorUnlockDialog';
// Add instead:
import { PremiumUnlock } from 'donor/PremiumUnlock';
```

```jsx
// Replace NoWalletState (currently index.jsx:154-168) with:
function NoWalletState() {
  return (
    <div className="dt-empty">
      <Lock size={28} className="dt-empty-icon" />
      <span className="dt-empty-title">No donor wallet connected</span>
      <span className="dt-empty-body">
        Unlock with a real donor wallet to see your own nodes' payout timing, apps, and utilization.
      </span>
      <PremiumUnlock />
    </div>
  );
}
```

Also remove the now-unused `Button` import and `useState`/`dialogOpen` if
nothing else in the file uses them — check before deleting (`Button` is
still used elsewhere in this file for `PayoutCard`'s "View wallet" action,
confirm with a search before removing the import).

- [ ] **Step 5: Delete `DonorUnlockDialog`**

```bash
git rm -r client/src/donor/DonorUnlockDialog
```

Search the whole `client/src` tree for any remaining `DonorUnlockDialog`
reference before this step (`grep -rn "DonorUnlockDialog" client/src`) —
Steps 3-4 cover the two known call sites, but confirm no third one exists
before deleting.

- [ ] **Step 6: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same count as this session's baseline (Task 1 added 5).

- [ ] **Step 7: Manual QA** — `yarn start` with
  `TESTING=false` (default) in `app-content.js`, visit `/live` while
  logged out: confirm the locked page shows `PremiumUnlock` inline (no
  dialog opens), type a real qualifying donor wallet, confirm it unlocks
  and the "Unlocked — donor status active" message shows. Visit
  `/analytics` (still route-gated until Task 4) and confirm the same.
  Revert `TESTING` to `false` and confirm `git status` clean before
  committing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(donor): replace modal DonorUnlockDialog with inline PremiumUnlock everywhere"
```

---

### Task 3: `panelAccess.js` config + `getPanelAccess` + `PanelGate` component

**Files:**
- Create: `client/src/analytics/panelAccess.js`
- Create: `client/src/analytics/panelAccess.test.js`
- Create: `client/src/analytics/PanelGate/index.jsx`
- Create: `client/src/analytics/PanelGate/index.scss`

**Interfaces:**
- Consumes: `useDonorStatus` (existing), `PremiumUnlock` (Task 2).
- Produces: `PANEL_ACCESS` (exported map), `getPanelAccess(panelKey,
  isUnlocked)` → boolean (pure, unit-tested), `<PanelGate panelKey="...">
  {children}</PanelGate>`. Task 4 imports `PanelGate` and the panel-key
  strings this task defines.

**Full panel-key list** (the spec named 5 illustrative keys; this task
enumerates every panel actually rendered in the 4 existing tabs today, per
the user's own explicit rule from brainstorming — *"let them stay
donor"* for everything already in Analytics — plus the 4 keys for panels
moving from Home in Session 2, added now so Session 2 doesn't need to
touch this file's shape):

```js
// client/src/analytics/panelAccess.js
/*
 * Single source of truth for /analytics' per-panel access level, replacing
 * the old whole-route <PremiumGate> (removed in Task 4). 'public' panels
 * render for everyone; 'donor' panels render PanelGate's locked state
 * until DonorContext.isUnlocked is true. Toggling any panel is a one-line
 * edit here — no component changes needed.
 *
 * Every panel currently rendered by AppsTab/NetworkTab/DonorTab/
 * ChainActivityTab has an explicit entry (no silent default) — anything
 * pre-existing in Analytics stays 'donor' per the user's explicit
 * direction during Track 2's brainstorming; DonorTab and ChainActivityTab
 * are each gated as one whole-tab unit (their content is one cohesive
 * dataset, not independently meaningful panels) rather than per-widget.
 * The 4 'public' keys below don't have a real panel wired to them until
 * Session 2 moves the actual components from /home — present now so this
 * config's shape doesn't change again then.
 */
export const PANEL_ACCESS = {
  // Apps tab
  appsTeamSponsoredStat: 'donor',
  appEcosystem: 'donor',
  topHostedApps: 'donor',
  topNodeOperators: 'donor',
  topAppOwners: 'donor',
  // Network tab
  worldMap: 'donor',
  continentBreakdown: 'donor',
  // Donor tab (whole tab, one unit)
  donorTab: 'donor',
  // Chain Activity tab (whole tab, one unit)
  chainActivity: 'donor',
  // Moving from /home in Session 2 — public per explicit user direction
  topDogs: 'public',
  expiringToday: 'public',
  deployedToday: 'public',
  workhorse: 'public',
};

export function getPanelAccess(panelKey, isUnlocked) {
  if (isUnlocked) return true;
  return PANEL_ACCESS[panelKey] === 'public';
}
```

- [ ] **Step 1: Write the failing test**

```js
// client/src/analytics/panelAccess.test.js
import { getPanelAccess, PANEL_ACCESS } from './panelAccess';

describe('getPanelAccess', () => {
  it('always renders when unlocked, regardless of config', () => {
    expect(getPanelAccess('donorTab', true)).toBe(true);
    expect(getPanelAccess('nonexistentKey', true)).toBe(true);
  });

  it('renders a public panel even when locked', () => {
    expect(getPanelAccess('topDogs', false)).toBe(true);
  });

  it('does not render a donor panel when locked', () => {
    expect(getPanelAccess('appEcosystem', false)).toBe(false);
  });

  it('treats an unknown key as locked-by-default when not unlocked', () => {
    expect(getPanelAccess('somethingNotInTheConfig', false)).toBe(false);
  });

  it('every currently-rendered Analytics panel has an explicit entry', () => {
    const required = [
      'appsTeamSponsoredStat', 'appEcosystem', 'topHostedApps',
      'topNodeOperators', 'topAppOwners', 'worldMap', 'continentBreakdown',
      'donorTab', 'chainActivity',
    ];
    for (const key of required) expect(PANEL_ACCESS).toHaveProperty(key);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && CI=true npx react-scripts test panelAccess --watchAll=false`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write `panelAccess.js`** — exact content given above.

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && CI=true npx react-scripts test panelAccess --watchAll=false`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Write `PanelGate`**

```jsx
// client/src/analytics/PanelGate/index.jsx
import { Lock } from 'lucide-react';
import { useDonorStatus } from 'contexts/DonorContext';
import { PremiumUnlock } from 'donor/PremiumUnlock';
import { getPanelAccess } from 'analytics/panelAccess';
import './index.scss';

/*
 * Per-panel sibling to donor/PremiumGate (which gates a whole route).
 * Session 1 ships this with the same plain locked-message treatment
 * PremiumGate already has — the blurred/ghosted real-data-preview
 * treatment is Part D of the spec, done visually in Sessions 3-4, not
 * here. This task only makes locking/unlocking work correctly per panel.
 */
export function PanelGate({ panelKey, feature, children }) {
  const { isUnlocked } = useDonorStatus();

  if (getPanelAccess(panelKey, isUnlocked)) return children;

  return (
    <div className="panel-gate-locked">
      <Lock size={20} className="panel-gate-locked-icon" />
      <span className="panel-gate-locked-title">{feature} is a premium feature</span>
      <PremiumUnlock />
    </div>
  );
}
```

```scss
// client/src/analytics/PanelGate/index.scss
// Smaller-footprint sibling of donor/PremiumGate's .premium-gate-locked —
// this sits inside a tab's panel grid, not centered on a whole page.
.panel-gate-locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 20px;
  text-align: center;
  background: var(--surface-inset);
  border-radius: var(--radius-md);
}

.panel-gate-locked-icon {
  color: var(--text-tertiary);
  opacity: 0.7;
}

.panel-gate-locked-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/analytics/panelAccess.js client/src/analytics/panelAccess.test.js client/src/analytics/PanelGate
git commit -m "feat(analytics): panelAccess config + PanelGate component for per-panel donor gating"
```

---

### Task 4: Wire `PanelGate` into Analytics; remove the route-level gate

**Files:**
- Modify: `client/src/Application.jsx` (remove `/analytics`'s `PremiumGate`
  wrap)
- Modify: `client/src/analytics/AppsTab/index.jsx`
- Modify: `client/src/analytics/NetworkTab/index.jsx`
- Modify: `client/src/analytics/Analytics.jsx` (wrap `DonorTab`/
  `ChainActivityTab` as whole-tab gates)

**Interfaces:**
- Consumes: `PanelGate` (Task 3).
- Produces: `/analytics` is reachable by everyone; individual panels gate
  themselves. Session 2 (panel moves) builds directly on this — it adds
  `<PanelGate panelKey="topDogs">` etc. around the newly-moved panels, no
  further change to this task's files needed.

- [ ] **Step 1: Remove the route-level gate** — in `Application.jsx`
  (currently lines 169-180):

```jsx
// Before:
<Route
  path='/analytics'
  element={
    <ErrorBoundary>
      <React.Suspense fallback={<PageLoader />}>
        <PremiumGate feature='Analytics'>
          <Analytics />
        </PremiumGate>
      </React.Suspense>
    </ErrorBoundary>
  }
/>
// After:
<Route
  path='/analytics'
  element={
    <ErrorBoundary>
      <React.Suspense fallback={<PageLoader />}>
        <Analytics />
      </React.Suspense>
    </ErrorBoundary>
  }
/>
```

`/live`'s `PremiumGate` usage is untouched — only `/analytics` changes
shape. Don't remove the `PremiumGate` import yet; `/live` still uses it.

- [ ] **Step 2: Wrap `AppsTab`'s panels** — in
  `client/src/analytics/AppsTab/index.jsx`, add the import and wrap each
  panel (current return block, lines 94-118):

```jsx
import { PanelGate } from 'analytics/PanelGate';
// ...
return (
  <div className="apps-tab">
    <div className="apps-tab-stat-row">
      <PanelGate panelKey="appsTeamSponsoredStat" feature="Flux-team-sponsored stat">
        <div className="hov-panel apps-tab-stat-card">
          <span className="hov-header-title">FLUX-TEAM-SPONSORED</span>
          <span className="apps-tab-stat-value">{sharePct.toFixed(1)}%</span>
          <span className="apps-tab-stat-caption">
            of {fmtNum(networkTotalInstances)} ordered app instances run under the Flux team's own owner ID
          </span>
        </div>
      </PanelGate>
    </div>

    <div className="apps-tab-panel-grid">
      <PanelGate panelKey="appEcosystem" feature="App Ecosystem">
        <AppEcosystemBreakdown gstore={gstore} />
      </PanelGate>
      <PanelGate panelKey="topHostedApps" feature="Top Hosted Apps">
        <TopHostedApps gstore={gstore} />
      </PanelGate>
      <PanelGate panelKey="topNodeOperators" feature="Top Node Operators">
        <RankedAddressList title="TOP NODE OPERATORS" rows={nodeOperatorRows} valueLabel="nodes" />
      </PanelGate>
      <PanelGate panelKey="topAppOwners" feature="Top App Owners">
        <RankedAddressList
          title="TOP APP OWNERS"
          rows={ownerRows}
          valueLabel="instances"
          teamZelids={FLUX_TEAM_OWNER_ZELIDS}
        />
      </PanelGate>
    </div>
  </div>
);
```

Note: `gstore`/`nodeOperatorRows`/`ownerRows` etc. still get fetched and
computed exactly as before, unconditionally — only the *rendering* is
gated, not the data fetch. This is deliberate and matches Part D's later
blurred-preview design, which needs real data underneath the blur; don't
add a fetch-skipping optimization here.

- [ ] **Step 3: Wrap `NetworkTab`'s panels** — in
  `client/src/analytics/NetworkTab/index.jsx` (current return, lines
  106-113):

```jsx
import { PanelGate } from 'analytics/PanelGate';
// ...
return (
  <div className="network-tab">
    <PanelGate panelKey="worldMap" feature="World Map">
      <WorldMap countryCounts={countryCounts} />
    </PanelGate>
    <div className="network-tab-continent-row">
      <PanelGate panelKey="continentBreakdown" feature="Continent Breakdown">
        <ContinentBreakdown continents={continentData.continents} networkTotal={continentData.networkTotal} />
      </PanelGate>
    </div>
  </div>
);
```

- [ ] **Step 4: Wrap `DonorTab` and `ChainActivityTab` as whole tabs** — in
  `client/src/analytics/Analytics.jsx`:

```jsx
import { PanelGate } from 'analytics/PanelGate';
// ...
<Tab id="donor" title="Donor" panel={
  <PanelGate panelKey="donorTab" feature="the Donor tab">
    <DonorTab />
  </PanelGate>
} />
<Tab id="chain-activity" title="Chain Activity" panel={
  <PanelGate panelKey="chainActivity" feature="Chain Activity">
    <ChainActivityTab />
  </PanelGate>
} />
```

`AppsTab`/`NetworkTab` themselves are NOT wrapped at this level — they
render un-gated (their own internal panels handle gating individually,
per Steps 2-3).

- [ ] **Step 5: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, same count as after Task 3.

- [ ] **Step 6: Manual QA** — with `TESTING=false`, visit `/analytics`
  logged out: confirm the tab shell and all 4 tab labels render (this is
  new — previously the whole page was one lock screen), Apps/Network tabs
  show `PanelGate`'s locked message per panel instead of real content,
  Donor/Chain-Activity tabs show one locked message for the whole tab.
  Then set `TESTING=true`, reload, confirm everything renders normally
  exactly as it does on `main` today. Revert `TESTING` to `false`, confirm
  `git status` clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(analytics): per-panel PanelGate wiring, remove whole-route PremiumGate"
```

---

### Task 5: `Application.jsx` — thread `setDonorWallet` to Home and MainApp

**Files:**
- Modify: `client/src/Application.jsx`

**Interfaces:**
- Consumes: `DonorContext.Consumer` (existing).
- Produces: `Home` and `MainApp` both receive a `setDonorWallet` prop.
  Tasks 6 and 7 use `this.props.setDonorWallet`.

**Why this is its own task:** class components can't call hooks, so
`Home.jsx`/`MainApp.jsx` can't call `useDonorStatus()` directly to get
`setDonorWallet`. Both already have `static contextType` claimed by
`LayoutContext` (used for `this.context.setLastUpdated`/
`setArcaneHumanVersion`), so a second `contextType` isn't available
either. `MainApp` already receives `donorWallet` this same way (a
`<DonorContext.Consumer>` wrapper in `Application.jsx` passing it down as
a prop) — this task extends that existing, proven pattern to also pass
`setDonorWallet`, and adds the same wrapper (currently absent) around
`<Home>`.

- [ ] **Step 1: Wrap `<Home>` in a `DonorContext.Consumer`** — currently
  (`Application.jsx:123-132`):

```jsx
// Before:
<Route
  path='/home'
  element={
    <ErrorBoundary>
      <React.Suspense fallback={<PageLoader />}>
        <Home theme={darkMode ? 'dark' : 'light'} />
      </React.Suspense>
    </ErrorBoundary>
  }
/>
// After:
<Route
  path='/home'
  element={
    <ErrorBoundary>
      <React.Suspense fallback={<PageLoader />}>
        <DonorContext.Consumer>
          {({ setDonorWallet }) => (
            <Home theme={darkMode ? 'dark' : 'light'} setDonorWallet={setDonorWallet} />
          )}
        </DonorContext.Consumer>
      </React.Suspense>
    </ErrorBoundary>
  }
/>
```

- [ ] **Step 2: Extend `<MainApp>`'s existing `DonorContext.Consumer`** —
  currently (`Application.jsx:133-146`):

```jsx
// Before:
<DonorContext.Consumer>
  {({ donorWallet }) => (
    <MainApp theme={darkMode ? 'dark' : 'light'} donorWallet={donorWallet} />
  )}
</DonorContext.Consumer>
// After:
<DonorContext.Consumer>
  {({ donorWallet, setDonorWallet }) => (
    <MainApp theme={darkMode ? 'dark' : 'light'} donorWallet={donorWallet} setDonorWallet={setDonorWallet} />
  )}
</DonorContext.Consumer>
```

- [ ] **Step 3: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, unchanged count (no new tests this task — this is plumbing
only, verified live in Tasks 6-7-8, not worth a shallow render-only test
this repo's convention doesn't otherwise use).

- [ ] **Step 4: Commit**

```bash
git add client/src/Application.jsx
git commit -m "feat(donor): thread setDonorWallet to Home and MainApp via DonorContext.Consumer"
```

---

### Task 6: `Home.jsx` wallet-search integration — crash guard + donor auto-detect + toast

**Files:**
- Create: `client/src/donor/runDonorAutoDetect.js`
- Modify: `client/src/home/Home.jsx`

**Interfaces:**
- Consumes: `checkDonorWallet`, `CHECK_STATUS` (Task 1); `this.props.setDonorWallet` (Task 5).
- Produces: `export async function runDonorAutoDetect(address, { setDonorWallet })`
  → `{ status, result }` (same shape as `checkDonorWallet`, but only calls
  `setDonorWallet` on a qualifying result — the actual side effect). Task 7
  reuses this same function unchanged.

- [ ] **Step 1: Write `runDonorAutoDetect`**, the class-component-safe
  helper (no hooks):

```js
// client/src/donor/runDonorAutoDetect.js
import { checkDonorWallet, CHECK_STATUS } from './donorWalletCheck';

/*
 * Plain (non-hook) wrapper around checkDonorWallet for the two legacy
 * class components (Home.jsx, MainApp.jsx) that can't call
 * useDonorWalletCheck. Takes setDonorWallet as a parameter (threaded down
 * as a prop from Application.jsx's DonorContext.Consumer — see Task 5)
 * rather than reading it from context directly. Silent on a
 * non-qualifying result by design: the caller searched this wallet to
 * look up node/earnings data, not to check donor status, so an address
 * that simply isn't a donor shouldn't produce any visible error.
 */
export async function runDonorAutoDetect(address, { setDonorWallet }) {
  const { status, result } = await checkDonorWallet(address);
  if (status === CHECK_STATUS.SUCCESS) setDonorWallet(address.trim(), result);
  return { status, result };
}
```

No dedicated unit test file for this one — it's a 3-line orchestration of
two already-tested pieces (`checkDonorWallet`, a passed-in setter);
`checkDonorWallet`'s own tests (Task 1) already cover every status branch
this delegates to. Covered instead by Task 8's live QA, matching this
repo's convention of not writing tests that just re-assert a mock was
called.

- [ ] **Step 2: Fix the dead-ref crash AND wire auto-detect** — in
  `client/src/home/Home.jsx`, add the import:

```js
import { runDonorAutoDetect } from 'donor/runDonorAutoDetect';
import { CHECK_STATUS } from 'donor/donorWalletCheck';
import { AppToaster } from 'components/AppToaster'; // already imported — confirm, don't duplicate
```

Then replace the block currently at `Home.jsx:308-344`:

```jsx
// Before:
    blurAllInputs();
    this.setSearch({ wallet: address }, { replace: false });

    {
      let newSearchHistory = this._createNewHistoryList(this.state.searchHistory, address);
      this.setState({ searchHistory: newSearchHistory });
      await appStore.setItem(StoreKeys.ADDR_SEARCH_HISTORY, newSearchHistory);
    }

    let isDOS = await isWalletDOSState(address);
    this.setState({ isDOS });

    const gstore = await fetch_global_stats(address);

    fetch_total_donations(address).then((res) => {
      this.setState({ totalDonations: res });
    });

    fetch_total_network_utils(gstore).then((store) => {
      this.setState({ gstore: store });
    });

    this.setState({
      isWalletAvailable: true,

      isNodesLoading: false,
      isPALoading: true, // Now start to fetch PA's (below)

      gstore,
      activeAddress: address
    });

    walletView.processAddress(address, gstore, ({ highestRankedNode, bestUptimeNode, mostHostedNode }) => {
      highestRankedNode && this.payoutTimer.receiveNode(highestRankedNode);
      bestUptimeNode && this.bestUptime.receiveNode(bestUptimeNode);
      mostHostedNode && this.mostHosted.receiveNode(mostHostedNode);
    });

    const summary = await wallet_pas_summary(address);
```

```jsx
// After:
    blurAllInputs();
    this.setSearch({ wallet: address }, { replace: false });

    // Fire-and-forget donor auto-detection — doesn't block or affect
    // anything else in this method. Silent unless the wallet qualifies,
    // in which case a toast confirms it (see below).
    runDonorAutoDetect(address, { setDonorWallet: this.props.setDonorWallet }).then(({ status }) => {
      if (status === CHECK_STATUS.SUCCESS) {
        AppToaster.show({
          intent: 'success',
          icon: 'tick-circle',
          message: 'Your wallet qualifies — premium features unlocked!',
        });
      }
    });

    {
      let newSearchHistory = this._createNewHistoryList(this.state.searchHistory, address);
      this.setState({ searchHistory: newSearchHistory });
      await appStore.setItem(StoreKeys.ADDR_SEARCH_HISTORY, newSearchHistory);
    }

    let isDOS = await isWalletDOSState(address);
    this.setState({ isDOS });

    const gstore = await fetch_global_stats(address);

    fetch_total_donations(address).then((res) => {
      this.setState({ totalDonations: res });
    });

    fetch_total_network_utils(gstore).then((store) => {
      this.setState({ gstore: store });
    });

    this.setState({
      isWalletAvailable: true,

      isNodesLoading: false,
      isPALoading: true, // Now start to fetch PA's (below)

      gstore,
      activeAddress: address
    });

    // walletView is a ref that has never actually been attached to a
    // rendered <WalletNodes> on this page (this.walletNodes' ref is
    // created in the constructor but no JSX anywhere sets ref={this.walletNodes}
    // — confirmed by searching this file and home/HomeOverview for a
    // <WalletNodes> tag; there isn't one). Before this fix, calling
    // .processAddress on that always-null ref threw synchronously,
    // silently killing everything below in this async method —
    // wallet_pas_summary, isPALoading clearing, setLastUpdated,
    // setArcaneHumanVersion never ran. Guarding it restores those without
    // attempting to also revive the notable-nodes feature itself (payout
    // timer / best uptime / most hosted), which needs a real render of
    // WalletNodes to compute — out of scope here, filed separately.
    if (walletView) {
      walletView.processAddress(address, gstore, ({ highestRankedNode, bestUptimeNode, mostHostedNode }) => {
        highestRankedNode && this.payoutTimer.receiveNode(highestRankedNode);
        bestUptimeNode && this.bestUptime.receiveNode(bestUptimeNode);
        mostHostedNode && this.mostHosted.receiveNode(mostHostedNode);
      });
    }

    const summary = await wallet_pas_summary(address);
```

- [ ] **Step 3: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, unchanged count.

- [ ] **Step 4: Manual QA** (in addition to Task 8's dedicated regression
  pass) — with `TESTING=false`, open the browser console, search a real
  wallet on `/home`. Confirm (a) no uncaught `TypeError` in the console
  where there used to be one, (b) the PA summary section actually loads
  (previously stuck), (c) searching a wallet you know qualifies as a donor
  shows the new success toast, (d) searching a real non-donor wallet shows
  no toast and no error. Revert `TESTING`, confirm `git status` clean.

- [ ] **Step 5: Commit**

```bash
git add client/src/donor/runDonorAutoDetect.js client/src/home/Home.jsx
git commit -m "fix(home): guard the dead walletView ref; wire donor auto-detect on wallet search"
```

---

### Task 7: `MainApp.jsx` wallet-search integration — donor auto-detect + toast

**Files:**
- Modify: `client/src/main/MainApp.jsx`

**Interfaces:**
- Consumes: `runDonorAutoDetect` (Task 6); `this.props.setDonorWallet`
  (Task 5).

Same pattern as Task 6, minus the crash guard — `MainApp.jsx`'s
`walletView` ref is genuinely attached (confirmed: `<WalletNodes
ref={this.walletNodes} .../>` really is rendered in this file, unlike
Home's). Don't add an `if (walletView)` guard here — that would silently
hide a real future regression if this ref ever did break.

- [ ] **Step 1: Add the import**

```js
import { runDonorAutoDetect } from 'donor/runDonorAutoDetect';
import { CHECK_STATUS } from 'donor/donorWalletCheck';
```

(`AppToaster` is already imported — `MainApp.jsx:12`.)

- [ ] **Step 2: Wire the call** — in `MainApp.jsx`'s `onProcessAddress`,
  immediately after the block currently at lines 354-355
  (`blurAllInputs(); this.setSearch(...)`), insert:

```jsx
    // Fire-and-forget donor auto-detection — see Home.jsx's identical
    // wiring (Task 6) for the full rationale; this mirrors it exactly.
    runDonorAutoDetect(address, { setDonorWallet: this.props.setDonorWallet }).then(({ status }) => {
      if (status === CHECK_STATUS.SUCCESS) {
        AppToaster.show({
          intent: 'success',
          icon: 'tick-circle',
          message: 'Your wallet qualifies — premium features unlocked!',
        });
      }
    });
```

- [ ] **Step 3: Run the full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, unchanged count.

- [ ] **Step 4: Manual QA** — with `TESTING=false`, search a real donor
  wallet on `/nodes` directly (not via Home), confirm the toast appears
  and donor status unlocks app-wide (check `/live` or `/analytics` becomes
  reachable without re-entering the wallet). Search a non-donor wallet,
  confirm no toast/error and the Nodes page's own node grid/health/PA
  summary all still populate exactly as before. Revert `TESTING`, confirm
  `git status` clean.

- [ ] **Step 5: Commit**

```bash
git add client/src/main/MainApp.jsx
git commit -m "feat(nodes): wire donor auto-detect on the Nodes page's wallet search"
```

---

### Task 8: Mandatory live regression QA — Nodes-page calculations, real wallet, before/after

**This task is the governing constraint from the spec and from direct user
instruction. Do not skip it. Do not consider this session done without
it.**

**Files:** none created/modified — this task is verification only, but it
gates whether Task 9's PR is safe to open.

- [ ] **Step 1: Establish the "before" baseline on `main`** — in a
  separate checkout (or `git stash`/`git checkout main` temporarily),
  `yarn start`, set `TESTING=true` in `app-content.js` (revert after),
  search the **same real wallet used in the 2026-09-09 session's live
  QA** (see `fluxnode-next-steps` memory / PR #191 for which wallet that
  was — reuse it so this is a true apples-to-apples comparison, not a
  fresh wallet with nothing to compare against) on both `/home` and
  `/nodes`. Record: node count and list, health/tier counts, any
  ranking/achievement badges shown, PA summary numbers, total donations
  figure.

- [ ] **Step 2: Same wallet, this branch** — switch back to
  `worktrees/analytics-session1`, `yarn start`, same `TESTING=true`,
  search the identical wallet on both `/home` and `/nodes`. Record the
  same numbers.

- [ ] **Step 3: Diff before vs. after** — every number from Step 1 must
  match Step 2 exactly, on both pages. Specifically confirm: `/nodes`'
  node grid, health panel, and PA summary are byte-for-byte the same
  (Task 7 only added a fire-and-forget side call — nothing it does should
  be able to change these); `/home`'s PA summary, which was previously
  stuck loading forever due to the dead-ref crash, now actually completes
  and shows real numbers (this is an intentional, expected *improvement*
  from Task 6 — call this out explicitly as such, don't mistake it for an
  unexpected diff).

- [ ] **Step 4: Second wallet — a multi-node-same-host wallet if one is
  known** — the 2026-09-09 bugs (`rankInGroup`/`lookupNodeInfo`) were both
  specifically about wallets owning several same-tier nodes on one host
  (bare-IP collapsing). This session doesn't touch that ranking code
  directly, but Task 6/7's auto-detect call sits in the same method as the
  ranking fetch calls — confirm a wallet with that shape (reuse the one
  identified in the 2026-09-09c session's memory/PR #191 if available)
  still shows identical rankings/achievements before vs. after.

- [ ] **Step 5: Revert `TESTING` to `false`** in both checkouts, confirm
  `git status` clean in the worktree before proceeding to Task 9.

- [ ] **Step 6: Document the result** — add a short section to the PR
  description (Task 9) stating exactly which wallet(s) were compared and
  that all figures matched, so the reviewer/user doesn't have to take it
  on faith. If anything did NOT match, stop here and fix it before Task 9
  — do not open a PR with a known regression.

---

### Task 9: Final whole-branch review + PR

**Files:** none created — final verification and PR only.

- [ ] **Step 1: Whole-branch diff review** — `git diff --stat main` from
  the worktree; confirm every changed file is one this plan actually
  named (Tasks 1-8's file lists). Read the full diff once end-to-end
  looking specifically for: any other `DonorUnlockDialog` reference missed
  by Task 2's search, any panel in Analytics left ungated (cross-check
  against Task 3's full key list), any `TESTING=true` left set.

- [ ] **Step 2: Full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: PASS. Record the final count and compare against this session's
recorded baseline (Global Constraints) — should be baseline + 10 (5 from
Task 1, 5 from Task 3).

- [ ] **Step 3: Production build**

Run: `cd client && npx react-scripts build`
Expected: exit 0. Compare warning files against this session's baseline —
flag anything beyond the pre-existing 4 baseline warning files (or
whatever this session's Global-Constraints baseline check found).

- [ ] **Step 4: Confirm Task 8's live regression QA is actually done and
  documented** — do not consider this session done otherwise.

- [ ] **Step 5: `git diff --stat main`**

Confirm only the files this plan's tasks actually named changed (Tasks
1-8's file lists) — no unrelated files, no leftover `TESTING=true`.

PR creation itself follows this repo's standard
`superpowers:finishing-a-development-branch` flow, not a scripted step
here — when it happens, the PR description must cover: that Sessions 2-4
of the Analytics rework depend on this landing first, Task 8's wallet-
comparison summary (which wallet(s), that every figure matched), and an
explicit callout of the `Home.jsx` dead-ref crash fix as a separate, real
bug fix bundled in (not part of Track 2's original scope, folded in per
direct user approval during planning — see Task 6).
