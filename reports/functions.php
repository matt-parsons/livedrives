<?php
/**
 * Theme functions and definitions
 *
 * @package HelloElementorChild
 */

/**
 * Load child theme css and optional scripts
 *
 * @return void
 */
function hello_elementor_child_enqueue_scripts() {
	wp_enqueue_style(
		'hello-elementor-child-style',
		get_stylesheet_directory_uri() . '/style.css',
		[
			'hello-elementor-theme-style',
		],
		'1.0.0'
	);
  wp_enqueue_script(
    'chartjs-cdn',
    'https://cdn.jsdelivr.net/npm/chart.js@4',
    [],
    null,
    true
  );
}
add_action( 'wp_enqueue_scripts', 'hello_elementor_child_enqueue_scripts', 20 );

add_filter('hello_elementor_page_title', '__return_false' );

function extra_css_js_cdn(){}

add_action('wp_enqueue_scripts', 'extra_css_js_cdn');

// live drive  logs from jsonl
// add_action('rest_api_init', function () {
//   register_rest_route('livedrive', '/logs', [
//     'methods' => 'GET',
//     'callback' => function () {
//       $path = '/opt/livedrive/logs/run-log.jsonl';
//       $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
//       if (!$lines) return new WP_Error('log_error', 'Could not read logs', ['status' => 500]);
//       $logs = array_reverse(array_map('json_decode', $lines));
//       return $logs;
//     },
//     'permission_callback' => '__return_true'
//   ]);
// });

function enqueue_custom_uule_script() {
  wp_enqueue_script(
    'uule-generator',
    get_stylesheet_directory_uri() . '/js/create-uule/main.js',
    array(), // Dependencies (e.g., ['jquery'] if needed)
    0.1,    // Version
    true     // Load in footer
  );
}
add_action('wp_enqueue_scripts', 'enqueue_custom_uule_script');

/* ------- helpers (unchanged behavior, PDO under the hood) ------- */

function ld_db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
      // Load .env for DB creds
      $env_path = '/opt/livedrive/.env';
      $env = [];
      foreach (file($env_path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if ($line === '' || $line[0] === '#') continue;
        [$k,$v] = array_pad(explode('=', $line, 2), 2, '');
        $env[trim($k)] = trim($v);
      }

      $host = $env['DB_HOST'] ?? '127.0.0.1';
      $db   = $env['DB_NAME'] ?? '';
      $user = $env['DB_USER'] ?? '';
      $pass = $env['DB_PASSWORD'] ?? '';
      $port = $env['DB_PORT'] ?? '3306';

    try {
        $dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4";
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        return $pdo;
    } catch (PDOException $e) {
        // Log the error and fail gracefully
        error_log("Database Connection Failed: " . $e->getMessage());
        return new PDO("sqlite::memory:"); // Return a non-functional PDO to avoid further errors
    }
}

/* === LiveDrive schedule feed ===================================== */
add_action('rest_api_init', function () {
  register_rest_route('livedrive', '/schedule', [
    'methods'  => 'GET',
    'callback' => function () {
      $file = '/opt/livedrive/logs/schedule-log.jsonl';   // adjust if needed
      if (!file_exists($file)) return [];
      $out = [];
      foreach (file($file, FILE_IGNORE_NEW_LINES) as $line) {
        $row = json_decode($line, true);
        if ($row) $out[] = $row;
      }
      return $out;            // WP converts to JSON automatically
    },
    'permission_callback' => '__return_true'
  ]);
});

