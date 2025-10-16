<?php
/* Template Name: LiveDrive Log Viewer */
get_header();
$template_uri = get_stylesheet_directory_uri(). '/mongooz';
$template_path = get_stylesheet_directory() . '/mongooz';

$styleversion = filemtime($template_path . '/styles.css');
$scriptsversion = filemtime($template_path . '/scripts.js');

?>
<link rel="stylesheet" href="<?php echo $template_uri; ?>/styles.css?v=<?php echo $styleversion; ?>">

<div class="wrap">
  <h2>📈 MONGOOZ</h2>

  <div class="toolbar stack-10">
    <button onclick="openLogsOverlay('today')">🔥 Today’s Logs</button>
    <button onclick="openLogsOverlay('all')">🗂️ All Logs</button>

    <button onclick="showTodaySchedule()">📅 View Today’s Schedule</button>
    <button onclick="toggleBizSummary()">📊 Business Summary</button>
    <button onclick="openGeoRunsOverlay()">🌐 Geo Runs</button>

    <div class="geo-run-launcher" id="globalGeoControls" aria-label="Start a geo grid run">
      <select id="globalGeoGridSelect" aria-label="Geo grid size"></select>
      <select id="globalGeoRadiusSelect" aria-label="Geo grid radius"></select>
      <select id="globalGeoBusinessSelect" aria-label="Business"></select>
      <select id="globalGeoKeywordSelect" aria-label="Keyword"></select>
      <button type="button" id="globalGeoRunButton" disabled>🚀 Start Geo Run</button>
      <div id="globalGeoRunStatus" class="geo-run-status muted is-hidden"></div>
    </div>

    <button onclick="refreshAll()">🔄 Refresh</button>
  </div>

  <!-- Business-first directory -->
  <table id="bizTable" style="margin-top:16px;">
    <thead>
      <tr>
        <th colspan="5">    <input id="bizSearch" class="search" type="search" placeholder="Filter businesses…"
           oninput="filterBusinesses(this.value)">
</th>
</tr>
      <tr>
        <th style="width:28%;">Business</th>
        <th title="Sum of successful sessions over window">Successful Sessions (7d)</th>
        <th>Avg Rank (ARP, 7d)</th>
        <th title="▲ = Rank improved (lower number), ▼ = Rank worsened (higher number)">Trend (vs. prev 7d)</th>
        <th>SoLV Top‑3 % (7d)</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
  
  <!-- Business details inline view -->
  <div id="bizOverlay" class="biz-inline hidden">
    <div class="box">
      <button type="button" class="back" onclick="closeBizOverlay()">⬅ Back to business list</button>
      <h3 id="bizTitle" style="margin:12px 0 0 0;">Business</h3>

    <div class="biz-detail-grid stack-16">
      <section class="biz-pane biz-pane--keywords" aria-labelledby="bizKeywordsHeading">
        <h4 id="bizKeywordsHeading" style="margin:6px 0;">Keywords (today)</h4>
        <div class="keyword-scope-controls" id="bizKeywordScopeControls" role="group" aria-label="Keyword scope">
          <button type="button" class="keyword-scope-button" data-scope="today" onclick="setBizKeywordScope('today')">Today</button>
          <button type="button" class="keyword-scope-button" data-scope="all" onclick="setBizKeywordScope('all')">All time</button>
        </div>
        <div id="bizKeywords" class="stack-6"></div>
        <div class="muted" style="margin-top:6px;">
          Tip: ARP axis is reversed (lower is better).
        </div>
      </section>

      <section id="bizKeywordDetail" class="biz-pane biz-keyword-detail hidden" aria-live="polite">
        <h4 id="bizKeywordTitle" style="margin:0 0 8px 0;">Keyword detail</h4>
        <div class="biz-keyword-visuals">
            <div class="biz-keyword-chart">
            <div class="chart-wrap">
              <canvas id="bizKwChart" height="260"></canvas>
            </div>
            <div class="biz-keyword-map">
              <div class="map-period-controls" id="bizKwMapPeriodControls">
                <button type="button" id="bizKwMapPrev" onclick="changeBizMapOffset(1)">◀ Earlier 7d</button>
                <span id="bizKwMapPeriodLabel">Current 7 days</span>
                <button type="button" id="bizKwMapNext" onclick="changeBizMapOffset(-1)" disabled>Later 7d ▶</button>
              </div>
              <div id="bizKwMapStatus" class="muted">Select a keyword to view the latest grid.</div>
              <div id="bizKwMap"></div>
            </div>            
            <table id="bizKwTrendTable" class="mini-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Successful Sessions</th>
                  <th>Avg Rank (ARP)</th>
                  <th>SoLV Top-3 %</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
            <div id="bizKwNotes" class="muted" style="margin-top:8px;"></div>
          </div>

        </div>
      </section>

      <section class="biz-pane biz-pane--reports" aria-labelledby="bizReportsHeading">
        <h4 id="bizReportsHeading" style="margin:6px 0;">Geo Grid Reports</h4>
        <div id="bizReports" class="stack-6">
          <div class="muted">Loading reports…</div>
        </div>
      </section>

      <section class="biz-pane biz-pane--daily" aria-labelledby="bizDailyHeading">
        <h4 id="bizDailyHeading" style="margin:6px 0;">Daily performance (last 7 days)</h4>
        <table id="bizDailyTable">
          <thead>
            <tr>
              <th>Date</th>
              <th>Successful Sessions</th>
              <th>Avg Rank (ARP)</th>
              <th title="▲ = Rank improved (lower number), ▼ = Rank worsened (higher number)">Trend</th>
              <th>SoLV Top‑3 %</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </section>
    </div>
  </div>
