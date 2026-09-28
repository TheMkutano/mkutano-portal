-- ============================================================================
-- Development data remediation: legacy engagement/task/user references
-- Date: 2026-08-26
-- ============================================================================
--
-- This records the approved cleanup needed before Drizzle can apply the
-- engagements.partner_id, tasks.workstream_id, and portal_users.auth_user_id
-- foreign keys in development.
-- The Drizzle schema is the source of truth for DDL.
--
-- Do NOT use this file as a production migration. Replit applies schema changes
-- to production through Publish. Before publishing these foreign keys, resolve
-- the corresponding production records through the supported application/admin
-- data flow.

BEGIN;

DELETE FROM engagements
WHERE id IN (
  '47d1e58b-2fdf-4873-ab29-8b99e09acef2',
  'e1a00fab-f1ee-44c4-bc00-0a01652b391e'
)
  AND partner_id = '';

DELETE FROM tasks
WHERE id = 'b360fe56-68d0-4f72-af31-1e89b1a8eaea'
  AND NOT EXISTS (
    SELECT 1
    FROM workstreams
    WHERE workstreams.id = tasks.workstream_id
  );

-- These fabricated team entries are not real Mkutano staff. Remove the one
-- stale audit event first because audit actor references are RESTRICTed.
DELETE FROM audit_logs
WHERE actor_user_id IN (
  SELECT id FROM portal_users WHERE auth_user_id LIKE 'seed-team-%'
);

DELETE FROM portal_users
WHERE auth_user_id LIKE 'seed-team-%';

DELETE FROM users
WHERE id LIKE 'seed-team-%';

-- Preserve the existing password-backed communications account while aligning
-- its roster identity with the real team address.
UPDATE users
SET email = 'comms@themkutano.com',
    first_name = 'Comms',
    last_name = NULL,
    updated_at = NOW()
WHERE id = 'info-auth-001'
  AND email = 'info@themkutano.com';

UPDATE portal_users
SET name = 'Comms',
    email = 'comms@themkutano.com'
WHERE auth_user_id = 'info-auth-001'
  AND email = 'info@themkutano.com';

COMMIT;