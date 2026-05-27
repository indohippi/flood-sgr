const express = require('express');
const path = require('path');
const config = require('./config');
const { fetchGaugeBundle } = require('./usgs');
const { fetchPointMetadata, fetchForecast, fetchActiveAlerts, extractRainSignal, extractBasinRainfallProfile } = require('./weather');
const { fetchLakeGeorgetownBundle } = require('./lake');
const { evaluateFloodRisk } = require('./scoring');
const {
  ensureStorage,
  persistSnapshot,
  listHistory,
  persistAlertEvent,
  listAlertEvents,
  readState,
  writeState
} = require('./storage');
const { shouldNotify, buildMessage, deliverNotification } = require('./notifier');

ensureStorage();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

let cache = {
  lastUpdated: null,
  data: null,
  error: null
};

const DEFAULT_THRESHOLD_SETTINGS = {
  southForkStages: { action: 5, minor: 9, moderate: 13, major: 26 },
  combinedIndex: { action: 10, minor: 18, moderate: 26, major: 52 },
  berryWeirIndex: { action: 18.21, minor: 26.21, moderate: 34.21, major: 60.21 },
  tropicalThreat: { yellow: 20, orange: 45, red: 70 }
};

function getThresholdSettings() {
  const state = readState();
  return {
    southForkStages: { ...DEFAULT_THRESHOLD_SETTINGS.southForkStages, ...(state.thresholdSettings?.southForkStages || {}) },
    combinedIndex: { ...DEFAULT_THRESHOLD_SETTINGS.combinedIndex, ...(state.thresholdSettings?.combinedIndex || {}) },
    berryWeirIndex: { ...DEFAULT_THRESHOLD_SETTINGS.berryWeirIndex, ...(state.thresholdSettings?.berryWeirIndex || {}) },
    tropicalThreat: { ...DEFAULT_THRESHOLD_SETTINGS.tropicalThreat, ...(state.thresholdSettings?.tropicalThreat || {}) }
  };
}

