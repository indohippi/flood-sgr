# Architecture Notes

## Live data flow

1. Frontend requests `/api/snapshot`
2. Server cache returns the latest successful snapshot
3. Background refresh pulls:
   - USGS gauges
   - NWS alerts
   - NWS forecast data for the property point
4. Rules engine computes:
   - river risk
   - flash runoff risk
   - property action risk
5. Frontend renders status cards, gauges, forecast, and reasoning

## Why Node.js + simple frontend

- Easy to deploy
- Easy to hand off
- Easy to add Twilio, email, and database support
- Better fit than a Java desktop app for a very small user base

## Upgrade path

### Storage
Add SQLite first. Move to Postgres only if you want remote multi-user history and auditing.

### Alerts
A simple first version can trigger only when status changes:
- YELLOW -> ORANGE
- ORANGE -> RED
- rising quickly while already ORANGE

### Calibration
The next serious upgrade is watershed-specific calibration:
- travel time from upstream gauges to your reach
- rainfall basin weighting
- separate branch behavior for North Fork dominant storms vs South Fork dominant storms


Added upstream South Fork gauge USGS-08104866 to improve early detection of stacked South Fork surges moving toward Georgetown.
