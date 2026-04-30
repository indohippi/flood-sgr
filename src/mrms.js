const SERVICE_URL = 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'accept': 'application/json',
      'user-agent': 'san-gabriel-river-watch/0.1 (contact local administrator)'
    }
  });
  if (!res.ok) {
    throw new Error(`MRMS request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function buildSampleUrl(lat, lon, rasterFunction) {
  const url = new URL(`${SERVICE_URL}/getSamples`);
  url.searchParams.set('geometry', JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
  url.searchParams.set('geometryType', 'esriGeometryPoint');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnFirstValueOnly', 'true');
  url.searchParams.set('sampleCount', '1');
  url.searchParams.set('mosaicRule', JSON.stringify({
    mosaicMethod: 'esriMosaicAttribute',
    sortField: 'idp_validendtime',
    ascending: false
  }));
  url.searchParams.set('renderingRule', JSON.stringify({ rasterFunction }));
  url.searchParams.set('f', 'pjson');
  return url.toString();
}

async function fetchSample(lat, lon, rasterFunction) {
  try {
    const data = await fetchJson(buildSampleUrl(lat, lon, rasterFunction));
    const sample = data?.samples?.[0];
    const value = sample?.value;
    if (value == null || Number(value) < 0) return null;
    return Number(Number(value).toFixed(2));
  } catch (_err) {
    return null;
  }
}

async function fetchLatestCatalogInfo() {
  try {
    const url = new URL(`${SERVICE_URL}/query`);
    url.searchParams.set('where', '1=1');
    url.searchParams.set('outFields', 'idp_validendtime,name');
    url.searchParams.set('orderByFields', 'idp_validendtime DESC');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('resultRecordCount', '1');
    url.searchParams.set('f', 'pjson');
    const data = await fetchJson(url.toString());
    const feature = data?.features?.[0];
    const attrs = feature?.attributes || {};
    return {
      validEndTime: attrs.idp_validendtime || null,
      name: attrs.name || null
    };
  } catch (_err) {
    return { validEndTime: null, name: null };
  }
}

async function fetchMrmsPoint(lat, lon, label) {
  const [qpe1h, qpe3h, qpe6h, qpe12h, qpe24h, latest] = await Promise.all([
    fetchSample(lat, lon, 'rft_1hr'),
    fetchSample(lat, lon, 'rft_3hr'),
    fetchSample(lat, lon, 'rft_6hr'),
    fetchSample(lat, lon, 'rft_12hr'),
    fetchSample(lat, lon, 'rft_24hr'),
    fetchLatestCatalogInfo()
  ]);

  const available = [qpe1h, qpe3h, qpe6h, qpe12h, qpe24h].filter(v => v != null).length;
  return {
    label,
    lat,
    lon,
    qpe1h,
    qpe3h,
    qpe6h,
    qpe12h,
    qpe24h,
    source: 'NOAA MRMS QPE Image Service',
    validEndTime: latest.validEndTime,
    productName: latest.name,
    available
  };
}

async function fetchMrmsBundle(property, basinPoints = {}) {
  const north = basinPoints.northFork || null;
  const south = basinPoints.southFork || null;
  const local = basinPoints.localArea || property;

  const [propertyPoint, northPoint, southPoint, localPoint] = await Promise.all([
    fetchMrmsPoint(property.lat, property.lon, 'Property'),
    north ? fetchMrmsPoint(north.lat, north.lon, 'North Fork Basin') : Promise.resolve(null),
    south ? fetchMrmsPoint(south.lat, south.lon, 'South Fork Basin') : Promise.resolve(null),
    local ? fetchMrmsPoint(local.lat, local.lon, 'Local Area') : Promise.resolve(null)
  ]);

  const points = {
    property: propertyPoint,
    northFork: northPoint,
    southFork: southPoint,
    localArea: localPoint
  };
  const availableCount = Object.values(points).filter(Boolean).reduce((acc, p) => acc + (p.available ? 1 : 0), 0);

  return {
    source: 'NOAA MRMS QPE Image Service',
    points,
    availableCount,
    fetchedAt: new Date().toISOString()
  };
}

module.exports = {
  fetchMrmsBundle
};
