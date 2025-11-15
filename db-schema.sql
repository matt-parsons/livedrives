-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Oct 26, 2025 at 04:00 PM
-- Server version: 10.11.8-MariaDB-0ubuntu0.24.04.1
-- PHP Version: 8.3.16

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `mongooz_driveline`
--

-- --------------------------------------------------------

--
-- Table structure for table `businesses`
--

CREATE TABLE `businesses` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `organization_id` bigint(20) UNSIGNED DEFAULT NULL,
  `business_slug` varchar(120) NOT NULL,
  `business_name` varchar(255) NOT NULL,
  `mid` varchar(64) DEFAULT NULL,
  `brand_search` varchar(255) DEFAULT NULL,
  `destination_address` varchar(255) DEFAULT NULL,
  `destination_zip` varchar(20) DEFAULT NULL,
  `dest_lat` decimal(10,7) DEFAULT NULL,
  `dest_lng` decimal(10,7) DEFAULT NULL,
  `timezone` varchar(64) NOT NULL,
  `drives_per_day` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `config_json` longtext DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `g_place_id` varchar(128) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `gbp_profile_cache`
--

CREATE TABLE `gbp_profile_cache` (
  `place_id` varchar(128) NOT NULL,
  `business_id` bigint(20) UNSIGNED DEFAULT NULL,
  `place_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`place_payload`)),
  `places_raw_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`places_raw_payload`)),
  `sidebar_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`sidebar_payload`)),
  `last_refreshed_at` datetime NOT NULL,
  `last_manual_refresh_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`place_id`),
  KEY `idx_gbp_profile_cache_business` (`business_id`),
  CONSTRAINT `fk_gbp_profile_cache_business`
    FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `business_hours`
--

