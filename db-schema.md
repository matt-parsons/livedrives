# 🧩 Mongooz DriveLine Database Schema

_Last updated: Oct 2025_

This document outlines the structure and relationships of the current MySQL database used by Mongooz DriveLine.

---

## **organizations**

| Column     | Type                | Key | Notes |
| ---------- | ------------------- | --- | ----- |
| id         | bigint(20) unsigned | PK  |       |
| name       | varchar(255)        |     |       |
| created_at | timestamp           |     |       |

---

## **user_org_members**

| Column          | Type                           | Key                   | Notes |
| --------------- | ------------------------------ | --------------------- | ----- |
| id              | bigint(20) unsigned            | PK                    |       |
| user_id         | bigint(20) unsigned            | FK → users.id         |       |
| organization_id | bigint(20) unsigned            | FK → organizations.id |       |
| role            | enum('owner','admin','member') |                       |       |
| created_at      | timestamp                      |                       |       |

---

## **users**

| Column       | Type                           | Key                | Notes             |
| ------------ | ------------------------------ | ------------------ | ----------------- |
| id           | bigint(20) unsigned            | PK                 |                   |
| firebase_uid | varchar(128)                   | UNI                | Firebase identity |
| email        | varchar(255)                   | UNI                |                   |
| business_id  | bigint(20) unsigned            | FK → businesses.id | Nullable          |
| role         | enum('owner','admin','member') |                    |                   |
| name         | varchar(255)                   |                    |                   |
| created_at   | timestamp                      |                    |                   |

---

## **businesses**

| Column              | Type                | Key                   | Notes       |
| ------------------- | ------------------- | --------------------- | ----------- |
| id                  | bigint(20) unsigned | PK                    |             |
| organization_id     | bigint(20) unsigned | FK → organizations.id |             |
| business_slug       | varchar(120)        | UNI                   |             |
| business_name       | varchar(255)        |                       |             |
| mid                 | varchar(64)         | UNI                   |             |
| brand_search        | varchar(255)        | MUL                   |             |
| destination_address | varchar(255)        |                       |             |
| destination_zip     | varchar(20)         |                       |             |
| dest_lat            | decimal(10,7)       |                       |             |
| dest_lng            | decimal(10,7)       |                       |             |
| timezone            | varchar(64)         |                       |             |
| drives_per_day      | int(10) unsigned    |                       |             |
| config_json         | longtext            |                       | JSON config |
| is_active           | tinyint(1)          |                       |             |
| created_at          | timestamp           |                       |             |
| updated_at          | timestamp           |                       |             |
| g_place_id          | varchar(128)        | UNI                   |             |

---

## **business_hours**

| Column       | Type                | Key                    | Notes |
| ------------ | ------------------- | ---------------------- | ----- |
| business_id  | bigint(20) unsigned | PK, FK → businesses.id |       |
| windows_json | longtext            |                        |       |
| updated_at   | timestamp           |                        |       |

---

## **soax_configs**

| Column      | Type                | Key                    | Notes |
| ----------- | ------------------- | ---------------------- | ----- |
| business_id | bigint(20) unsigned | PK, FK → businesses.id |       |
| label       | varchar(64)         | UNI                    |       |
| endpoint    | varchar(255)        |                        |       |
| username    | varchar(255)        |                        |       |
| created_at  | timestamp           |                        |       |

---

## **origin_zones**

| Column      | Type                | Key                | Notes |
| ----------- | ------------------- | ------------------ | ----- |
| id          | bigint(20) unsigned | PK                 |       |
| business_id | bigint(20) unsigned | FK → businesses.id |       |
| name        | varchar(255)        |                    |       |
| canonical   | varchar(255)        |                    |       |
| zip         | varchar(20)         |                    |       |
| lat         | decimal(10,7)       |                    |       |
| lng         | decimal(10,7)       |                    |       |
| radius_mi   | decimal(6,2)        |                    |       |
| weight      | decimal(5,2)        |                    |       |
| keywords    | longtext            |                    |       |
| created_at  | timestamp           |                    |       |

---

## **geo_grid_runs**

| Column        | Type                                    | Key                | Notes |
| ------------- | --------------------------------------- | ------------------ | ----- |
| id            | bigint(20) unsigned                     | PK                 |       |
| business_id   | bigint(20) unsigned                     | FK → businesses.id |       |
| keyword       | varchar(255)                            |                    |       |
| origin_lat    | decimal(9,6)                            |                    |       |
| origin_lng    | decimal(9,6)                            |                    |       |
| radius_miles  | decimal(5,2)                            |                    |       |
| grid_rows     | int(10) unsigned                        |                    |       |
| grid_cols     | int(10) unsigned                        |                    |       |
| spacing_miles | decimal(5,2)                            |                    |       |
| status        | enum('queued','running','done','error') |                    |       |
| notes         | varchar(512)                            |                    |       |
| requested_by  | bigint(20) unsigned                     | FK → users.id      |       |
| created_at    | timestamp                               |                    |       |
| finished_at   | timestamp                               |                    |       |

