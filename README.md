# San Gabriel River Watch MVP+ 

This is a small-group flood monitoring app for **2055 FM 971, Georgetown, TX**. It is built around the reality that the **North Fork** and **South Fork** of the San Gabriel merge upstream of the property reach, while the **Weir** gauge is downstream and can be distorted by **Berry Creek** and other lower-basin inputs.

## What this phase adds

- Local persistence of snapshots in `data/snapshots.jsonl`
- Local persistence of sent alert events in `data/alerts.jsonl`
- Alert state tracking so you are notified on escalation or timed resend
- A simple notification transport that logs to the console and can also POST to a webhook
- `/api/history` and `/api/alerts` endpoints
- A recent score-history chart on the dashboard

## What the monitor does

- Pulls real-time USGS gauge data for the five stations you identified
- Pulls National Weather Service alerts and hourly forecast data for the property point
- Scores three separate conditions:
  - **River risk**
  - **Flash runoff risk**
  - **Property action risk**
- Displays a dashboard with current gauge values, trends, active alerts, recent stored history, and a historical comparison against the **July 5, 2025 South Fork crest**
- Keeps the **GPT role separate** from the source-of-truth rules engine

## How to run

```bash
npm install
npm start
```

Then open:

```bash
http://localhost:3000
```

## Environment options

Create a `.env`-style process environment or set variables directly:

- `PORT=3000`
- `POLL_MINUTES=10`
- `DATA_DIR=./data`
- `ALERTS_ENABLED=true`
- `ALERT_RESEND_MINUTES=90`
- `ALERT_WEBHOOK_URL=` optional webhook target for Slack, Teams, Make, Zapier, or a custom relay

## Alert behavior in this phase

Alerts are sent when:
- property status escalates upward, such as `YELLOW -> ORANGE`
- the system starts in a triggered state and no alert has been sent yet
- the same triggered status has persisted longer than the resend window

## Best next upgrades

### Phase 2
- Add Twilio SMS and email transports
- Add a dedicated admin/settings page
- Add watershed travel-time calibration by storm type
- Add better rainfall observations and radar overlays
- Add a GPT summary endpoint that turns the snapshot into family-ready language
- Move local JSONL persistence to SQLite or Postgres if you want stronger querying and multi-user access

## Key files

- `src/config.js` app, property, storage, and notification settings
- `src/server.js` refresh cycle, API endpoints, persistence, and notifications
- `src/scoring.js` threat model
- `src/storage.js` local history and alert persistence
- `src/notifier.js` alert escalation logic and delivery
- `public/index.html` dashboard

## Safety note

This tool is decision support. It is not a replacement for county emergency notifications, NWS warnings, evacuation orders, or common sense.


## Debug help in this build

This build adds extra USGS debug visibility.

If gauge cards are blank:
- open `http://localhost:3000/api/health`
- look at `gaugeDebug`
- each gauge will show:
  - `source`
  - `error`
  - `latestKeys`
  - `requestUrl`

This makes it much easier to see whether:
- USGS returned no series
- the gauge returned unexpected parameter codes
- the request itself failed


## Auto refresh

This build adds browser-side auto refresh every 10 minutes.
- The dashboard shows a visible countdown under the Refresh button.
- Manual refresh resets the 10-minute timer.
- The server still maintains its own polling cycle based on `POLL_MINUTES`.


## Gauge sparklines

This build adds a mini spark chart to each gauge card using the recent stage series (`00065`) so you can quickly see whether readings are climbing, flattening, or falling.


## Forecast period display

This build populates the forecast table with the hourly forecast `startTime` rendered in local Central time, such as `1:00 PM CDT`, whenever NWS leaves the hourly `name` field blank.

## Added South Fork upstream gauge

This build adds:
- `USGS-08104866` — **S Fk San Gabriel Rv at SH 1869 nr Liberty Hill, TX**

The scoring model now gives extra river-risk weight when:
- both upstream South Fork gauges are rising together
- both show meaningful rate-of-rise

