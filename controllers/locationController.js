const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '../data/usStateCities.json');

/** @type {Record<string, string[]> | null} */
let cityData = null;

const ABBREV_TO_FULL = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

const FULL_TO_ABBREV = Object.fromEntries(
  Object.entries(ABBREV_TO_FULL).map(([abbr, full]) => [full, abbr]),
);

function loadData() {
  if (!cityData) {
    cityData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  }
  return cityData;
}

/**
 * @param {string} raw
 * @param {Record<string, string[]>} data
 */
function resolveStateKey(raw, data) {
  const s = String(raw).trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (up.length === 2 && ABBREV_TO_FULL[up]) {
    return ABBREV_TO_FULL[up];
  }
  const keys = Object.keys(data);
  const lower = s.toLowerCase();
  for (const k of keys) {
    if (k.toLowerCase() === lower) return k;
  }
  for (const k of keys) {
    if (k.toLowerCase().startsWith(lower) && lower.length >= 3) return k;
  }
  return null;
}

/** In-memory cache: resolved state name -> payload */
const cache = new Map();
const CACHE_TTL_MS = parseInt(process.env.LOCATIONS_CITIES_CACHE_MS, 10) || 60 * 60 * 1000;

/**
 * GET /api/locations/cities?state=California
 * Response: { state, stateCode, cities: [{ name }] }
 * Legacy: ?format=array → [ { name }, ... ] only (no meta)
 */
function getCitiesByState(req, res) {
  try {
    const state = req.query.state;
    const format = req.query.format;

    if (!state || !String(state).trim()) {
      if (format === 'array') return res.json([]);
      return res.json({ state: null, stateCode: null, cities: [] });
    }

    const data = loadData();
    const key = resolveStateKey(String(state), data);
    if (!key) {
      if (format === 'array') return res.json([]);
      return res.json({ state: null, stateCode: null, cities: [] });
    }

    const now = Date.now();
    const cacheKey = key;
    const hit = cache.get(cacheKey);
    if (hit && now - hit.t < CACHE_TTL_MS) {
      if (format === 'array') return res.json(hit.payload.cities);
      return res.json(hit.payload);
    }

    const names = data[key] || [];
    const stateCode = FULL_TO_ABBREV[key] || null;
    const cities = names.map((name) => ({ name }));
    const payload = { state: key, stateCode, cities };

    cache.set(cacheKey, { t: now, payload });

    if (format === 'array') return res.json(cities);
    return res.json(payload);
  } catch (e) {
    console.error('getCitiesByState', e);
    return res.status(500).json({
      success: false,
      error: 'Failed to load cities',
      state: null,
      stateCode: null,
      cities: [],
    });
  }
}

module.exports = {
  getCitiesByState,
};
