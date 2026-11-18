# Database Setup

Database: **Cloudflare D1** (SQLite). Binding name in code: `DB`. Migrations are in `migrations/`.

## Tables

| Table | Purpose |
|---|---|
| `applications` | One row per application: reference, category, contact details, `form_data` (JSON, validated), status, applicant facing message, timestamps. |
| `application_reviews` | Private review notes and recommendations (`None`, `Approve`, `Reject`). |
| `application_status_history` | Every status change, with internal note and applicant facing message. **Append only** (database triggers block edits and deletes). |
| `admin_users` | The single administrator. A unique expression index allows at most one row. Password stored as a PBKDF2 hash. |
| `admin_sessions` | Hashed session tokens, CSRF token, expiry (8 hours) and idle limit (2 hours). |
| `communication_logs` | Prepared and manually "Marked as Sent" email records. |
| `audit_logs` | Logins, failed logins, status changes, notes, decisions, communications. **Append only.** |
| `rate_limits` | Counters for login, application and status lookups. Cleaned up on each login. |

Relationships: reviews, history and communications reference `applications(id)` with `ON DELETE RESTRICT` (history can never be lost by deleting an application). Admin references use `ON DELETE SET NULL`. Constraints enforce valid statuses, categories, communication types and that declarations were accepted. Indexes cover status, category, submission date, email and duplicate checks.

## Local versus production

- **Local**: `npm run db:migrate:local` and `npm run dev`. Stored under `.wrangler/state/`. Safe to delete (`sh tests/reset-local.sh` resets it).
- **Production**: `npm run db:migrate:remote`. This is the real data. Never run test scripts against it (`tests/reset-local.sh` only touches local data).

## Future migrations

1. Add a new file with the next number, for example `migrations/0002_add_something.sql`. Never edit an applied migration.
2. Test locally: `npm run db:migrate:local`, then `sh tests/run-all.sh`.
3. Back up production (below), then `npm run db:migrate:remote`.

## Backup and recovery

- Export: `npx wrangler d1 export aswra-membership --remote --output backup-YYYY-MM-DD.sql`. Store backups in a private place controlled by ASWRA. They contain personal data.
- D1 also offers Time Travel point in time restore. Check Cloudflare's documentation for current retention on your plan.
- Restore: `npx wrangler d1 execute aswra-membership --remote --file backup-YYYY-MM-DD.sql` into an empty database.
- Recommended: export monthly and before every migration.

## Useful maintenance SQL (run with `wrangler d1 execute ... --remote --command "..."`)

Test applications cannot be deleted because their history is protected. Before launch use a fresh database instead (create a new D1 database, run the migration, bind it as `DB`).

Reset the administrator password if it is forgotten: delete the administrator row and run the setup procedure again.
```
DELETE FROM admin_users;
```
Then set `ADMIN_SETUP_TOKEN` again, run `npm run setup:admin`, and delete the token. (Sessions are removed automatically.)
