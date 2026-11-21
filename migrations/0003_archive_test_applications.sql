-- Soft-archive the two explicitly identified test applications.
-- Application, review, status-history and communication records remain intact.
ALTER TABLE applications ADD COLUMN archived_at TEXT;

UPDATE applications
SET archived_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND reference = 'ASWRA-2026-H6W3MEPH0Y71'
  AND archived_at IS NULL;

UPDATE applications
SET archived_at = CURRENT_TIMESTAMP
WHERE id = 2
  AND reference = 'ASWRA-2026-YDJK82BF5VDM'
  AND archived_at IS NULL;