That helps flag the kind of stacked surge or “wall of water” you described.


## Upstream convergence and Lake Georgetown build

This build adds:
- `USGS-0810464660` as a North Fork inflow proxy above Lake Georgetown
- Lake Georgetown watch logic using:
  - USGS lake-level gauge `USGS-08104650`
  - USACE Lake Georgetown overview/status/release pages
- two new risk cards:
  - **Upstream Convergence**
  - **North Fork / Lake Georgetown**
- property score now considers river, flash runoff, upstream convergence, and dam/reservoir risk together

Note: the Lake Georgetown release and status fields are scraped from public USACE pages. They should be treated as operational guidance and may occasionally be unavailable if the page format changes.


## Tuning changes in this build

- Reagan Blvd North Fork inflow now gets less weight unless Lake Georgetown rise, release activity, or spillway proximity suggest dam concern.
- South Fork at Hwy 183 is displayed as a datum-based growth signal when it reports a large elevation number.
- Property status now leans more on real river behavior and will not overreact as aggressively to weather alone.


## Lake Georgetown / dam watch fix

This build changes the dam watch to:
- use the USGS Lake Georgetown gauge as the primary source for lake elevation
- compute 24-hour lake change from the recent USGS series
- use USACE primarily for release context
- show `unavailable` instead of blank fields when a source cannot be read


## Fork-load comparison update

The former July 2025 comparison panel now shows:
- North Fork near Georgetown current stage
- South Fork at Georgetown current stage
- Combined fork load index (operational index, not a literal water depth)
- July 2025 South Fork crest reference


## Widget arrows update

Each gauge card now includes:
- a large direction arrow
- a rate badge such as Slight rise, Slow rise, Moderate rise, Rapid rise, and matching fall badges
- the existing sparkline and text trend


## Threshold proximity update

This build adds threshold proximity lines to key gauges. Right now it is configured for South Fork at Georgetown to show distance above/below action, minor, moderate, and major stage.


## Lake threshold proximity update

The Lake Georgetown / dam watch now shows threshold proximity more clearly, including:
- feet below spillway
- lake level vs conservation pool
- top of dam reference


## Local cluster reorder update

This build creates a primary-local-threat container with three cards together:
- North Fork near Georgetown
- South Fork at Georgetown
- Combined North + South local load widget

Threshold proximity is now shown on North Fork near Georgetown and the combined load widget as operational thresholds.


## Container reorder update

This build:
- moves S Fk at SH 1869 and South Fork at Hwy 183 into their own upstream South Fork container
- places that container above the primary local threat cluster
- creates a separate downstream loading relationship cluster containing:
  - North + South combined load
  - Berry Creek at Airport Rd
  - San Gabriel near Weir


## Combined load + Berry/Weir thresholds update

This build:
- shows the North + South combined load card in both the primary-local-threat cluster and the downstream-loading-relationship cluster
- adds operational threshold-index lines to Berry Creek at Airport Rd and San Gabriel near Weir


## Lake Georgetown system container update

This build groups these two elements into one container:
- North Fork inflow to Lake Georgetown
- Lake Georgetown / dam watch


## Tabs update

This build renames the app to San Gabriel River Watch and adds a second tab for Feeder Basin Rainfall and long-range awareness.


## Real basin-point rainfall update

This build upgrades the Feeder Basin Rainfall tab to use separate official NWS point/grid forecasts for three representative areas:
- North Fork Basin feeder area
- South Fork Basin feeder area
- Local property area

It uses NWS /points and forecastGridData where available, and falls back to forecast-derived estimates when grid QPF is unavailable.


## Historical analogs update

This build adds a first-pass Historical Analogs section to the Feeder Basin Rainfall tab using July 2025 as the anchor event.


## Lead Time update

This build adds a first-pass Lead Time section on the Feeder Basin Rainfall tab. It estimates short/medium/long lead posture from current basin loading and gauge trends.


## Tropical / Gulf Rain Threat update

