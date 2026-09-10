import fs from 'fs';
import path from 'path';
import { create_global_store, fill_rewards } from 'apidata';

/*
 * The APP side of the D1 (earnings) audit.
 *
 * This runs the app's OWN functions -- that is the point. The independent
 * reimplementation lives in tools/audit/reference/d1_earnings.py, and the two
 * are compared by tools/audit/compare.py. Both are fed the same captured
 * fixture, so nothing here depends on the network or on when it runs.
 *
 * It lives as a Jest test rather than a standalone Node script for one
 * practical reason: Jest already resolves this project's module aliases
 * (`apidata`, `content/index`, ...) and already provides `window.gContent` via
 * setupTests.js. Reimplementing that resolution in a bare script would be a
 * second, subtly-different loader -- exactly the kind of near-duplicate that
 * causes the bugs this audit hunts.
 *
 * It is INERT in a normal test run: with no fixture captured it skips, so
 * `npm test` neither fails nor writes files. Run `python tools/audit/capture.py`
 * first to arm it.
 *
 * Note the dependency this creates: because it runs under Jest, it reads
 * setupTests.js's `window.gContent`, NOT production's app-content.js. That is
 * only sound while those two agree -- which constantsParity.test.js enforces.
 * If that test fails, this file's output is meaningless and compare.py says so.
 */

const FIXTURE_DIR = path.join(__dirname, '..', '..', '..', 'tools', 'audit', 'fixtures', 'latest');
const NODE_COUNT_FIXTURE = path.join(FIXTURE_DIR, 'getzelnodecount.json');

const armed = fs.existsSync(NODE_COUNT_FIXTURE);
const whenArmed = armed ? describe : describe.skip;

whenArmed('D1 earnings -- app side', () => {
  it('emits the projections the app would display, from the captured fixture', () => {
    const payload = JSON.parse(fs.readFileSync(NODE_COUNT_FIXTURE, 'utf8'));
    const stats = payload.data || payload;

    const gstore = create_global_store();
    gstore.node_count.cumulus = stats['cumulus-enabled'];
    gstore.node_count.nimbus = stats['nimbus-enabled'];
    gstore.node_count.stratus = stats['stratus-enabled'];

    fill_rewards(gstore);

    const out = {};
    for (const tier of ['cumulus', 'nimbus', 'stratus']) {
      const p = gstore.reward_projections[tier];
      out[tier] = {
        pay_frequency: p.pay_frequency,
        payment_amount: p.payment_amount,
        pa_amount: p.pa_amount,
        apy: p.apy,
      };
    }

    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'appside-d1.json'),
      JSON.stringify(out, null, 2),
      'utf8'
    );

    // Assertions here are deliberately weak. This is a data-emitting step, not
    // the check -- the real verdict is compare.py's diff against the
    // independent reference. Asserting expected VALUES here would just be the
    // app grading its own homework.
    for (const tier of ['cumulus', 'nimbus', 'stratus']) {
      expect(Number.isFinite(out[tier].payment_amount)).toBe(true);
      expect(out[tier].payment_amount).toBeGreaterThan(0);
    }
  });
});