// functions.php (theme) or a tiny MU-plugin
add_action('rest_api_init', function () {
  register_rest_route('livedrive', '/logs', [
    'methods'  => 'GET',
    'callback' => function () {
      // Load .env for DB creds
      $env_path = '/opt/livedrive/.env';
      $env = [];
      foreach (file($env_path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if ($line === '' || $line[0] === '#') continue;
        [$k,$v] = array_pad(explode('=', $line, 2), 2, '');
        $env[trim($k)] = trim($v);
      }

      $host = $env['DB_HOST'] ?? '127.0.0.1';
      $db   = $env['DB_NAME'] ?? '';
      $user = $env['DB_USER'] ?? '';
      $pass = $env['DB_PASSWORD'] ?? '';
      $port = $env['DB_PORT'] ?? '3306';

      try {
        $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass, [
          PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
          PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
      } catch (Throwable $e) {
        return new WP_Error('db_connect', 'Could not connect: '.$e->getMessage(), ['status' => 500]);
      }

      // ⚡ Fetch *all* rows (ordered newest first)
      $sql = "
        SELECT
          rl.id,
          rl.run_id,
          rl.timestamp_utc,
          rl.session_id,
          r.business_id,
          rl.keyword,
          rl.business_name,
          rl.reason,
          rl.ctr_ip_address,
          rl.drive_ip_address,
          rl.origin,
          rl.location_label,
          rl.device,
          rl.steps_json,
          rl.duration_min,
          rl.events_json,
          rl.created_at,
          rl.rank
        FROM run_logs rl
        LEFT JOIN runs r ON r.id = rl.run_id
        ORDER BY COALESCE(rl.timestamp_utc, rl.created_at) DESC, rl.id DESC
      ";
      $rows = $pdo->query($sql)->fetchAll();

      // Decode JSON fields
      foreach ($rows as &$r) {
        $r['business_id'] = $r['business_id'] !== null ? (int)$r['business_id'] : null;
        $r['steps']  = $r['steps_json']  ? json_decode($r['steps_json'], true) : null;
        $r['events'] = $r['events_json'] ? json_decode($r['events_json'], true) : null;
        unset($r['steps_json'], $r['events_json']);
      }

      return $rows; // return plain array
    },
    'permission_callback' => '__return_true'
  ]);
});

add_action('rest_api_init', function () {
  register_rest_route('livedrive', '/daily', [
    'methods'  => 'GET',
    'callback' => function (WP_REST_Request $req) {
      // --- DB creds (.env supports DB_* or MYSQL_*) ---
      $env = [];
      foreach (@file('/opt/livedrive/.env', FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line); if ($line==='' || $line[0]==='#') continue;
        [$k,$v] = array_pad(explode('=', $line, 2), 2, '');
        $env[trim($k)] = trim($v);
      }
      $host = $env['DB_HOST']??$env['MYSQL_HOST']??'127.0.0.1';
      $db   = $env['DB_NAME']??$env['MYSQL_DATABASE']??'';
      $user = $env['DB_USER']??$env['MYSQL_USER']??'';
      $pass = $env['DB_PASSWORD']??$env['MYSQL_PASSWORD']??'';
      $port = $env['DB_PORT']??$env['MYSQL_PORT']??'3306';

      try {
        $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4",$user,$pass,[
          PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
          PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
        ]);
      } catch (Throwable $e) {
        return new WP_Error('db_connect','DB connect failed: '.$e->getMessage(),['status'=>500]);
      }

      // --- Filters ---
      $since = trim((string)$req->get_param('since')); // YYYY-MM-DD
      $until = trim((string)$req->get_param('until'));

      // Phoenix local day from UTC timestamp (handles ISO or MySQL DATETIME)
      $tsUtc = "
        CASE
          WHEN rl.timestamp_utc LIKE '%T%' THEN
            STR_TO_DATE(REPLACE(REPLACE(rl.timestamp_utc,'T',' '),'Z',''), '%Y-%m-%d %H:%i:%s.%f')
          ELSE rl.timestamp_utc
        END
      ";
      $dayPhx = "DATE(CONVERT_TZ(COALESCE($tsUtc, rl.created_at), '+00:00', '-07:00'))";

      $where  = ['1=1', 'r.business_id IS NOT NULL'];
      $params = [];
      if ($since !== '') { $where[] = "$dayPhx >= ?"; $params[] = $since; }
      if ($until !== '') { $where[] = "$dayPhx <= ?"; $params[] = $until; }
      $whereSql = 'WHERE '.implode(' AND ', $where);

      // --- Main per-business daily metrics ---
      $sql = "
        SELECT
          $dayPhx                                   AS day,
          r.business_id                             AS business_id,
          MAX(rl.business_name)                     AS business_name,
          SUM(rl.reason='success')                  AS sessions,
          SUM(rl.reason='success')                  AS success_count,
          COUNT(*)                                  AS total_runs,
          ROUND(100 * SUM(rl.reason='success')/NULLIF(COUNT(*),0), 1) AS success_rate,
          AVG(NULLIF(rl.rank,0))                    AS avg_rank,       -- ARP over known ranks
          SUM(rl.rank IS NOT NULL)                  AS ranked_count,
          SUM(rl.rank IS NOT NULL AND rl.rank <= 3) AS top3_count,
          ROUND(100 * SUM(rl.rank IS NOT NULL AND rl.rank <= 3) /
                NULLIF(SUM(rl.rank IS NOT NULL),0), 1) AS solv_top3,   -- SoLV top-3%
          AVG(rl.duration_min)                      AS avg_duration_min
        FROM run_logs rl
        LEFT JOIN runs r ON r.id = rl.run_id
        $whereSql
        GROUP BY day, business_id
        ORDER BY day DESC, business_name ASC
      ";
      $stmt = $pdo->prepare($sql);
      $stmt->execute($params);
      $rows = $stmt->fetchAll();

      // --- Top keywords per day+business (trim to top 5) ---
      $sqlKw = "
        SELECT $dayPhx AS day, r.business_id AS business_id, rl.keyword,
               SUM(rl.reason='success') AS c
        FROM run_logs rl
        LEFT JOIN runs r ON r.id = rl.run_id
        $whereSql
        GROUP BY day, business_id, rl.keyword
        HAVING SUM(rl.reason='success') > 0
      ";
      $stmt = $pdo->prepare($sqlKw);
      $stmt->execute($params);
      $kwByKeyFull = [];
      foreach ($stmt->fetchAll() as $r) {
        $bizId = $r['business_id'] !== null ? (int)$r['business_id'] : null;
        if ($bizId === null) continue;
        $k = $r['day'].'|'.$bizId;
        $kwByKeyFull[$k][] = ['keyword'=>$r['keyword'], 'count'=>(int)$r['c']];
      }
      $kwTopByKey = [];
      foreach ($kwByKeyFull as $key => $arr) {
        usort($arr, fn($a,$b)=>$b['count']<=>$a['count']);
        $kwByKeyFull[$key] = $arr;
        $kwTopByKey[$key] = array_slice($arr, 0, 5);
      }

      // Attach keywords
      foreach ($rows as &$r) {
        $r['business_id'] = $r['business_id'] !== null ? (int)$r['business_id'] : null;
        if ($r['business_id'] === null) continue;
        $idx = $r['day'].'|'.$r['business_id'];
        $r['keyword_breakdown'] = $kwByKeyFull[$idx] ?? [];
        $r['top_keywords'] = $kwTopByKey[$idx] ?? array_slice($r['keyword_breakdown'], 0, 5);
      }

      return $rows;
    },
    'permission_callback' => '__return_true'
  ]);
});