</div>


</div>

<!-- Logs overlay (moved log table here) -->
<div id="logsOverlay" class="overlay" onclick="closeLogsOverlay()">
  <div class="box" onclick="event.stopPropagation();">
    <span class="close" onclick="closeLogsOverlay()">❌</span>
    <h3 style="margin-top:0;">Session Logs</h3>

    <div class="toolbar stack-10" style="margin:6px 0 12px 0;">
      <label style="font-size:14px;">
        <input type="checkbox" id="logsSuccessToggle" onchange="applySuccessFilter()"> Show successes only
      </label>
      <button onclick="sortByBusiness()" title="Sort by business">Sort by Business</button>
      <span class="muted" id="logsScopeLabel"></span>
    </div>

    <div style="width:100%; overflow-x:auto;">
      <table id="logTable" style="width:100%;">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Status</th>
            <th>Events</th>
            <th>Keyword</th>
            <th>Rank</th>
            <th onclick="sortByBusiness()" style="cursor:pointer;">Business 🔽</th>
            <th>Origin Zone</th>
            <th>Device</th>
            <th>CTR IP</th>
            <th>Drive IP</th>
            <th>Route</th>
            <th>Steps</th>
            <th>Duration (min)</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
</div>

<!-- Existing overlays you already had (kept, with unified classes) -->
<div id="eventsOverlay" class="overlay" onclick="closeEvents()">
  <div class="box" onclick="event.stopPropagation();">
    <span class="close" onclick="closeEvents()">❌</span>
    <h3>Run Events</h3>
    <pre id="eventsContent" style="font-family:monospace;font-size:.85em;"></pre>
  </div>
</div>

<div id="scheduleOverlay" class="overlay" onclick="closeSchedule()">
  <div class="box" onclick="event.stopPropagation();">
    <span class="close" onclick="closeSchedule()">❌</span>
    <h3>Today's Scheduled Drives</h3>
    <table style="width:100%;">
      <thead>
        <tr><th>Run&nbsp;Time</th><th>Company</th><th>#</th><th>Config</th></tr>
      </thead>
      <tbody id="scheduleBody"></tbody>
    </table>
  </div>
</div>

<div id="bizSummaryWrap" class="overlay" onclick="closeBizSummary()">
  <div class="box" onclick="event.stopPropagation();">
    <span class="close" onclick="closeBizSummary()">❌</span>
    <h3 style="margin-top:0;">Business Summary by Day</h3>
    <table id="bizSummaryTable" style="width:100%;">
      <thead>
        <tr>
          <th>Date</th>
          <th>Business</th>
          <th style="text-align:right;">Successes</th>
          <th style="text-align:right;">Failures</th>
          <th style="text-align:right;">Total Runs</th>
          <th style="text-align:right;">Unique Keywords</th>
          <th style="text-align:right;">Success Rate</th>
        </tr>
</thead>
      <tbody></tbody>
    </table>
  </div>
</div>

<!-- Keyword trend overlay (as you had) -->
<div id="keywordOverlay" class="overlay">
  <div class="box">
    <span class="close" onclick="closeKeywordOverlay()">×</span>
    <h3 id="kwTitle" style="margin-top:0;"></h3>
    <div style="height: 400px; margin:6px 0 12px 0;">
      <canvas id="kwChart"></canvas>
    </div>
    <table id="kwTrendTable" border="1" cellspacing="0" cellpadding="6" style="width:100%;">
      <thead>
        <tr>
          <th>Date</th>
          <th>Successful Sessions</th>
          <th>Avg Rank (ARP)</th>
          <th>SoLV Top-3 %</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
    <div id="kwNotes" style="margin-top:8px;color:#666;font-size:.9em;"></div>
  </div>
</div>

