const { fetchGaugeBundle } = require('./usgs');

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      accept: 'text/html,application/json'
    }
  });
  if (!res.ok) {
    throw new Error(`Lake request failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function parseNumber(value) {
  if (value == null) return null;
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function pickLakeElevation(bundle) {
  return bundle?.latest?.['62614']?.value
    ?? bundle?.latest?.['00062']?.value
    ?? bundle?.latest?.['00065']?.value
    ?? null;
}

function compute24hChange(bundle) {
  const series =
    bundle?.series?.['62614']
    ?? bundle?.series?.['00062']
    ?? bundle?.series?.['00065']
    ?? [];

  if (!Array.isArray(series) || series.length < 2) return null;

  const sorted = [...series]
    .map((p) => ({ time: p.time, value: Number(p.value) }))
    .filter((p) => Number.isFinite(p.value) && p.time)
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  if (sorted.length < 2) return null;

  const latest = sorted[sorted.length - 1];
  const latestMs = new Date(latest.time).getTime();
  const targetMs = latestMs - (24 * 60 * 60 * 1000);

  let baseline = sorted[0];
  for (const point of sorted) {
    if (new Date(point.time).getTime() <= targetMs) {
      baseline = point;
    } else {
      break;
    }
  }

  return Number((latest.value - baseline.value).toFixed(2));
}

async function fetchLakeGeorgetownBundle() {
  const lakeGauge = {
    id: 'USGS-08104650',
    shortName: 'Lake Georgetown',
    role: 'reservoir-condition',
    kind: 'lakeGeorgetown',
    priority: 1,
    parameterTargets: ['00062', '62614', '00065'],
    labels: {
      '00062': 'Lake elevation (ft)',
      '62614': 'Water surface elevation (ft)',
      '00065': 'Gage height (ft)'
    }
  };

  let lakeGaugeBundle = null;
  let lakeGaugeError = null;
  try {
    lakeGaugeBundle = await fetchGaugeBundle(lakeGauge);
  } catch (error) {
    lakeGaugeError = error.message;
    lakeGaugeBundle = {
      gauge: lakeGauge,
      latest: {},
      trends: {},
      series: {},
      source: 'error',
      fetchedAt: new Date().toISOString(),
      error: error.message,
      debug: {}
    };
  }

  const urls = {
    overview: 'https://water.usace.army.mil/overview/swf/locations/gglt2',
    status: 'https://www.swf-wc.usace.army.mil/lake/status.htm',
    release: 'https://www.swf-wc.usace.army.mil/selectreport/releasereport.shtml'
  };

  let overviewText = '';
  let statusText = '';
  let releaseText = '';
  const errors = [];

  for (const [key, url] of Object.entries(urls)) {
    try {
      const txt = await fetchText(url);
      if (key === 'overview') overviewText = txt;
      if (key === 'status') statusText = txt;
      if (key === 'release') releaseText = txt;
    } catch (error) {
      errors.push(`${key}: ${error.message}`);
    }
  }

  const usgsElevation = pickLakeElevation(lakeGaugeBundle);
  const usgs24hChange = compute24hChange(lakeGaugeBundle);

  const currentPoolElevationOverview = parseNumber(
    overviewText.match(/current pool elevation is\s*([0-9.,-]+)/i)?.[1]
  );

  const change24hOverview =
    parseNumber(overviewText.match(/increased in elevation\s*([0-9.,-]+)\s*feet in the last 24 hours/i)?.[1]) ??
    (parseNumber(overviewText.match(/decreased in elevation\s*([0-9.,-]+)\s*feet in the last 24 hours/i)?.[1]) * -1);

  let statusRow = null;
  const lines = statusText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^Georgetown\b/i.test(line)) {
      statusRow = line;
      break;
    }
  }

  let conservationPool = null;
  let deltaFromConservation = null;
  let releaseCfs = null;
  let floodPool = null;

  if (statusRow) {
    const nums = (statusRow.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length >= 6) {
      conservationPool = nums[1] ?? null;
      deltaFromConservation = nums[2] ?? null;
      if (releaseCfs == null) releaseCfs = nums[4] ?? null;
      floodPool = nums[5] ?? null;
    }
  }

  const releaseLines = releaseText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let releaseRow = null;
  for (const line of releaseLines) {
    if (/^Georgetown\b/i.test(line)) {
      releaseRow = line;
      break;
    }
  }
  if (releaseRow) {
    const nums = (releaseRow.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length >= 5) {
      releaseCfs = releaseCfs ?? nums[4] ?? null;
    }
  }

  const elevation = usgsElevation ?? currentPoolElevationOverview ?? null;
  const change24h = usgs24hChange ?? change24hOverview ?? null;

  const spillwayCrestFt = 834.0;
  const topOfDamFt = 861.0;
  const feetBelowSpillway =
    elevation == null ? null : Number((spillwayCrestFt - elevation).toFixed(2));

  return {
    lakeGauge: lakeGaugeBundle,
    lakeMeta: {
      currentPoolElevationFt: elevation,
      conservationPoolFt: conservationPool,
      deltaFromConservationFt: deltaFromConservation,
      change24hFt: change24h,
      releaseCfs,
      floodPoolFt: floodPool,
      spillwayCrestFt,
      topOfDamFt,
      feetBelowSpillway,
      elevationSource: usgsElevation != null ? 'USGS gauge' : (currentPoolElevationOverview != null ? 'USACE page' : 'unavailable'),
      change24hSource: usgs24hChange != null ? 'Computed from USGS series' : (change24hOverview != null ? 'USACE page' : 'unavailable'),
      releaseSource: releaseCfs != null ? 'USACE page' : 'unavailable',
      sourceUrls: urls,
      errors: [...errors, ...(lakeGaugeError ? [`lakeGauge: ${lakeGaugeError}`] : [])],
      fetchedAt: new Date().toISOString()
    }
  };
}

module.exports = {
  fetchLakeGeorgetownBundle
};
