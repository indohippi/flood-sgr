const fs = require('fs');
const path = require('path');
const config = require('./config');

const storageDir = config.storage.dir;
const snapshotPath = path.join(storageDir, config.storage.snapshotFile);
const alertPath = path.join(storageDir, config.storage.alertFile);
const statePath = path.join(storageDir, config.storage.stateFile);

function ensureStorage() {
  fs.mkdirSync(storageDir, { recursive: true });
  for (const target of [snapshotPath, alertPath]) {
    if (!fs.existsSync(target)) fs.writeFileSync(target, '');
  }
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify({ notificationState: {} }, null, 2));
  }
}

function appendJsonLine(filePath, value) {
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function readJsonLines(filePath, limit = 100) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function readState() {
  ensureStorage();
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { notificationState: {} };
  }
}

function writeState(state) {
  ensureStorage();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function persistSnapshot(snapshot) {
  ensureStorage();
  const primaryGauge = snapshot.gauges.find((g) => g.gauge.kind === 'southForkGeorgetown');
  const northGauge = snapshot.gauges.find((g) => g.gauge.kind === 'northFork');
  const weirGauge = snapshot.gauges.find((g) => g.gauge.kind === 'downstreamWeir');

  appendJsonLine(snapshotPath, {
    timestamp: snapshot.generatedAt,
    propertyStatus: snapshot.scorecard.statuses.property,
    propertyScore: snapshot.scorecard.scores.property,
    riverStatus: snapshot.scorecard.statuses.river,
    riverScore: snapshot.scorecard.scores.river,
    flashStatus: snapshot.scorecard.statuses.flashRunoff,
    flashScore: snapshot.scorecard.scores.flashRunoff,
    southForkGeorgetownStageFt: primaryGauge?.latest?.['00065']?.value ?? null,
    northForkStageFt: northGauge?.latest?.['00065']?.value ?? null,
    weirStageFt: weirGauge?.latest?.['00065']?.value ?? null,
    alerts: snapshot.scorecard.signals.alertTitles || []
  });
}

function listHistory(limit = 100) {
  return readJsonLines(snapshotPath, limit);
}

function persistAlertEvent(event) {
  ensureStorage();
  appendJsonLine(alertPath, event);
}

function listAlertEvents(limit = 100) {
  return readJsonLines(alertPath, limit);
}

module.exports = {
  ensureStorage,
  persistSnapshot,
  listHistory,
  persistAlertEvent,
  listAlertEvents,
  readState,
  writeState
};
