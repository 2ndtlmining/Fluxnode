// Map ip-api.com continent name to a short code
const CONTINENT_CODE_MAP = {
  'North America': 'NA',
  'South America': 'SA',
  Europe: 'EU',
  Asia: 'AS',
  Africa: 'AF',
  Oceania: 'OC',
  Antarctica: 'AN',
};

export function countryCodeToFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';
  // Regional Indicator Symbol letters: A = 0x1F1E6
  const base = 0x1f1e6 - 65;
  return (
    String.fromCodePoint(countryCode.charCodeAt(0) + base) +
    String.fromCodePoint(countryCode.charCodeAt(1) + base)
  );
}

/**
 * Geolocate the unique IPs of wallet nodes using ip-api.com batch endpoint.
 * Returns { [ip]: { country, countryCode, continent, continentCode, flag } }
 * Silently returns {} if the API is unavailable.
 */
export async function geolocateNodes(walletNodes) {
  if (!walletNodes || walletNodes.length === 0) return {};

  const ips = walletNodes.map((n) => n.ip_full?.host).filter(Boolean);
  const unique = [...new Set(ips)].slice(0, 100);

  if (unique.length === 0) return {};

  try {
    const res = await fetch('http://ip-api.com/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        unique.map((query) => ({
          query,
          fields: 'status,query,country,countryCode,continent',
        }))
      ),
    });

    if (!res.ok) return {};

    const data = await res.json();

    const result = {};
    data.forEach((item) => {
      if (item.status === 'success') {
        const continentCode = CONTINENT_CODE_MAP[item.continent] || item.continent;
        result[item.query] = {
          country: item.country,
          countryCode: item.countryCode,
          continent: item.continent,
          continentCode,
          flag: countryCodeToFlag(item.countryCode),
        };
      }
    });

    return result;
  } catch (e) {
    console.warn('[Gamification] Geolocation failed:', e);
    return {};
  }
}