add_action('rest_api_init', function () {
register_rest_route('livedrive', '/keyword-trend', [
    'methods'  => 'GET',
    'callback' => function (WP_REST_Request $req) {
      $bid   = (int)$req->get_param('business_id');
      $kw    = trim((string)$req->get_param('keyword'));
      $days  = max(1, (int)($req->get_param('days') ?: 30));
      $top_n = max(1, (int)($req->get_param('top_n') ?: 3));

      if (!$bid || $kw==='') {
        return new WP_Error('bad_request','business_id and keyword required',['status'=>400]);
      }

      // --- DB creds (DB_* or MYSQL_*) ---
      $env=[]; foreach (@file('/opt/livedrive/.env', FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line); if ($line==='' || $line[0]==='#') continue;
        [$k,$v]=array_pad(explode('=', $line, 2), 2, ''); $env[trim($k)] = trim($v);
      }
      $host=$env['DB_HOST']??$env['MYSQL_HOST']??'127.0.0.1';
      $db  =$env['DB_NAME']??$env['MYSQL_DATABASE']??''; $user=$env['DB_USER']??$env['MYSQL_USER']??'';
      $pass=$env['DB_PASSWORD']??$env['MYSQL_PASSWORD']??''; $port=$env['DB_PORT']??$env['MYSQL_PORT']??'3306';

      try {
        $pdo=new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4",$user,$pass,[
          PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
        ]);
      } catch (Throwable $e) { return new WP_Error('db_connect','DB connect failed: '.$e->getMessage(),['status'=>500]); }

      // Phoenix local day computed from query timestamps (snapshots inherit query time)
      $tsUtc = "
        CASE
          WHEN rq.timestamp_utc LIKE '%T%' THEN STR_TO_DATE(REPLACE(REPLACE(rq.timestamp_utc,'T',' '),'Z',''), '%Y-%m-%d %H:%i:%s.%f')
          ELSE rq.timestamp_utc
        END
      ";
      $dayPhx = "DATE(CONVERT_TZ($tsUtc, '+00:00', '-07:00'))";

      // -------- Our business series from snapshots --------
      // Removed redundant JOIN to 'runs' table as filtering is done on 'ranking_queries'.
      $stmt = $pdo->prepare("
        SELECT
          $dayPhx AS day,
          COUNT(*) AS snapshots,
          AVG(NULLIF(rs.matched_position,0)) AS avg_rank,
          ROUND(100 * SUM(rs.matched_position IS NOT NULL AND rs.matched_position <= 3) / COUNT(*), 1) AS solv_top3
        FROM ranking_snapshots rs
          JOIN ranking_queries rq ON rq.run_id = rs.run_id
        WHERE rq.business_id = ? AND rq.keyword = ?
          AND $tsUtc >= (UTC_TIMESTAMP() - INTERVAL ? DAY)
        GROUP BY day
        ORDER BY day ASC
      ");
      $stmt->execute([$bid, $kw, $days+1]);
      $series = $stmt->fetchAll();

      $seriesMap = [];
      foreach ($series as $row) {
        $seriesMap[$row['day']] = $row;
      }

      // -------- Fallback using run_logs when snapshots are missing --------
      $tsLog = "
        CASE
          WHEN rl.timestamp_utc LIKE '%T%' THEN STR_TO_DATE(REPLACE(REPLACE(rl.timestamp_utc,'T',' '),'Z',''), '%Y-%m-%d %H:%i:%s.%f')
          ELSE rl.timestamp_utc
        END
      ";
      $dayLog = "DATE(CONVERT_TZ(COALESCE($tsLog, rl.created_at), '+00:00', '-07:00'))";

      $stmt = $pdo->prepare("
        SELECT
          $dayLog AS day,
          AVG(NULLIF(rl.rank,0)) AS avg_rank,
          ROUND(100 * SUM(rl.rank IS NOT NULL AND rl.rank <= 3) / NULLIF(SUM(rl.rank IS NOT NULL),0), 1) AS solv_top3
        FROM run_logs rl
        JOIN runs r ON r.id = rl.run_id
        WHERE r.business_id = ? AND rl.keyword = ?
          AND COALESCE($tsLog, rl.created_at) >= (UTC_TIMESTAMP() - INTERVAL ? DAY)
        GROUP BY day
        ORDER BY day ASC
      ");
      $stmt->execute([$bid, $kw, $days+1]);
      foreach ($stmt->fetchAll() as $row) {
        $day = $row['day'];
        if (!isset($seriesMap[$day])) {
          $seriesMap[$day] = [
            'day'        => $day,
            'snapshots'  => 0,
            'avg_rank'   => $row['avg_rank'],
            'solv_top3'  => $row['solv_top3'],
          ];
          continue;
        }

        if ($seriesMap[$day]['avg_rank'] === null && $row['avg_rank'] !== null) {
          $seriesMap[$day]['avg_rank'] = $row['avg_rank'];
        }
        if ($seriesMap[$day]['solv_top3'] === null && $row['solv_top3'] !== null) {
          $seriesMap[$day]['solv_top3'] = $row['solv_top3'];
        }
      }

      ksort($seriesMap);
      $series = array_values($seriesMap);

      // -------- Competitor aggregation (pick top_N, then build per-day series) --------
      // 1) Aggregate across the lookback to choose competitors
      // Removed redundant JOIN to 'runs' table as filtering is done on 'ranking_queries'.
      $stmt = $pdo->prepare("
        SELECT rs.results_json,
               $dayPhx AS day
        FROM ranking_snapshots rs
        JOIN ranking_queries rq ON rq.run_id = rs.run_id
        WHERE rq.business_id = ? AND rq.keyword = ?
          AND $tsUtc >= (UTC_TIMESTAMP() - INTERVAL ? DAY)
        ORDER BY rq.timestamp_utc ASC
      ");
      $stmt->execute([$bid, $kw, $days+1]);

      $agg = []; // place_id => {name, appearances, top3_hits, sum_pos}
      $perDayRaw = []; // day => [{place_id, pos}]

      while ($row = $stmt->fetch()) {
        $day = $row['day'];
        $arr = json_decode($row['results_json'] ?? '[]', true);
        if (!is_array($arr)) continue;
        foreach ($arr as $it) {
          if (!empty($it['is_match'])) continue; // skip our own business
          $pid  = $it['place_id'] ?? null;
          $name = $it['name'] ?? '(unknown)';
          $pos  = isset($it['position']) ? (int)$it['position'] : null;
          if (!$pid || !$pos) continue;

          if (!isset($agg[$pid])) $agg[$pid] = ['place_id'=>$pid,'name'=>$name,'appearances'=>0,'top3_hits'=>0,'sum_pos'=>0];
          $agg[$pid]['appearances']++;
          $agg[$pid]['sum_pos'] += $pos;
          if ($pos <= 3) $agg[$pid]['top3_hits']++;

          $perDayRaw[$day][] = ['place_id'=>$pid, 'pos'=>$pos];
        }
      }

      // pick top competitors overall
      $cands = array_values(array_map(function($c){
        $c['avg_pos'] = round($c['sum_pos']/max(1,$c['appearances']),2);
        unset($c['sum_pos']); return $c;
      }, $agg));
      usort($cands, function($a,$b){
        if ($b['top3_hits'] !== $a['top3_hits']) return $b['top3_hits'] <=> $a['top3_hits'];
        return $a['avg_pos'] <=> $b['avg_pos'];
      });
      $cands = array_slice($cands, 0, $top_n);

      // 2) Build per-day series for those competitors (avg position per day)
      $compSeries = []; // [ { place_id,name, series:[{day, avg_pos}] } ]
      $candSet = array_column($cands, null, 'place_id'); // map
      if (!empty($candSet)) {
        // initialize day map
        $daysPresent = []; foreach ($series as $s) { $daysPresent[$s['day']] = true; }

        $perDayAgg = []; // place_id => day => [sum,pos,count]
        foreach ($perDayRaw as $day => $items) {
          foreach ($items as $it) {
            if (!isset($candSet[$it['place_id']])) continue;
            $perDayAgg[$it['place_id']][$day]['sum']  = ($perDayAgg[$it['place_id']][$day]['sum'] ?? 0) + $it['pos'];
            $perDayAgg[$it['place_id']][$day]['cnt']  = ($perDayAgg[$it['place_id']][$day]['cnt'] ?? 0) + 1;
          }
        }
        foreach ($cands as $c) {
          $row = ['place_id'=>$c['place_id'], 'name'=>$c['name'], 'series'=>[]];
          foreach (array_keys($daysPresent) as $d) {
            if (isset($perDayAgg[$c['place_id']][$d])) {
              $sum = $perDayAgg[$c['place_id']][$d]['sum']; $cnt=$perDayAgg[$c['place_id']][$d]['cnt'];
              $row['series'][] = ['day'=>$d, 'avg_pos'=>round($sum/$cnt,2)];
            } else {
              $row['series'][] = ['day'=>$d, 'avg_pos'=>null];
            }
          }
          $compSeries[] = $row;
        }
      }

      return [
        'series'          => $series,      // our business: snapshots, avg_rank, solv_top3 (Phoenix days)
        'competitors'     => $cands,       // top-N summary across the window
        'competitorSeries'=> $compSeries,  // per-day avg position for each top competitor
      ];
    },
    'permission_callback' => '__return_true'
  ]);
});


add_action('rest_api_init', function () {
    register_rest_route('livedrive', '/geo-snapshots', [
        'methods' => 'GET',
        'callback' => function (WP_REST_Request $req) {
            // Validate required parameters first
            $bid = (int) $req->get_param('business_id');
            $kw  = trim((string) $req->get_param('keyword'));

            if (!$bid || $kw === '') {
                error_log('livedrive-api: Missing business_id or keyword');
                return new WP_Error('bad_request', 'business_id and keyword are required', ['status' => 400]);
            }

            // --- Database credentials from .env file ---
            $env = [];
            $env_path = '/opt/livedrive/.env';
            if (file_exists($env_path)) {
                $lines = @file($env_path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
                foreach ($lines as $line) {
                    $line = trim($line);
                    if ($line === '' || $line[0] === '#') continue;
                    list($k, $v) = array_pad(explode('=', $line, 2), 2, '');
                    $env[trim($k)] = trim($v);
                }
            } else {
                error_log('livedrive-api: .env file not found at ' . $env_path);
                return new WP_Error('db_config_missing', 'Database configuration file missing', ['status' => 500]);
            }

            $host = $env['DB_HOST'] ?? $env['MYSQL_HOST'] ?? '127.0.0.1';
            $db   = $env['DB_NAME'] ?? $env['MYSQL_DATABASE'] ?? '';
            $user = $env['DB_USER'] ?? $env['MYSQL_USER'] ?? '';
            $pass = $env['DB_PASSWORD'] ?? $env['MYSQL_PASSWORD'] ?? '';
            $port = $env['DB_PORT'] ?? $env['MYSQL_PORT'] ?? '3306';

            $pdo = null;
            $weekOffsetParam = $req->get_param('week_offset');
            $weekOffset = (is_numeric($weekOffsetParam) && (int)$weekOffsetParam >= 0)
                ? (int)$weekOffsetParam
                : 0;

            $periodParam = strtolower((string)$req->get_param('period'));
            if ($weekOffset === 0) {
                if ($periodParam === 'previous' || $periodParam === 'prior') {
                    $weekOffset = 1;
                } elseif (ctype_digit($periodParam)) {
                    $weekOffset = (int)$periodParam;
                }
            }

            $tzUtc = new DateTimeZone('UTC');
            $nowUtc = new DateTimeImmutable('now', $tzUtc);
            $daysPerWindow = 7;
            $lowerDays = ($weekOffset + 1) * $daysPerWindow;
            $upperDays = $weekOffset * $daysPerWindow;

            $windowStart = $nowUtc->sub(new DateInterval('P' . $lowerDays . 'D'));
            $windowEnd = $nowUtc->sub(new DateInterval('P' . $upperDays . 'D'));

            $windowStartSql = $windowStart->format('Y-m-d H:i:s');
            $windowEndSql = $windowEnd->format('Y-m-d H:i:s');
            $windowStartISO = $windowStart->format(DATE_ATOM);
            $windowEndISO = $windowEnd->format(DATE_ATOM);

            $periodLabel = match (true) {
                $weekOffset === 0 => 'current',
                $weekOffset === 1 => 'previous',
                default => 'weeks_ago_' . $weekOffset,
            };
            try {
                // Attempt to establish a database connection
                $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]);

                // --- Step 1: Return recent run_logs entries if available ---
                $points = [];

                // Gather snapshot points for the requested period window
                $sqlRecentSnapshots = "
                    SELECT
                        COALESCE(rq_run.run_id, rq_id.run_id, rs.run_id) AS resolved_run_id,
                        rs.origin_lat,
                        rs.origin_lng,
                        rs.matched_position AS rank
                    FROM ranking_snapshots rs
                    LEFT JOIN ranking_queries rq_run ON rq_run.run_id = rs.run_id
                    LEFT JOIN ranking_queries rq_id ON rq_id.id = rs.run_id
                    JOIN runs r ON r.id = COALESCE(rq_run.run_id, rq_id.run_id, rs.run_id)
                    WHERE r.business_id = ?
                      AND COALESCE(rq_run.keyword, rq_id.keyword) = ?
                      AND COALESCE(rq_run.timestamp_utc, rq_id.timestamp_utc) >= ?
                      AND COALESCE(rq_run.timestamp_utc, rq_id.timestamp_utc) < ?
                      AND (rq_run.id IS NOT NULL OR rq_id.id IS NOT NULL)
                ";
                $stmtRecent = $pdo->prepare($sqlRecentSnapshots);
                $stmtRecent->execute([$bid, $kw, $windowStartSql, $windowEndSql]);
                $recentRows = $stmtRecent->fetchAll();

                foreach ($recentRows as $row) {
                    $lat = isset($row['origin_lat']) ? (float)$row['origin_lat'] : null;
                    $lng = isset($row['origin_lng']) ? (float)$row['origin_lng'] : null;
                    if (!is_finite($lat) || !is_finite($lng)) continue;

                    $points[] = [
                        'run_id'     => (int)$row['resolved_run_id'],
                        'origin_lat' => $lat,
                        'origin_lng' => $lng,
                        'rank'       => isset($row['rank']) ? (int)$row['rank'] : null,
                        'source'     => 'snapshots',
                        'period'     => $periodLabel,
                        'weeks_ago'  => $weekOffset,
                        'window_start' => $windowStartISO,
                        'window_end'   => $windowEndISO
                    ];
                }

                if (!empty($points)) {
                    return $points;
                }

                // Fallback: use the most recent run regardless of age
                $sqlLatestRun = "
                    SELECT r.id AS run_id
                    FROM runs r
                    JOIN ranking_queries rq ON rq.run_id = r.id
                    WHERE r.business_id = ? AND rq.keyword = ?
                      AND rq.timestamp_utc >= ?
                      AND rq.timestamp_utc < ?
                    ORDER BY rq.timestamp_utc DESC
                    LIMIT 1
                ";
                $stmtLatest = $pdo->prepare($sqlLatestRun);
                $stmtLatest->execute([$bid, $kw, $windowStartSql, $windowEndSql]);
                $latestRunId = $stmtLatest->fetchColumn();

                if (!$latestRunId) {
                    return [];
                }

                $sqlLatestSnapshots = "
                    SELECT
                        COALESCE(rq_run.run_id, rq_id.run_id, rs.run_id) AS resolved_run_id,
                        rs.origin_lat,
                        rs.origin_lng,
                        rs.matched_position AS rank
                    FROM ranking_snapshots rs
                    LEFT JOIN ranking_queries rq_run ON rq_run.run_id = rs.run_id
                    LEFT JOIN ranking_queries rq_id ON rq_id.id = rs.run_id
                    JOIN runs r ON r.id = COALESCE(rq_run.run_id, rq_id.run_id, rs.run_id)
                    WHERE COALESCE(rq_run.run_id, rq_id.run_id, rs.run_id) = ?
                      AND r.business_id = ?
                      AND COALESCE(rq_run.keyword, rq_id.keyword) = ?
                      AND (rq_run.id IS NOT NULL OR rq_id.id IS NOT NULL)
                ";
                $stmtLatestPoints = $pdo->prepare($sqlLatestSnapshots);
                $stmtLatestPoints->execute([$latestRunId, $bid, $kw]);
                $latestRows = $stmtLatestPoints->fetchAll();

                $latestPoints = [];
                foreach ($latestRows as $row) {
                    $lat = isset($row['origin_lat']) ? (float)$row['origin_lat'] : null;
                    $lng = isset($row['origin_lng']) ? (float)$row['origin_lng'] : null;
                    if (!is_finite($lat) || !is_finite($lng)) continue;

                    $latestPoints[] = [
                        'run_id'     => (int)$row['resolved_run_id'],
                        'origin_lat' => $lat,
                        'origin_lng' => $lng,
                        'rank'       => isset($row['rank']) ? (int)$row['rank'] : null,
                        'source'     => 'snapshots',
                        'period'     => $periodLabel,
                        'weeks_ago'  => $weekOffset,
                        'window_start' => $windowStartISO,
                        'window_end'   => $windowEndISO
                    ];
                }

                return $latestPoints;

            } catch (Throwable $e) {
                // Log the exact error message from any database failure (connection or query)
                error_log('livedrive-api: DB error: ' . $e->getMessage());
                return new WP_Error('db_error', 'Database operation failed', ['status' => 500]);
            } finally {
                // Ensure the database connection is closed properly
                $pdo = null;
            }
        },
        'permission_callback' => '__return_true'
    ]);
});




