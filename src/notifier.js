const config = require('./config');

function statusRank(status) {
  return { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 }[status] ?? 0;
}

function minutesSince(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function shouldNotify({ previous, current }) {
  if (!config.notifications.enabled) return false;
  if (!config.notifications.triggerStatuses.includes(current.status)) return false;
  if (!previous) return true;
  if (statusRank(current.status) > statusRank(previous.status)) return true;
  if (minutesSince(previous.sentAt) >= config.notifications.resendMinutes && current.status !== 'GREEN') return true;
  return false;
}

function buildMessage(snapshot) {
  const scorecard = snapshot.scorecard;
  const hist = scorecard.historicalComparison;
  const reasons = (scorecard.reasons || []).slice(0, 3).join(' ');
  return {
    headline: `Flood monitor status ${scorecard.statuses.property} for ${snapshot.property.name}`,
    body: [
      `Property risk: ${scorecard.statuses.property} (${scorecard.scores.property})`,
      `River risk: ${scorecard.statuses.river} (${scorecard.scores.river})`,
      `Flash runoff risk: ${scorecard.statuses.flashRunoff} (${scorecard.scores.flashRunoff})`,
      hist ? `South Fork Georgetown: ${hist.currentStageFt} ft, ${hist.percentOfJuly2025}% of July 2025 crest.` : 'Historical comparison unavailable.',
      reasons || 'No additional reasons available.'
    ].join('\n')
  };
}

async function sendWebhookNotification(message) {
  if (!config.notifications.webhookUrl) return { delivered: false, channel: 'webhook', skipped: true };

  const res = await fetch(config.notifications.webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message)
  });

  if (!res.ok) {
    throw new Error(`Webhook alert failed: ${res.status} ${res.statusText}`);
  }

  return { delivered: true, channel: 'webhook' };
}

async function deliverNotification(message) {
  console.log('[ALERT]', message.headline, '\n' + message.body);
  const webhookResult = await sendWebhookNotification(message);
  return {
    delivered: true,
    channels: [webhookResult.channel || 'console'],
    webhook: webhookResult
  };
}

module.exports = {
  shouldNotify,
  buildMessage,
  deliverNotification
};
