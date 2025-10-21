
/* =================== UTILITIES =================== */
function parseUtc(ts){
  if (!ts) return null;
  if (ts.includes('Z')) return new Date(ts);
  if (/^\d{4}-\d{2}-\d{2} /.test(ts)) return new Date(ts.replace(' ','T')+'Z');
  return new Date(ts);
}
function phoenixDateKey(row){
  const ts = row.timestamp_utc || row.created_at;
  const d  = parseUtc(ts);
  return d ? d.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }) : 'Unknown';
}
function phoenixTodayKey(){
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
}
function phoenixDateTime(ts){
  const d = parseUtc(ts);
  return d ? d.toLocaleString('en-US', { timeZone: 'America/Phoenix' }) : '';
}
function arrowDelta(curr, prev, higherIsBetter){
  if (prev == null || isNaN(prev)) return {txt:'', cls:''};
  const delta = curr - prev;
  if (Math.abs(delta) < 1e-9) return {txt:' ▬ (0)', cls:'', delta};
  const improved = higherIsBetter ? (delta > 0) : (delta < 0);
  const arrow = improved ? '▲' : '▼';
  const cls   = improved ? 'color:green' : 'color:#c0392b';
  const pretty = (Math.round(delta*10)/10).toString();
  return {txt:` <span style="${cls}">${arrow} (${pretty})</span>`, cls, delta};
}

/* =================== EVENTS OVERLAY (unchanged behavior) =================== */
function showEvents(encoded){
  const ev   = JSON.parse(decodeURIComponent(encoded));
  const box  = document.getElementById('eventsContent');
  box.innerHTML = '';
  ev.forEach(item=>{
    if(typeof item === 'string'){
      box.append(document.createTextNode(item), document.createElement('br'));
    }else{
      const line = document.createElement('div');
      line.textContent = item.msg || '(no message)';
      box.appendChild(line);
      if(item.img){
        const url = LOGS_BASE_URL + item.img;
        const a   = document.createElement('a');
        a.href = url; a.target = '_blank';
        a.appendChild(document.createTextNode(url));
        box.appendChild(a);
      }
    }
  });
  document.getElementById('eventsOverlay').style.display='flex';
}
function closeEvents(){ document.getElementById('eventsOverlay').style.display='none'; }

/* =================== SCHEDULE OVERLAY =================== */
function closeSchedule(){ document.getElementById('scheduleOverlay').style.display='none'; }
function showTodaySchedule(){
  fetch(ENDPOINT_SCH)
    .then(r=>r.json())
    .then(rows=>{
      const today = new Date().toLocaleDateString('en-CA', { timeZone:'America/Phoenix' });
      const tbody = document.getElementById('scheduleBody');
      let scheduledCount = 0;
      tbody.innerHTML='';
      rows
        .filter(r=> new Date(r.runAt).toLocaleDateString('en-CA', { timeZone:'America/Phoenix' }) === today)
        .sort((a,b)=> new Date(a.runAt) - new Date(b.runAt))
        .forEach(r=>{
          const tr=document.createElement('tr');
          const configName = typeof r.configPath === 'string'
            ? r.configPath.replace(/^.*[\\/]/,'')
            : '(unspecified)';
          tr.innerHTML = `
            <td>${new Date(r.runAt).toLocaleTimeString()}</td>
            <td>${r.companyId}</td>
            <td style="text-align:center;">${r.driveIndex}</td>
            <td>${configName}</td>
          `;
          tbody.appendChild(tr);
          scheduledCount++;
        });
      document.querySelector('#scheduleOverlay h3').textContent =
        `Today's Scheduled Drives (${scheduledCount})`;
      document.getElementById('scheduleOverlay').style.display='flex';
    });
}

/* =================== BUSINESS DIRECTORY =================== */
let dailyRowsCache = [];   // raw rows from /daily
let byBizCache     = new Map(); // aggregated per business
let currentBizContext = null;
let currentBizKeywordSelection = null;
let bizKeywordScope = 'today';
let currentBizReportSelection = null;
let bizKwChartInstance = null;
let bizGeoMap = null;
let bizGeoMapMarkers = [];
let bizGeoInfoWindow = null;
let bizReportRequestId = 0;
let bizMapContextId = 0;
let bizReportsLastMessage = '';
let bizReportsLastIsError = false;
let bizMapWeekOffset = 0;

let geoRunsLoaded = false;
let geoRunsLoading = false;
let geoRunsCache = [];

let globalGeoSelectedBusinessId = null;
const globalGeoKeywordSelections = new Map();
let globalGeoControlsInitialized = false;

const GEO_GRID_CHOICES = [
  { label: '5×5', rows: 5, cols: 5 },
  { label: '7×7', rows: 7, cols: 7 },
  { label: '10×10', rows: 10, cols: 10 }
];
const GEO_RADIUS_CHOICES = [1, 2, 3, 5];
const geoRunSettings = new Map();
const keywordOriginCache = new Map();

function getGeoSettingsForBusiness(businessId) {
  if (!geoRunSettings.has(businessId)) {
    geoRunSettings.set(businessId, { gridIndex: 0, radiusIndex: 0 });
  }
  const settings = geoRunSettings.get(businessId);
  return {
    gridIndex: Math.min(Math.max(0, Number(settings.gridIndex) || 0), GEO_GRID_CHOICES.length - 1),
    radiusIndex: Math.min(Math.max(0, Number(settings.radiusIndex) || 0), GEO_RADIUS_CHOICES.length - 1)
  };
}

function buildGeoRunConfig(businessId) {
  const { gridIndex, radiusIndex } = getGeoSettingsForBusiness(businessId);
  const gridChoice = GEO_GRID_CHOICES[gridIndex] || GEO_GRID_CHOICES[0];
  const radius = GEO_RADIUS_CHOICES[radiusIndex] || GEO_RADIUS_CHOICES[0];
  return {
    rows: gridChoice.rows,
    cols: gridChoice.cols,
    radius,
    label: gridChoice.label,
    points: gridChoice.rows * gridChoice.cols
  };
}

function updateGlobalGeoRunStatus(message, isError = false) {
  const statusEl = document.getElementById('globalGeoRunStatus');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  if (isError) {
    statusEl.classList.add('error');
  } else {
    statusEl.classList.remove('error');
  }
  statusEl.classList.toggle('is-hidden', !message);
}

function reflectGeoRunStatus(message, isError = false) {
  const statusEl = document.getElementById('bizReportsStatus');
  if (statusEl) {
    statusEl.textContent = message || '';
    statusEl.classList.toggle('error', Boolean(isError));
  }
  updateGlobalGeoRunStatus(message, isError);
}

function setupGlobalGeoRunControls() {
  if (globalGeoControlsInitialized) return;

  const gridSelect = document.getElementById('globalGeoGridSelect');
  const radiusSelect = document.getElementById('globalGeoRadiusSelect');
  const businessSelect = document.getElementById('globalGeoBusinessSelect');
  const keywordSelect = document.getElementById('globalGeoKeywordSelect');
  const runButton = document.getElementById('globalGeoRunButton');

  if (!gridSelect || !radiusSelect || !businessSelect || !keywordSelect || !runButton) {
    return;
  }

  if (!gridSelect.options.length) {
    GEO_GRID_CHOICES.forEach((choice, idx) => {
      const option = document.createElement('option');
      option.value = String(idx);
      option.textContent = `${choice.label} (${choice.rows * choice.cols} pts)`;
      gridSelect.appendChild(option);
    });
  }

  if (!radiusSelect.options.length) {
    GEO_RADIUS_CHOICES.forEach((radius, idx) => {
      const option = document.createElement('option');
      option.value = String(idx);
      option.textContent = `${radius} mi radius`;
      radiusSelect.appendChild(option);
    });
  }

  gridSelect.disabled = true;
  radiusSelect.disabled = true;
  keywordSelect.disabled = true;
  runButton.disabled = true;

  businessSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Loading businesses…';
  businessSelect.appendChild(placeholder);

  gridSelect.addEventListener('change', onGlobalGeoGridChange);
  radiusSelect.addEventListener('change', onGlobalGeoRadiusChange);
  businessSelect.addEventListener('change', onGlobalGeoBusinessChange);
  keywordSelect.addEventListener('change', onGlobalGeoKeywordChange);
  runButton.addEventListener('click', handleGlobalGeoRunStart);

  globalGeoControlsInitialized = true;
  updateGlobalGeoRunButtonLabel();
  updateGlobalGeoRunStatus('');
}

function refreshGlobalGeoBusinesses(businessList = []) {
  setupGlobalGeoRunControls();
  const businessSelect = document.getElementById('globalGeoBusinessSelect');
  if (!businessSelect) return;

  const previousId = globalGeoSelectedBusinessId;
  businessSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = businessList.length ? 'Select a business…' : 'No businesses available';
  businessSelect.appendChild(placeholder);

  businessList.forEach(biz => {
    const option = document.createElement('option');
    option.value = String(biz.id);
    option.textContent = biz.name;
    businessSelect.appendChild(option);
  });

  if (previousId && businessList.some(biz => biz.id === previousId)) {
    businessSelect.value = String(previousId);
  } else {
    businessSelect.value = '';
  }

  onGlobalGeoBusinessChange();
}

function persistGlobalGeoSettings() {
  if (!globalGeoSelectedBusinessId) return;
  const gridSelect = document.getElementById('globalGeoGridSelect');
  const radiusSelect = document.getElementById('globalGeoRadiusSelect');
  if (!gridSelect || !radiusSelect) return;
  const gridIndex = Math.min(Math.max(0, Number(gridSelect.value) || 0), GEO_GRID_CHOICES.length - 1);
  const radiusIndex = Math.min(Math.max(0, Number(radiusSelect.value) || 0), GEO_RADIUS_CHOICES.length - 1);
  geoRunSettings.set(globalGeoSelectedBusinessId, { gridIndex, radiusIndex });
}

function onGlobalGeoGridChange() {
  persistGlobalGeoSettings();
  updateGlobalGeoRunButtonLabel();
}

function onGlobalGeoRadiusChange() {
  persistGlobalGeoSettings();
  updateGlobalGeoRunButtonLabel();
}

function onGlobalGeoKeywordChange() {
  const keywordSelect = document.getElementById('globalGeoKeywordSelect');
  if (!keywordSelect) return;
  if (!globalGeoSelectedBusinessId) {
    updateGlobalGeoRunButtonLabel();
    return;
  }
  const keyword = keywordSelect.value;
  if (keyword) {
    globalGeoKeywordSelections.set(globalGeoSelectedBusinessId, keyword);
  } else {
    globalGeoKeywordSelections.delete(globalGeoSelectedBusinessId);
  }
  updateGlobalGeoRunButtonLabel();
}

function onGlobalGeoBusinessChange() {
  const businessSelect = document.getElementById('globalGeoBusinessSelect');
  const gridSelect = document.getElementById('globalGeoGridSelect');
  const radiusSelect = document.getElementById('globalGeoRadiusSelect');
  const keywordSelect = document.getElementById('globalGeoKeywordSelect');
  const runButton = document.getElementById('globalGeoRunButton');
  if (!businessSelect || !gridSelect || !radiusSelect || !keywordSelect || !runButton) return;

  const previousSelectedId = globalGeoSelectedBusinessId;
  const selectedId = Number(businessSelect.value);
  if (!Number.isFinite(selectedId) || selectedId <= 0) {
    globalGeoSelectedBusinessId = null;
    gridSelect.disabled = true;
    radiusSelect.disabled = true;
    keywordSelect.disabled = true;
    keywordSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a business…';
    keywordSelect.appendChild(placeholder);
    runButton.disabled = true;
    updateGlobalGeoRunButtonLabel();
    updateGlobalGeoRunStatus('');
    return;
  }

  globalGeoSelectedBusinessId = selectedId;

  const { gridIndex, radiusIndex } = getGeoSettingsForBusiness(selectedId);
  gridSelect.disabled = false;
  radiusSelect.disabled = false;
  gridSelect.value = String(gridIndex);
  radiusSelect.value = String(radiusIndex);

  populateGlobalGeoKeywords(selectedId);
  if (previousSelectedId !== selectedId) {
    updateGlobalGeoRunStatus('');
  }
  updateGlobalGeoRunButtonLabel();
}