---

## **geo_grid_points**

| Column          | Type                 | Key                   | Notes |
| --------------- | -------------------- | --------------------- | ----- |
| id              | bigint(20) unsigned  | PK                    |       |
| run_id          | bigint(20) unsigned  | FK → geo_grid_runs.id |       |
| row_idx         | int(10) unsigned     |                       |       |
| col_idx         | int(10) unsigned     |                       |       |
| lat             | decimal(9,6)         |                       |       |
| lng             | decimal(9,6)         |                       |       |
| rank_pos        | smallint(5) unsigned |                       |       |
| place_id        | varchar(128)         |                       |       |
| result_json     | longtext             |                       |       |
| measured_at     | timestamp            |                       |       |
| screenshot_path | varchar(255)         |                       |       |
| search_url      | text                 |                       |       |
| landing_url     | text                 |                       |       |

---

## **runs**

| Column      | Type                | Key                | Notes |
| ----------- | ------------------- | ------------------ | ----- |
| id          | bigint(20) unsigned | PK                 |       |
| business_id | bigint(20) unsigned | FK → businesses.id |       |
| started_at  | timestamp           |                    |       |
| finished_at | timestamp           |                    |       |

---

## **run_logs**

| Column           | Type                | Key                     | Notes |
| ---------------- | ------------------- | ----------------------- | ----- |
| id               | bigint(20) unsigned | PK                      |       |
| run_id           | bigint(20) unsigned | FK → runs.id            |       |
| query_id         | bigint(20) unsigned | FK → ranking_queries.id |       |
| timestamp_utc    | datetime(3)         |                         |       |
| session_id       | varchar(64)         |                         |       |
| business_id      | bigint(20) unsigned | FK → businesses.id      |       |
| keyword          | varchar(255)        |                         |       |
| business_name    | varchar(255)        |                         |       |
| reason           | varchar(255)        |                         |       |
| ctr_ip_address   | varchar(45)         |                         |       |
| drive_ip_address | varchar(45)         |                         |       |
| origin           | varchar(255)        |                         |       |
| location_label   | varchar(255)        |                         |       |
| device           | varchar(64)         |                         |       |
| steps_json       | longtext            |                         |       |
| duration_min     | decimal(10,2)       |                         |       |
| events_json      | longtext            |                         |       |
| created_at       | timestamp           |                         |       |
| rank             | smallint(6)         |                         |       |

---

## **ranking_queries**

| Column           | Type                                       | Key                  | Notes |
| ---------------- | ------------------------------------------ | -------------------- | ----- |
| id               | bigint(20) unsigned                        | PK                   |       |
| run_id           | bigint(20) unsigned                        | FK → runs.id         |       |
| business_id      | bigint(20) unsigned                        | FK → businesses.id   |       |
| keyword          | varchar(255)                               |                      |       |
| source           | enum('google_places','serp')               |                      |       |
| variant          | enum('text','nearby','find_place','other') |                      |       |
| origin_zone_id   | bigint(20) unsigned                        | FK → origin_zones.id |       |
| origin_lat       | decimal(10,7)                              |                      |       |
| origin_lng       | decimal(10,7)                              |                      |       |
| radius_mi        | decimal(6,2)                               |                      |       |
| session_id       | varchar(64)                                |                      |       |
| request_id       | varchar(128)                               |                      |       |
| timestamp_utc    | datetime(3)                                |                      |       |
| local_date       | date                                       |                      |       |
| matched_position | int(11)                                    |                      |       |
| matched_place_id | varchar(128)                               |                      |       |
| matched_by       | enum('place_id','mid','name_addr','none')  |                      |       |
| created_at       | timestamp                                  |                      |       |

---

## **ranking_snapshots**

| Column           | Type                | Key                | Notes |
| ---------------- | ------------------- | ------------------ | ----- |
| id               | bigint(20) unsigned | PK                 |       |
| run_id           | bigint(20) unsigned | FK → runs.id       |       |
| business_id      | bigint(20) unsigned | FK → businesses.id |       |
| origin_lat       | decimal(10,7)       |                    |       |
| origin_lng       | decimal(10,7)       |                    |       |
| total_results    | int(11)             |                    |       |
| matched_place_id | varchar(128)        |                    |       |
| matched_position | int(11)             |                    |       |
| results_json     | longtext            |                    |       |
| created_at       | timestamp           |                    |       |

---

## **🧠 Relationships Summary**

organizations ─┬─< businesses ─┬─< geo_grid_runs ─┬─< geo_grid_points
│ ├─< runs ─┬─< run_logs
│ │ ├─< ranking_queries
│ │ └─< ranking_snapshots
│ ├─< origin_zones
│ ├─< soax_configs
│ └─< business_hours
└─< user_org_members >─ users

---

**Notes**

- All timestamps use UTC.
- JSON columns (`*_json`) are designed for flexible config and event storage.
- ENUMs are constrained to known operational states.
- Designed for multi-tenant usage via `organizations` and `user_org_members`.
