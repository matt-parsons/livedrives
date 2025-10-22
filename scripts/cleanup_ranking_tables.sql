-- Remove any ranking snapshots or queries that reference non-CTR runs.
DELETE FROM ranking_snapshots
WHERE run_id NOT IN (SELECT id FROM runs);

DELETE FROM ranking_queries
WHERE run_id NOT IN (SELECT id FROM runs);