function populateGlobalGeoKeywords(businessId) {
  const keywordSelect = document.getElementById('globalGeoKeywordSelect');
  if (!keywordSelect) return;

  keywordSelect.disabled = true;
  keywordSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a keyword…';
  keywordSelect.appendChild(placeholder);

  const bizData = byBizCache.get(businessId);
  if (!bizData) {
    globalGeoKeywordSelections.delete(businessId);
    updateGlobalGeoRunButtonLabel();
    return;
  }

  const availableValues = [];
  const seen = new Set();

  const addOption = (parent, keyword, count) => {
    const normalized = String(keyword || '').trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    const option = document.createElement('option');
    option.value = normalized;
    const numericCount = Number(count);
    option.textContent = Number.isFinite(numericCount) && numericCount > 0
      ? `${normalized} (${numericCount})`
      : normalized;
    parent.appendChild(option);
    seen.add(key);
    availableValues.push(option.value);
  };

  const appendGroup = (label, entries) => {
    if (!Array.isArray(entries) || !entries.length) return;
    const group = document.createElement('optgroup');
    group.label = label;
    entries.forEach(({ keyword, count }) => addOption(group, keyword, count));
    if (group.children.length) {
      keywordSelect.appendChild(group);
    }
  };

  appendGroup('Today', bizData.keywordsToday || []);
  appendGroup('All time', bizData.keywordsAll || bizData.keywords || []);

  const hasKeywords = availableValues.length > 0;
  let selection = globalGeoKeywordSelections.get(businessId) || '';
  if (!selection || !availableValues.includes(selection)) {
    selection = hasKeywords ? availableValues[0] : '';
  }

  if (selection) {
    keywordSelect.value = selection;
    globalGeoKeywordSelections.set(businessId, selection);
  } else {
    keywordSelect.value = '';
    globalGeoKeywordSelections.delete(businessId);
  }

  keywordSelect.disabled = !hasKeywords;
  onGlobalGeoKeywordChange();
}

function updateGlobalGeoRunButtonLabel() {
  const runButton = document.getElementById('globalGeoRunButton');
  const keywordSelect = document.getElementById('globalGeoKeywordSelect');
  if (!runButton) return;

  if (!globalGeoSelectedBusinessId) {
    runButton.innerHTML = '🚀 Start Geo Run<br><small>Select a business</small>';
    runButton.disabled = true;
    runButton.title = 'Select a business and keyword to start a geo grid run';
    return;
  }

  const config = buildGeoRunConfig(globalGeoSelectedBusinessId);
  const radiusLabel = describeRadiusMiles(config.radius) || config.radius;
  const keyword = keywordSelect ? keywordSelect.value : '';
  const baseLabel = `🚀 Run ${config.label} (${radiusLabel} mi)`;

  if (keyword) {
    runButton.innerHTML = `${baseLabel}<br><small>“${escapeHtml(keyword)}”</small>`;
    runButton.disabled = false;
    runButton.title = `Start ${config.label} grid (${radiusLabel} mi) for “${keyword}”`;
  } else {
    runButton.innerHTML = `${baseLabel}<br><small>Select a keyword</small>`;
    runButton.disabled = true;
    runButton.title = 'Select a keyword to start this geo grid run';
  }
}

async function handleGlobalGeoRunStart(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  if (!globalGeoSelectedBusinessId) {
    updateGlobalGeoRunStatus('Select a business to start a geo grid run.', true);
    return;
  }

  const keywordSelect = document.getElementById('globalGeoKeywordSelect');
  const businessSelect = document.getElementById('globalGeoBusinessSelect');
  if (!keywordSelect || !businessSelect) return;

  const keyword = String(keywordSelect.value || '').trim();
  if (!keyword) {
    updateGlobalGeoRunStatus('Select a keyword to start a geo grid run.', true);
    return;
  }

  const businessId = globalGeoSelectedBusinessId;
  const bizData = byBizCache.get(businessId);
  const businessName = bizData?.name || (businessSelect.selectedOptions[0]?.textContent || 'Business');

  persistGlobalGeoSettings();
  const config = buildGeoRunConfig(businessId);

  updateGlobalGeoRunStatus('Resolving origin zone…');

  let originInfo = null;
  try {
    originInfo = await resolveKeywordOriginZone(businessId, keyword, config.radius);
  } catch (error) {
    console.error('Failed to resolve origin zone for keyword:', error);
    const message = error?.message || 'Failed to resolve origin zone for this keyword.';
    updateGlobalGeoRunStatus(message, true);
    alert(message);
    return;
  }

  if (!originInfo) {
    const message = 'No origin zone is configured for this keyword yet.';
    updateGlobalGeoRunStatus(message, true);
    alert(message);
    return;
  }

  const effectiveRadius = Number.isFinite(originInfo.radius) ? originInfo.radius : config.radius;
  const radiusLabel = describeRadiusMiles(effectiveRadius) || effectiveRadius;
  const zoneLabel = originInfo.zoneName || 'origin zone';
  const coordsLabel = `${originInfo.lat.toFixed(4)}, ${originInfo.lng.toFixed(4)}`;
  const confirmMessage = `Start a ${config.label} grid (${radiusLabel} mi radius, ${config.points} points) for ${businessName} — “${keyword}”?\nOrigin: ${zoneLabel} (${coordsLabel})`;
  if (!window.confirm(confirmMessage)) {
    updateGlobalGeoRunStatus('Geo grid run cancelled.', false);
    return;
  }

  await startGeoGridRun(businessId, businessName, keyword, config, originInfo);
}

async function resolveKeywordOriginZone(businessId, keyword, radiusMiles) {
  const normalizedKeyword = String(keyword || '').trim();
  if (!normalizedKeyword) return null;

  const cacheKey = `${businessId}||${normalizedKeyword.toLowerCase()}||${Number.isFinite(radiusMiles) ? radiusMiles : 'na'}`;
  if (keywordOriginCache.has(cacheKey)) {
    return keywordOriginCache.get(cacheKey);
  }

  const params = new URLSearchParams({ business_id: String(businessId), keyword: normalizedKeyword });
  if (Number.isFinite(radiusMiles)) {
    params.append('radius_miles', String(radiusMiles));
  }

  const res = await fetch(`${ENDPOINT_ORIGIN_ZONE}?${params.toString()}`);
  let data = null;
  try {
    data = await res.json();
  } catch (error) {
    data = null;
  }

  if (res.status === 404) {
    keywordOriginCache.set(cacheKey, null);
    return null;
  }

  if (!res.ok || (data && data.error)) {
    const message = data && data.error ? data.error : `Request failed (${res.status})`;
    throw new Error(message);
  }

  const origin = {
    zoneId: data?.zone_id ?? null,
    zoneName: data?.zone_name || data?.canonical || null,
    canonical: data?.canonical ?? null,
    zip: data?.zip ?? null,
    lat: Number(data?.lat),
    lng: Number(data?.lng),
    radius: data?.radius_miles != null ? Number(data.radius_miles) : null,
    weight: data?.weight != null ? Number(data.weight) : null
  };

  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    throw new Error('Origin zone response missing coordinates.');
  }

  keywordOriginCache.set(cacheKey, origin);
  return origin;
}

async function loadDaily(){
  const res = await fetch(ENDPOINT_DAILY);
  const rows = await res.json();
  dailyRowsCache = rows
    .map(r => ({
      ...r,
      business_id: Number.isFinite(Number(r.business_id)) ? Number(r.business_id) : null
    }))
    .filter(r => Number.isFinite(r.business_id) && r.business_id > 0);
  buildBusinessDirectory(dailyRowsCache);
}