<div id="dailyKeywordOverlay" class="overlay" onclick="closeDailyKeywordOverlay()">
  <div class="box" onclick="event.stopPropagation();">
    <span class="close" onclick="closeDailyKeywordOverlay()">❌</span>
    <h3 id="dailyKeywordTitle" style="margin-top:0;">Successful Sessions</h3>
    <div id="dailyKeywordSummary" class="muted" style="margin-bottom:8px;"></div>
    <table id="dailyKeywordTable" class="mini-table" style="width:100%;">
      <thead>
        <tr>
          <th>Keyword</th>
          <th style="text-align:right;">Successful Sessions</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="2" class="muted">Loading…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<!-- New Geo Grid Overlay (Integrated) -->
<div id="geoOverlay" class="overlay">
  <div class="box" style="background: #333; color: #eee; width: min(1100px, 96vw); max-height: 90vh;">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px;">
      <h2 style="margin:0; font-size:20px;" id="geoTitle">Geo Grid</h2>
      <span class="close" onclick="closeGeoOverlay()">❌</span>
    </div>
    <div id="geoReportList" style="flex-grow: 1; border-radius: 8px; position: relative; padding: 20px;"></div>
    <div id="geoMap" style="height: 500px; width: 100%; margin-top: 20px;"></div>
    
  </div>
</div>

<div id="geoRunsOverlay" class="overlay" onclick="closeGeoRunsOverlay()">
  <div class="box" onclick="event.stopPropagation();">
    <span class="close" onclick="closeGeoRunsOverlay()">❌</span>
    <h3 style="margin-top:0;">Geo Grid Runs</h3>
    <div class="toolbar stack-10" style="margin:0 0 12px 0;">
      <button type="button" onclick="refreshGeoRuns()">Refresh</button>
      <span class="muted" id="geoRunsStatus"></span>
    </div>
    <div style="width:100%; overflow-x:auto;">
      <table id="geoRunsTable">
        <thead>
          <tr>
            <th>Date</th>
            <th>Business</th>
            <th>Keyword</th>
            <th>Scan</th>
            <th>ARP</th>
            <th>SoLV</th>
          </tr>
        </thead>
        <tbody id="geoRunsBody">
          <tr><td colspan="6" class="muted">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Chart.js for charts -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
  /* =================== CONFIG / CONSTANTS =================== */
const LOGS_BASE_URL = '<?php echo site_url("/live-drive-logs/screenshots/"); ?>/';
// Request 14 days of data to compare last 7 vs previous 7
const ENDPOINT_DAILY = '<?php echo site_url("/wp-json/livedrive/daily?days=7"); ?>';
const ENDPOINT_LOGS  = '<?php echo site_url("/wp-json/livedrive/logs"); ?>';
const ENDPOINT_SCH   = '<?php echo site_url("/wp-json/livedrive/schedule"); ?>';
const ENDPOINT_KTREND= '<?php echo site_url("/wp-json/livedrive/keyword-trend"); ?>';
const ENDPOINT_GEO= '<?php echo site_url("/wp-json/livedrive/geo-snapshots"); ?>';
const ENDPOINT_CREATE_RUN= '<?php echo site_url("/wp-json/livedrive/geo-grid/run"); ?>';
const ENDPOINT_LIST_RUNS  = '<?php echo site_url("/wp-json/livedrive/geo-grid/runs"); ?>';
const ENDPOINT_GET_REPORT= '<?php echo site_url("/wp-json/livedrive/geo-grid/report"); ?>';
const ENDPOINT_ORIGIN_ZONE= '<?php echo site_url("/wp-json/livedrive/geo-grid/origin"); ?>';

const WINDOW_DAYS = 7;
</script>
<script src="<?php echo $template_uri; ?>/scripts.js?v=<?php echo $scriptsversion; ?>"></script>
<script>
  (function () {
    const bizOverlay = document.getElementById('bizOverlay');
    const bizTable = document.getElementById('bizTable');
    if (!bizOverlay || !bizTable) {
      return;
    }

    const originalOpen = window.openBizOverlay;
    const originalClose = window.closeBizOverlay;

    window.openBizOverlay = function (...args) {
      if (typeof originalOpen === 'function') {
        originalOpen.apply(this, args);
      }
      bizTable.classList.add('hidden');
      bizOverlay.classList.remove('hidden');
      bizOverlay.classList.add('active');
    };

    window.closeBizOverlay = function (...args) {
      if (typeof originalClose === 'function') {
        originalClose.apply(this, args);
      }
      bizOverlay.classList.remove('active');
      bizOverlay.classList.add('hidden');
      bizTable.classList.remove('hidden');
    };
  })();
</script>

<!-- IMPORTANT: Replace YOUR_API_KEY with your actual Google Maps API key -->
<script loading="async" defer src="https://maps.googleapis.com/maps/api/js?key=AIzaSyAo3iWM8Z_nk7XgCzSGKA2tRh2Ezu3TpzU&callback=initMap"></script>
<?php get_footer(); ?>