function validateThreshold(value, min = -100, max = 1000) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Invalid threshold value: must be a finite number`);
  }
  if (num < min || num > max) {
    throw new Error(`Invalid threshold value ${num}: must be between ${min} and ${max}`);
  }
  return num;
}

async function buildSnapshot() {
  const gaugeBundles = await Promise.all(
    config.gauges.map(async (gauge) => {
      try {
        const bundle = await fetchGaugeBundle(gauge);
        console.log(`[USGS] ${gauge.id} keys=${Object.keys(bundle.latest || {}).join(',') || 'none'} source=${bundle.source}`);
        return bundle;
      } catch (error) {
        console.error(`[USGS] ${gauge.id} failed: ${error.message}`);
        return {
          gauge,
          latest: {},
          trends: {},
          source: 'error',
          fetchedAt: new Date().toISOString(),
          error: error.message,
          debug: {}
        };
      }
    })
  );
  const pointMeta = await fetchPointMetadata(config.property.lat, config.property.lon);
  const alerts = await fetchActiveAlerts(config.property.lat, config.property.lon);
  const forecast = await fetchForecast(pointMeta);
  const rainSignal = extractRainSignal(forecast.hourly);

  const basinEntries = Object.entries(config.basinPoints || {});
  const basinWeatherEntries = await Promise.all(
    basinEntries.map(async ([key, point]) => {
      const meta = await fetchPointMetadata(point.lat, point.lon);
      const basinForecast = await fetchForecast(meta);
      return [key, {
        point,
        office: meta?.properties?.gridId,
        forecastZone: meta?.properties?.forecastZone,
        county: meta?.properties?.county,
        profile: extractBasinRainfallProfile(basinForecast),
        forecast: {
          hourlyPreview: (basinForecast?.hourly?.properties?.periods || []).slice(0, 6).map((p) => ({
            startTime: p.startTime,
            probabilityOfPrecipitation: p?.probabilityOfPrecipitation?.value,
            shortForecast: p?.shortForecast || ''
          }))
        }
      }];
    })
  );
  const basinWeather = Object.fromEntries(basinWeatherEntries);

  const lakeData = await fetchLakeGeorgetownBundle();
  const thresholdSettings = getThresholdSettings();
  const scorecard = evaluateFloodRisk({ gaugeBundles, alerts, rainSignal, lakeData, settings: thresholdSettings });

  return {
    generatedAt: new Date().toISOString(),
    property: config.property,
    gauges: gaugeBundles,
    weather: {
      office: pointMeta?.properties?.gridId,
      forecastZone: pointMeta?.properties?.forecastZone,
      county: pointMeta?.properties?.county,
      alerts,
      forecast,
      rainSignal
    },
    basinWeather,
    lake: lakeData,
    settings: { thresholds: thresholdSettings },
    scorecard
  };
}

async function processNotifications(snapshot) {
  const state = readState();
  const current = {
    status: snapshot.scorecard.statuses.property,
    score: snapshot.scorecard.scores.property,
    generatedAt: snapshot.generatedAt
  };
  const previous = state.notificationState?.property || null;

  if (!shouldNotify({ previous, current })) {
    state.notificationState = { ...state.notificationState, property: { ...previous, ...current, checkedAt: snapshot.generatedAt } };
    writeState(state);
    return;
  }

  const message = buildMessage(snapshot);
  const delivery = await deliverNotification(message);
  const event = {
    timestamp: snapshot.generatedAt,
    status: current.status,
    score: current.score,
    headline: message.headline,
    body: message.body,
    delivery
  };

  persistAlertEvent(event);
  state.notificationState = {
    ...state.notificationState,
    property: {
      status: current.status,
      score: current.score,
      sentAt: snapshot.generatedAt,
      lastHeadline: message.headline
    }
  };
  writeState(state);
}

async function refreshCache() {
  try {
    const data = await buildSnapshot();
    persistSnapshot(data);
    await processNotifications(data);
    cache = {
      lastUpdated: data.generatedAt,
      data,
      error: null
    };
  } catch (error) {
    cache = {
      ...cache,
      error: {
        message: error.message,
        time: new Date().toISOString()
      }
    };
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    lastUpdated: cache.lastUpdated,
    hasData: Boolean(cache.data),
    error: cache.error,
    gaugeDebug: (cache.data?.gauges || []).map((g) => ({
      id: g.gauge?.id,
      source: g.source,
      error: g.error || null,
      latestKeys: Object.keys(g.latest || {}),
      debug: g.debug || null
    })),
    lakeDebug: cache.data?.lake?.lakeMeta || null
  });
});

app.get('/api/snapshot', async (_req, res) => {
  if (!cache.data) await refreshCache();
  if (!cache.data) {
    return res.status(503).json({ error: 'No data available yet.', details: cache.error });
  }

  return res.json({
    generatedAt: cache.lastUpdated,
    ...cache.data,
    history: listHistory(72),
    alertEvents: listAlertEvents(20),
    error: cache.error
  });
});

app.get('/api/history', (_req, res) => {
  const limit = Math.min(Number(_req.query.limit || 144), config.app.historyLimit);
  res.json({ items: listHistory(limit) });
});

app.get('/api/alerts', (_req, res) => {
  const limit = Math.min(Number(_req.query.limit || 50), 200);
  res.json({ items: listAlertEvents(limit) });
});

app.post('/api/refresh', async (_req, res) => {
  await refreshCache();
  if (!cache.data) return res.status(503).json({ ok: false, error: cache.error });
  res.json({ ok: true, lastUpdated: cache.lastUpdated });
});


app.get('/api/settings', (_req, res) => {
  res.json({ thresholds: getThresholdSettings() });
});

app.post('/api/settings', async (req, res) => {
  try {
    const incoming = req.body?.thresholds || {};
    const state = readState();
    const thresholds = {
      southForkStages: {
        action: validateThreshold(incoming?.southForkStages?.action ?? DEFAULT_THRESHOLD_SETTINGS.southForkStages.action),
        minor: validateThreshold(incoming?.southForkStages?.minor ?? DEFAULT_THRESHOLD_SETTINGS.southForkStages.minor),
        moderate: validateThreshold(incoming?.southForkStages?.moderate ?? DEFAULT_THRESHOLD_SETTINGS.southForkStages.moderate),
        major: validateThreshold(incoming?.southForkStages?.major ?? DEFAULT_THRESHOLD_SETTINGS.southForkStages.major)
      },
      combinedIndex: {
        action: validateThreshold(incoming?.combinedIndex?.action ?? DEFAULT_THRESHOLD_SETTINGS.combinedIndex.action),
        minor: validateThreshold(incoming?.combinedIndex?.minor ?? DEFAULT_THRESHOLD_SETTINGS.combinedIndex.minor),
        moderate: validateThreshold(incoming?.combinedIndex?.moderate ?? DEFAULT_THRESHOLD_SETTINGS.combinedIndex.moderate),
        major: validateThreshold(incoming?.combinedIndex?.major ?? DEFAULT_THRESHOLD_SETTINGS.combinedIndex.major)
      },
      berryWeirIndex: {
        action: validateThreshold(incoming?.berryWeirIndex?.action ?? DEFAULT_THRESHOLD_SETTINGS.berryWeirIndex.action),
        minor: validateThreshold(incoming?.berryWeirIndex?.minor ?? DEFAULT_THRESHOLD_SETTINGS.berryWeirIndex.minor),
        moderate: validateThreshold(incoming?.berryWeirIndex?.moderate ?? DEFAULT_THRESHOLD_SETTINGS.berryWeirIndex.moderate),
        major: validateThreshold(incoming?.berryWeirIndex?.major ?? DEFAULT_THRESHOLD_SETTINGS.berryWeirIndex.major)
      },
      tropicalThreat: {
        yellow: validateThreshold(incoming?.tropicalThreat?.yellow ?? DEFAULT_THRESHOLD_SETTINGS.tropicalThreat.yellow, 0, 100),
        orange: validateThreshold(incoming?.tropicalThreat?.orange ?? DEFAULT_THRESHOLD_SETTINGS.tropicalThreat.orange, 0, 100),
        red: validateThreshold(incoming?.tropicalThreat?.red ?? DEFAULT_THRESHOLD_SETTINGS.tropicalThreat.red, 0, 100)
      }
    };

    state.thresholdSettings = thresholds;
    writeState(state);
    await refreshCache();
    res.json({ ok: true, thresholds });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(config.app.port, config.app.host, async () => {
  console.log(`Flood monitor listening on http://${config.app.host}:${config.app.port}`);
  await refreshCache();
  setInterval(refreshCache, config.app.pollMinutes * 60 * 1000);
});
