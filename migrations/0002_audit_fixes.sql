-- 0002: fixes found in the project audit. Safe to apply to a database that already contains data.
-- Applied once by `wrangler d1 migrations apply`. Every statement is also safe to repeat.

-- 1. Rate limit counters are disposable. The application limit scheme changed (see functions/api/applications.js),
--    so clear any counters created by the older scheme. This cannot affect applications, history or audit logs.
DELETE FROM rate_limits;

-- 2. Allow the communication type 'acknowledgement'. SQLite cannot change a CHECK constraint in place,
--    so the table is rebuilt and every existing row is copied across unchanged.
DROP TABLE IF EXISTS communication_logs_new;
CREATE TABLE communication_logs_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id   INTEGER NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  comm_type        TEXT NOT NULL CHECK (comm_type IN ('acknowledgement','approval','rejection','additional_information','under_review','receipt_confirmation','general_update','clarification')),
  recipient        TEXT NOT NULL,
  subject          TEXT NOT NULL,
  body             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'Prepared' CHECK (status IN ('Prepared','Marked as Sent')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  sent_recorded_at TEXT,
  admin_id         INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);
INSERT INTO communication_logs_new (id, application_id, comm_type, recipient, subject, body, status, created_at, sent_recorded_at, admin_id)
  SELECT id, application_id, comm_type, recipient, subject, body, status, created_at, sent_recorded_at, admin_id FROM communication_logs;
DROP TABLE communication_logs;
ALTER TABLE communication_logs_new RENAME TO communication_logs;
CREATE INDEX IF NOT EXISTS idx_comm_app ON communication_logs(application_id);

-- 3. Faster lookup of recent diagnostics entries.
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, id);
