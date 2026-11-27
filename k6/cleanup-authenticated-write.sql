-- Removes the rows created by k6/authenticated-write.js.
--   docker compose exec -T db psql -U qaryati -d qaryati < k6/cleanup-authenticated-write.sql
-- Landmarks first: they reference the sources.
DELETE FROM landmarks WHERE name LIKE 'K6-WRITE %';
DELETE FROM sources WHERE title LIKE 'K6-WRITE %';