function buildBusinessDirectory(rows){
  byBizCache.clear();
  const keywordTotals = new Map();

  const dates = [...new Set(rows.map(r => r.day))].sort().reverse();
  const last7Days  = new Set(dates.slice(0, 7));
  const prev7Days  = new Set(dates.slice(7, 14));

  const byBizLast7 = new Map();
  const byBizPrev7 = new Map();

  rows.forEach(r => {
      const id = Number(r.business_id);
      if (!Number.isFinite(id) || id <= 0) return;
      if (!keywordTotals.has(id)) {
          keywordTotals.set(id, { all: new Map(), byDay: new Map() });
      }
      const totals = keywordTotals.get(id);
      const totalsMap = totals.all;
      const dayMapKey = r.day;
      const dayMap = totals.byDay.get(dayMapKey) || new Map();
      const targetMap = last7Days.has(r.day) ? byBizLast7 : (prev7Days.has(r.day) ? byBizPrev7 : null);
      if (!targetMap) return;
      if (!targetMap.has(id)) {
          targetMap.set(id, { name: r.business_name || '(unknown)', arpSum: 0, arpN: 0, lastDay: null, solvSum: 0, solvN: 0, successSum: 0, kwCounts: new Map() });
      }
      const b = targetMap.get(id);
      b.successSum += Number(r.success_count || 0);
      if (r.avg_rank != null) { b.arpSum += Number(r.avg_rank); b.arpN++; }
      if (r.solv_top3 != null) { b.solvSum += Number(r.solv_top3); b.solvN++; }
      if (!b.lastDay || r.day > b.lastDay) b.lastDay = r.day;
      const keywordSource = Array.isArray(r.keyword_breakdown) && r.keyword_breakdown.length
        ? r.keyword_breakdown
        : (r.top_keywords || []);
      keywordSource.forEach(k => {
          const key = String(k.keyword || '').trim() || '(none)';
          b.kwCounts.set(key, (b.kwCounts.get(key) || 0) + Number(k.count || 0));
          const count = Number(k.count || 0);
          totalsMap.set(key, (totalsMap.get(key) || 0) + count);
          dayMap.set(key, (dayMap.get(key) || 0) + count);
      });
      totals.byDay.set(dayMapKey, dayMap);
  });

  const allBizIds = new Set([...byBizLast7.keys(), ...byBizPrev7.keys()]);
  const list = Array.from(allBizIds).map(id => {
      const last7 = byBizLast7.get(id);
      const prev7 = byBizPrev7.get(id);
      const arp = last7?.arpN ? (last7.arpSum / last7.arpN) : null;
      const prevArp = prev7?.arpN ? (prev7.arpSum / prev7.arpN) : null;
      const trend = arrowDelta(arp, prevArp, false);
      const kwCounts = last7?.kwCounts || new Map();
      const totals = keywordTotals.get(id) || { all: new Map(), byDay: new Map() };
      const keywordsAll = Array.from(totals.all.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([keyword, count]) => ({ keyword, count }));
      const todayKey = phoenixTodayKey();
      const keywordsToday = Array.from((totals.byDay.get(todayKey) || new Map()).entries())
        .sort((a, b) => b[1] - a[1])
        .map(([keyword, count]) => ({ keyword, count }));
      const topKeywords = keywordsAll.slice(0, 5);

      const bizData = {
          id: id,
          name: last7?.name || prev7?.name || '(unknown)',
          successSum: last7?.successSum ?? 0,
          arp: arp,
          solv: last7?.solvN ? (last7.solvSum / last7.solvN) : null,
          lastDay: last7?.lastDay || prev7?.lastDay || '—',
          daysSeen: (last7?.arpN ?? 0) + (prev7?.arpN ?? 0),
          keywords: keywordsAll,
          keywordsAll,
          keywordsToday,
          topKeywords,
          trend: trend
      };

      byBizCache.set(id, bizData);

      return bizData;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const tbody = document.querySelector('#bizTable tbody');
  tbody.innerHTML = '';
  list.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div><a href="#" class="link" onclick="openBizOverlay(${b.id}, '${b.name.replace(/'/g,"\\'")}'); return false;">${b.name}</a></div>
          <div class="muted">Last day: ${b.lastDay} • Days seen: ${b.daysSeen}</div>
        </td>
        <td style="text-align:right;">${b.successSum}</td>
        <td style="text-align:right;">${b.arp != null ? b.arp.toFixed(2) : ''}</td>
        <td style="text-align:center;">${b.trend.txt || '—'}</td>
        <td style="text-align:right;">${b.solv != null ? Math.round(b.solv) : ''}</td>
      `;
      tr.dataset.businessName = b.name.toLowerCase();
      tbody.appendChild(tr);
  });

  refreshGlobalGeoBusinesses(list);
}

function filterBusinesses(q){
  const val = (q||'').toLowerCase().trim();
  document.querySelectorAll('#bizTable tbody tr').forEach(tr=>{
    tr.style.display = !val || (tr.dataset.businessName||'').includes(val) ? '' : 'none';
  });
}

/* =================== BUSINESS OVERLAY (per-business daily + keywords) =================== */
function openBizOverlay(businessId, businessName){
  document.getElementById('bizTitle').textContent = `${businessName} — last ${WINDOW_DAYS} days`;
  currentBizContext = { id: businessId, name: businessName };
  bizReportsLastMessage = '';
  bizReportsLastIsError = false;
  renderBizDaily(businessId);
  bizKeywordScope = 'today';
  renderBizKeywords(businessId, businessName);
  renderBizReports(businessId);
  const overlay = document.getElementById('bizOverlay');
  if (overlay.classList.contains('overlay')) {
    overlay.style.display = 'flex';
  }
}
function closeBizOverlay(){
  const overlay = document.getElementById('bizOverlay');
  resetBizKeywordDetail();
  currentBizReportSelection = null;
  highlightReport();
  currentBizContext = null;
  bizReportsLastMessage = '';
  bizReportsLastIsError = false;
  if (overlay.classList.contains('overlay')) {
    overlay.style.display = 'none';
  }
}

function renderBizDaily(businessId){
  const rows = dailyRowsCache.filter(r=> r.business_id === businessId)
                             .sort((a,b)=> b.day.localeCompare(a.day)); // desc
  const tbody = document.querySelector('#bizDailyTable tbody');
  tbody.innerHTML = '';
  rows.forEach((r, index) => {
    const prevDay = (index + 1 < rows.length) ? rows[index + 1] : null;
    const currentArp = r.avg_rank != null ? Number(r.avg_rank) : null;
    const prevArp = prevDay?.avg_rank != null ? Number(prevDay.avg_rank) : null;
    const trend = arrowDelta(currentArp, prevArp, false);
    const successCount = Number(r.success_count ?? r.sessions ?? 0);
    const keywordBreakdown = Array.isArray(r.keyword_breakdown) ? r.keyword_breakdown : [];
    const hasBreakdown = keywordBreakdown.some(item => Number(item?.count || 0) > 0);
    const breakdownBtn = hasBreakdown
      ? `<button type="button" class="link keyword-breakdown-link" onclick="showDailyKeywordBreakdown(${businessId}, '${r.day}')" title="View successful sessions by keyword">details</button>`
      : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.day}</td>
      <td>${successCount}${breakdownBtn ? ` ${breakdownBtn}` : ''}</td>
      <td>${r.avg_rank != null ? currentArp.toFixed(2) : ''}</td>
      <td>${trend.txt || '—'}</td>
      <td>${r.solv_top3 ?? ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function showDailyKeywordBreakdown(businessId, day){
  const overlay = document.getElementById('dailyKeywordOverlay');
  const tbody = document.querySelector('#dailyKeywordTable tbody');
  if (!overlay || !tbody) return;

  const titleEl = document.getElementById('dailyKeywordTitle');
  const summaryEl = document.getElementById('dailyKeywordSummary');
  const row = dailyRowsCache.find(r => r.business_id === businessId && r.day === day);
  const keywords = row && Array.isArray(row.keyword_breakdown) ? row.keyword_breakdown : [];
  const businessName = (currentBizContext && currentBizContext.id === businessId)
    ? currentBizContext.name
    : (row?.business_name || 'Business');

  if (titleEl) {
    titleEl.textContent = `${businessName} — ${day}`;
  }

  if (!keywords.length) {
    tbody.innerHTML = '<tr><td colspan="2" class="muted">No successful sessions recorded for this day.</td></tr>';
    if (summaryEl) {
      summaryEl.textContent = '';
    }
  } else {
    const total = keywords.reduce((sum, item) => sum + Number(item.count || 0), 0) || 0;
    tbody.innerHTML = keywords.map(item => `
      <tr>
        <td>${item.keyword || '(none)'}</td>
        <td style="text-align:right;">${item.count || 0}</td>
      </tr>
    `).join('');
    if (summaryEl) {
      summaryEl.textContent = `${total} successful session${total === 1 ? '' : 's'}`;
    }
  }

  overlay.style.display = 'flex';
}

function closeDailyKeywordOverlay(){
  const overlay = document.getElementById('dailyKeywordOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function buildKeywordSuccessMap(businessId, keyword){
  const normalized = String(keyword || '').trim().toLowerCase();
  const map = new Map();
  if (!normalized) return map;
  dailyRowsCache.forEach(row => {
    if (row.business_id !== businessId) return;
    const breakdown = Array.isArray(row.keyword_breakdown) ? row.keyword_breakdown : [];
    const match = breakdown.find(item => String(item?.keyword || '').trim().toLowerCase() === normalized);
    map.set(row.day, Number(match?.count || 0));
  });
  return map;
}

function renderBizKeywords(businessId, businessName, options = {}){
  const container = document.getElementById('bizKeywords');
  if (!container) return;

  const preserveSelection = Boolean(options.preserveSelection);
  const heading = document.getElementById('bizKeywordsHeading');
  const controls = document.getElementById('bizKeywordScopeControls');
  const previousSelection = preserveSelection && currentBizKeywordSelection && currentBizKeywordSelection.businessId === businessId
    ? currentBizKeywordSelection.keyword
    : null;

  container.innerHTML = '';
  currentBizKeywordSelection = null;

  const detailSection = document.getElementById('bizKeywordDetail');
  if (detailSection) {
    detailSection.classList.add('hidden');
  }

  const bizData = byBizCache.get(businessId);
  if (!bizData) {
    container.innerHTML = '<div class="muted">(no keyword data available)</div>';
    if (heading) {
      heading.textContent = 'Keywords';
    }
    resetBizKeywordDetail();
    updateBizReportsActionButton();
    return;
  }

  const normalizedScope = bizKeywordScope === 'all' ? 'all' : 'today';
  const keywordsAll = bizData.keywordsAll || bizData.keywords || [];
  const keywordsToday = bizData.keywordsToday || [];
  const activeKeywords = normalizedScope === 'today' ? keywordsToday : keywordsAll;

  if (heading) {
    heading.textContent = normalizedScope === 'today' ? 'Keywords (today)' : 'Keywords (all time)';
  }
  if (controls) {
    controls.querySelectorAll('.keyword-scope-button').forEach(btn => {
      const scope = btn.dataset.scope === 'all' ? 'all' : 'today';
      btn.classList.toggle('active', scope === normalizedScope);
    });
  }

  if (!activeKeywords.length) {
    const message = normalizedScope === 'today'
      ? 'No keywords recorded today. Select "All time" to view historical keywords.'
      : '(no keyword data available)';
    container.innerHTML = `<div class="muted">${message}</div>`;
    resetBizKeywordDetail();
    updateBizReportsActionButton();
    return;
  }

  const totalSuccesses = activeKeywords.reduce((sum, entry) => sum + Number(entry.count || 0), 0) || 0;

  activeKeywords.forEach(({ keyword, count }) => {
    const row = document.createElement('div');
    row.className = 'keyword-item';
    row.dataset.keyword = keyword;

    const title = document.createElement('span');
    title.className = 'keyword-item-title';
    title.textContent = keyword;

    const countNode = document.createElement('span');
    countNode.className = 'muted';
    const share = totalSuccesses ? Math.round((Number(count) / totalSuccesses) * 100) : 0;
    countNode.textContent = `${count} successes${share ? ` · ${share}%` : ''}`;

    row.appendChild(title);
    row.appendChild(countNode);
    row.onclick = () => showBizKeywordDetails(businessId, businessName, keyword);

    container.appendChild(row);
  });

  const defaultKeyword = previousSelection && activeKeywords.some(k => k.keyword === previousSelection)
    ? previousSelection
    : activeKeywords[0]?.keyword;
  if (defaultKeyword) {
    showBizKeywordDetails(businessId, businessName, defaultKeyword);
  } else {
    resetBizKeywordDetail();
  }
  updateBizReportsActionButton();
}

function setBizKeywordScope(scope){
  const normalized = scope === 'all' ? 'all' : 'today';
  if (bizKeywordScope === normalized) {
    return;
  }
  bizKeywordScope = normalized;
  if (currentBizContext) {
    renderBizKeywords(currentBizContext.id, currentBizContext.name, { preserveSelection: true });
  }
}

function resetBizKeywordDetail(){
  if (bizKwChartInstance) {
    bizKwChartInstance.destroy();
    bizKwChartInstance = null;
  }
  const detailSection = document.getElementById('bizKeywordDetail');
  if (detailSection) {
    detailSection.classList.add('hidden');
  }
  const tbody = document.querySelector('#bizKwTrendTable tbody');
  if (tbody) tbody.innerHTML = '';
  const notes = document.getElementById('bizKwNotes');
  if (notes) notes.textContent = '';
  const status = document.getElementById('bizKwMapStatus');
  if (status) status.textContent = 'Select a keyword to view the latest grid.';
  resetBizGeoMap();
}

function highlightKeyword(keyword){
  document.querySelectorAll('#bizKeywords .keyword-item').forEach(item => {
    item.classList.toggle('active', item.dataset.keyword === keyword);
  });
}

function showBizKeywordDetails(businessId, businessName, keyword){
  const container = document.getElementById('bizKeywords');
  if (!container) return;

  currentBizKeywordSelection = { businessId, keyword };
  highlightKeyword(keyword);
  currentBizReportSelection = null;
  highlightReport();

  const detailSection = document.getElementById('bizKeywordDetail');
  if (detailSection) {
    detailSection.classList.remove('hidden');
  }

  const titleEl = document.getElementById('bizKeywordTitle');
  if (titleEl) {
    titleEl.textContent = `${businessName} — “${keyword}” (last ${WINDOW_DAYS} days)`;
  }

  const tbody = document.querySelector('#bizKwTrendTable tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
  }
  const notes = document.getElementById('bizKwNotes');
  if (notes) notes.textContent = '';

  const status = document.getElementById('bizKwMapStatus');
  if (status) {
    status.textContent = `Loading grid (${describeWeekOffset(bizMapWeekOffset)})…`;
    status.classList.remove('error');
  }
  resetBizGeoMap();

  updateBizMapPeriodControls();

  showKeywordTrend(businessId, businessName, keyword, { inline: true });
  loadBizKeywordMap(businessId, keyword);
  updateBizReportsActionButton();
}

const MS_PER_DAY = 86400000;

function getWeekRange(offset){
  const now = Date.now();
  const start = new Date(now - (offset + 1) * 7 * MS_PER_DAY);
  const end = new Date(now - offset * 7 * MS_PER_DAY);
  return { start, end };
}

function formatWeekRange(offset){
  const { start, end } = getWeekRange(offset);
  const displayEnd = new Date(end.getTime() - 1000);
  const opts = { month: 'short', day: 'numeric', timeZone: 'America/Phoenix' };
  return `${start.toLocaleDateString('en-US', opts)} – ${displayEnd.toLocaleDateString('en-US', opts)}`;
}

function describeWeekOffset(offset){
  if (offset === 0) return 'Current 7 days';
  return formatWeekRange(offset);
}

function updateBizMapPeriodControls(){
  const label = document.getElementById('bizKwMapPeriodLabel');
  if (label) {
    label.textContent = describeWeekOffset(bizMapWeekOffset);
  }
  const prevBtn = document.getElementById('bizKwMapPrev');
  if (prevBtn) {
    prevBtn.disabled = false;
  }
  const nextBtn = document.getElementById('bizKwMapNext');
  if (nextBtn) {
    nextBtn.disabled = bizMapWeekOffset === 0;
  }
}

function changeBizMapOffset(delta){
  if (!Number.isFinite(delta)) {
    updateBizMapPeriodControls();
    return;
  }
  const nextOffset = Math.max(0, bizMapWeekOffset + delta);
  if (nextOffset === bizMapWeekOffset) {
    updateBizMapPeriodControls();
    return;
  }
  bizMapWeekOffset = nextOffset;
  updateBizMapPeriodControls();
  if (currentBizKeywordSelection) {
    const status = document.getElementById('bizKwMapStatus');
    if (status) {
      status.textContent = `Loading grid (${describeWeekOffset(bizMapWeekOffset)})…`;
      status.classList.remove('error');
    }
    loadBizKeywordMap(currentBizKeywordSelection.businessId, currentBizKeywordSelection.keyword);
  }
}

function updateBizReportsActionButton(){
  const btn = document.getElementById('bizReportsNewRun');
  if (!btn) return;
  const businessId = Number(btn.dataset.businessId || 0);
  const keyword = currentBizKeywordSelection && currentBizKeywordSelection.businessId === businessId
    ? currentBizKeywordSelection.keyword
    : null;

  const config = buildGeoRunConfig(businessId);
  const baseLabel = `Run ${config.label} (${config.radius} mi)`;

  if (!currentBizContext || currentBizContext.id !== businessId) {
    btn.disabled = true;
    btn.innerHTML = `${baseLabel}`;
    btn.dataset.keyword = '';
    return;
  }

  if (keyword) {
    btn.disabled = false;
    btn.innerHTML = `${baseLabel}<br>“${keyword}”`;
    btn.dataset.keyword = keyword;
  } else {
    btn.disabled = true;
    btn.innerHTML = `${baseLabel}<br>(select a keyword)`;
    btn.dataset.keyword = '';
  }
}

async function handleNewGeoGridRunClick(businessId){
  if (!currentBizContext || currentBizContext.id !== businessId) return;
  const keyword = currentBizKeywordSelection && currentBizKeywordSelection.businessId === businessId
    ? currentBizKeywordSelection.keyword
    : null;
  if (!keyword) {
    alert('Select a keyword first to launch a geo grid run.');
    return;
  }
  const config = buildGeoRunConfig(businessId);
  let originInfo = null;
  try {
    originInfo = await resolveKeywordOriginZone(businessId, keyword, config.radius);
  } catch (error) {
    console.error('Failed to resolve origin zone for keyword:', error);
    alert(error?.message || 'Failed to resolve origin zone for this keyword.');
    return;
  }

  if (!originInfo) {
    alert('No origin zone is configured for this keyword yet.');
    return;
  }

  const effectiveRadius = Number.isFinite(originInfo.radius) ? originInfo.radius : config.radius;
  const radiusLabel = describeRadiusMiles(effectiveRadius) || effectiveRadius;
  const zoneLabel = originInfo.zoneName || 'origin zone';
  const coordsLabel = `${originInfo.lat.toFixed(4)}, ${originInfo.lng.toFixed(4)}`;
  const message = `Start a ${config.label} grid (${radiusLabel} mi radius, ${config.points} points) for ${currentBizContext.name} — “${keyword}”?\nOrigin: ${zoneLabel} (${coordsLabel})`;
  if (!window.confirm(message)) {
    return;
  }
  startGeoGridRun(businessId, currentBizContext.name, keyword, config, originInfo);
}

function withGoogleMaps(callback, retries = 24){
  if (typeof google === 'object' && google.maps && typeof google.maps.Map === 'function') {
    callback();
    return;
  }
  if (retries <= 0) {
    console.warn('Google Maps API not ready');
    return;
  }
  setTimeout(() => withGoogleMaps(callback, retries - 1), 250);
}

function clearBizGeoMarkers(){
  if (bizGeoMapMarkers.length) {
    bizGeoMapMarkers.forEach(marker => marker.setMap(null));
  }
  bizGeoMapMarkers = [];
}

function resetBizGeoMap(){
  clearBizGeoMarkers();
  if (bizGeoInfoWindow) {
    bizGeoInfoWindow.close();
    bizGeoInfoWindow = null;
  }
  if (bizGeoMap) {
    bizGeoMap = null;
  }
  const container = document.getElementById('bizKwMap');
  if (container) {
    container.innerHTML = '';
  }
}

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttr(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function resolveMarkerArtifacts(data) {
  const rawScreenshot = (() => {
    if (!data) return null;
    if (typeof data.screenshot_path === 'string' && data.screenshot_path.trim()) return data.screenshot_path.trim();
    if (typeof data.screenshotPath === 'string' && data.screenshotPath.trim()) return data.screenshotPath.trim();
    if (typeof data.screenshot_file === 'string' && data.screenshot_file.trim()) return data.screenshot_file.trim();
    if (typeof data.screenshotFile === 'string' && data.screenshotFile.trim()) return data.screenshotFile.trim();
    return null;
  })();

  const screenshotFilename = rawScreenshot
    ? rawScreenshot.split(/[\\/]/).filter(Boolean).pop()
    : null;
  const screenshotHref = screenshotFilename
    ? (typeof LOGS_BASE_URL === 'string' && LOGS_BASE_URL
        ? `${LOGS_BASE_URL}${screenshotFilename}`
        : screenshotFilename)
    : null;

  const searchUrl = (() => {
    if (!data) return null;
    const candidates = [data.search_url, data.searchUrl, data.requestedUrl];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return null;
  })();

  const landingUrl = (() => {
    if (!data) return null;
    const candidates = [data.landing_url, data.landingUrl, data.currentUrl];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return null;
  })();

  return {
    screenshotHref,
    queryHref: landingUrl || searchUrl || null,
  };
}

function renderBizMapSessions(sessions, contextId, runId = null){
  const status = document.getElementById('bizKwMapStatus');
  if (!Array.isArray(sessions) || !sessions.length) {
    resetBizGeoMap();
    if (status && bizMapContextId === contextId) {
      if (bizMapWeekOffset === 0) {
        status.textContent = 'No live grid data found for this keyword yet.';
      } else {
        status.textContent = `No grid data found for this keyword in the ${describeWeekOffset(bizMapWeekOffset)} window.`;
      }
      status.classList.remove('error');
    }
    return;
  }

  withGoogleMaps(() => {
    if (bizMapContextId !== contextId) {
      return;
    }
    const container = document.getElementById('bizKwMap');
    if (!container) return;

    const validSessions = sessions.filter(s => Number.isFinite(Number(s.origin_lat)) && Number.isFinite(Number(s.origin_lng)));
    if (!validSessions.length) {
      resetBizGeoMap();
      if (status && bizMapContextId === contextId) {
        status.textContent = bizMapWeekOffset === 0
          ? 'No mappable grid data for this keyword yet.'
          : `No mappable grid data for this keyword in the ${describeWeekOffset(bizMapWeekOffset)} window.`;
        status.classList.remove('error');
      }
      return;
    }

    let needFitBounds = false;
    if (!bizGeoMap) {
      container.innerHTML = '';
      bizGeoMap = new google.maps.Map(container, {
        zoom: 12,
        center: { lat: Number(validSessions[0].origin_lat), lng: Number(validSessions[0].origin_lng) },
        mapId: 'DEMO_MAP_ID',
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false
      });
      needFitBounds = true;
    }

    clearBizGeoMarkers();
    const bounds = new google.maps.LatLngBounds();
    bizGeoMapMarkers = validSessions.map(session => {
      const rank = Number(session.rank);
      const runKey = session.run_id != null ? Number(session.run_id) : null;
      const queryKey = session.query_id != null ? Number(session.query_id) : null;
      let color = '#e74c3c';
      let zIndex = 1;
      if (Number.isFinite(rank) && rank <= 3) {
        color = '#2ecc71';
        zIndex = 3;
      } else if (Number.isFinite(rank) && rank <= 10) {
        color = '#f1c40f';
        zIndex = 2;
      }
      const position = { lat: Number(session.origin_lat), lng: Number(session.origin_lng) };
      bounds.extend(position);
      const rankLabel = Number.isFinite(rank)
        ? (rank > 20 ? '20+' : (rank > 0 ? String(rank) : '—'))
        : '—';
      const titleLines = [
        `Run: ${runKey ?? 'unknown'}`,
        queryKey != null ? `Query: ${queryKey}` : null,
        `Rank: ${rankLabel !== '—' ? rankLabel : 'n/a'}`,
        `Lat/Lng: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
      ].filter(Boolean);

      const marker = new google.maps.Marker({
        position,
        map: bizGeoMap,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: color,
          fillOpacity: 0.9,
          strokeWeight: 1,
          strokeColor: '#555'
        },
        label: {
          text: rankLabel,
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '12px'
        },
        title: titleLines.join('\n'),
        zIndex
      });

      marker.addListener('click', () => {
        if (!bizGeoInfoWindow) {
          bizGeoInfoWindow = new google.maps.InfoWindow();
        }
        const { screenshotHref, queryHref } = resolveMarkerArtifacts(session);
        const coordLabel = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
        const safeRank = escapeHtml(rankLabel);
        const safeCoord = escapeHtml(coordLabel);
        const queryHrefAttr = queryHref ? escapeHtmlAttr(queryHref) : null;
        const screenshotHrefAttr = screenshotHref ? escapeHtmlAttr(screenshotHref) : null;
        const parts = [
          `<div><strong>Rank:</strong> ${safeRank}</div>`,
          `<div><strong>Lat/Lng:</strong> ${safeCoord}</div>`
        ];
        if (queryHref) {
          parts.push(`<div><a href="${queryHrefAttr}" target="_blank" rel="noopener noreferrer">Open Search</a></div>`);
        }
        if (screenshotHref) {
          parts.push(`<div><a href="${screenshotHrefAttr}" target="_blank" rel="noopener noreferrer">View Screenshot</a></div>`);
        }
        if (parts.length === 2) {
          parts.push('<div>No artifacts captured for this point.</div>');
        }
        bizGeoInfoWindow.setContent(`<div class="geo-marker-info">${parts.join('')}</div>`);
        bizGeoInfoWindow.open({ map: bizGeoMap, anchor: marker });
      });
      return marker;
    });
    if (!bounds.isEmpty()) {
      if (validSessions.length === 1) {
        const targetZoom = 15;
        bizGeoMap.setCenter(bounds.getCenter());
        if (bizGeoMap.getZoom() < targetZoom) {
          bizGeoMap.setZoom(targetZoom);
        }
      } else if (needFitBounds) {
        bizGeoMap.fitBounds(bounds, 40);
      } else {
        const currentBounds = bizGeoMap.getBounds();
        if (!currentBounds || !currentBounds.contains(bounds.getNorthEast()) || !currentBounds.contains(bounds.getSouthWest())) {
          bizGeoMap.fitBounds(bounds, 40);
        }
      }
    }

    if (status && bizMapContextId === contextId) {
      const uniqueSources = new Set(validSessions.map(s => s.source || 'logs'));
      const fromLogs = uniqueSources.has('logs');
      const uniquePointCount = new Set(validSessions.map(s => `${s.origin_lat},${s.origin_lng}`)).size;
      const runIds = Array.from(new Set(validSessions
        .map(s => (s.run_id != null ? Number(s.run_id) : null))
        .filter(id => Number.isFinite(id))));
      const periodLabel = describeWeekOffset(bizMapWeekOffset);

      if (fromLogs) {
        const runText = runIds.length === 0
          ? 'recent runs'
          : (runIds.length === 1 ? `Run #${runIds[0]}` : `${runIds.length} runs`);
        status.textContent = `Keyword activity (${periodLabel}) — ${uniquePointCount} points across ${runText}.`;
      } else if (runId) {
        status.textContent = bizMapWeekOffset === 0
          ? `Latest keyword grid from run #${runId}.`
          : `Keyword grid from run #${runId} (${periodLabel} window).`;
      } else {
        status.textContent = `Keyword grid data (${periodLabel}, ${uniquePointCount} points).`;
      }
      status.classList.remove('error');
    }
  });
}

