
async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'accept': 'application/geo+json, application/json',
      'user-agent': 'san-gabriel-river-watch/0.1 (contact local administrator)'
    }
  });

  if (!res.ok) {
    throw new Error(`NWS request failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

async function fetchPointMetadata(lat, lon) {
  return fetchJson(`https://api.weather.gov/points/${lat},${lon}`);
}

async function fetchForecast(pointMeta) {
  const hourlyUrl = pointMeta?.properties?.forecastHourly;
  const forecastUrl = pointMeta?.properties?.forecast;
  const gridUrl = pointMeta?.properties?.forecastGridData;

  const [hourly, daily, grid] = await Promise.all([
    hourlyUrl ? fetchJson(hourlyUrl) : Promise.resolve(null),
    forecastUrl ? fetchJson(forecastUrl) : Promise.resolve(null),
    gridUrl ? fetchJson(gridUrl) : Promise.resolve(null)
  ]);

  return { hourly, daily, grid };
}

async function fetchActiveAlerts(lat, lon) {
  const url = new URL('https://api.weather.gov/alerts/active');
  url.searchParams.set('point', `${lat},${lon}`);
  return fetchJson(url.toString());
}

function extractRainSignal(hourlyForecast) {
  const periods = hourlyForecast?.properties?.periods || [];
  const next12 = periods.slice(0, 12);

  let precipitationProbabilityMax = 0;
  let intenseRainSignal = false;
  let headline = 'No strong rain signal detected in next 12 hours.';

  for (const period of next12) {
    const pop = Number(period.probabilityOfPrecipitation?.value || 0);
    precipitationProbabilityMax = Math.max(precipitationProbabilityMax, pop);

    const text = `${period.shortForecast || ''} ${period.detailedForecast || ''}`.toLowerCase();
    if (/(thunderstorm|heavy rain|torrential|flash flood)/.test(text)) {
      intenseRainSignal = true;
      headline = `Potential intense rainfall mentioned in forecast period: ${period.name || period.startTime}.`;
    }
  }

  return {
    precipitationProbabilityMax,
    intenseRainSignal,
    headline,
    next12Hours: next12.map((p) => ({
      startTime: p.startTime,
      name: p.name,
      temperature: p.temperature,
      temperatureUnit: p.temperatureUnit,
      probabilityOfPrecipitation: p.probabilityOfPrecipitation?.value,
      shortForecast: p.shortForecast
    }))
  };
}

function parseISODurationHours(durationText) {
  if (!durationText) return 1;
  const match = durationText.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?/);
  if (!match) return 1;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  return Math.max(1, (days * 24) + hours);
}

function expandGridValues(values, maxHours = 24) {
  const hourly = [];
  for (const entry of values || []) {
    const validTime = entry?.validTime;
    const value = entry?.value;
    if (value == null || !validTime) continue;
    const [start, duration] = validTime.split('/');
    const hours = parseISODurationHours(duration);
    const startMs = new Date(start).getTime();
    for (let i = 0; i < hours && hourly.length < maxHours; i++) {
      hourly.push({
        time: new Date(startMs + i * 3600000).toISOString(),
        value: Number(value)
      });
    }
    if (hourly.length >= maxHours) break;
  }
  return hourly;
}

function mmToInches(mm) {
  return mm == null ? null : Number((Number(mm) / 25.4).toFixed(2));
}

function extractBasinRainfallProfile(forecast) {
  const hourlyForecast = forecast?.hourly?.properties?.periods || [];
  const gridProps = forecast?.grid?.properties || {};

  const qpfSeriesRaw =
    gridProps.quantitativePrecipitation?.values ||
    gridProps.quantitativePrecipitation12Hour?.values ||
    gridProps.quantitativePrecipitation6Hour?.values ||
    [];

  const popSeriesRaw = gridProps.probabilityOfPrecipitation?.values || [];

  const qpfHourlyMM = expandGridValues(qpfSeriesRaw, 24);
  const popHourly = expandGridValues(popSeriesRaw, 24);

  const qpf6hIn = qpfHourlyMM.length
    ? Number(qpfHourlyMM.slice(0, 6).reduce((a, p) => a + Number(p.value || 0), 0) / 25.4).toFixed(2)
    : null;
  const qpf12hIn = qpfHourlyMM.length
    ? Number(qpfHourlyMM.slice(0, 12).reduce((a, p) => a + Number(p.value || 0), 0) / 25.4).toFixed(2)
    : null;
  const qpf24hIn = qpfHourlyMM.length
    ? Number(qpfHourlyMM.slice(0, 24).reduce((a, p) => a + Number(p.value || 0), 0) / 25.4).toFixed(2)
    : null;

  const popMax6h = popHourly.length
    ? Math.max(...popHourly.slice(0, 6).map(p => Number(p.value || 0)))
    : Math.max(...hourlyForecast.slice(0, 6).map(p => Number(p?.probabilityOfPrecipitation?.value || 0)), 0);

  const intense = hourlyForecast.slice(0, 12).some(p => /(thunderstorm|heavy rain|torrential|flash flood)/i.test(`${p?.shortForecast || ''} ${p?.detailedForecast || ''}`));

  return {
    qpf6hIn: qpf6hIn == null ? null : Number(qpf6hIn),
    qpf12hIn: qpf12hIn == null ? null : Number(qpf12hIn),
    qpf24hIn: qpf24hIn == null ? null : Number(qpf24hIn),
    popMax6h,
    intenseRainSignal: intense,
    hourlyNamePreview: hourlyForecast.slice(0, 3).map(p => p?.shortForecast).filter(Boolean)
  };
}

module.exports = {
  fetchPointMetadata,
  fetchForecast,
  fetchActiveAlerts,
  extractRainSignal,
  extractBasinRainfallProfile
};
