/*
 * Approximate [lat, lon] centroids by ISO 3166-1 alpha-2 country code, used to
 * place a country-level ping on the world map. Node geolocation elsewhere in
 * the app (nodeGeoMap) is country-level only, so per-node precision isn't
 * available or needed here — a centroid is an honest representation of what
 * we actually know.
 *
 * Coordinates are deliberately approximate (rounded, "visually about right"),
 * not survey-grade — fine for a decorative ping, not for navigation.
 */
export const COUNTRY_CENTROIDS = {
  US: [39.8, -98.6], CA: [56.1, -106.3], MX: [23.6, -102.5],
  BR: [-14.2, -51.9], AR: [-38.4, -63.6], CL: [-35.7, -71.5], CO: [4.6, -74.1],
  PE: [-9.2, -75.0], VE: [6.4, -66.6], EC: [-1.8, -78.2], UY: [-32.5, -55.8],
  GB: [55.4, -3.4], IE: [53.4, -8.2], FR: [46.2, 2.2], DE: [51.2, 10.5],
  NL: [52.1, 5.3], BE: [50.5, 4.5], LU: [49.8, 6.1], CH: [46.8, 8.2],
  AT: [47.5, 14.6], ES: [40.5, -3.7], PT: [39.4, -8.2], IT: [41.9, 12.6],
  SE: [60.1, 18.6], NO: [60.5, 8.5], FI: [61.9, 25.7], DK: [56.3, 9.5],
  IS: [64.9, -19.0], PL: [51.9, 19.1], CZ: [49.8, 15.5], SK: [48.7, 19.7],
  HU: [47.2, 19.5], RO: [45.9, 24.9], BG: [42.7, 25.5], GR: [39.1, 21.8],
  UA: [48.4, 31.2], BY: [53.7, 27.9], RU: [61.5, 105.3], TR: [38.9, 35.2],
  RS: [44.0, 21.0], HR: [45.1, 15.2], SI: [46.1, 14.8], LT: [55.2, 23.9],
  LV: [56.9, 24.6], EE: [58.6, 25.0], MD: [47.4, 28.4], AL: [41.2, 20.2],
  MT: [35.9, 14.4], CY: [35.1, 33.4],
  CN: [35.9, 104.2], JP: [36.2, 138.3], KR: [35.9, 127.8], KP: [40.3, 127.5],
  IN: [20.6, 79.0], PK: [30.4, 69.3], BD: [23.7, 90.4], LK: [7.9, 80.8],
  NP: [28.4, 84.1], SG: [1.35, 103.8], MY: [4.2, 101.9], TH: [15.9, 100.99],
  VN: [14.1, 108.3], PH: [12.9, 121.8], ID: [-0.8, 113.9], MM: [21.9, 95.96],
  KH: [12.6, 104.99], LA: [19.9, 102.5], TW: [23.7, 121.0], HK: [22.3, 114.2],
  MN: [46.9, 103.8], KZ: [48.0, 66.9], UZ: [41.4, 64.6], AZ: [40.1, 47.6],
  GE: [42.3, 43.4], AM: [40.1, 45.0],
  AU: [-25.3, 133.8], NZ: [-40.9, 174.9], FJ: [-17.7, 178.1],
  ZA: [-30.6, 22.9], NG: [9.1, 8.7], EG: [26.8, 30.8], KE: [-0.02, 37.9],
  MA: [31.8, -7.1], DZ: [28.0, 1.7], TN: [33.9, 9.5], GH: [7.9, -1.0],
  ET: [9.1, 40.5], TZ: [-6.4, 34.9], UG: [1.4, 32.3], CI: [7.5, -5.5],
  SN: [14.5, -14.5], CM: [3.8, 11.5], ZM: [-13.1, 27.9], ZW: [-19.0, 29.2],
  AO: [-11.2, 17.9], MZ: [-18.7, 35.5], NA: [-22.9, 18.5], BW: [-22.3, 24.7],
  RW: [-1.9, 30.1], LY: [26.3, 17.2], SD: [12.9, 30.2],
  IL: [31.0, 34.8], SA: [23.9, 45.1], AE: [23.4, 53.8], QA: [25.4, 51.2],
  KW: [29.3, 47.5], BH: [26.0, 50.6], OM: [21.5, 55.9], JO: [30.6, 36.2],
  LB: [33.9, 35.9], IQ: [33.2, 43.7], IR: [32.4, 53.7], SY: [34.8, 38.9],
  YE: [15.6, 48.0],
  PA: [8.5, -80.8], CR: [9.7, -83.8], NI: [12.9, -85.2], HN: [15.2, -86.2],
  GT: [15.8, -90.2], SV: [13.8, -88.9], DO: [18.7, -70.2], CU: [21.5, -77.8],
  JM: [18.1, -77.3], PR: [18.2, -66.6], BS: [24.3, -76.6], TT: [10.7, -61.2],
  BO: [-16.3, -63.6], PY: [-23.4, -58.4], GY: [4.9, -58.9], SR: [3.9, -56.0],
};

// Fallback so an unmapped country still gets a plausible spot instead of the
// map's [0, 0] origin (which is empty ocean).
export const DEFAULT_CENTROID = [20, 0];

export function getCountryCentroid(countryCode) {
  if (!countryCode) return null;
  return COUNTRY_CENTROIDS[countryCode.toUpperCase()] || null;
}

// Equirectangular projection: plain lat/lon -> percentage position within a
// rectangular map container. No mapping library needed, GPU-friendly (the
// caller only ever sets a CSS transform/left/top from these), and accurate
// enough for a country-level dot.
export function projectToPercent([lat, lon]) {
  const x = ((lon + 180) / 360) * 100;
  const y = ((90 - lat) / 180) * 100;
  return { xPct: x, yPct: y };
}