function renderBizMapReport(run, points, contextId){
  const status = document.getElementById('bizKwMapStatus');
  if (!Array.isArray(points) || !points.length) {
    resetBizGeoMap();
    if (status && bizMapContextId === contextId) {
      status.textContent = 'Report has no plotted points.';
      status.classList.remove('error');
    }
    return;
  }

  withGoogleMaps(() => {
    if (bizMapContextId !== contextId) {
      return;
    }
    const container = document.getElementById('bizKwMap');
    if (!container) return;

    const validPoints = points.filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
    if (!validPoints.length) {
      resetBizGeoMap();
      if (status && bizMapContextId === contextId) {
        status.textContent = 'Report has no mappable points.';
        status.classList.remove('error');
      }
      return;
    }

    let needFitBounds = false;
    if (!bizGeoMap) {
      container.innerHTML = '';
      bizGeoMap = new google.maps.Map(container, {
        zoom: 12,
        center: { lat: Number(validPoints[0].lat), lng: Number(validPoints[0].lng) },
        mapId: 'DEMO_MAP_ID',
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false
      });
      needFitBounds = true;
    }

    clearBizGeoMarkers();
    const bounds = new google.maps.LatLngBounds();
    bizGeoMapMarkers = validPoints.map(point => {
      const rank = Number(point.rank_pos);
      const runKey = point.run_id != null ? Number(point.run_id) : null;
      const queryKey = point.query_id != null ? Number(point.query_id) : null;
      let color = '#e74c3c';
      let zIndex = 1;
      if (Number.isFinite(rank) && rank <= 3) {
        color = '#2ecc71';
        zIndex = 3;
      } else if (Number.isFinite(rank) && rank <= 10) {
        color = '#f1c40f';
        zIndex = 2;
      }
      const position = { lat: Number(point.lat), lng: Number(point.lng) };
      bounds.extend(position);
      const rankLabel = Number.isFinite(rank)
        ? (rank > 20 ? '20+' : (rank > 0 ? String(rank) : '—'))
        : '—';
      const titleLines = [
        `Run: ${runKey ?? 'unknown'}`,
        queryKey != null ? `Query: ${queryKey}` : null,
        `Rank: ${rankLabel !== '—' ? rankLabel : 'n/a'}`,
        `Lat/Lng: ${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
      ].filter(Boolean);

      const marker = new google.maps.Marker({
        position,
        map: bizGeoMap,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: color,
          fillOpacity: 0.9,
          strokeWeight: 1,
          strokeColor: '#555'
        },
        label: {
          text: rankLabel,
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '12px'
        },
        title: titleLines.join('\n'),
        zIndex
      });

      marker.addListener('click', () => {
        if (!bizGeoInfoWindow) {
          bizGeoInfoWindow = new google.maps.InfoWindow();
        }
        const { screenshotHref, queryHref } = resolveMarkerArtifacts(point);
        const coordLabel = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
        const safeRank = escapeHtml(rankLabel);
        const safeCoord = escapeHtml(coordLabel);
        const queryHrefAttr = queryHref ? escapeHtmlAttr(queryHref) : null;
        const screenshotHrefAttr = screenshotHref ? escapeHtmlAttr(screenshotHref) : null;
        const parts = [
          `<div><strong>Rank:</strong> ${safeRank}</div>`,
          `<div><strong>Lat/Lng:</strong> ${safeCoord}</div>`
        ];
        if (queryHref) {
          parts.push(`<div><a href="${queryHrefAttr}" target="_blank" rel="noopener noreferrer">Open Search</a></div>`);
        }
        if (screenshotHref) {
          parts.push(`<div><a href="${screenshotHrefAttr}" target="_blank" rel="noopener noreferrer">View Screenshot</a></div>`);
        }
        if (parts.length === 2) {
          parts.push('<div>No artifacts captured for this point.</div>');
        }
        bizGeoInfoWindow.setContent(`<div class="geo-marker-info">${parts.join('')}</div>`);
        bizGeoInfoWindow.open({ map: bizGeoMap, anchor: marker });
      });
      return marker;
    });
    if (!bounds.isEmpty()) {
      if (validPoints.length === 1) {
        const targetZoom = 15;
        bizGeoMap.setCenter(bounds.getCenter());
        if (bizGeoMap.getZoom() < targetZoom) {
          bizGeoMap.setZoom(targetZoom);
        }
      } else if (needFitBounds) {
        bizGeoMap.fitBounds(bounds, 40);
      } else {
        const currentBounds = bizGeoMap.getBounds();
        if (!currentBounds || !currentBounds.contains(bounds.getNorthEast()) || !currentBounds.contains(bounds.getSouthWest())) {
          bizGeoMap.fitBounds(bounds, 40);
        }
      }
    }

    if (status && bizMapContextId === contextId) {
      const finishedAt = run?.finished_at ? new Date(run.finished_at).toLocaleString() : null;
      const keywordLabel = run?.keyword ? `“${run.keyword}”` : 'report';
      status.textContent = finishedAt ? `Viewing ${keywordLabel} report from ${finishedAt}.` : `Viewing ${keywordLabel} report.`;
      status.classList.remove('error');
    }
  });
}

async function loadBizKeywordMap(businessId, keyword){
  const status = document.getElementById('bizKwMapStatus');
  const contextId = ++bizMapContextId;
  try {
    const res = await fetch(`${ENDPOINT_GEO}?business_id=${businessId}&keyword=${encodeURIComponent(keyword)}&week_offset=${bizMapWeekOffset}`);
    const sessions = await res.json();
    if (bizMapContextId !== contextId) {
      return;
    }
    if (!res.ok || (sessions && sessions.error)) {
      throw new Error(sessions?.error || 'Request failed');
    }
    const normalized = Array.isArray(sessions) ? sessions : [];
    const runId = normalized.length ? normalized[0]?.run_id ?? null : null;
    renderBizMapSessions(normalized, contextId, runId);
  } catch (error) {
    console.error('Failed to load live geo grid data:', error);
    if (bizMapContextId === contextId && status) {
      status.textContent = `Failed to load grid for ${describeWeekOffset(bizMapWeekOffset)}.`;
      status.classList.add('error');
    }
    resetBizGeoMap();
  }
}

async function loadBizReport(runId, keyword){
  const status = document.getElementById('bizKwMapStatus');
  const contextId = ++bizMapContextId;
  try {
    const res = await fetch(`${ENDPOINT_GET_REPORT}?run_id=${runId}`);
    const payload = await res.json();
    if (bizMapContextId !== contextId) {
      return;
    }
    if (!res.ok || payload?.error) {
      throw new Error(payload?.error || 'Request failed');
    }
    renderBizMapReport(payload.run, payload.points, contextId);
  } catch (error) {
    console.error('Failed to load geo-grid report:', error);
    if (bizMapContextId === contextId && status) {
      status.textContent = `Failed to load report${keyword ? ` for “${keyword}”` : ''}.`;
      status.classList.add('error');
    }
    resetBizGeoMap();
  }
}

function highlightReport(runId){
  document.querySelectorAll('#bizReports .report-item').forEach(item => {
    item.classList.toggle('active', runId != null && item.dataset.runId === String(runId));
  });
}

function formatDateTime(value){
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function describeRadiusMiles(value){
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num * 10) / 10;
  return Math.abs(rounded - Math.round(rounded)) < 1e-9
    ? String(Math.round(rounded))
    : rounded.toFixed(1);
}

function formatRankStat(value){
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num >= 20.95) return '20+';
  const fixed = num.toFixed(2);
  return fixed
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

function formatPercentStat(value){
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `${num.toFixed(1).replace(/\.0$/, '')}%`;
}

function describeGeoRunScan(run){
  if (!run || typeof run !== 'object') return '—';
  const parts = [];
  const rows = Number(run.grid_rows);
  const cols = Number(run.grid_cols);
  if (Number.isFinite(rows) && Number.isFinite(cols) && rows > 0 && cols > 0) {
    parts.push(`${rows}×${cols} grid`);
  }
  const radius = describeRadiusMiles(run.radius_miles);
  if (radius) {
    parts.push(`${radius} mi radius`);
  }
  const status = typeof run.status === 'string' ? run.status.trim() : '';
  if (status) {
    parts.push(status);
  }
  return parts.length ? parts.join(' · ') : '—';
}

function buildGeoRunMeta(run){
  const parts = [];
  if (run.created_at) parts.push(formatDateTime(run.created_at));
  if (run.status) parts.push(run.status);

  const rows = Number(run.grid_rows);
  const cols = Number(run.grid_cols);
  if (Number.isFinite(rows) && Number.isFinite(cols) && rows > 0 && cols > 0) {
    parts.push(`${rows}×${cols} grid`);
  }

  const radius = describeRadiusMiles(run.radius_miles);
  if (radius) {
    parts.push(`${radius} mi radius`);
  }

  const arp = Number(run.avg_rank);
  const arpText = formatRankStat(arp);
  if (arpText) {
    parts.push(`ARP ${arpText}`);
  }

  const solv = Number(run.solv_top3);
  if (Number.isFinite(solv)) {
    parts.push(`SoLV ${solv.toFixed(1)}%`);
  }

  return parts.join(' · ');
}

async function renderBizReports(businessId){
  const container = document.getElementById('bizReports');
  if (!container) return;

  container.innerHTML = '<div class="muted">Loading reports…</div>';
  const requestId = ++bizReportRequestId;

  try {
    const res = await fetch(`${ENDPOINT_LIST_RUNS}?business_id=${businessId}`);
    const payload = await res.json();
    if (bizReportRequestId !== requestId) {
      return;
    }
    if (!res.ok || payload?.error) {
      throw new Error(payload?.error || 'Request failed');
    }

    const runs = payload.runs || [];

    container.innerHTML = '';

    const actions = document.createElement('div');
    actions.className = 'biz-reports-actions';

    const controlsWrap = document.createElement('div');
    controlsWrap.className = 'biz-reports-controls';

    const settings = getGeoSettingsForBusiness(businessId);

    const gridSelect = document.createElement('select');
    gridSelect.id = `geoGridSize-${businessId}`;
    GEO_GRID_CHOICES.forEach((choice, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = `${choice.label} (${choice.rows * choice.cols} pts)`;
      gridSelect.appendChild(opt);
    });
    gridSelect.value = String(settings.gridIndex);

    const radiusSelect = document.createElement('select');
    radiusSelect.id = `geoGridRadius-${businessId}`;
    GEO_RADIUS_CHOICES.forEach((radius, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = `${radius} mi radius`;
      radiusSelect.appendChild(opt);
    });
    radiusSelect.value = String(settings.radiusIndex);

    const handleControlChange = () => {
      geoRunSettings.set(businessId, {
        gridIndex: Number(gridSelect.value),
        radiusIndex: Number(radiusSelect.value)
      });
      updateBizReportsActionButton();
    };
    gridSelect.addEventListener('change', handleControlChange);
    radiusSelect.addEventListener('change', handleControlChange);

    controlsWrap.appendChild(gridSelect);
    controlsWrap.appendChild(radiusSelect);
    actions.appendChild(controlsWrap);

    const newRunButton = document.createElement('button');
    newRunButton.type = 'button';
    newRunButton.id = 'bizReportsNewRun';
    newRunButton.dataset.businessId = String(businessId);
    newRunButton.onclick = () => handleNewGeoGridRunClick(businessId);
    actions.appendChild(newRunButton);
    container.appendChild(actions);

    const status = document.createElement('div');
    status.id = 'bizReportsStatus';
    status.className = 'biz-reports-status muted';
    if (bizReportsLastMessage && currentBizContext && currentBizContext.id === businessId) {
      status.textContent = bizReportsLastMessage;
      status.classList.toggle('error', bizReportsLastIsError);
    }
    container.appendChild(status);

    if (!runs.length) {
      status.textContent = '(no reports yet)';
      status.classList.remove('error');
      updateBizReportsActionButton();
      return;
    }

    const list = document.createElement('ul');
    list.className = 'report-list';

    runs.forEach(run => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'report-item';
      button.dataset.runId = String(run.id);

      const name = document.createElement('span');
      name.textContent = run.keyword ? `“${run.keyword}”` : '(no keyword)';

      const meta = document.createElement('span');
      meta.className = 'muted';
      meta.textContent = buildGeoRunMeta(run);

      button.appendChild(name);
      button.appendChild(meta);
      button.onclick = () => {
        highlightReport(run.id);
        currentBizReportSelection = { businessId, runId: run.id };
        const status = document.getElementById('bizKwMapStatus');
        if (status) {
          status.textContent = `Loading report for ${run.keyword ? `“${run.keyword}”` : 'selected run'}…`;
          status.classList.remove('error');
        }
        resetBizGeoMap();
        loadBizReport(run.id, run.keyword);
      };

      item.appendChild(button);
      list.appendChild(item);
    });

    container.appendChild(list);

    updateBizReportsActionButton();

    if (currentBizReportSelection && currentBizReportSelection.businessId === businessId) {
      highlightReport(currentBizReportSelection.runId);
    }
  } catch (error) {
    console.error('Failed to load geo-grid reports:', error);
    if (bizReportRequestId === requestId) {
      container.innerHTML = '<div class="muted">Failed to load reports.</div>';
    }
  }
}

/* =================== GEO RUNS OVERLAY =================== */
function setGeoRunsStatus(message, isError = false){
  const statusEl = document.getElementById('geoRunsStatus');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.style.color = isError ? '#c0392b' : '';
  statusEl.style.fontWeight = isError ? '600' : '';
}

function renderGeoRunsTable(runs){
  const tbody = document.getElementById('geoRunsBody');
  if (!tbody) return;

  if (!Array.isArray(runs) || runs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">No geo grid runs yet.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  runs.forEach(run => {
    const tr = document.createElement('tr');

    const created = document.createElement('td');
    created.textContent = formatDateTime(run.created_at) || '—';
    tr.appendChild(created);

    const business = document.createElement('td');
    business.textContent = run.business_name || '(unknown)';
    tr.appendChild(business);

    const keyword = document.createElement('td');
    keyword.textContent = run.keyword ? `“${run.keyword}”` : '—';
    tr.appendChild(keyword);

    const scan = document.createElement('td');
    scan.textContent = describeGeoRunScan(run);
    tr.appendChild(scan);

    const arp = document.createElement('td');
    const arpText = formatRankStat(run.avg_rank);
    arp.textContent = arpText ?? '—';
    tr.appendChild(arp);

    const solv = document.createElement('td');
    const solvText = formatPercentStat(run.solv_top3);
    solv.textContent = solvText ?? '—';
    tr.appendChild(solv);

    tbody.appendChild(tr);
  });
}

async function loadGeoRuns(){
  if (geoRunsLoading) return;

  const tbody = document.getElementById('geoRunsBody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
  }
  setGeoRunsStatus('Loading latest runs…');
  geoRunsLoading = true;

  try {
    const res = await fetch(`${ENDPOINT_LIST_RUNS}?limit=200`);
    const data = await res.json();
    if (!res.ok || data?.error) {
      throw new Error(data?.error || 'Request failed');
    }
    geoRunsCache = Array.isArray(data.runs) ? data.runs : [];
    renderGeoRunsTable(geoRunsCache);
    geoRunsLoaded = true;
    const count = geoRunsCache.length;
    setGeoRunsStatus(count ? `Loaded ${count} run${count === 1 ? '' : 's'}.` : 'No runs yet.');
  } catch (error) {
    console.error('Failed to load geo grid runs:', error);
    if (!geoRunsLoaded) {
      const body = document.getElementById('geoRunsBody');
      if (body) {
        body.innerHTML = '<tr><td colspan="6" class="muted">Failed to load runs.</td></tr>';
      }
    } else {
      renderGeoRunsTable(geoRunsCache);
    }
    setGeoRunsStatus(error.message || 'Failed to load runs.', true);
  } finally {
    geoRunsLoading = false;
  }
}

async function openGeoRunsOverlay(){
  const overlay = document.getElementById('geoRunsOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  if (!geoRunsLoaded) {
    await loadGeoRuns();
  }
}

function closeGeoRunsOverlay(){
  const overlay = document.getElementById('geoRunsOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function refreshGeoRuns(){
  geoRunsLoaded = false;
  return loadGeoRuns();
}

/* =================== LOGS OVERLAY =================== */
let currentSortOrder = null;
function openLogsOverlay(scope){
  document.getElementById('logsOverlay').style.display='flex';
  document.getElementById('logsScopeLabel').textContent =
    scope === 'today' ? 'Showing: Today only' : 'Showing: All available days';
  loadLogs(scope);
}
function closeLogsOverlay(){ document.getElementById('logsOverlay').style.display='none'; }

function toggleGroup(date){
  const rows = document.querySelectorAll(`.log-row[data-date="${date}"]`);
  const isHidden = rows[0] && rows[0].style.display==='none';
  rows.forEach(r=>r.style.display = isHidden ? 'table-row' : 'none');
  const btn = document.getElementById(`toggle-${date}`);
  btn.textContent = (isHidden?'▼':'▶')+' '+btn.dataset.label;
}

function applySuccessFilter(){
  const showOnlySuccess = document.getElementById('logsSuccessToggle').checked;
  document.querySelectorAll('#logTable .log-row').forEach(r=>{
    const isSuccess  = r.dataset.success === 'true';
    const groupArrow = document.getElementById(`toggle-${r.dataset.date}`);
    const groupOpen  = groupArrow && groupArrow.textContent.trim().startsWith('▼');
    if (showOnlySuccess && !isSuccess) {
      r.style.display = 'none';
    } else if (!groupOpen) {
      r.style.display = 'none';
    } else {
      r.style.display = 'table-row';
    }
  });
}

function sortByBusiness(){
  const tbody = document.querySelector('#logTable tbody');
  const allRows = Array.from(tbody.querySelectorAll('.log-row'));
  if(!allRows.length) return;

  const grouped={}, toggleRows={};
  allRows.forEach(r=>{ (grouped[r.dataset.date]=grouped[r.dataset.date]||[]).push(r); });
  Object.keys(grouped).forEach(d=>{
    const t = document.getElementById(`toggle-${d}`);
    toggleRows[d]= t ? t.closest('tr') : null;
  });

  tbody.innerHTML='';
  currentSortOrder = currentSortOrder==='asc'?'desc':'asc';
  Object.keys(grouped).forEach(d=>{
    if (toggleRows[d]) tbody.appendChild(toggleRows[d]);
    grouped[d].sort((a,b)=>{
      const A=a.cells[5].textContent.trim().toLowerCase();
      const B=b.cells[5].textContent.trim().toLowerCase();
      return currentSortOrder==='asc'?A.localeCompare(B):B.localeCompare(A);
    });
    grouped[d].forEach(r=>tbody.appendChild(r));
  });
}

async function loadLogs(scope='all'){
  const openDates=new Set();
  document.querySelectorAll('#logTable .log-row').forEach(r=>{
    if(r.style.display!=='none') openDates.add(r.dataset.date);
  });

  const res=await fetch(ENDPOINT_LOGS);
  const data=await res.json();
  const tbody=document.querySelector('#logTable tbody');
  tbody.innerHTML='';

  const grouped = {};
  data.forEach(r=>{
    const d = phoenixDateKey(r);
    (grouped[d] = grouped[d] || []).push(r);
  });

  const todayPHX = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
  Object.keys(grouped).forEach(date=>{
    const count=grouped[date].length;
    const shouldShowGroup = (scope==='all') || (date === todayPHX);

    const toggleRow=document.createElement('tr');
    toggleRow.style.display = shouldShowGroup ? '' : 'none';
    toggleRow.innerHTML=`
      <td colspan="15" style="background:#ddd;font-weight:bold;cursor:pointer;"
          onclick="toggleGroup('${date}')">
        <span id="toggle-${date}" data-label="${date} (${count})">
          ${ (openDates.size===0 && (scope==='today' ? date===todayPHX : date===todayPHX)) ? '▼' : '▶' } ${date} (${count})
        </span>
      </td>`;
    tbody.appendChild(toggleRow);

    grouped[date].forEach(row=>{
      const tr=document.createElement('tr');
      tr.classList.add('log-row'); tr.dataset.date=date;

      let status, reasonTxt='', isSuccess=false;
      if(row.reason!==undefined){
        if(row.reason==='success'){ status='✅'; isSuccess=true; }
        else{ reasonTxt=String(row.reason).replace(/_/g,' '); status=`❌<br/>${reasonTxt}`; }
      }else{
        if(row.captchaFailed){ status='❌<br/>captcha'; }
        else if(row.ctrfound===false){ status='❌<br/>ctr'; }
        else{ status='✅'; isSuccess=true; }
      }

      tr.dataset.success=isSuccess;
      tr.style.display = (shouldShowGroup && date===todayPHX) ? 'table-row' : (shouldShowGroup ? 'none' : 'none');

      if(row.retry) tr.style.background='#fff8e1';

      const originLat=row.origin?.lat, originLng=row.origin?.lng,
            destLat=row.location?.lat, destLng=row.location?.lng;
      const routeLink=(originLat&&destLat)
        ? `<a href="https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}" target="_blank">View Route</a>`
        : '';

      const hasEvents=Array.isArray(row.events)&&row.events.length;
      let eventsLink = '';
      if (hasEvents) {
        const encoded = encodeURIComponent(JSON.stringify(row.events)).replace(/'/g, '%27');
        eventsLink = `<a title="view events" style="cursor:pointer;" onclick="showEvents('${encoded}')">📄</a>`;
      }

      tr.innerHTML = `
        <td>${phoenixDateTime(row.timestamp_utc || row.created_at)}</td>
        <td style="text-align:center;">${status}</td>
        <td style="text-align:center;">${eventsLink}</td>
        <td>${row.keyword||''}</td>
        <td>${row.rank||''}</td>
        <td>${row.business_name||''}</td>
        <td>${row.origin||''}</td>
        <td>${row.device||''}</td>
        <td>${row.ctr_ip_address||''}</td>
        <td>${row.drive_ip_address||''}</td>
        <td>${routeLink}</td>
        <td>${row.steps??''}</td>
        <td>${row.durationMin??''}</td>`;
      tbody.appendChild(tr);
    });
  });

  if(currentSortOrder) sortByBusiness();
  applySuccessFilter();
}

/* =================== BUSINESS SUMMARY (lazy loads logs) =================== */
let bizSummaryBuilt = false;
function toggleBizSummary(){
  const el = document.getElementById('bizSummaryWrap');
  const willOpen = (el.style.display === 'none' || !el.style.display);
  if (willOpen && !bizSummaryBuilt) {
    buildBizSummaryFromLogs().then(()=> {
      el.style.display='flex';
    });
  } else {
    el.style.display = willOpen ? 'flex' : 'none';
  }
}
function closeBizSummary(){ document.getElementById('bizSummaryWrap').style.display='none'; }

async function buildBizSummaryFromLogs(){
  const res = await fetch(ENDPOINT_LOGS);
  const rows = await res.json();
  const byDayBiz = new Map();
  rows.forEach(r=>{
    const date = new Date(r.timestamp_utc).toLocaleDateString('en-CA', { timeZone:'America/Los_Angeles' });
    const biz  = (r.businessName || r.business_name || '').trim() || '(unknown)';
    const key  = `${date}||${biz}`;
    if(!byDayBiz.has(key)){
      byDayBiz.set(key, { date, biz, ok:0, fail:0, total:0, kws:new Set() });
    }
    const bucket = byDayBiz.get(key);
    const isSuccess = (r.reason !== undefined) ? (r.reason === 'success')
                    : (r.captchaFailed ? false : r.ctrfound !== false);
    bucket.total += 1;
    if(isSuccess) bucket.ok += 1; else bucket.fail += 1;
    if (r.keyword) bucket.kws.add(String(r.keyword).trim());
  });

  const tbody = document.querySelector('#bizSummaryTable tbody');
  tbody.innerHTML = '';
  const rowsArr = Array.from(byDayBiz.values()).sort((a,b)=>{
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.biz.localeCompare(b.biz);
  });
  rowsArr.forEach((b, idx) => {
    const tr = document.createElement('tr');
    const uniqKw = b.kws.size;
    const rate = b.total ? Math.round((b.ok / b.total) * 100) : 0;
    tr.innerHTML = `
      <td>${b.date}</td>
      <td>${b.biz}</td>
      <td style="text-align:right;">${b.ok}</td>
      <td style="text-align:right;">${b.fail}</td>
      <td style="text-align:right;">${b.total}</td>
      <td style="text-align:right;">${uniqKw}</td>
      <td style="text-align:right;">${rate}%</td>
    `;
    if (idx > 0 && b.date !== rowsArr[idx - 1].date) {
      const dividerRow = document.createElement('tr');
      dividerRow.style.background = '#ccc';
      dividerRow.innerHTML = `<td colspan="7" style="height:2px;padding:0;"></td>`;
      tbody.appendChild(dividerRow);
    }
    tbody.appendChild(tr);
  });
  bizSummaryBuilt = true;
}

/* =================== KEYWORD TREND (your existing logic, kept) =================== */
function kwLink(bid, bname, kw, count){
  const safeKw = kw?.replace(/"/g,'&quot;') || '';
  return `<a href="#" onclick="showKeywordTrend(${bid}, '${bname?.replace(/'/g,"\\'")}', '${safeKw}')">${kw||'(none)'} (${count})</a>`;
}
function closeKeywordOverlay(){
  document.getElementById('keywordOverlay').style.display='none';
  if (kwChart) { kwChart.destroy(); kwChart = null; }
}
const top3Shade = {
  id: 'top3Shade',
  beforeDraw(chart, args, opts){
    const {ctx, chartArea, scales} = chart;
    if (!chartArea) return;
    const y = scales.yRank;
    const yTop = y.getPixelForValue(3);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 200, 0, 0.08)';
    ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, yTop - chartArea.top);
    ctx.restore();
  }
};
let kwChart = null;

async function showKeywordTrend(businessId, businessName, keyword, options = {}){
  const inline = options.inline === true;
  const overlay = inline ? null : document.getElementById('keywordOverlay');
  const titleEl = inline ? document.getElementById('bizKeywordTitle') : document.getElementById('kwTitle');
  const tbody = inline ? document.querySelector('#bizKwTrendTable tbody') : document.querySelector('#kwTrendTable tbody');
  const notesEl = inline ? document.getElementById('bizKwNotes') : document.getElementById('kwNotes');
  const canvas = inline ? document.getElementById('bizKwChart') : document.getElementById('kwChart');

  if (!canvas || !tbody || !notesEl) return;

  if (titleEl && !inline) {
    titleEl.textContent = `${businessName} — “${keyword}” (last ${WINDOW_DAYS} days)`;
  }

  if (!inline) {
    tbody.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
    overlay.style.display = 'flex';
  }

  const url = `${ENDPOINT_KTREND}?business_id=${encodeURIComponent(businessId)}&keyword=${encodeURIComponent(keyword)}&days=${WINDOW_DAYS}`;
  const res = await fetch(url);
  const payload = await res.json();

  let rows   = payload.series || [];
  const comps  = payload.competitorSeries || [];

  const successMap = buildKeywordSuccessMap(businessId, keyword);

  const rowMap = new Map(rows.map(r => [r.day, { ...r }]));
  const mergedDaySet = new Set([
    ...rowMap.keys(),
    ...successMap.keys()
  ]);

  const sortedDays = Array.from(mergedDaySet).sort();
  const limitedDays = sortedDays.slice(-WINDOW_DAYS);

  rows = limitedDays.map(day => {
    if (rowMap.has(day)) return rowMap.get(day);
    return { day, avg_rank: null, solv_top3: null, snapshots: 0 };
  });

  const labels = rows.map(r => r.day);
  const arp    = rows.map(r => (r.avg_rank != null ? Number(r.avg_rank) : null));
  const solv   = rows.map(r => (r.solv_top3 != null ? Number(r.solv_top3) : null));
  const successSeries = labels.map(day => {
    if (!successMap.has(day)) return 0;
    const value = Number(successMap.get(day) || 0);
    return Number.isFinite(value) ? value : 0;
  });

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (inline) {
    if (bizKwChartInstance) bizKwChartInstance.destroy();
  } else if (kwChart) {
    kwChart.destroy();
  }

  const compDatasets = (comps || []).map((c) => {
    const dayMap = new Map((c.series || []).map(s => [s.day, s.avg_pos != null ? Number(s.avg_pos) : null]));
    return {
      label: `${c.name} (comp)`,
      data: labels.map(day => dayMap.has(day) ? dayMap.get(day) : null),
      spanGaps: true,
      tension: 0.2,
      pointRadius: 1.5,
      borderDash: [2,2],
      yAxisID: 'yRank',
      order: 2
    };
  });

  const chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Our Avg Rank (ARP)',
          data: arp,
          spanGaps: true,
          tension: 0.2,
          pointRadius: 2,
          yAxisID: 'yRank',
          order: 1
        },
        ...compDatasets,
        {
          label: 'Our SoLV Top-3 %',
          data: solv,
          yAxisID: 'yPct',
          spanGaps: true,
          borderDash: [6,4],
          tension: 0.2,
          pointRadius: 2,
          order: 3
        },
        {
          type: 'bar',
          label: 'Successful Sessions',
          data: successSeries,
          yAxisID: 'ySessions',
          backgroundColor: 'rgba(52, 152, 219, 0.25)',
          borderColor: 'rgba(52, 152, 219, 0.6)',
          borderWidth: 1,
          order: 0,
          borderRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true },
        tooltip: {
          mode: 'index',
          intersect: false,
          filter(ctx) {
            const value = ctx.parsed?.y ?? ctx.parsed ?? ctx.raw;
            return value !== null && value !== undefined && !Number.isNaN(value);
          },
          callbacks: {
            label(ctx) {
              const datasetLabel = ctx.dataset?.label ? `${ctx.dataset.label}: ` : '';
              const axisId = ctx.dataset?.yAxisID;
              const rawValue = ctx.parsed?.y ?? ctx.parsed ?? ctx.raw;

              if (rawValue === null || rawValue === undefined || Number.isNaN(rawValue)) {
                return `${datasetLabel}—`;
              }

              if (axisId === 'ySessions') {
                return `${datasetLabel}${Math.round(rawValue)}`;
              }

              if (axisId === 'yPct') {
                return `${datasetLabel}${Number(rawValue).toFixed(1)}%`;
              }

              if (axisId === 'yRank') {
                return `${datasetLabel}${Number(rawValue).toFixed(2)}`;
              }

              return `${datasetLabel}${rawValue}`;
            }
          }
        }
      },
      scales: {
        yRank: { position: 'left', reverse: true, title: { display: true, text: 'Rank (↓ better)' } },
        yPct:  { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: 'SoLV %' } },
        ySessions: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'Successful Sessions' },
          ticks: { precision: 0 }
        }
      }
    },
    plugins: [top3Shade]
  });

  if (inline) {
    bizKwChartInstance = chartInstance;
  } else {
    kwChart = chartInstance;
  }

  tbody.innerHTML = '';
  let prev = null;
  rows.forEach(r=>{
    const successes = successMap.has(r.day)
      ? Number(successMap.get(r.day) || 0)
      : 0;
    const arpV  = r.avg_rank!=null ? Number(r.avg_rank) : null;
    const solvV = r.solv_top3 != null ? Number(r.solv_top3) : null;
    const previousSuccesses = prev?.successes ?? null;
    const dSessions = arrowDelta(successes, previousSuccesses, true);
    const dArp      = arrowDelta(arpV, prev?.avg_rank, false);
    const dSolv     = arrowDelta(solvV, prev?.solv_top3, true);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.day}</td>
      <td>${successes}${dSessions.txt}</td>
      <td>${arpV != null ? arpV.toFixed(2) : ''}${dArp.txt}</td>
      <td>${solvV ?? ''}${dSolv.txt}</td>
    `;
    tbody.appendChild(tr);
    prev = { successes, avg_rank:arpV, solv_top3:solvV };
  });

  const notes = [];
  if (comps.length > 0) {
    notes.push('Competitors are included for context; data may not be available for all days.');
  }
  if (successMap.size === 0) {
    notes.push('No successful sessions recorded for this keyword within the selected window.');
  }
  notesEl.textContent = notes.join(' ');
}

/* =================== GEODATA VIEWER (Integrated) =================== */
let geoMap = null; // Store the map instance globally

function buildGeoTooltip(keyword, lat, lng, rankText) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const latParam = Number.isFinite(latNum) ? latNum.toFixed(6) : String(lat ?? '');
    const lngParam = Number.isFinite(lngNum) ? lngNum.toFixed(6) : String(lng ?? '');
    const hasKeyword = typeof keyword === 'string' && keyword.trim().length > 0;
    const encodedKeyword = hasKeyword ? encodeURIComponent(keyword) : '';
    const mapsUrl = hasKeyword
        ? `https://www.google.com/maps/search/${encodedKeyword}/@${latParam},${lngParam},13z`
        : `https://www.google.com/maps/@${latParam},${lngParam},13z`;
    const lines = [];
    if (typeof rankText === 'string' && rankText.trim().length > 0) {
        lines.push(`Rank: ${rankText}`);
    }
    if (hasKeyword) lines.push(`Keyword: ${keyword}`);
    lines.push(`Lat: ${latParam}`);
    lines.push(`Lng: ${lngParam}`);
    lines.push(`Maps: ${mapsUrl}`);
    return lines.join('\n');
}

