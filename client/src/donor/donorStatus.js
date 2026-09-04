import { ADDRESS_FLUX } from 'content/index';
import { DONOR_THRESHOLD_FLUX, DONOR_WINDOW_DAYS, DONOR_MAX_PAGES_FETCHED, DONOR_STATUS_CACHE_TTL_MS } from 'donor/config';

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

const TXS_BY_ADDRESS_ENDPOINT = 'https://explorer.runonflux.io/api/txs';
const DONOR_STATUS_CACHE_KEY = 'donorStatus_v1';

async function safeFetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Sums every vout in `tx` paid to `address` — a tx can pay the same address
// more than once, so this is a sum, not a find-first.
function sumVoutToAddress(tx, address) {
  return (tx.vout || []).reduce((sum, vout) => {
    const addresses = vout.scriptPubKey?.addresses || [];
    return addresses.includes(address) ? sum + Number(vout.value) : sum;
  }, 0);
}

function readDonorStatusCache(address) {
  try {
    const raw = localStorage.getItem(DONOR_STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.address !== address) return null;
    if (Date.now() - parsed.timestamp >= DONOR_STATUS_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeDonorStatusCache(address, data) {
  try {
    localStorage.setItem(DONOR_STATUS_CACHE_KEY, JSON.stringify({ address, data, timestamp: Date.now() }));
  } catch {
    // localStorage unavailable/full — non-fatal, just skip caching this result
  }
}

/*
 * Pages through the donation address's own transaction history (same
 * endpoint apidata.js's fetch_total_donations already uses), stopping as
 * soon as a transaction older than the DONOR_WINDOW_DAYS window is reached
 * — confirmed 2026-09-05 that this API returns newest-first, so early-stop
 * is safe. Unlike fetch_total_donations (which only counts matching tx
 * occurrences), this sums the real FLUX amount paid to the donation address
 * by `walletAddress` specifically.
 */
export async function fetch_donor_status(walletAddress) {
  const cached = readDonorStatusCache(walletAddress);
  if (cached) return cached;

  const nowMs = Date.now();
  const windowStartSec = Math.floor((nowMs - WINDOW_MS) / 1000);
  const baseUrl = `${TXS_BY_ADDRESS_ENDPOINT}?address=${ADDRESS_FLUX}`;

  const records = [];
  let pageNum = 0;
  let pagesTotal = 1;
  let hitWindowEdge = false;

  while (!hitWindowEdge && pageNum < pagesTotal && pageNum < DONOR_MAX_PAGES_FETCHED) {
    const url = pageNum === 0 ? baseUrl : `${baseUrl}&pageNum=${pageNum}`;
    const json = await safeFetchJson(url);
    if (!json) break; // explorer unreachable partway through — incomplete scan, see scanComplete below

    pagesTotal = json.pagesTotal || 1;
    const txs = Array.isArray(json.txs) ? json.txs : [];

    for (const tx of txs) {
      if (tx.time < windowStartSec) {
        hitWindowEdge = true;
        break;
      }
      const sentByWallet = (tx.vin || []).some((v) => v.addr === walletAddress);
      if (!sentByWallet) continue;
      const amount = sumVoutToAddress(tx, ADDRESS_FLUX);
      if (amount > 0) records.push({ date: tx.time * 1000, amount });
    }

    pageNum += 1;
  }

  // A scan only counts as a trustworthy answer if it either reached the
  // window boundary (hitWindowEdge) or genuinely exhausted every page the
  // explorer reports (pageNum >= pagesTotal). Anything else — a fetch
  // failing partway through, or hitting the page cap — is incomplete and
  // must never be cached or reported as a confident "not a donor". A
  // positive result is always trustworthy even from a partial scan, since
  // more data can only raise totalInWindow, never lower it.
  const scanComplete = hitWindowEdge || pageNum >= pagesTotal;
  const computed = computeDonorStatus(records, nowMs);
  const result = { ...computed, verified: scanComplete || computed.isDonor };

  if (result.verified) {
    writeDonorStatusCache(walletAddress, result);
  }
  return result;
}
