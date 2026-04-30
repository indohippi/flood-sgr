const LEGACY_BASE = 'https://waterservices.usgs.gov/nwis/iv/';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`USGS request failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function stripMonitoringPrefix(monitoringLocationId) {
  return String(monitoringLocationId || '').replace(/^USGS-/, '');
}

function buildLegacyInstantValuesUrl(monitoringLocationId, days = 2, parameterTargets = []) {
  const url = new URL(LEGACY_BASE);
  url.searchParams.set('format', 'json');
  url.searchParams.set('sites', stripMonitoringPrefix(monitoringLocationId));
  url.searchParams.set('siteStatus', 'all');
  url.searchParams.set('period', `P${days}D`);
  if (parameterTargets.length) {
    url.searchParams.set('parameterCd', parameterTargets.join(','));
  }
  return url.toString();
}

function normalizeLegacyIv(payload) {
  const series = payload?.value?.timeSeries || [];
  const latest = {};
  const trendSeries = {};

  for (const ts of series) {
    const code = ts?.variable?.variableCode?.[0]?.value;
    if (!code) continue;

    const unit = ts?.variable?.unit?.unitCode || ts?.variable?.unit?.unitCd || null;
    const groups = Array.isArray(ts?.values) ? ts.values : [];
    const values = groups.flatMap((group) => Array.isArray(group?.value) ? group.value : []);
    const normalized = values
      .map((entry) => ({
        time: entry.dateTime,
        value: Number(entry.value),
        unit,
        qualifiers: entry.qualifiers || []
      }))
      .filter((entry) => Number.isFinite(entry.value))
      .sort((a, b) => new Date(a.time) - new Date(b.time));

    if (!normalized.length) continue;

    trendSeries[code] = normalized.map(({ time, value, unit }) => ({ time, value, unit }));
    const finalPoint = normalized[normalized.length - 1];
    latest[code] = {
      parameterCode: code,
      unit,
      value: finalPoint.value,
      time: finalPoint.time,
      statisticId: null,
      timeSeriesId: ts?.name || null,
      qualifiers: finalPoint.qualifiers || []
    };
  }

  return { latest, trendSeries, seriesCount: series.length };
}

function summarizeTrend(points) {
  if (!points || points.length < 2) {
    return {
      direction: 'unknown',
      delta: null,
      deltaPerHour: null,
      latest: points?.at(-1)?.value ?? null
    };
  }

  const latest = points.at(-1);
  const baseline = points[Math.max(0, points.length - 9)];
  const delta = latest.value - baseline.value;
  const hours = Math.max((new Date(latest.time) - new Date(baseline.time)) / 3600000, 0.25);
  const deltaPerHour = delta / hours;

  let direction = 'steady';
  if (deltaPerHour > 0.05) direction = 'rising';
  if (deltaPerHour < -0.05) direction = 'falling';

  return {
    direction,
    delta,
    deltaPerHour,
    latest: latest.value,
    startTime: baseline.time,
    endTime: latest.time
  };
}

async function fetchGaugeBundle(gauge) {
  const url = buildLegacyInstantValuesUrl(gauge.id, 2, gauge.parameterTargets || []);
  const payload = await fetchJson(url);
  const { latest, trendSeries, seriesCount } = normalizeLegacyIv(payload);

  const trends = {};
  for (const code of gauge.parameterTargets || []) {
    trends[code] = summarizeTrend(trendSeries[code]);
  }

  return {
    gauge,
    latest,
    trends,
    series: trendSeries,
    source: 'legacy-nwis-iv',
    fetchedAt: new Date().toISOString(),
    debug: {
      requestUrl: url,
      seriesCount,
      latestKeys: Object.keys(latest),
      trendKeys: Object.keys(trendSeries)
    }
  };
}

module.exports = {
  fetchGaugeBundle
};