/* ------- helpers (unchanged behavior, PDO under the hood) ------- */

function ld_miles_to_deg($m){ return $m / 69.0; }

function ld_geo_grid_spacing(float $radiusMiles, int $rows, int $cols): float {
  $rows = max(1, $rows);
  $cols = max(1, $cols);
  $diameter = $radiusMiles * 2.0;
  $spacingRow = $rows > 1 ? $diameter / ($rows - 1) : $diameter;
  $spacingCol = $cols > 1 ? $diameter / ($cols - 1) : $diameter;
  $spacing = max($spacingRow, $spacingCol);
  if (!is_finite($spacing) || $spacing <= 0) {
    $spacing = 3.0;
  }
  return $spacing;
}

function ld_origin_zone_keywords_parse($raw): array {
  if ($raw === null) return [];
  $str = trim((string)$raw);
  if ($str === '') return [];

  if ($str[0] === '[') {
    $decoded = json_decode($str, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
      $out = [];
      foreach ($decoded as $entry) {
        if (is_array($entry)) {
          $term = isset($entry['term']) ? trim((string)$entry['term']) : '';
          if ($term === '') continue;
          $weight = isset($entry['weight']) && is_numeric($entry['weight']) ? (float)$entry['weight'] : 1.0;
          if ($weight <= 0) $weight = 1.0;
          $out[] = ['term' => $term, 'weight' => $weight];
        } else {
          $term = trim((string)$entry);
          if ($term === '') continue;
          $out[] = ['term' => $term, 'weight' => 1.0];
        }
      }
      return $out;
    }
  }

  $parts = preg_split('/[,;\n]+/', $str);
  $out = [];
  foreach ($parts as $part) {
    $term = trim($part);
    if ($term === '') continue;
    $out[] = ['term' => $term, 'weight' => 1.0];
  }
  return $out;
}

