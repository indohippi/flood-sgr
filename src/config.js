const path = require('path');

module.exports = {
  app: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
    pollMinutes: Number(process.env.POLL_MINUTES || 10),
    historyLimit: Number(process.env.HISTORY_LIMIT || 500)
  },
  storage: {
    dir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
    snapshotFile: process.env.SNAPSHOT_FILE || 'snapshots.jsonl',
    alertFile: process.env.ALERT_FILE || 'alerts.jsonl',
    stateFile: process.env.STATE_FILE || 'state.json'
  },
  notifications: {
    webhookUrl: process.env.ALERT_WEBHOOK_URL || '',
    enabled: String(process.env.ALERTS_ENABLED || 'true').toLowerCase() !== 'false',
    triggerStatuses: ['YELLOW', 'ORANGE', 'RED'],
    resendMinutes: Number(process.env.ALERT_RESEND_MINUTES || 90)
  },
  property: {
    name: '2055 FM 971, Georgetown, TX',
    lat: 30.6624152,
    lon: -97.6303583,
    notes: [
      'Primary local threat is combined San Gabriel mainstem behavior after the North Fork and South Fork merge near San Gabriel Park.',
      'Downstream Weir gauge is useful for confirmation, but it is contaminated by downstream tributary influence including Berry Creek.',
      'North Fork near Georgetown is downstream of Lake Georgetown dam, so reservoir level, release behavior, and upstream inflow should be watched separately.'
    ]
  },

  basinPoints: {
    northFork: {
      name: 'North Fork Basin representative point',
      lat: 30.7400,
      lon: -97.8600,
      note: 'Representative forecast point for the North Fork / Lake Georgetown feeder area.'
    },
    southFork: {
      name: 'South Fork Basin representative point',
      lat: 30.7050,
      lon: -97.7900,
      note: 'Representative forecast point for the South Fork feeder area upstream of Georgetown.'
    },
    localArea: {
      name: 'Local property area point',
      lat: 30.6624152,
      lon: -97.6303583,
      note: 'Representative forecast point for the property area.'
    }
  },
  gauges: [
    {
      id: 'USGS-0810464660',
      shortName: 'N Fk at Reagan Blvd',
      role: 'upstream-inflow-to-lake',
      kind: 'northForkUpstream',
      priority: 0,
      parameterTargets: ['00060', '00065'],
      labels: {
        '00060': 'Discharge (cfs)',
        '00065': 'Gage height (ft)'
      }
    },
    {
      id: 'USGS-08104700',
      shortName: 'North Fork near Georgetown',
      role: 'upstream-contributor',
      kind: 'northFork',
      priority: 2,
      parameterTargets: ['00060', '00065'],
      labels: {
        '00060': 'Discharge (cfs)',
        '00065': 'Gage height (ft)'
      }
    },
    {
      id: 'USGS-08104866',
      shortName: 'S Fk at SH 1869',
      role: 'upstream-early-warning',
      kind: 'southForkUpper',
      priority: 0,
      parameterTargets: ['00060', '00065'],
      labels: {
        '00060': 'Discharge (cfs)',
        '00065': 'Gage height (ft)'
      }
    },
    {
      id: 'USGS-08104870',
      shortName: 'South Fork at Hwy 183',
      role: 'upstream-early-warning',
      kind: 'southForkUpstream',
      priority: 1,
      parameterTargets: ['00060', '00065', '62614'],
      labels: {
        '00060': 'Discharge (cfs)',
        '00065': 'Gage height (ft)',
        '62614': 'Water surface elevation (ft)'
      }
    },
    {
      id: 'USGS-08104900',
      shortName: 'South Fork at Georgetown',
      role: 'primary-local-threat',
      kind: 'southForkGeorgetown',
      priority: 0,
      parameterTargets: ['00060', '00065'],
      labels: {
        '00060': 'Discharge (cfs)',
        '00065': 'Gage height (ft)'
      },
      stages: {
        action: 5,
        minor: 9,
        moderate: 13,
        major: 26
      },
      july2025CrestFt: 37.36,
      july2025CrestDate: '2025-07-05'
    },
    {
      id: 'USGS-08105095',
      shortName: 'Berry Creek at Airport Rd',
      role: 'downstream-distortion-check',
      kind: 'berryCreek',
      priority: 4,
      parameterTargets: ['00060', '00065'],
      labels: {
        '00060': 'Discharge (cfs)',
        '00065': 'Gage height (ft)'
      }
    },
    {
      id: 'USGS-08105300',
      shortName: 'San Gabriel near Weir',
      role: 'downstream-validation',
      kind: 'downstreamWeir',
      priority: 3,
      parameterTargets: ['00060', '00065'],
      labels: {
        '00060': 'Discharge (cfs)',
        '00065': 'Gage height (ft)'
      }
    }
  ]
};