CREATE TABLE `business_hours` (
  `business_id` bigint(20) UNSIGNED NOT NULL,
  `windows_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`windows_json`)),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `geo_grid_points`
--

CREATE TABLE `geo_grid_points` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `run_id` bigint(20) UNSIGNED NOT NULL,
  `row_idx` int(10) UNSIGNED NOT NULL,
  `col_idx` int(10) UNSIGNED NOT NULL,
  `lat` decimal(9,6) NOT NULL,
  `lng` decimal(9,6) NOT NULL,
  `rank_pos` smallint(5) UNSIGNED DEFAULT NULL,
  `place_id` varchar(128) DEFAULT NULL,
  `result_json` longtext DEFAULT NULL,
  `measured_at` timestamp NULL DEFAULT NULL,
  `screenshot_path` varchar(255) DEFAULT NULL,
  `search_url` text DEFAULT NULL,
  `landing_url` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `geo_grid_runs`
--

CREATE TABLE `geo_grid_runs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `business_id` bigint(20) UNSIGNED NOT NULL,
  `keyword` varchar(255) DEFAULT NULL,
  `origin_lat` decimal(9,6) NOT NULL,
  `origin_lng` decimal(9,6) NOT NULL,
  `radius_miles` decimal(5,2) NOT NULL,
  `grid_rows` int(10) UNSIGNED NOT NULL DEFAULT 9,
  `grid_cols` int(10) UNSIGNED NOT NULL DEFAULT 9,
  `spacing_miles` decimal(5,2) NOT NULL DEFAULT 0.50,
  `status` enum('queued','running','done','error') NOT NULL DEFAULT 'queued',
  `notes` varchar(512) DEFAULT NULL,
  `requested_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `finished_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `geo_grid_schedules`
--

CREATE TABLE `geo_grid_schedules` (
  `business_id` bigint(20) UNSIGNED NOT NULL,
  `run_day_of_week` tinyint(2) NOT NULL,
  `run_time_local` time NOT NULL,
  `lead_minutes` int(10) UNSIGNED NOT NULL DEFAULT 120,
  `next_run_at` datetime DEFAULT NULL,
  `last_run_at` datetime DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`business_id`),
  KEY `idx_geo_grid_schedules_next_run` (`next_run_at`),
  KEY `idx_geo_grid_schedules_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `organizations`
--

CREATE TABLE `organizations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `organization_trials`
--

CREATE TABLE `organization_trials` (
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `trial_starts_at` datetime NOT NULL,
  `trial_ends_at` datetime NOT NULL,
  `status` enum('active','expired','cancelled') NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `origin_zones`
--

CREATE TABLE `origin_zones` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `business_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `canonical` varchar(255) DEFAULT NULL,
  `zip` varchar(20) DEFAULT NULL,
  `lat` decimal(10,7) NOT NULL,
  `lng` decimal(10,7) NOT NULL,
  `radius_mi` decimal(6,2) NOT NULL,
  `weight` decimal(5,2) NOT NULL,
  `keywords` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`keywords`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ranking_queries`
--

CREATE TABLE `ranking_queries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `run_id` bigint(20) UNSIGNED DEFAULT NULL,
  `business_id` bigint(20) UNSIGNED NOT NULL,
  `keyword` varchar(255) NOT NULL,
  `source` enum('google_places','serp') NOT NULL DEFAULT 'google_places',
  `variant` enum('text','nearby','find_place','other') NOT NULL DEFAULT 'text',
  `origin_zone_id` bigint(20) UNSIGNED DEFAULT NULL,
  `origin_lat` decimal(10,7) DEFAULT NULL,
  `origin_lng` decimal(10,7) DEFAULT NULL,
  `radius_mi` decimal(6,2) DEFAULT NULL,
  `session_id` varchar(64) DEFAULT NULL,
  `request_id` varchar(128) DEFAULT NULL,
  `timestamp_utc` datetime(3) NOT NULL,
  `local_date` date DEFAULT NULL,
  `matched_position` int(11) DEFAULT NULL,
  `matched_place_id` varchar(128) DEFAULT NULL,
  `matched_by` enum('place_id','mid','name_addr','none') NOT NULL DEFAULT 'none',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ranking_snapshots`
--

CREATE TABLE `ranking_snapshots` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `run_id` bigint(20) UNSIGNED DEFAULT NULL,
  `query_id` bigint(20) UNSIGNED DEFAULT NULL,
  `business_id` bigint(20) UNSIGNED DEFAULT NULL,
  `origin_lat` decimal(10,7) DEFAULT NULL,
  `origin_lng` decimal(10,7) DEFAULT NULL,
  `total_results` int(11) NOT NULL,
  `matched_place_id` varchar(128) DEFAULT NULL,
  `matched_position` int(11) DEFAULT NULL,
  `results_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`results_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `runs`
--

CREATE TABLE `runs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `business_id` bigint(20) UNSIGNED NOT NULL,
  `started_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `finished_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `run_logs`
--

CREATE TABLE `run_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `run_id` bigint(20) UNSIGNED DEFAULT NULL,
  `query_id` bigint(20) UNSIGNED DEFAULT NULL,
  `timestamp_utc` datetime(3) NOT NULL,
  `session_id` varchar(64) DEFAULT NULL,
  `business_id` bigint(20) UNSIGNED DEFAULT NULL,
  `keyword` varchar(255) DEFAULT NULL,
  `business_name` varchar(255) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `ctr_ip_address` varchar(45) DEFAULT NULL,
  `drive_ip_address` varchar(45) DEFAULT NULL,
  `origin` varchar(255) DEFAULT NULL,
  `location_label` varchar(255) DEFAULT NULL,
  `device` varchar(64) DEFAULT NULL,
  `steps_json` longtext DEFAULT NULL,
  `duration_min` decimal(10,2) DEFAULT NULL,
  `events_json` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `rank` smallint(6) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `soax_configs`
--

CREATE TABLE `soax_configs` (
  `business_id` bigint(20) UNSIGNED NOT NULL,
  `label` varchar(64) NOT NULL,
  `endpoint` varchar(255) NOT NULL,
  `username` varchar(255) NOT NULL,
  `res_username` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `firebase_uid` varchar(128) NOT NULL,
  `email` varchar(255) NOT NULL,
  `business_id` bigint(20) UNSIGNED DEFAULT NULL,
  `role` enum('owner','admin','member') DEFAULT 'owner',
  `name` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_org_members`
--

CREATE TABLE `user_org_members` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `organization_id` bigint(20) UNSIGNED NOT NULL,
  `role` enum('owner','admin','member') NOT NULL DEFAULT 'owner',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `funnel_leads`
--

CREATE TABLE `funnel_leads` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `email` varchar(255) NOT NULL,
  `place_id` varchar(128) NOT NULL,
  `place_name` varchar(255) DEFAULT NULL,
  `place_address` varchar(255) DEFAULT NULL,
  `place_lat` decimal(10,7) DEFAULT NULL,
  `place_lng` decimal(10,7) DEFAULT NULL,
  `place_metadata_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`place_metadata_json`)),
  `preview_status` enum('pending','completed','error') NOT NULL DEFAULT 'pending',
  `preview_error` varchar(512) DEFAULT NULL,
  `preview_started_at` datetime DEFAULT NULL,
  `preview_completed_at` datetime DEFAULT NULL,
  `converted_lead_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  CONSTRAINT `fk_funnel_leads_user`
    FOREIGN KEY (`converted_lead_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `businesses`
--
ALTER TABLE `businesses`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_company_id` (`business_slug`),
  ADD UNIQUE KEY `uq_mid` (`mid`),
  ADD UNIQUE KEY `uq_g_place_id` (`g_place_id`),
  ADD KEY `idx_company_lookup` (`business_slug`),
  ADD KEY `idx_brand_search` (`brand_search`),
  ADD KEY `idx_biz_org` (`organization_id`);

--
-- Indexes for table `business_hours`
--
ALTER TABLE `business_hours`
  ADD PRIMARY KEY (`business_id`);

--
-- Indexes for table `geo_grid_points`
--
ALTER TABLE `geo_grid_points`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_point` (`run_id`,`row_idx`,`col_idx`),
  ADD KEY `idx_run` (`run_id`);

--
-- Indexes for table `geo_grid_runs`
--
ALTER TABLE `geo_grid_runs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_business_date` (`business_id`,`created_at`);

--
-- Indexes for table `geo_grid_schedules`
--
ALTER TABLE `geo_grid_schedules`
  ADD PRIMARY KEY (`business_id`),
  ADD KEY `idx_geo_grid_schedules_next_run` (`next_run_at`),
  ADD KEY `idx_geo_grid_schedules_active` (`is_active`);

--
-- Indexes for table `organizations`
--
ALTER TABLE `organizations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `organization_trials`
--
ALTER TABLE `organization_trials`
  ADD PRIMARY KEY (`organization_id`);

--
-- Indexes for table `origin_zones`
--
ALTER TABLE `origin_zones`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_business_zone` (`business_id`,`name`),
  ADD KEY `idx_business` (`business_id`);

--
-- Indexes for table `ranking_queries`
--
ALTER TABLE `ranking_queries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_biz_kw_date` (`business_id`,`keyword`,`local_date`),
  ADD KEY `idx_biz_time` (`business_id`,`timestamp_utc`),
  ADD KEY `fk_rq_zone` (`origin_zone_id`),
  ADD KEY `idx_queries_run` (`run_id`),
  ADD KEY `idx_rq_biz_kw_time` (`business_id`,`keyword`,`timestamp_utc`);

--
-- Indexes for table `ranking_snapshots`
--
ALTER TABLE `ranking_snapshots`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_snapshot_query_created` (`run_id`,`created_at`),
  ADD KEY `idx_snapshot_query_match` (`run_id`,`matched_position`),
  ADD KEY `idx_rs_query_id` (`run_id`),
  ADD KEY `fk_snapshots_business` (`business_id`),
  ADD KEY `fk_snapshots_query` (`query_id`);

--
-- Indexes for table `runs`
--
ALTER TABLE `runs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_runs_biz_time` (`business_id`,`started_at`),
  ADD KEY `idx_runs_biz_started` (`business_id`,`started_at`),
  ADD KEY `idx_runs_biz_finished` (`business_id`,`finished_at`);

--
-- Indexes for table `run_logs`
--
ALTER TABLE `run_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_session_id` (`session_id`),
  ADD KEY `idx_timestamp` (`timestamp_utc`),
  ADD KEY `idx_keyword` (`keyword`),
  ADD KEY `idx_business` (`business_name`),
  ADD KEY `idx_runlogs_business` (`business_id`),
  ADD KEY `idx_runlogs_run` (`run_id`),
  ADD KEY `idx_rl_biz_kw_time` (`business_id`,`keyword`,`timestamp_utc`),
  ADD KEY `fk_runlogs_query` (`query_id`);

--
-- Indexes for table `soax_configs`
--
ALTER TABLE `soax_configs`
  ADD PRIMARY KEY (`business_id`),
  ADD UNIQUE KEY `label` (`label`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `firebase_uid` (`firebase_uid`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `fk_users_business` (`business_id`);

--
-- Indexes for table `user_org_members`
--
ALTER TABLE `user_org_members`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_user_org` (`user_id`,`organization_id`),
  ADD KEY `fk_uom_org` (`organization_id`);

--
-- Indexes for table `funnel_leads`
--
ALTER TABLE `funnel_leads`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_funnel_email` (`email`),
  ADD KEY `idx_funnel_place` (`place_id`),
  ADD KEY `idx_funnel_converted` (`converted_lead_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `businesses`
--
ALTER TABLE `businesses`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `geo_grid_points`
--
ALTER TABLE `geo_grid_points`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `geo_grid_runs`
--
ALTER TABLE `geo_grid_runs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `organizations`
--
ALTER TABLE `organizations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `origin_zones`
--
ALTER TABLE `origin_zones`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ranking_queries`
--
ALTER TABLE `ranking_queries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ranking_snapshots`
--
ALTER TABLE `ranking_snapshots`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `runs`
--
ALTER TABLE `runs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `run_logs`
--
ALTER TABLE `run_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `soax_configs`
--
ALTER TABLE `soax_configs`
  MODIFY `business_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_org_members`
--
ALTER TABLE `user_org_members`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `funnel_leads`
--
ALTER TABLE `funnel_leads`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `businesses`
--
ALTER TABLE `businesses`
  ADD CONSTRAINT `fk_biz_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `business_hours`
--
ALTER TABLE `business_hours`
  ADD CONSTRAINT `fk_hours_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON UPDATE CASCADE;

--
-- Constraints for table `geo_grid_points`
--
ALTER TABLE `geo_grid_points`
  ADD CONSTRAINT `fk_geogridpoints_run` FOREIGN KEY (`run_id`) REFERENCES `geo_grid_runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `geo_grid_runs`
--
ALTER TABLE `geo_grid_runs`
  ADD CONSTRAINT `fk_geogridruns_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `geo_grid_schedules`
--
ALTER TABLE `geo_grid_schedules`
  ADD CONSTRAINT `fk_geo_grid_schedule_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `organization_trials`
--
ALTER TABLE `organization_trials`
  ADD CONSTRAINT `organization_trials_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `origin_zones`
--
ALTER TABLE `origin_zones`
  ADD CONSTRAINT `fk_zones_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `ranking_queries`
--
ALTER TABLE `ranking_queries`
  ADD CONSTRAINT `fk_queries_run` FOREIGN KEY (`run_id`) REFERENCES `runs` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_rq_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_rq_zone` FOREIGN KEY (`origin_zone_id`) REFERENCES `origin_zones` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `ranking_snapshots`
--
ALTER TABLE `ranking_snapshots`
  ADD CONSTRAINT `fk_snapshots_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_snapshots_query` FOREIGN KEY (`query_id`) REFERENCES `ranking_queries` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_snapshots_run` FOREIGN KEY (`run_id`) REFERENCES `runs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `run_logs`
--
ALTER TABLE `run_logs`
  ADD CONSTRAINT `fk_runlogs_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_runlogs_query` FOREIGN KEY (`query_id`) REFERENCES `ranking_queries` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_runlogs_run` FOREIGN KEY (`run_id`) REFERENCES `runs` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `user_org_members`
--
ALTER TABLE `user_org_members`
  ADD CONSTRAINT `fk_uom_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_uom_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
