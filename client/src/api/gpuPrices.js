/*
 * GPU pricing and fleet totals from the FluxCore service.
 *
 * Extracted from apidata.js (issue #147). A MOVE, not a rewrite.
 *
 * Session-cached for GPU_PRICES_CACHE_TTL: the numbers move slowly and every
 * Analytics visit would otherwise re-fetch them. Both the cache read and the
 * cache write are wrapped -- sessionStorage throws in private-mode Safari and
 * when the quota is full, and neither is a reason to lose the data we just
 * fetched.
 */

import { REQUEST_OPTIONS_API } from 'api/endpoints';

const API_GPU_PRICES_URL = 'https://service.fluxcore.ai/api/getGPUPrices';
const GPU_PRICES_CACHE_KEY = 'gpuPrices_v1';
const GPU_PRICES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetch_gpu_prices() {
  try {
    const raw = sessionStorage.getItem(GPU_PRICES_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.timestamp < GPU_PRICES_CACHE_TTL) {
        return cached.data;
      }
    }
  } catch {}

  try {
    const res = await fetch(API_GPU_PRICES_URL, { ...REQUEST_OPTIONS_API });
    const json = await res.json();
    if (!Array.isArray(json)) return null;

    const totalGPUs = json.reduce((s, g) => s + (g.number_of_gpus || 0), 0);
    const totalComputers = json.reduce((s, g) => s + (g.number_of_computers || 0), 0);
    const models = json
      .filter((g) => g.number_of_gpus > 0)
      .sort((a, b) => b.number_of_gpus - a.number_of_gpus);

    const data = { models, totalGPUs, totalComputers };
    try {
      sessionStorage.setItem(GPU_PRICES_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
      console.warn('[GPU] Cache write failed:', e?.message);
    }
    return data;
  } catch {
    return null;
  }
}