function ld_geo_grid_fetch_origin_zones(PDO $pdo, int $businessId): array {
  $stmt = $pdo->prepare("
    SELECT
      id, name, canonical, zip,
      lat, lng, radius_mi, weight, keywords
    FROM origin_zones
    WHERE business_id = ?
    ORDER BY id ASC
  ");
  $stmt->execute([$businessId]);
  $zones = [];
  while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    if (!is_numeric($row['lat']) || !is_numeric($row['lng'])) {
      continue;
    }
    $zones[] = [
      'id'       => (int)$row['id'],
      'name'     => isset($row['name']) ? (string)$row['name'] : '',
      'canonical'=> isset($row['canonical']) ? (string)$row['canonical'] : null,
      'zip'      => isset($row['zip']) ? (string)$row['zip'] : null,
      'lat'      => (float)$row['lat'],
      'lng'      => (float)$row['lng'],
      'radius'   => is_numeric($row['radius_mi']) ? (float)$row['radius_mi'] : null,
      'weight'   => is_numeric($row['weight']) ? (float)$row['weight'] : 0.0,
      'keywords' => ld_origin_zone_keywords_parse($row['keywords'] ?? '')
    ];
  }
  return $zones;
}

function ld_geo_grid_pick_origin_zone(PDO $pdo, int $businessId, array $args): ?array {
  $bizStmt = $pdo->prepare("SELECT id, dest_lat, dest_lng FROM businesses WHERE id = ? LIMIT 1");
  $bizStmt->execute([$businessId]);
  $biz = $bizStmt->fetch(PDO::FETCH_ASSOC);
  if (!$biz) {
    return null;
  }

  $zones = ld_geo_grid_fetch_origin_zones($pdo, $businessId);
  if (!$zones) {
    $cfg = [];
  } else {
    $cfg = ['origin_zones' => array_map(function ($zone) {
      return [
        'id'       => $zone['id'],
        'name'     => $zone['name'],
        'canonical'=> $zone['canonical'],
        'zip'      => $zone['zip'],
        'lat'      => $zone['lat'],
        'lng'      => $zone['lng'],
        'radius'   => $zone['radius'],
        'weight'   => $zone['weight'],
        'keywords' => array_map(function ($entry) {
          return ['term' => $entry['term'], 'weight' => $entry['weight']];
        }, $zone['keywords'])
      ];
    }, $zones)];
  }

  $bizForOrigin = [
    'dest_lat'    => isset($biz['dest_lat']) ? (float)$biz['dest_lat'] : null,
    'dest_lng'    => isset($biz['dest_lng']) ? (float)$biz['dest_lng'] : null,
    'config_json' => json_encode($cfg)
  ];

  $origin = ld_geo_grid_resolve_origin_row($bizForOrigin, $args);
  if (!$origin || !isset($origin['lat'], $origin['lng'])) {
    return null;
  }

  $match = null;
  foreach ($zones as $zone) {
    $latMatch = abs($zone['lat'] - (float)$origin['lat']) < 1e-6;
    $lngMatch = abs($zone['lng'] - (float)$origin['lng']) < 1e-6;
    if ($latMatch && $lngMatch) {
      $match = $zone;
      break;
    }
  }

  if ($match) {
    $radius = $match['radius'] !== null ? (float)$match['radius'] : ($origin['radius'] ?? null);
    return [
      'zone_id'      => $match['id'],
      'zone_name'    => $match['name'],
      'canonical'    => $match['canonical'],
      'zip'          => $match['zip'],
      'lat'          => (float)$origin['lat'],
      'lng'          => (float)$origin['lng'],
      'radius_miles' => $radius,
      'weight'       => $match['weight'],
    ];
  }

  return [
    'zone_id'      => null,
    'zone_name'    => null,
    'canonical'    => null,
    'zip'          => null,
    'lat'          => (float)$origin['lat'],
    'lng'          => (float)$origin['lng'],
    'radius_miles' => $origin['radius'] ?? null,
    'weight'       => null,
  ];
}

