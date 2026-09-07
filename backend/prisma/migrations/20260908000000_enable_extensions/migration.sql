-- Two extensions the schema depends on later. They are enabled in the first
-- migration, before anything references them (PROJECT_SPEC.md §8.2).
--
--   pg_trgm     fuzzy matching for the global search (§6.3, B3.4).
--   btree_gist  required by the booking exclusion constraint (§6.2, B5.4). A
--               gist EXCLUDE that mixes equality on "assignedUserId" with an
--               overlap test on a time range cannot be created without it, and
--               the failure appears only when that migration runs.
--
-- Enabling them here rather than in the migration that needs them means the
-- dependency is satisfied on every environment, including a database restored
-- from a dump taken before B5.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
