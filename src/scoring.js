function getGaugeValue(bundle, parameterCode) {
  return bundle?.latest?.[parameterCode]?.value ?? null;
}

function getTrend(bundle, parameterCode) {
  return bundle?.trends?.[parameterCode] || { direction: 'unknown', deltaPerHour: null, delta: null };
}

function toStatus(score) {
  if (score >= 80) return 'RED';
  if (score >= 55) return 'ORANGE';
  if (score >= 30) return 'YELLOW';
  return 'GREEN';
}

function listAlertTitles(alerts) {
  const features = alerts?.features || [];
  return features.map((f) => f.properties?.event).filter(Boolean);
}

function evaluateFloodRisk({ gaugeBundles, alerts, rainSignal, lakeData, settings = {} }) {
  const byKind = Object.fromEntries(gaugeBundles.map((b) => [b.gauge.kind, b]));
  const northUp = byKind.northForkUpstream;
  const northDam = byKind.northFork;
  const southUpper = byKind.southForkUpper;
  const southUp = byKind.southForkUpstream;
  const southGeo = byKind.southForkGeorgetown;
  const berry = byKind.berryCreek;
  const weir = byKind.downstreamWeir;

  const northDamStage = getGaugeValue(northDam, '00065');
  const southGeoStage = getGaugeValue(southGeo, '00065');
  const weirStage = getGaugeValue(weir, '00065');

  const northUpTrend = getTrend(northUp, '00065');
  const northDamTrend = getTrend(northDam, '00065');
  const southUpperTrend = getTrend(southUpper, '00065');
  const southUpTrend = getTrend(southUp, '00065');
  const southGeoTrend = getTrend(southGeo, '00065');
  const berryTrend = getTrend(berry, '00065');

  const lakeRise24h = lakeData?.lakeMeta?.change24hFt ?? null;
  const lakeReleaseCfs = lakeData?.lakeMeta?.releaseCfs ?? null;
  const lakeElevationFt = lakeData?.lakeMeta?.currentPoolElevationFt ?? null;
  const spillwayCrestFt = lakeData?.lakeMeta?.spillwayCrestFt ?? null;

  const southForkStages = settings.southForkStages || { action: 5, minor: 9, moderate: 13, major: 26 };
  const releaseActive = (lakeReleaseCfs || 0) >= 250;
  const gateConcern = releaseActive || ((lakeRise24h || 0) >= 0.5) || (spillwayCrestFt != null && lakeElevationFt != null && (spillwayCrestFt - lakeElevationFt) <= 3);

  let riverScore = 0;
  let flashScore = 0;
  let upstreamConvergenceScore = 0;
  let northForkDamScore = 0;
  const reasons = [];

  if (southGeoStage != null) {
    const stages = southForkStages;
    if (southGeoStage >= stages.major) {
      riverScore += 90;
      reasons.push('South Fork Georgetown is at or above major flood stage.');
    } else if (southGeoStage >= stages.moderate) {
      riverScore += 70;
      reasons.push('South Fork Georgetown is at or above moderate flood stage.');
    } else if (southGeoStage >= stages.minor) {
      riverScore += 50;
      reasons.push('South Fork Georgetown is at or above minor flood stage.');
    } else if (southGeoStage >= stages.action) {
      riverScore += 25;
      reasons.push('South Fork Georgetown is above action stage.');
    } else if (southGeoStage >= 4) {
      riverScore += 10;
      reasons.push('South Fork Georgetown is elevated below action stage.');
    }
  }

  const mainstemRising = [northDamTrend, southGeoTrend].filter((t) => t.direction === 'rising').length;
  const upstreamRising = [southUpperTrend, southUpTrend].filter((t) => t.direction === 'rising').length;
  if (mainstemRising >= 2) {
    riverScore += 20;
    reasons.push('Both North Fork below the dam and South Fork Georgetown are rising together.');
  } else if (southGeoTrend.direction === 'rising' && upstreamRising >= 1) {
    riverScore += 10;
    reasons.push('South Fork upstream growth is beginning to translate toward Georgetown.');
  }

  if ((northDamTrend.deltaPerHour || 0) > 0.2) {
    riverScore += 10;
    reasons.push('North Fork below the dam is rising quickly.');
  }

  const southForkRapidRise = [southUpperTrend, southUpTrend, southGeoTrend].some((t) => (t.deltaPerHour || 0) > 0.2);
  if (southForkRapidRise) {
    riverScore += 15;
    reasons.push('At least one South Fork gauge is rising quickly.');
  }

  if (southUpperTrend.direction === 'rising' && southUpTrend.direction === 'rising') {
    upstreamConvergenceScore += 30;
    reasons.push('Both upstream South Fork gauges are rising together, which can signal a stacked surge moving downstream.');
  }
  if ((southUpperTrend.deltaPerHour || 0) > 0.1 && (southUpTrend.deltaPerHour || 0) > 0.03) {
    upstreamConvergenceScore += 20;
    reasons.push('Both upstream South Fork gauges show meaningful rate-of-rise.');
  }

  if (gateConcern && northUpTrend.direction === 'rising') {
    upstreamConvergenceScore += 10;
    reasons.push('Upstream North Fork inflow is rising while lake or gate conditions deserve attention.');
  }
  if (gateConcern && (northUpTrend.deltaPerHour || 0) > 0.2) {
    upstreamConvergenceScore += 10;
    reasons.push('Upstream North Fork inflow is rising quickly while lake or gate conditions deserve attention.');
  }
  if (gateConcern && (southUpperTrend.direction === 'rising' || southUpTrend.direction === 'rising') && northUpTrend.direction === 'rising') {
    upstreamConvergenceScore += 15;
    reasons.push('North Fork inflow and South Fork upstream signals are both building while lake or gate conditions deserve attention.');
  }

  if ((lakeRise24h || 0) >= 0.5) {
    northForkDamScore += 20;
    reasons.push('Lake Georgetown has risen materially in the last 24 hours.');
  } else if ((lakeRise24h || 0) >= 0.2) {
    northForkDamScore += 10;
    reasons.push('Lake Georgetown is rising.');
  }
  if ((lakeReleaseCfs || 0) >= 1000) {
    northForkDamScore += 35;
    reasons.push('Lake Georgetown release is elevated.');
  } else if ((lakeReleaseCfs || 0) >= 250) {
    northForkDamScore += 20;
    reasons.push('Lake Georgetown is releasing water.');
  }
  if (spillwayCrestFt != null && lakeElevationFt != null) {
    const feetBelowSpillway = spillwayCrestFt - lakeElevationFt;
    if (feetBelowSpillway <= 1) {
      northForkDamScore += 30;
      reasons.push('Lake Georgetown is near spillway crest.');
    } else if (feetBelowSpillway <= 3) {
      northForkDamScore += 15;
      reasons.push('Lake Georgetown is within a few feet of spillway crest.');
    }
  }
  if ((northDamTrend.deltaPerHour || 0) > 0.2 && releaseActive) {
    northForkDamScore += 15;
    reasons.push('North Fork below the dam is rising while releases are active.');
  }

  const alertTitles = listAlertTitles(alerts);
  if (alertTitles.some((t) => /flash flood warning/i.test(t))) {
    flashScore += 45;
    reasons.push('Active Flash Flood Warning for the property point.');
  } else if (alertTitles.some((t) => /flood warning/i.test(t))) {
    flashScore += 30;
    reasons.push('Active Flood Warning for the property point.');
  } else if (alertTitles.some((t) => /flood advisory/i.test(t))) {
    flashScore += 15;
    reasons.push('Active Flood Advisory for the property point.');
  }

  if ((rainSignal?.precipitationProbabilityMax || 0) >= 70) {
    flashScore += 10;
    reasons.push('High precipitation probability in the next 12 hours.');
  }

  if (rainSignal?.intenseRainSignal) {
    flashScore += 20;
    reasons.push('Forecast language suggests intense rainfall or thunderstorms.');
  }

  let distortionFlag = false;
  if (weirStage != null && southGeoStage != null && berryTrend.direction === 'rising') {
    distortionFlag = true;
    reasons.push('Downstream signal may be inflated by Berry Creek or other lower-basin tributary inputs.');
  }

  // Property score should respect the real river picture more than raw weather alone.
  const flashCapWhenRiverLow = riverScore < 30 ? 55 : 80;
  const flashContribution = Math.min(flashScore, flashCapWhenRiverLow);
  let propertyScore = Math.max(
    riverScore,
    flashContribution,
    Math.round((riverScore * 0.55) + (flashScore * 0.25) + (upstreamConvergenceScore * 0.20)),
    Math.round((riverScore * 0.60) + (northForkDamScore * 0.25) + (upstreamConvergenceScore * 0.15))
  );

  if (riverScore < 30 && flashScore >= 55 && upstreamConvergenceScore >= 30) {
    propertyScore = Math.max(propertyScore, 55);
    reasons.push('Heavy rain plus upstream convergence keeps property status elevated as an early warning, even before the main river reaches action stage.');
  }

  const historicalComparison = southGeoStage == null
    ? null
    : {
        july2025CrestFt: southGeo.gauge.july2025CrestFt,
        currentStageFt: southGeoStage,
        percentOfJuly2025: Number(((southGeoStage / southGeo.gauge.july2025CrestFt) * 100).toFixed(1))
      };

  return {
    generatedAt: new Date().toISOString(),
    statuses: {
      river: toStatus(riverScore),
      flashRunoff: toStatus(flashScore),
      upstreamConvergence: toStatus(upstreamConvergenceScore),
      northForkDam: toStatus(northForkDamScore),
      property: toStatus(propertyScore)
    },
    scores: {
      river: Math.min(riverScore, 100),
      flashRunoff: Math.min(flashScore, 100),
      upstreamConvergence: Math.min(upstreamConvergenceScore, 100),
      northForkDam: Math.min(northForkDamScore, 100),
      property: Math.min(propertyScore, 100)
    },
    signals: {
      northForkUpstreamStageFt: getGaugeValue(northUp, '00065'),
      northForkStageFt: northDamStage,
      southForkGeorgetownStageFt: southGeoStage,
      downstreamWeirStageFt: weirStage,
      confluenceStackingRisk: mainstemRising >= 2,
      upstreamConvergenceLikely: upstreamConvergenceScore >= 30,
      damInfluenceElevated: northForkDamScore >= 30,
      downstreamDistortionLikely: distortionFlag,
      lakeGeorgetownElevationFt: lakeElevationFt,
      lakeGeorgetownReleaseCfs: lakeReleaseCfs,
      gateConcern,
      alertTitles
    },
    historicalComparison,
    reasons
  };
}

module.exports = {
  evaluateFloodRisk
};