async function initMap(sessions, keyword) {
    if (!sessions || sessions.length === 0) {
        document.getElementById('geoMap').innerHTML = '<p style="text-align: center; color: #eee; padding-top: 50%;">No geo data to plot.</p>';
        return;
    }

    const centerLat = sessions.reduce((sum, s) => sum + parseFloat(s.origin_lat), 0) / sessions.length;
    const centerLng = sessions.reduce((sum, s) => sum + parseFloat(s.origin_lng), 0) / sessions.length;

    // Create the map if it doesn't exist
    if (!geoMap) {
        geoMap = new google.maps.Map(document.getElementById('geoMap'), {
            zoom: 12,
            center: { lat: centerLat, lng: centerLng },
            mapId: 'DEMO_MAP_ID', // You can use a specific map ID if you have one
        });
    } else {
        // If the map already exists, just re-center it
        geoMap.setCenter({ lat: centerLat, lng: centerLng });
        geoMap.setZoom(12);
    }

    // Clear existing markers
    if (geoMap.markers) {
        geoMap.markers.forEach(marker => marker.setMap(null));
    }
    geoMap.markers = [];
    
    // Plot markers for each session
    sessions.forEach(session => {
        const position = {
            lat: parseFloat(session.origin_lat),
            lng: parseFloat(session.origin_lng)
        };
        
        const sessionRank = Number(session.rank);
        let color = '#e74c3c'; // Red for low ranks
        let zIndex = 1;
        if (Number.isFinite(sessionRank) && sessionRank <= 3) {
            color = '#2ecc71'; // Green for top 3
            zIndex = 3;
        } else if (Number.isFinite(sessionRank) && sessionRank <= 10) {
            color = '#f1c40f'; // Yellow for 4-10
            zIndex = 2;
        }

        const rankLabel = Number.isFinite(sessionRank)
          ? (sessionRank > 20 ? '20+' : (sessionRank > 0 ? String(sessionRank) : '—'))
          : '—';

        const markerKeyword = keyword || session.keyword || '';
        const tooltip = buildGeoTooltip(markerKeyword, position.lat, position.lng, rankLabel);

        const marker = new google.maps.Marker({
            position: position,
            map: geoMap,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 20,
                fillColor: color,
                fillOpacity: 0.9,
                strokeWeight: 1,
                strokeColor: '#555'
            },
            label: {
                text: rankLabel,
                color: 'white',
                fontWeight: 'bold',
                fontSize: '12px'
            },
            title: tooltip,
            zIndex: zIndex
        });
        geoMap.markers.push(marker);
    });
}