This build adds a Tropical / Gulf Rain Threat section on the Feeder Basin Rainfall tab. It is an awareness layer that watches heavy-rain posture and tropical-style forecast signals, not a full live tropical cyclone tracker yet.


## Confidence + analog library update

This build adds a Confidence section and expands the Historical Analogs section into a small multi-anchor library.


## Refresh wiring cleanup

This build fixes stale placeholder text on the Feeder Basin tab, expands the analog library, and adds a visible basin-tab refresh timestamp.


## Tropical / Gulf Rain Threat tuning

This build reduces false RED signals by:
- giving far less weight to flash warnings and generic heavy-storm posture
- removing generic thunderstorm wording as a tropical trigger
- requiring much stronger tropical or banded-rain wording to drive high threat scores


## Settings + source transparency + incident summary/export

This build adds a Settings & Export tab with local settings, a source transparency table, and a generated incident summary that can be copied or printed.


## Threshold settings UI

This build adds a threshold settings UI backed by the app itself. You can adjust South Fork stages, combined load index thresholds, Berry/Weir thresholds, and tropical threat cutoffs from the Settings & Export tab.


## Map view tab

This build adds a dedicated Map View tab between Overview and Feeder Basin Rainfall. It shows the property, lake system, upstream gauges, local threat gauges, and downstream loading points on an interactive map.


## Nearby USGS Stations overlay

This build adds a toggleable Nearby USGS Stations overlay to the Map View tab using the USGS monitoring-locations API with a loose local bbox around the property reach.


## Map tuning update

This build changes the default map start to a tighter property-centered zoom, uses a pinned property marker, keeps the nearby USGS overlay enabled by default, and gives overlay stations a tooltip/popup that includes the closest tracked gauge information.


## Floodplain overlay + confluence marker + river-relevant filtering

This build adds a FEMA NFHL floodplain overlay, a confluence marker where the North and South forks merge, and filters the nearby USGS overlay to river-relevant stations near the corridor.


## Better icons + threshold popups + follow-the-water mode

This build upgrades the map with custom marker icons, threshold detail inside the important map popups, and a Follow the Water mode that highlights likely active upstream-to-downstream flow paths.


## Marker relocation update

This build moves the confluence marker east to the actual fork merge area and shifts the downstream Weir/D marker to a more accurate downstream crossing location. The downstream popup now explains that Berry Creek + San Gabriel convergence upstream affects the downstream crossing point.


## Marker relocation v2

This build refines the confluence marker farther east into the actual circled merge area and moves the downstream Weir/D marker to the circled crossing location. The downstream popup now explicitly references the Berry Creek + San Gabriel convergence upstream near FM 971.


## Marker relocation v3

This build moves C to 30.646995, -97.671304, moves the downstream Weir crossing to E at 30.646053, -97.585403, and adds a new D marker at 30.671809, -97.610190 for the Berry Creek + San Gabriel convergence.


## Forecast Inputs tab merged into marker-relocation-v3

This build merges the Forecast Inputs tab into the uploaded marker-relocation-v3 branch so you get both the updated map work and the forecast scorecard in one package.


## Radar overlay + feeder basin polygons

This build adds a live NOAA nowCOAST radar overlay and toggleable feeder-basin polygon overlays to the Map View tab. The map now supports live radar, floodplain, feeder basins, nearby USGS stations, and follow-the-water highlighting together on one operational canvas.


## Radar + overlay visibility fix

This build switches the radar layer to the nowCOAST ArcGIS WMS endpoint, increases radar opacity, darkens the FEMA floodplain overlay, and increases feeder-basin line/fill visibility.


## V2 + V3 combined testing release

This build renames Overview to Current Overview, adds a 5hr Forecast Overview tab, splits hydrologic guidance into Operational Hydrology and Official Model Guidance, adds a first-pass Basin Saturation Index, refactors the main overview into River Condition / Floodplain Activation / Property Impact, and adds broad mouseover help text to major widgets.