function ld_geo_grid_resolve_origin_row(array $biz, array $args): array {
  // 1) explicit params
  if (!empty($args['origin_lat']) && !empty($args['origin_lng'])) {
    return [
      'lat'    => (float)$args['origin_lat'],
      'lng'    => (float)$args['origin_lng'],
      'radius' => isset($args['radius_miles']) ? (float)$args['radius_miles'] : 3.0,
    ];
  }

  $keywordRaw = isset($args['keyword']) ? trim((string)$args['keyword']) : '';
  $keyword    = $keywordRaw !== '' ? mb_strtolower($keywordRaw) : null;
  $requestedZone = isset($args['origin_zone']) ? trim((string)$args['origin_zone']) : '';
  $requestedZoneLower = $requestedZone !== '' ? mb_strtolower($requestedZone) : null;

  $zones = [];
  if (!empty($biz['config_json'])) {
    $cfg = json_decode($biz['config_json'], true);
    if (json_last_error() === JSON_ERROR_NONE && isset($cfg['origin_zones']) && is_array($cfg['origin_zones'])) {
      $zones = $cfg['origin_zones'];
    }
  }

  $bestZone = null;
  $bestScore = -INF;
  foreach ($zones as $zone) {
    $zoneLat = isset($zone['lat']) ? (float)$zone['lat'] : null;
    $zoneLng = isset($zone['lng']) ? (float)$zone['lng'] : null;
    if (!is_finite($zoneLat) || !is_finite($zoneLng)) {
      continue;
    }

    $score = 0.0;
    $zoneName = isset($zone['name']) ? (string)$zone['name'] : '';
    $zoneNameLower = $zoneName !== '' ? mb_strtolower($zoneName) : null;

    if ($requestedZoneLower && $zoneNameLower === $requestedZoneLower) {
      $score += 1000.0; // explicit zone request
    }

    if ($keyword) {
      $zoneKeywords = isset($zone['keywords']) && is_array($zone['keywords']) ? $zone['keywords'] : [];
      foreach ($zoneKeywords as $entry) {
        if (is_array($entry)) {
          $term = isset($entry['term']) ? (string)$entry['term'] : '';
          $weight = isset($entry['weight']) ? (float)$entry['weight'] : 1.0;
        } else {
          $term = (string)$entry;
          $weight = 1.0;
        }
        $termLower = $term !== '' ? mb_strtolower($term) : '';
        if ($termLower === '') continue;

        if ($termLower === $keyword) {
          $score = max($score, 500.0 + ($weight * 50.0));
        } elseif (strpos($keyword, $termLower) !== false || strpos($termLower, $keyword) !== false) {
          $score = max($score, 200.0 + ($weight * 20.0));
        }
      }
    }

    $score += isset($zone['weight']) ? (float)$zone['weight'] : 0.0;

    if ($score > $bestScore) {
      $bestScore = $score;
      $bestZone = $zone;
    }
  }

  if ($bestZone) {
    return [
      'lat'    => (float)$bestZone['lat'],
      'lng'    => (float)$bestZone['lng'],
      'radius' => isset($bestZone['radius']) ? (float)$bestZone['radius'] : (isset($args['radius_miles']) ? (float)$args['radius_miles'] : 3.0),
    ];
  }

  // 3) fallback to first defined zone
  if (!empty($zones)) {
    foreach ($zones as $zone) {
      if (isset($zone['lat'], $zone['lng']) && is_finite((float)$zone['lat']) && is_finite((float)$zone['lng'])) {
        return [
          'lat'    => (float)$zone['lat'],
          'lng'    => (float)$zone['lng'],
          'radius' => isset($zone['radius']) ? (float)$zone['radius'] : (isset($args['radius_miles']) ? (float)$args['radius_miles'] : 3.0),
        ];
      }
    }
  }

  // 4) fallback to destination coords
  return [
    'lat'    => (float)$biz['dest_lat'],
    'lng'    => (float)$biz['dest_lng'],
    'radius' => isset($args['radius_miles']) ? (float)$args['radius_miles'] : 3.0,
  ];
}

function ld_geo_grid_points(float $oLat, float $oLng, int $rows, int $cols, float $spacingMiles): array {
  $pts = [];
  $latStep = ld_miles_to_deg($spacingMiles);
  $lngStep = ld_miles_to_deg($spacingMiles) / cos(deg2rad($oLat));
  $rOff = ($rows - 1) / 2.0;
  $cOff = ($cols - 1) / 2.0;

  for ($r=0; $r<$rows; $r++){
    for ($c=0; $c<$cols; $c++){
      $lat = round($oLat + ($r - $rOff) * $latStep, 6);
      $lng = round($oLng + ($c - $cOff) * $lngStep, 6);
      $pts[] = ['row_idx'=>$r,'col_idx'=>$c,'lat'=>$lat,'lng'=>$lng];
    }
  }
  return $pts;
}