// New function for geo-grid reports
function initGridMap(run, points) {
    if (!points || points.length === 0) {
        document.getElementById('geoMap').innerHTML = '<p style="text-align: center; color: #eee; padding-top: 50%;">No geo data to plot.</p>';
        return;
    }

    // Calculate center based on the report data
    const centerLat = points.reduce((sum, p) => sum + parseFloat(p.lat), 0) / points.length;
    const centerLng = points.reduce((sum, p) => sum + parseFloat(p.lng), 0) / points.length;

    // Create the map if it doesn't exist
    if (!geoMap) {
        geoMap = new google.maps.Map(document.getElementById('geoMap'), {
            zoom: 12,
            center: { lat: centerLat, lng: centerLng },
            mapId: 'DEMO_MAP_ID',
        });
    } else {
        // If the map already exists, just re-center it
        geoMap.setCenter({ lat: centerLat, lng: centerLng });
        geoMap.setZoom(12);
    }

    // Clear existing markers
    if (geoMap.markers) {
        geoMap.markers.forEach(marker => marker.setMap(null));
    }
    geoMap.markers = [];
    
    const runKeyword = (run && typeof run.keyword === 'string') ? run.keyword : '';

    // Plot markers for each point in the report
    points.forEach(point => {
        const position = {
            lat: parseFloat(point.lat),
            lng: parseFloat(point.lng)
        };
        
        const rankValue = Number(point.rank_pos);
        let color = '#e74c3c'; // Red for low ranks
        let zIndex = 1;
        if (rankValue <= 3) {
            color = '#2ecc71'; // Green for top 3
            zIndex = 3;
        } else if (rankValue <= 10) {
            color = '#f1c40f'; // Yellow for 4-10
            zIndex = 2;
        }

        const rankPos = Number.isFinite(rankValue)
            ? (rankValue > 20 ? '20+' : (rankValue > 0 ? String(rankValue) : '—'))
            : '—';

        const tooltip = buildGeoTooltip(runKeyword, position.lat, position.lng, rankPos);

        const marker = new google.maps.Marker({
            position: position,
            map: geoMap,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 20,
                fillColor: color,
                fillOpacity: 0.9,
                strokeWeight: 1,
                strokeColor: '#555'
            },
            label: {
                text: rankPos,
                color: 'white',
                fontWeight: 'bold',
                fontSize: '12px'
            },
            title: tooltip,
            zIndex: zIndex
        });
        geoMap.markers.push(marker);
    });
}

