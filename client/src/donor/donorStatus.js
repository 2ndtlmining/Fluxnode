import { DONOR_THRESHOLD_FLUX, DONOR_WINDOW_DAYS } from 'donor/config';

const WINDOW_MS = DONOR_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/*
 * Pure — no network, no storage. Given every donation record known within the
 * trailing window, decides donor status and, if qualified, the exact date the
 * running total would first drop below DONOR_THRESHOLD_FLUX as records age
 * past their own 365-day mark. This is what makes "days left" always
 * chain-accurate instead of a separately stored, driftable expiry.
 */
export function computeDonorStatus(records, nowMs = Date.now()) {
  const windowStart = nowMs - WINDOW_MS;
  const inWindow = (records || []).filter((r) => r.date >= windowStart && r.date <= nowMs);
  const totalInWindow = inWindow.reduce((sum, r) => sum + r.amount, 0);

  if (totalInWindow < DONOR_THRESHOLD_FLUX) {
    return { isDonor: false, totalInWindow, expiresAt: null, daysLeft: 0 };
  }

  // Oldest-first: each record "ages out" of the window at record.date + 365d.
  // Walk those drop dates in order, subtracting as we go, until the running
  // total would first fall below the threshold — that's the real expiry.
  const oldestFirst = [...inWindow].sort((a, b) => a.date - b.date);
  let running = totalInWindow;
  let expiresAt = null;
  for (const record of oldestFirst) {
    running -= record.amount;
    if (running < DONOR_THRESHOLD_FLUX) {
      expiresAt = record.date + WINDOW_MS;
      break;
    }
  }
  // totalInWindow >= DONOR_THRESHOLD_FLUX (checked above) and DONOR_THRESHOLD_FLUX > 0,
  // so removing every record eventually drives running to 0, which is always
  // < DONOR_THRESHOLD_FLUX — the loop cannot exit without setting expiresAt.

  const daysLeft = Math.max(0, Math.ceil((expiresAt - nowMs) / (24 * 60 * 60 * 1000)));
  return { isDonor: true, totalInWindow, expiresAt, daysLeft };
}
