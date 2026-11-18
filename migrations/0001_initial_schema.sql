-- ASWRA membership management: initial schema (Cloudflare D1 / SQLite)
-- Timestamps are UTC text: YYYY-MM-DD HH:MM:SS

CREATE TABLE admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
-- Database level guarantee: at most ONE administrator row can ever exist.
CREATE UNIQUE INDEX idx_single_admin ON admin_users ((1));

CREATE TABLE admin_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT NOT NULL UNIQUE,
  csrf_token   TEXT NOT NULL,
  admin_id     INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_hash      TEXT,
  user_agent   TEXT
);
CREATE INDEX idx_sessions_expires ON admin_sessions(expires_at);

CREATE TABLE applications (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  reference            TEXT NOT NULL UNIQUE,
  category             TEXT NOT NULL CHECK (category IN (
                         'Individual Recycler Members','Recycling Business Members','Cooperative Members',
                         'Institutional Members','Strategic and Corporate Partners')),
  applicant_name       TEXT NOT NULL,
  contact_person       TEXT,
  email                TEXT NOT NULL,
  phone                TEXT NOT NULL,
  address              TEXT NOT NULL,
  lga                  TEXT NOT NULL,
  form_data            TEXT NOT NULL CHECK (json_valid(form_data)),
  declaration_accepted INTEGER NOT NULL CHECK (declaration_accepted = 1),
  privacy_accepted     INTEGER NOT NULL CHECK (privacy_accepted = 1),
  status               TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN (
                         'Pending','Under Review','Requires Information','Recommended for Approval',
                         'Recommended for Rejection','Approved','Rejected')),
  public_message       TEXT,
  dedupe_hash          TEXT NOT NULL,
  submitted_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at           TEXT
);
CREATE INDEX idx_app_status    ON applications(status);
CREATE INDEX idx_app_category  ON applications(category);
CREATE INDEX idx_app_submitted ON applications(submitted_at);
CREATE INDEX idx_app_dedupe    ON applications(dedupe_hash, submitted_at);
CREATE INDEX idx_app_email     ON applications(email);

CREATE TABLE application_reviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  notes          TEXT NOT NULL,
  recommendation TEXT NOT NULL DEFAULT 'None' CHECK (recommendation IN ('None','Approve','Reject')),
  admin_id       INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reviews_app ON application_reviews(application_id);

CREATE TABLE application_status_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  previous_status TEXT,
  new_status     TEXT NOT NULL,
  change_type    TEXT NOT NULL CHECK (change_type IN ('submission','status','recommendation','decision')),
  internal_note  TEXT,
  public_message TEXT,
  admin_id       INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_history_app ON application_status_history(application_id);

CREATE TABLE communication_logs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id   INTEGER NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  comm_type        TEXT NOT NULL CHECK (comm_type IN ('approval','rejection','additional_information','under_review','receipt_confirmation','general_update','clarification')),
  recipient        TEXT NOT NULL,
  subject          TEXT NOT NULL,
  body             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'Prepared' CHECK (status IN ('Prepared','Marked as Sent')),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  sent_recorded_at TEXT,
  admin_id         INTEGER REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX idx_comm_app ON communication_logs(application_id);

CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  details     TEXT,
  ip_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- History and audit records are append only: they can never be edited or deleted.
CREATE TRIGGER trg_history_no_update BEFORE UPDATE OF application_id,previous_status,new_status,change_type,internal_note,public_message,created_at ON application_status_history BEGIN SELECT RAISE(ABORT,'status history is append only'); END;
CREATE TRIGGER trg_history_no_delete BEFORE DELETE ON application_status_history BEGIN SELECT RAISE(ABORT,'status history is append only'); END;
CREATE TRIGGER trg_audit_no_update   BEFORE UPDATE OF action,entity_type,entity_id,details,ip_hash,created_at ON audit_logs BEGIN SELECT RAISE(ABORT,'audit log is append only'); END;
CREATE TRIGGER trg_audit_no_delete   BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'audit log is append only'); END;