async function showGeoGrid(keyword, businessId) {
    document.getElementById('geoTitle').textContent = `Geo Grid for "${keyword}"`;
    document.getElementById('geoOverlay').style.display = 'flex';
    
    const url = `${ENDPOINT_GEO}?business_id=${businessId}&keyword=${encodeURIComponent(keyword)}`;

    try {
        const res = await fetch(url);
        const sessions = await res.json();

        if (sessions.length === 0) {
            document.getElementById('geoMap').innerHTML = `<p style="text-align: center; color: #eee; padding-top: 50%;">No geo data found for this keyword.</p>`;
            return;
        }

        // Load and initialize the map with the session data
        if (typeof google === 'object' && typeof google.maps === 'object') {
            initMap(sessions, keyword);
        } else {
            // If Google Maps API is not loaded yet, wait for it
            window.initMap = () => {
                initMap(sessions, keyword);
            };
        }
    } catch (error) {
        console.error('Failed to load geo grid data:', error);
        document.getElementById('geoMap').innerHTML = `<p style="text-align: center; color: #e74c3c; padding-top: 50%;">Failed to load data. Please try again.</p>`;
    }
}
// This function now just fetches and displays a specific run.
async function displayGeoGridReport(runId) {
    document.getElementById('geoMap').innerHTML = `<p style="text-align: center; color: #eee; padding-top: 50%;">Loading report #${runId}...</p>`;
    try {
        const reportUrl = `${ENDPOINT_GET_REPORT}?run_id=${runId}`;
        const reportRes = await fetch(reportUrl);
        const reportData = await reportRes.json();

        if (!reportRes.ok || reportData.error) {
            throw new Error(reportData.error || 'Failed to load report.');
        }

        document.getElementById('geoMap').innerHTML = ''; // Clear status message
        if (typeof google === 'object' && typeof google.maps === 'object') {
            initGridMap(reportData.run, reportData.points);
        } else {
            window.initMap = () => {
                initGridMap(reportData.run, reportData.points);
            };
        }
    } catch (error) {
        console.error('Failed to load geo grid report:', error);
        document.getElementById('geoMap').innerHTML = `<p style="text-align: center; color: #e74c3c; padding-top: 50%;">Failed to load report. ${error.message}</p>`;
    }
}
// New function to show or create geo-grid reports
async function showGeoGridReports(businessId, businessName, keyword) {
    const geoOverlay = document.getElementById('geoOverlay');
    document.getElementById('geoTitle').textContent = `Geo Grid Reports for "${keyword}"`;
    geoOverlay.style.display = 'flex';

    // Clear the map and set status in the list container
    document.getElementById('geoMap').innerHTML = '';
    const reportListContainer = document.getElementById('geoReportList');
    reportListContainer.innerHTML = `<p style="text-align: center; color: #eee; padding-top: 50%;">Fetching list of reports...</p>`;

    try {
        const listRes = await fetch(`${ENDPOINT_LIST_RUNS}?business_id=${businessId}&keyword=${encodeURIComponent(keyword)}`);
        const listData = await listRes.json();

        if (!listRes.ok || listData.error) {
            throw new Error(listData.error || 'Failed to fetch list of runs');
        }

        const runs = listData.runs;
        reportListContainer.innerHTML = '';

        if (runs.length === 0) {
            reportListContainer.innerHTML = `<p style="text-align: center; color: #eee;">No reports found. <button onclick="createNewRun(${businessId}, '${businessName.replace(/'/g, "\\'")}', '${keyword.replace(/'/g, "\\'")}'); return false;">Create New Report</button></p>`;
            return;
        }
reportListContainer.innerHTML = `<p style="text-align: center; color: #eee;"><button onclick="createNewRun(${businessId}, '${businessName.replace(/'/g, "\\'")}', '${keyword.replace(/'/g, "\\'")}'); return false;">Create New Report</button></p>`;
        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.padding = '0';
        ul.style.color = '#fff';
        runs.forEach(run => {
            const li = document.createElement('li');
            li.style.cursor = 'pointer';
            li.style.padding = '10px';
            li.style.borderBottom = '1px solid #444';
            li.textContent = `Report #${run.id} - ${run.status} - ${new Date(run.created_at).toLocaleString()}`;
            li.onclick = () => displayGeoGridReport(run.id);
            ul.appendChild(li);
        });
        reportListContainer.appendChild(ul);

    } catch (error) {
        console.error('Failed to get geo grid report list:', error);
        reportListContainer.innerHTML = `<p style="text-align: center; color: #e74c3c; padding-top: 50%;">Failed to load report list. ${error.message}</p>`;
    }
}