/* ------- CREATE RUN (PDO) ------- */

function ld_geo_grid_create_run(int $business_id, array $args = []){
  $pdo = ld_db();

  // Pull only the columns we use (per your schema)
  $stmt = $pdo->prepare("
    SELECT id, business_name, business_slug, dest_lat, dest_lng, config_json
    FROM businesses
    WHERE id = ?
    LIMIT 1
  ");
  $stmt->execute([$business_id]);
  $biz = $stmt->fetch();
  if (!$biz) return new WP_Error('not_found', 'Business not found');

  $rows       = max(1, (int)($args['grid_rows']     ?? 5));
  $cols       = max(1, (int)($args['grid_cols']     ?? 5));
  $spacing    = (float)($args['spacing_miles']      ?? 3);
  $keyword    = isset($args['keyword']) ? (string)$args['keyword'] : null;
  $requested  = get_current_user_id() ?: null;

  $origin = ld_geo_grid_resolve_origin_row($biz, $args);
  if (!$origin['lat'] || !$origin['lng']) {
    return new WP_Error('bad_origin', 'Origin coordinates unavailable for this business');
  }

  try {
    $pdo->beginTransaction();

    // Insert run (explicitly name columns to match our DDL)
    $ins = $pdo->prepare("
      INSERT INTO geo_grid_runs
        (business_id, keyword, origin_lat, origin_lng, radius_miles,
         grid_rows, grid_cols, spacing_miles, status, requested_by)
      VALUES
        (:business_id, :keyword, :origin_lat, :origin_lng, :radius_miles,
         :grid_rows, :grid_cols, :spacing_miles, 'queued', :requested_by)
    ");
    $ins->execute([
      ':business_id'  => $business_id,
      ':keyword'      => $keyword,
      ':origin_lat'   => $origin['lat'],
      ':origin_lng'   => $origin['lng'],
      ':radius_miles' => $origin['radius'],
      ':grid_rows'    => $rows,
      ':grid_cols'    => $cols,
      ':spacing_miles'=> $spacing,
      ':requested_by' => $requested,
    ]);
    $run_id = (int)$pdo->lastInsertId();

    // Seed points
    $pts = ld_geo_grid_points($origin['lat'], $origin['lng'], $rows, $cols, $spacing);
    $pi  = $pdo->prepare("
      INSERT INTO geo_grid_points (run_id, row_idx, col_idx, lat, lng)
      VALUES (:run_id, :row_idx, :col_idx, :lat, :lng)
    ");
    foreach ($pts as $p){
      $pi->execute([
        ':run_id' => $run_id,
        ':row_idx'=> $p['row_idx'],
        ':col_idx'=> $p['col_idx'],
        ':lat'    => $p['lat'],
        ':lng'    => $p['lng'],
      ]);
    }

    $pdo->commit();
    return ['run_id' => $run_id];
  } catch (Throwable $e){
    if ($pdo->inTransaction()) $pdo->rollBack();
    return new WP_Error('db_error', 'Failed to create run: '.$e->getMessage());
  }
}

function ld_geo_grid_start_run(int $run_id){
  $pdo = ld_db();
  $stmt = $pdo->prepare("UPDATE geo_grid_runs SET status='running' WHERE id=?");
  $stmt->execute([$run_id]);
}

function ld_geo_grid_finish_run(int $run_id, bool $had_error=false){
  $pdo = ld_db();
  $stmt = $pdo->prepare("
    UPDATE geo_grid_runs
    SET status = ?, finished_at = UTC_TIMESTAMP()
    WHERE id = ?
  ");
  $stmt->execute([$had_error ? 'error' : 'done', $run_id]);
}

/* ------- REST endpoints: use PDO like your other endpoints ------- */

add_action('rest_api_init', function () {

  register_rest_route('livedrive', '/geo-grid/origin', [
    'methods'  => 'GET',
    'permission_callback' => '__return_true',
    'callback' => function (WP_REST_Request $req) {
      $business_id = (int)$req->get_param('business_id');
      $keywordRaw  = (string)$req->get_param('keyword');
      $keyword     = trim($keywordRaw);
      $radiusParam = $req->get_param('radius_miles');

      if ($business_id <= 0) {
        return new WP_REST_Response(['error' => 'business_id is required'], 400);
      }

      $args = [
        'keyword'      => $keyword !== '' ? $keyword : null,
        'radius_miles' => ($radiusParam !== null && $radiusParam !== '') ? (float)$radiusParam : null,
      ];

      try {
        $pdo = ld_db();
        $match = ld_geo_grid_pick_origin_zone($pdo, $business_id, $args);
      } catch (Throwable $e) {
        error_log('livedrive geo-grid/origin error: '.$e->getMessage());
        return new WP_REST_Response(['error' => 'Failed to resolve origin zone'], 500);
      }

      if (!$match || !isset($match['lat'], $match['lng']) || $match['zone_id'] === null) {
        return new WP_REST_Response(['error' => 'Origin zone not found'], 404);
      }

      return new WP_REST_Response([
        'zone_id'      => $match['zone_id'],
        'zone_name'    => $match['zone_name'],
        'canonical'    => $match['canonical'],
        'zip'          => $match['zip'],
        'lat'          => $match['lat'],
        'lng'          => $match['lng'],
        'radius_miles' => $match['radius_miles'],
        'weight'       => $match['weight'],
      ], 200);
    }
  ]);

  register_rest_route('livedrive', '/geo-grid/run', [
    'methods'  => 'POST',
    'permission_callback' => '__return_true',
    'callback' => function(WP_REST_Request $req){
      $business_id  = (int)$req->get_param('business_id');
      $radiusMi = $req->get_param('radius_miles');
      $rows     = $req->get_param('grid_rows');
      $cols     = $req->get_param('grid_cols');
      $spacing  = $req->get_param('spacing_miles');

      $spacingMiles = null;
      if ($spacing !== null && $spacing !== '') {
        $spacingMiles = (float)$spacing;
      } elseif ($radiusMi && $rows && $cols) {
        $spacingMiles = ld_geo_grid_spacing((float)$radiusMi, (int)$rows, (int)$cols);
      }

      $args = [
        'keyword'       => $req->get_param('keyword') ?: null,
        'grid_rows'     => $rows,
        'grid_cols'     => $cols,
        'spacing_miles' => $spacingMiles,
        'origin_lat'    => $req->get_param('origin_lat'),
        'origin_lng'    => $req->get_param('origin_lng'),
        'radius_miles'  => $radiusMi,
      ];
      $res = ld_geo_grid_create_run($business_id, $args);
      if (is_wp_error($res)) {
        return new WP_REST_Response(['error' => $res->get_error_message()], 400);
      }
      ld_geo_grid_start_run((int)$res['run_id']);

      // $node_script_path = '/opt/livedrive/workers/geogrid_worker.js';
      // $command = "nohup node $node_script_path > /dev/null 2>&1 &";
      // shell_exec($command);

// --- Configuration ---
// 1. ABSOLUTE path to the directory containing package.json and your JS file.
$SCRIPT_DIR = '/opt/livedrive/workers/'; 
// Note: You must check this path on your server:
// *** UPDATED to use the NVM path provided by the user ***
$NODE_PATH = '/root/.nvm/versions/node/v22.18.0/bin/node'; 

$SCRIPT_NAME = 'geogrid_worker.js';
$LOG_FILE = '/tmp/geo_grid_scraper_log_' . date('YmdHis') . '.log'; 

// ----------------------------------------------------------------------

// --- DEBUG COMMANDS (Retained for the initial successful launch confirmation) ---
$debug_commands = [
    "echo \"--- Debug Start ---\"",
    "echo \"Current User: \" && whoami",
    "echo \"Current Directory: \" && pwd",
    "echo \"Node Path Test: \" && $NODE_PATH -v", 
    "echo \"Script File Check: \" && ls -l $SCRIPT_NAME", 
    "echo \"--- Debug End ---\"",
];

$debug_command_string = implode(" && ", $debug_commands);

// --- ROBUST COMMAND ---
// It uses the same background execution method as your preferred solution, 
// but keeps the CRUCIAL directory change and logging.
$command = "(cd $SCRIPT_DIR && $debug_command_string && $NODE_PATH $SCRIPT_NAME >> $LOG_FILE 2>&1) &";

// Execute the command using exec, as it gives better immediate feedback than shell_exec
exec($command, $output, $return_var);
    

      return new WP_REST_Response(['ok'=>true, 'run_id'=>$res['run_id']], 200);
    }
  ]);

  register_rest_route('livedrive', '/geo-grid/report', [
    'methods'  => 'GET',
    'permission_callback' => '__return_true',
    'callback' => function(WP_REST_Request $req){
      $pdo = ld_db();
      $business_id = (int)$req->get_param('business_id');
      $run_id      = (int)$req->get_param('run_id');
      $latest      = (int)$req->get_param('latest');

      if (!$run_id && $latest) {
        $s = $pdo->prepare("SELECT id FROM geo_grid_runs WHERE business_id = ? ORDER BY created_at DESC LIMIT 1");
        $s->execute([$business_id]);
        $run_id = (int)$s->fetchColumn();
      }
      if (!$run_id) return new WP_REST_Response(['error'=>'run_id or latest=1 required'], 400);

      $rs = $pdo->prepare("SELECT * FROM geo_grid_runs WHERE id = ? LIMIT 1");
      $rs->execute([$run_id]);
      $run = $rs->fetch();
      if (!$run) return new WP_REST_Response(['error'=>'Run not found'], 404);

      $ps = $pdo->prepare("
        SELECT row_idx, col_idx, lat, lng, rank_pos, place_id, measured_at, screenshot_path, search_url, landing_url
        FROM geo_grid_points
        WHERE run_id = ?
        ORDER BY row_idx ASC, col_idx ASC
      ");
      $ps->execute([$run_id]);
      $points = $ps->fetchAll();

      return new WP_REST_Response(['run'=>$run, 'points'=>$points], 200);
    }
  ]);
    register_rest_route('livedrive', '/geo-grid/runs', [
        'methods'  => 'GET',
        'permission_callback' => '__return_true',
        'callback' => function(WP_REST_Request $req){
            $pdo = ld_db();

            $businessParam = $req->get_param('business_id');
            $keyword = $req->get_param('keyword');
            $limitParam = $req->get_param('limit');

            $businessId = null;
            if ($businessParam !== null && $businessParam !== '') {
                $businessId = (int)$businessParam;
                if ($businessId <= 0) {
                    $businessId = null;
                }
            }

            $limit = is_numeric($limitParam) ? (int)$limitParam : 200;
            if ($limit < 1) {
                $limit = 1;
            }
            if ($limit > 500) {
                $limit = 500;
            }

            $params = [];
            $conditions = [];

            if ($businessId !== null) {
                $conditions[] = 'r.business_id = ?';
                $params[] = $businessId;
            }

            if ($keyword !== null && $keyword !== '') {
                $conditions[] = 'r.keyword = ?';
                $params[] = $keyword;
            }

            $whereSql = '';
            if ($conditions) {
                $whereSql = 'WHERE ' . implode(' AND ', $conditions);
            }

            $query = "
                SELECT
                    r.id,
                    r.business_id,
                    b.business_name,
                    r.keyword,
                    r.status,
                    r.created_at,
                    r.finished_at,
                    r.grid_rows,
                    r.grid_cols,
                    r.radius_miles,
                    ROUND(AVG(
                        CASE
                            WHEN p.rank_pos IS NULL OR p.rank_pos <= 0 THEN NULL
                            WHEN p.rank_pos >= 999 THEN 21
                            ELSE p.rank_pos
                        END
                    ), 2) AS avg_rank,
                    ROUND(
                        100 * SUM(
                            CASE
                                WHEN p.rank_pos IS NULL OR p.rank_pos <= 0 THEN 0
                                WHEN p.rank_pos <= 3 THEN 1
                                ELSE 0
                            END
                        )
                        / NULLIF(SUM(
                            CASE
                                WHEN p.rank_pos IS NULL OR p.rank_pos <= 0 THEN 0
                                ELSE 1
                            END
                        ), 0)
                    , 1) AS solv_top3
                FROM geo_grid_runs r
                LEFT JOIN geo_grid_points p ON p.run_id = r.id
                LEFT JOIN businesses b ON b.id = r.business_id
                $whereSql
                GROUP BY
                    r.id,
                    r.business_id,
                    b.business_name,
                    r.keyword,
                    r.status,
                    r.created_at,
                    r.finished_at,
                    r.grid_rows,
                    r.grid_cols,
                    r.radius_miles
                ORDER BY r.created_at DESC
                LIMIT $limit
            ";

            $s = $pdo->prepare($query);
            $s->execute($params);

            $runs = $s->fetchAll(PDO::FETCH_ASSOC);
            return new WP_REST_Response(['runs' => $runs], 200);
        }
    ]);


});
