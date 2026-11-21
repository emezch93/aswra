// Migration safety test: applies 0001, fills it with data, applies 0002 and proves nothing is lost or broken.
//   node tests/migration.mjs      (uses an isolated temporary local database; never touches production)
import { execSync } from "node:child_process";
import fs from "node:fs";
const DIR = ".wrangler/mig-state";
let pass = 0, fail = 0; const failures = [];
const check = (n, c, x = "") => { if (c) { pass++; console.log("  PASS", n); } else { fail++; failures.push(n); console.log("  FAIL", n, x); } };
const run = (args) => execSync(`npx wrangler d1 execute aswra-membership --local --persist-to ${DIR} ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } });
const file = (f) => run(`--file ${f}`);
const rows = (sql) => JSON.parse(run(`--json --command "${sql.replace(/"/g, '\\"')}"`))[0].results;
const fails = (sql) => { try { run(`--command "${sql.replace(/"/g, '\\"')}"`); return false; } catch { return true; } };

fs.rmSync(DIR, { recursive: true, force: true });
console.log("\n1. Build the OLD database (migration 0001) and fill it with data");
file("migrations/0001_initial_schema.sql");
fs.writeFileSync("/tmp/mig-seed.sql", `
INSERT INTO admin_users (email, password_hash) VALUES ('a@example.org','hash');
INSERT INTO applications (reference,category,applicant_name,email,phone,address,lga,form_data,declaration_accepted,privacy_accepted,dedupe_hash) VALUES
 ('ASWRA-2026-AAAAAAAAAAAA','Individual Recycler Members','Alpha One','a@x.com','08030000001','1 Road','Awka South','{}',1,1,'h1'),
 ('ASWRA-2026-BBBBBBBBBBBB','Cooperative Members','Beta Coop','b@x.com','08030000002','2 Road','Ihiala','{"k":"v"}',1,1,'h2');
INSERT INTO application_status_history (application_id,previous_status,new_status,change_type) VALUES (1,NULL,'Pending','submission'),(2,NULL,'Pending','submission');
INSERT INTO application_reviews (application_id,notes,recommendation,admin_id) VALUES (1,'private note','None',1);
INSERT INTO communication_logs (application_id,comm_type,recipient,subject,body,status,admin_id) VALUES (1,'approval','a@x.com','Subject A','Body A body A body A','Marked as Sent',1),(2,'rejection','b@x.com','Subject B','Body B body B body B','Prepared',1);
INSERT INTO audit_logs (admin_id,action) VALUES (1,'admin.login');
INSERT INTO rate_limits (key,window_start,count) VALUES ('stale-old-key',strftime('%s','now'),999),('another',strftime('%s','now'),50);
`);
file("/tmp/mig-seed.sql");
const tables = ["applications", "application_status_history", "application_reviews", "communication_logs", "audit_logs", "admin_users"];
const snap = () => Object.fromEntries(tables.map((t) => [t, JSON.stringify(rows(`SELECT * FROM ${t} ORDER BY id`))]));
const before = snap();
check("old database holds the seeded data", rows("SELECT COUNT(*) c FROM applications")[0].c === 2 && rows("SELECT COUNT(*) c FROM rate_limits")[0].c === 2);
check("old schema rejects the new communication type", fails("INSERT INTO communication_logs (application_id,comm_type,recipient,subject,body) VALUES (1,'acknowledgement','a','b','c')"));

console.log("\n2. Apply migration 0002");
file("migrations/0002_audit_fixes.sql"); const after = snap();
for (const t of tables) check(`${t}: every row is preserved exactly`, before[t] === after[t]);
check("stale rate limit counters are cleared", rows("SELECT COUNT(*) c FROM rate_limits")[0].c === 0);
check("communication table now accepts 'acknowledgement'", !fails("INSERT INTO communication_logs (application_id,comm_type,recipient,subject,body) VALUES (1,'acknowledgement','a@x.com','Ack','Acknowledgement body text')"));
check("communication table still rejects unknown types", fails("INSERT INTO communication_logs (application_id,comm_type,recipient,subject,body) VALUES (1,'bogus','a','b','c')"));
check("communication table still rejects an unknown status", fails("INSERT INTO communication_logs (application_id,comm_type,recipient,subject,body,status) VALUES (1,'approval','a','b','c','Delivered')"));
check("foreign keys still protect communications", fails("INSERT INTO communication_logs (application_id,comm_type,recipient,subject,body) VALUES (999,'approval','a','b','c')"));
check("no foreign key violations in the database", rows("PRAGMA foreign_key_check").length === 0);
const idx = rows("SELECT name FROM sqlite_master WHERE type='index'").map((r) => r.name);
check("indexes exist (idx_comm_app, idx_audit_action) and older ones survive", ["idx_comm_app", "idx_audit_action", "idx_app_status", "idx_history_app", "idx_single_admin"].every((n) => idx.includes(n)), idx.join());
check("append only protection is still active on history", fails("UPDATE application_status_history SET new_status='Approved' WHERE id=1"));
check("only one administrator can exist", fails("INSERT INTO admin_users (email,password_hash) VALUES ('b@example.org','h')"));
check("all eight core tables exist", ["admin_users", "admin_sessions", "applications", "application_reviews", "application_status_history", "communication_logs", "audit_logs", "rate_limits"].every((t) => rows(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).length === 1));

console.log("\n3. Re-running 0002 is safe (idempotent)");
file("migrations/0002_audit_fixes.sql");
check("rows are still intact after a second run", rows("SELECT COUNT(*) c FROM communication_logs")[0].c === 3 && rows("SELECT COUNT(*) c FROM applications")[0].c === 2);
check("still no foreign key violations", rows("PRAGMA foreign_key_check").length === 0);
fs.rmSync(DIR, { recursive: true, force: true });
console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