// Fetches and displays a specific geo-grid report by its runId
async function displayGeoGridReport(runId) {
    const mapContainer = document.getElementById('geoMap');
    mapContainer.innerHTML = `<p style="text-align: center; color: #eee; padding-top: 50%;">Loading report #${runId}...</p>`;
    try {
        const reportUrl = `${ENDPOINT_GET_REPORT}?run_id=${runId}`;
        const reportRes = await fetch(reportUrl);
        const reportData = await reportRes.json();

        if (!reportRes.ok || reportData.error) {
            throw new Error(reportData.error || 'Failed to load report.');
        }
        
        // This is where you would call your map initialization function for the new grid
        initGridMap(reportData.run, reportData.points);
        // mapContainer.innerHTML = `<p style="text-align: center; color: #eee; padding-top: 50%;">Report data loaded (map not implemented).</p>`;

    } catch (error) {
        console.error('Failed to load geo grid report:', error);
        mapContainer.innerHTML = `<p style="text-align: center; color: #e74c3c; padding-top: 50%;">Failed to load report. ${error.message}</p>`;
    }
}


async function startGeoGridRun(businessId, businessName, keyword, configOverride, originOverride) {
  const baseConfig = configOverride || buildGeoRunConfig(businessId);
  const origin = originOverride && Number.isFinite(originOverride?.lat) && Number.isFinite(originOverride?.lng)
    ? originOverride
    : null;
  const effectiveRadius = Number.isFinite(baseConfig.radius) ? baseConfig.radius : origin?.radius;
  const config = { ...baseConfig, radius: effectiveRadius };
  const radiusLabel = describeRadiusMiles(config.radius) || config.radius;
  const originLabel = origin?.zoneName || origin?.canonical || null;
  const originSummary = origin
    ? ` from ${originLabel || 'origin zone'} (${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)})`
    : '';
  const startingMessage = `Starting ${config.label} grid (${radiusLabel} mi) for “${keyword}”${originSummary}…`;
  bizReportsLastMessage = startingMessage;
  bizReportsLastIsError = false;
  reflectGeoRunStatus(startingMessage, false);

  try {
    const payload = {
      business_id: businessId,
      keyword,
      grid_rows: config.rows,
      grid_cols: config.cols,
      radius_miles: config.radius
    };
    if (origin) {
      payload.origin_lat = origin.lat;
      payload.origin_lng = origin.lng;
      if (originLabel) {
        payload.origin_zone = originLabel;
      }
    }

    const createRes = await fetch(ENDPOINT_CREATE_RUN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const createData = await createRes.json();
    if (!createRes.ok || createData.error) {
      throw new Error(createData.error || 'Failed to create run');
    }

    const runId = createData.run_id;
    bizReportsLastMessage = `Run #${runId} created (${config.label}, ${radiusLabel} mi). Monitoring progress…`;
    reflectGeoRunStatus(bizReportsLastMessage, false);

    await pollGeoGridRun(businessId, businessName, keyword, runId, config);
  } catch (error) {
    console.error('Failed to start new geo grid run:', error);
    bizReportsLastMessage = error.message || 'Failed to create run.';
    bizReportsLastIsError = true;
    reflectGeoRunStatus(bizReportsLastMessage, true);
  }
}

async function pollGeoGridRun(businessId, businessName, keyword, runId, config){
  const pollIntervalMs = 5000;
  const maxAttempts = 60; // ~5 minutes
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const reportUrl = `${ENDPOINT_GET_REPORT}?run_id=${runId}`;
      const reportRes = await fetch(reportUrl);
      const runData = await reportRes.json();
      if (!reportRes.ok || runData?.error) {
        throw new Error(runData?.error || 'Error fetching report.');
      }

      const status = runData.run?.status;
      if (status === 'done') {
        const cfgText = config ? ` (${config.label}, ${config.radius} mi)` : '';
        bizReportsLastMessage = `Run #${runId} completed${cfgText}.`;
        bizReportsLastIsError = false;
        reflectGeoRunStatus(bizReportsLastMessage, false);
        currentBizReportSelection = { businessId, runId };
        renderBizReports(businessId);
        loadBizReport(runId, keyword);
        return;
      }
      if (status === 'error') {
        const cfgText = config ? ` (${config.label}, ${config.radius} mi)` : '';
        bizReportsLastMessage = `Run #${runId} encountered an error${cfgText}.`;
        bizReportsLastIsError = true;
        reflectGeoRunStatus(bizReportsLastMessage, true);
        renderBizReports(businessId);
        return;
      }

      reflectGeoRunStatus(`Run #${runId} is ${status || 'in progress'}…`, false);
    } catch (error) {
      console.error('Geo grid run polling failed:', error);
      bizReportsLastMessage = error.message || 'Error while polling run status.';
      bizReportsLastIsError = true;
      reflectGeoRunStatus(bizReportsLastMessage, true);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  const cfgText = config ? ` (${config.label}, ${config.radius} mi)` : '';
  bizReportsLastMessage = `Run #${runId} is taking longer than expected${cfgText}.`;
  bizReportsLastIsError = true;
  reflectGeoRunStatus(bizReportsLastMessage, true);
}

// Legacy alias used by older overlay markup
async function createNewRun(businessId, businessName, keyword){
  const numericBusinessId = Number(businessId);
  const config = buildGeoRunConfig(numericBusinessId);
  try {
    const originInfo = await resolveKeywordOriginZone(numericBusinessId, keyword, config.radius);
    if (!originInfo) {
      alert('No origin zone is configured for this keyword yet.');
      return;
    }
    await startGeoGridRun(numericBusinessId, businessName, keyword, config, originInfo);
  } catch (error) {
    console.error('Failed to create new geo grid run:', error);
    alert(error?.message || 'Failed to resolve origin zone for this keyword.');
  }
}

// Function to close the geo overlay
function closeGeoOverlay() {
  const geoOverlay = document.getElementById('geoOverlay');
  const mapContainer = document.getElementById('geoMapContainer');
  const reportListContainer = document.getElementById('reportListContainer');

  // Explicitly destroy the map instance to prevent freezing
  if (geoMap) {
    if (window.overlays) {
      window.overlays.forEach(overlay => overlay.setMap(null));
      window.overlays = [];
    }
    geoMap = null;
  }

  // Clear the contents of the containers to prevent bugs with stale data.
  if (mapContainer) {
      mapContainer.innerHTML = "";
  }
  if (reportListContainer) {
      reportListContainer.innerHTML = "";
  }

  // Hide the overlay
  geoOverlay.style.display = "none";

}

/* =================== INITIALIZATION =================== */
document.addEventListener('DOMContentLoaded', () => {
  setupGlobalGeoRunControls();
  loadDaily();
  const bizSearch = document.getElementById('bizSearch');
  if (bizSearch) {
    bizSearch.addEventListener('search', function(){ filterBusinesses(this.value); });
    bizSearch.addEventListener('input', function(){ filterBusinesses(this.value); });
  }
  updateBizMapPeriodControls();
});

function refreshAll(){
  loadDaily();
  if(document.getElementById('logsOverlay').style.display==='flex') loadLogs();
  const geoRunsOverlay = document.getElementById('geoRunsOverlay');
  geoRunsLoaded = false;
  if (geoRunsOverlay && geoRunsOverlay.style.display === 'flex') {
    loadGeoRuns();
  }
}

// expose period controls for inline handlers
window.changeBizMapOffset = changeBizMapOffset;
// backwards compatibility with older templates
window.changeBizMapPeriod = (period) => {
  const target = period === 'previous' || period === 'prior' ? 1 : 0;
  changeBizMapOffset(target - bizMapWeekOffset);
};
window.showDailyKeywordBreakdown = showDailyKeywordBreakdown;
window.closeDailyKeywordOverlay = closeDailyKeywordOverlay;
