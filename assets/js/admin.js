import { CATEGORIES } from "./form-schema.js";
import { TEMPLATES, REJECTION_REASONS, reasonStarter, buildMessage, PLACEHOLDER, mailtoUrl } from "./admin-templates.js";
import { $, h, fmtDate, statusBadge } from "./dom.js";

const STATUSES = ["Pending", "Under Review", "Requires Information", "Recommended for Approval", "Recommended for Rejection", "Approved", "Rejected"];
const TRANSITIONS = {
  "Pending": ["Under Review", "Requires Information"],
  "Under Review": ["Requires Information", "Recommended for Approval", "Recommended for Rejection"],
  "Requires Information": ["Under Review"],
  "Recommended for Approval": ["Under Review", "Requires Information", "Recommended for Rejection"],
  "Recommended for Rejection": ["Under Review", "Requires Information", "Recommended for Approval"],
};
const DECISION_FROM = ["Under Review", "Recommended for Approval", "Recommended for Rejection"];
const FINAL = ["Approved", "Rejected"];
const TYPE_FOR_STATUS = { "Pending": "acknowledgement", "Approved": "approval", "Rejected": "rejection", "Requires Information": "additional_information", "Under Review": "under_review" };

const root = $("#app");
// Opens the email app. (window.__testNavigate is only used by automated tests.)
const openMail = (url) => { if (typeof window.__testNavigate === "function") window.__testNavigate(url); else location.href = url; };
let csrf = "", adminEmail = "";
const filters = { q: "", status: "", category: "", sort: "submitted", dir: "desc", page: 1 };

/* ---------- helpers ---------- */
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch("/api/admin" + path, {
    method, credentials: "same-origin",
    headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...(method !== "GET" ? { "x-csrf-token": csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/login") { showLogin("Your session has ended. Please sign in again."); throw Object.assign(new Error("auth"), { auth: true }); }
  if (!res.ok) throw Object.assign(new Error(data.error || "The request failed."), { status: res.status, data });
  return data;
}
function toast(msg, kind = "ok") {
  const t = h("div", { class: `toast ${kind}`, role: kind === "err" ? "alert" : "status", text: msg });
  $("#toast").append(t); setTimeout(() => t.remove(), 7000);
}
const notice = (msg, kind = "err") => h("div", { class: `notice ${kind}`, role: "alert", text: msg });
const select = (name, options, value, label = (x) => x) => h("select", { name }, options.map((o) => h("option", { value: o, text: label(o), selected: o === value })));
const labelled = (text, control, help, tone) => h("div", { class: "field" }, h("label", {}, text, tone ? h("span", { class: `tone ${tone}`, text: tone === "private" ? "Private" : tone === "public" ? "Shown to applicant" : "Email" }) : null, help ? h("span", { class: "help", text: help }) : null), control);
const busyBtn = async (btn, fn) => { const t = btn.textContent; btn.disabled = true; btn.textContent = "Please wait\u2026"; try { await fn(); } finally { btn.disabled = false; btn.textContent = t; } };

/* ---------- login ---------- */
function showLogin(message) {
  csrf = "";
  const err = h("div", {}), email = h("input", { id: "em", type: "email", required: true, autocomplete: "username" }), pw = h("input", { id: "pw", type: "password", required: true, autocomplete: "current-password" });
  const btn = h("button", { class: "btn green", type: "submit", text: "Sign in" });
  const form = h("form", { class: "form login", onsubmit: (e) => { e.preventDefault(); busyBtn(btn, async () => {
    err.replaceChildren();
    try { const d = await api("/login", { method: "POST", body: { email: email.value.trim(), password: pw.value } }); csrf = d.csrfToken; adminEmail = d.email; pw.value = ""; route(); }
    catch (x) { if (!x.auth) err.replaceChildren(notice(x.message)); }
  }); } },
    h("h1", { text: "ASWRA membership admin" }), h("p", { class: "muted", text: "Authorised administrator only." }), message ? notice(message, "warn") : null, err,
    h("div", { class: "field" }, h("label", { for: "em", text: "Email" }), email), h("div", { class: "field" }, h("label", { for: "pw", text: "Password" }), pw), btn);
  root.replaceChildren(h("main", { class: "login-wrap" }, form)); email.focus();
}

function topbar() {
  return h("header", { class: "admin-top" }, h("div", { class: "admin-bar" },
    h("a", { class: "admin-brand", href: "#", text: "ASWRA Membership Admin" }),
    h("div", { class: "admin-user" }, h("span", { class: "small", text: adminEmail }),
      h("button", { class: "btn outline small", type: "button", text: "Log out", onclick: async () => { try { await api("/logout", { method: "POST" }); } catch {} showLogin("You have been signed out."); } }))));
}


/* ---------- system check (spam protection diagnostics) ---------- */
function systemCheck() {
  const box = h("div", { class: "sys-body" }, h("p", { class: "muted small", text: "Open this section to check the spam protection settings." }));
  const wrap = h("details", { class: "card sys", ontoggle: (e) => { if (e.target.open) load(); } }, h("summary", { text: "System check: spam protection (Turnstile)" }), box);
  const yn = (v) => (v ? "Yes" : "No");
  async function load() {
    box.replaceChildren(h("p", { class: "loading", role: "status", text: "Checking\u2026" }));
    try {
      const d = await api("/diagnostics"), tsv = d.turnstile, probeOut = h("div", { role: "status" });
      const probe = h("button", { class: "btn outline-dark small", type: "button", text: "Ask Cloudflare to check the secret key", onclick: (e) => busyBtn(e.target, async () => {
        try {
          const r = await api("/diagnostics", { method: "POST" });
          const msg = { secret_accepted: ["ok", "Cloudflare accepted the secret key. (This cannot prove the site key belongs to the same widget. Check that in the Turnstile dashboard.)"], secret_rejected: ["err", "Cloudflare REJECTED the secret key. Copy the secret key again from the Turnstile widget settings."], no_secret: ["err", "No secret key is configured for this environment."], unreachable: ["warn", "Cloudflare could not be reached. Try again."] }[r.result];
          probeOut.replaceChildren(notice(msg[1], msg[0]));
        } catch (x) { if (!x.auth) probeOut.replaceChildren(notice(x.message)); }
      }) });
      box.replaceChildren(
        dl([["Site key set", yn(tsv.siteKeyConfigured)], ["Secret key set", yn(tsv.secretConfigured)], ["Server host name", tsv.serverHostname], ["Local development bypass", yn(tsv.bypassedForLocalDevelopment)], ["App secret set", yn(d.appSecretConfigured)]]),
        d.warnings.length ? h("div", { class: "notice warn" }, h("strong", { text: "Things to fix" }), h("ul", {}, d.warnings.map((w) => h("li", { text: w })))) : notice("No configuration problems detected.", "ok"),
        h("div", { class: "cta" }, probe), probeOut,
        h("h3", { text: "Verification failures in the last 24 hours" }),
        Object.keys(d.failuresLast24Hours).length ? h("p", { class: "small", text: Object.entries(d.failuresLast24Hours).map(([k, v]) => `${k}: ${v}`).join(" \u00b7 ") }) : null,
        h("h3", { text: "Most recent failures" }),
        d.recentFailures.length ? h("ul", { class: "small" }, d.recentFailures.map((f) => h("li", { text: `${fmtDate(f.at)}: ${f.reason}${f.codes && f.codes.length ? ` (${f.codes.join(", ")})` : ""}${f.hostname ? ` on ${f.hostname}` : ""}` }))) : h("p", { class: "muted small", text: "None recorded." }),
        h("p", { class: "small muted", text: "Reasons: expired = the visitor waited too long or reused a check; invalid = the check was not accepted; misconfigured = the secret key is wrong; unavailable = Cloudflare could not be reached." }));
    } catch (e) { if (!e.auth) box.replaceChildren(notice(e.message)); }
  }
  return wrap;
}

/* ---------- application list ---------- */
async function renderList() {
  const stats = h("section", { class: "stats", "aria-label": "Summary" }, h("p", { class: "loading", text: "Loading summary\u2026" }));
  const tableBox = h("div", {}), pager = h("div", { class: "pager" });
  let timer;
  const q = h("input", { type: "search", placeholder: "Search name, reference, email, phone or LGA", value: filters.q, "aria-label": "Search applications", oninput: (e) => { clearTimeout(timer); timer = setTimeout(() => { filters.q = e.target.value; filters.page = 1; load(); }, 300); } });
  const st = h("select", { "aria-label": "Filter by status", onchange: (e) => { filters.status = e.target.value; filters.page = 1; load(); } }, h("option", { value: "", text: "All statuses" }), STATUSES.map((s) => h("option", { value: s, text: s, selected: s === filters.status })));
  const ct = h("select", { "aria-label": "Filter by category", onchange: (e) => { filters.category = e.target.value; filters.page = 1; load(); } }, h("option", { value: "", text: "All categories" }), CATEGORIES.map((c) => h("option", { value: c.label, text: c.label, selected: c.label === filters.category })));
  const SORTS = { "submitted-desc": "Newest first", "submitted-asc": "Oldest first", "name-asc": "Name A to Z", "name-desc": "Name Z to A", "status-asc": "Status", "reference-asc": "Reference" };
  const so = h("select", { "aria-label": "Sort applications", onchange: (e) => { [filters.sort, filters.dir] = e.target.value.split("-"); load(); } }, Object.entries(SORTS).map(([v, l]) => h("option", { value: v, text: l, selected: v === `${filters.sort}-${filters.dir}` })));
  const clear = h("button", { class: "btn outline-dark small", type: "button", text: "Clear filters", onclick: () => { Object.assign(filters, { q: "", status: "", category: "", sort: "submitted", dir: "desc", page: 1 }); renderList(); } });
  root.replaceChildren(topbar(), h("main", { class: "admin-main" }, h("h1", { text: "Applications" }), stats, systemCheck(), h("div", { class: "filters" }, q, st, ct, so, clear), tableBox, pager));

  api("/dashboard").then((d) => {
    const card = (label, n, cls = "") => h("button", { class: `stat ${cls}`, type: "button", onclick: () => { filters.status = label === "Total" ? "" : label; filters.page = 1; renderList(); } }, h("b", { text: String(n) }), h("span", { text: label }));
    const b = d.byStatus;
    stats.replaceChildren(card("Total", d.total), card("Pending", b["Pending"]), card("Under Review", b["Under Review"]), card("Requires Information", b["Requires Information"]), card("Approved", b["Approved"], "good"), card("Rejected", b["Rejected"], "bad"),
      h("p", { class: "small muted wide", text: `Awaiting official decision: ${b["Recommended for Approval"]} recommended for approval, ${b["Recommended for Rejection"]} recommended for rejection.` }));
  }).catch((e) => { if (!e.auth) stats.replaceChildren(notice(e.message)); });

  async function load() {
    tableBox.replaceChildren(h("p", { class: "loading", role: "status", text: "Loading applications\u2026" })); pager.replaceChildren();
    const p = new URLSearchParams({ ...filters, pageSize: 20 }); for (const [k, v] of [...p]) if (v === "") p.delete(k);
    try {
      const d = await api("/applications?" + p);
      if (!d.items.length) { tableBox.replaceChildren(h("div", { class: "empty" }, h("p", { text: filters.q || filters.status || filters.category ? "No applications match your search or filters." : "No applications have been submitted yet." }))); return; }
      const th = (t) => h("th", { scope: "col", text: t });
      tableBox.replaceChildren(h("table", { class: "tbl" }, h("thead", {}, h("tr", {}, th("Reference"), th("Applicant"), th("Category"), th("Submitted"), th("Status"), th("Action"))),
        h("tbody", {}, d.items.map((a) => h("tr", {},
          h("td", { "data-label": "Reference", class: "mono", text: a.reference }), h("td", { "data-label": "Applicant", text: a.name }), h("td", { "data-label": "Category", text: a.category }),
          h("td", { "data-label": "Submitted", text: fmtDate(a.submittedAt, false) }), h("td", { "data-label": "Status" }, statusBadge(a.status)),
          h("td", { "data-label": "Action" }, h("a", { class: "btn green small", href: `#application-${a.id}`, "aria-label": `View ${a.name}`, text: "View" })))))));
      pager.replaceChildren(h("button", { class: "btn outline-dark small", type: "button", text: "Previous", disabled: d.page <= 1, onclick: () => { filters.page--; load(); } }),
        h("span", { class: "small", text: `Page ${d.page} of ${d.pages} \u00b7 ${d.total} application${d.total === 1 ? "" : "s"}` }),
        h("button", { class: "btn outline-dark small", type: "button", text: "Next", disabled: d.page >= d.pages, onclick: () => { filters.page++; load(); } }));
    } catch (e) { if (!e.auth) tableBox.replaceChildren(notice(e.message), h("button", { class: "btn small", type: "button", text: "Try again", onclick: load })); }
  }
  load();
}

/* ---------- application detail ---------- */
const dl = (rows) => h("dl", { class: "dl" }, rows.filter((r) => r).map(([k, v]) => [h("dt", { text: k }), h("dd", {}, v == null || v === "" ? h("span", { class: "muted", text: "Not provided" }) : v)]));

async function renderDetail(id) {
  root.replaceChildren(topbar(), h("main", { class: "admin-main" }, h("p", { class: "loading", role: "status", text: "Loading application\u2026" })));
  let d;
  try { d = await api(`/applications/${id}`); }
  catch (e) { if (!e.auth) root.replaceChildren(topbar(), h("main", { class: "admin-main" }, notice(e.message), h("p", {}, h("a", { href: "#", text: "Back to applications" })))); return; }
  draw(d);
}

function draw(d) {
  const a = d.application, y = scrollY, reload = async () => { const nd = await api(`/applications/${a.id}`); draw(nd); scrollTo(0, y); };
  const cat = CATEGORIES.find((c) => c.label === a.category);
  const info = cat ? cat.fields.map((f) => { const v = a.formData[f.id]; return [f.type === "checkbox" ? f.label : f.label, f.type === "checkbox" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : v]; }) : [];

  const form = (title, tone, ...kids) => h("section", { class: "card" }, h("h2", { text: title }), ...kids);
  const run = (btn, errBox, fn) => busyBtn(btn, async () => { errBox.replaceChildren(); try { await fn(); } catch (e) { if (!e.auth) errBox.replaceChildren(notice(e.message)); } });

  // Status
  const sErr = h("div", {});
  let statusCard;
  if (FINAL.includes(a.status)) statusCard = form("Status", "", h("p", {}, "Current status: ", statusBadge(a.status)), notice("An official decision has been recorded. The status can no longer be changed.", "ok"));
  else {
    const allowed = TRANSITIONS[a.status] || [], sel = select("status", allowed, allowed[0]), note = h("textarea", { name: "internalNote", rows: 3 }), msg = h("textarea", { name: "publicMessage", rows: 3 });
    const btn = h("button", { class: "btn green", type: "submit", text: "Update status" });
    statusCard = form("Update status", "", h("p", {}, "Current status: ", statusBadge(a.status)),
      h("form", { onsubmit: (e) => { e.preventDefault(); run(btn, sErr, async () => { await api(`/applications/${a.id}/status`, { method: "PATCH", body: { status: sel.value, internalNote: note.value, publicMessage: msg.value } }); toast("Status updated."); await reload(); }); } },
        labelled("New status", sel), labelled("Internal note", note, "Only you can see this.", "private"),
        labelled("Message for the applicant status page", msg, "Appears on the public status page when the applicant enters their reference. Required when requesting information. Leave empty to show no message.", "public"), btn), sErr);
  }

  // Review note and recommendation
  const rErr = h("div", {}), rNote = h("textarea", { name: "notes", rows: 3 }), rMsg = h("textarea", { rows: 2 });
  const rRec = select("rec", ["None", "Approve", "Reject"], "None", (x) => ({ None: "No recommendation (note only)", Approve: "Recommend approval", Reject: "Recommend rejection" }[x]));
  const rBtn = h("button", { class: "btn green", type: "submit", text: "Save note" });
  const reviewCard = form("Review note and recommendation", "", h("p", { class: "small muted", text: "A recommendation is not a decision. It only moves the status to \"Recommended for ...\". The application must be Under Review first." }),
    h("form", { onsubmit: (e) => { e.preventDefault(); run(rBtn, rErr, async () => { await api(`/applications/${a.id}/reviews`, { method: "POST", body: { notes: rNote.value, recommendation: rRec.value, publicMessage: rMsg.value } }); toast("Review note saved."); await reload(); }); } },
      labelled("Private review note", rNote, "Required.", "private"), labelled("Recommendation", rRec),
      labelled("Message for the applicant status page (optional)", rMsg, "Only used when you record a recommendation.", "public"), rBtn), rErr);

  // Official decision
  let decisionCard = null;
  if (DECISION_FROM.includes(a.status)) {
    const dErr = h("div", {}), dec = select("decision", ["Approved", "Rejected"], "Approved", (x) => (x === "Approved" ? "Approve this application" : "Reject this application"));
    const reason = select("reason", ["", ...REJECTION_REASONS], "", (x) => x || "Choose a reason category\u2026"), note = h("textarea", { rows: 3 }), pub = h("textarea", { rows: 3 });
    const rejectOnly = h("div", { hidden: true }, labelled("Reason category", reason, "A rejection must always give a specific reason."));
    reason.addEventListener("change", () => { if (!note.value.trim() || REJECTION_REASONS.some((r) => note.value.trim() === reasonStarter(r).trim())) note.value = reasonStarter(reason.value); });
    dec.addEventListener("change", () => { rejectOnly.hidden = dec.value !== "Rejected"; });
    const btn = h("button", { class: "btn", type: "submit", text: "Record official decision" });
    decisionCard = form("Official decision", "", h("p", { class: "small muted", text: "Only this action makes an application Approved or Rejected. It is final and cannot be undone." }),
      h("form", { onsubmit: (e) => { e.preventDefault();
        if (!confirm(`Record an OFFICIAL decision: ${dec.value.toUpperCase()} for ${a.applicantName}?\n\nThis is final and cannot be changed.`)) return;
        run(btn, dErr, async () => { await api(`/applications/${a.id}/decision`, { method: "POST", body: { decision: dec.value, confirmed: true, reasonCategory: dec.value === "Rejected" ? reason.value : "", internalNote: note.value, publicMessage: pub.value } }); toast(`Decision recorded: ${dec.value}.`); await reload(); }); } },
        labelled("Decision", dec), rejectOnly, labelled("Internal explanation", note, "Required for a rejection.", "private"),
        labelled("Message for the applicant status page", pub, "Optional. For a rejection, consider explaining the reason here.", "public"), btn), dErr);
  }

  // Email composer
  const cErr = h("div", {}), typeSel = select("type", Object.keys(TEMPLATES), TYPE_FOR_STATUS[a.status] || "general_update", (k) => TEMPLATES[k].label);
  const detailWrap = h("div", {}), subject = h("input", { type: "text", id: "subject" }), body = h("textarea", { rows: 14, id: "body" }), preview = h("pre", { class: "preview", hidden: true }), detailBox = h("textarea", { rows: 3 });
  const reasonSel = select("reason", ["", ...REJECTION_REASONS], "", (x) => x || "Choose a reason category\u2026");
  const generate = () => { const t = TEMPLATES[typeSel.value], m = buildMessage(typeSel.value, { name: a.applicantName, reference: a.reference, detail: detailBox.value }); subject.value = m.subject; body.value = m.body; };
  const drawDetail = () => { const t = TEMPLATES[typeSel.value]; detailWrap.replaceChildren();
    if (t.detail) { detailWrap.append(...[t.detail.reasons ? labelled("Reason category", reasonSel) : null, labelled(t.detail.label, detailBox, t.detail.help, "email"), h("button", { class: "btn outline-dark small", type: "button", text: "Put this into the message", onclick: generate })].filter(Boolean)); detailBox.value = ""; reasonSel.value = ""; } };
  reasonSel.addEventListener("change", () => { detailBox.value = reasonStarter(reasonSel.value); });
  typeSel.addEventListener("change", () => { drawDetail(); generate(); preview.hidden = true; });
  drawDetail(); generate();
  const save = async (open) => {
    cErr.replaceChildren();
    if (PLACEHOLDER.test(subject.value + body.value)) return cErr.append(notice("The message still contains a template placeholder in [square brackets]. Fill in the details above or edit the message before saving."));
    if (body.value.trim().length < 20 || subject.value.trim().length < 3) return cErr.append(notice("Write a subject and a message first."));
    const r = await api(`/applications/${a.id}/communications`, { method: "POST", body: { type: typeSel.value, subject: subject.value, body: body.value } });
    toast("Saved as Prepared. Nothing has been sent.");
    if (open) openMail(mailtoUrl(a.email, subject.value, body.value));
    await reload();
  };
  const pBtn = h("button", { class: "btn outline-dark", type: "button", text: "Preview", onclick: () => { preview.hidden = !preview.hidden; preview.textContent = `To: ${a.email}\nSubject: ${subject.value}\n\n${body.value}`; } });
  const sBtn = h("button", { class: "btn green", type: "button", text: "Save and open email", onclick: () => run(sBtn, cErr, () => save(true)) });
  const dBtn = h("button", { class: "btn outline-dark", type: "button", text: "Save as prepared only", onclick: () => run(dBtn, cErr, () => save(false)) });
  const composer = form("Email to the applicant", "", h("p", { class: "small muted" }, "To: ", h("strong", { text: a.email })),
    h("div", { class: "notice" }, h("strong", { text: "How this works. " }), "This system never sends email. \"Save and open email\" records the message and opens your email app with it ready. Your device needs an email app set up, such as Gmail or Mail. If it does not open, use \"Copy message\" in the list below and paste it into your email. After you send the email yourself, click \"Mark as sent\"."),
    labelled("Message type", typeSel), detailWrap, labelled("Subject", subject, null, "email"), labelled("Message (you can edit it)", body, null, "email"), preview,
    h("div", { class: "cta" }, pBtn, dBtn, sBtn), cErr);

  // Communication records
  const copyText = async (txt) => { try { await navigator.clipboard.writeText(txt); toast("Message copied."); } catch { const t = h("textarea", { value: txt }); document.body.append(t); t.select(); try { document.execCommand("copy"); toast("Message copied."); } catch { toast("Could not copy. Select the text and copy it manually.", "err"); } t.remove(); } };
  const comms = form("Communication records", "", h("p", { class: "small muted", text: "\"Marked as sent\" is your own manual record. It is not proof that the email was delivered." }),
    d.communications.length ? d.communications.map((c) => h("div", { class: "comm" },
      h("div", { class: "comm-top" }, h("strong", { text: TEMPLATES[c.comm_type]?.label || c.comm_type }), h("span", { class: `badge ${c.status === "Prepared" ? "st-requires-information" : "st-approved"}`, text: c.status })),
      h("p", { class: "small" }, `To ${c.recipient} \u00b7 prepared ${fmtDate(c.created_at)}`, c.sent_recorded_at ? ` \u00b7 recorded as sent ${fmtDate(c.sent_recorded_at)}` : ""),
      h("p", { class: "small" }, h("strong", { text: "Subject: " }), c.subject),
      h("details", {}, h("summary", { text: "Show message" }), h("pre", { class: "preview", text: c.body })),
      h("div", { class: "cta" },
        h("button", { class: "btn outline-dark small", type: "button", text: "Open email", onclick: () => openMail(mailtoUrl(c.recipient, c.subject, c.body)) }),
        h("button", { class: "btn outline-dark small", type: "button", text: "Copy message", onclick: () => copyText(`To: ${c.recipient}\nSubject: ${c.subject}\n\n${c.body}`) }),
        c.status === "Prepared" ? h("button", { class: "btn green small", type: "button", text: "Mark as sent", onclick: async (e) => { if (!confirm("Only mark this as sent after you have actually sent the email from your email app. Continue?")) return; await busyBtn(e.target, async () => { try { await api(`/communications/${c.id}`, { method: "PATCH", body: { status: "Marked as Sent" } }); toast("Recorded as sent."); await reload(); } catch (x) { if (!x.auth) toast(x.message, "err"); } }); } }) : null))) : h("p", { class: "muted", text: "No messages prepared yet." }));

  // History timeline
  const items = [
    ...d.history.map((x) => ({ at: x.created_at, k: `h${x.id}`, node: h("li", {},
      h("div", { class: "tl-top" }, h("strong", { text: x.change_type === "submission" ? "Application submitted" : x.change_type === "decision" ? `Official decision: ${x.new_status}` : x.change_type === "recommendation" ? `Recommendation: ${x.new_status}` : `Status changed: ${x.previous_status} \u2192 ${x.new_status}` }), h("span", { class: "small muted", text: fmtDate(x.created_at) })),
      x.internal_note ? h("p", { class: "small" }, h("span", { class: "tone private", text: "Private" }), x.internal_note) : null,
      x.public_message ? h("p", { class: "small" }, h("span", { class: "tone public", text: "Shown to applicant" }), x.public_message) : null) })),
    ...d.reviews.map((x) => ({ at: x.created_at, k: `r${x.id}`, node: h("li", {},
      h("div", { class: "tl-top" }, h("strong", { text: "Review note" + (x.recommendation !== "None" ? ` (recommended: ${x.recommendation})` : "") }), h("span", { class: "small muted", text: fmtDate(x.created_at) })),
      h("p", { class: "small" }, h("span", { class: "tone private", text: "Private" }), x.notes)) })),
  ].sort((p, q) => (p.at < q.at ? 1 : p.at > q.at ? -1 : p.k < q.k ? 1 : -1));
  const history = form("History", "", h("ol", { class: "timeline" }, items.map((i) => i.node)));

  const left = h("div", { class: "col" },
    form("Applicant", "", dl([["Name", a.applicantName], a.contactPerson ? ["Contact person", a.contactPerson] : null, ["Email", a.email], ["Phone", a.phone], ["Address", a.address], ["LGA", a.lga], ["Category", a.category], ["Submitted", fmtDate(a.submittedAt)], ["Last updated", fmtDate(a.updatedAt)], a.decidedAt ? ["Decision recorded", fmtDate(a.decidedAt)] : null])),
    form("Application details", "", dl(info)),
    form("Declarations", "", dl([["Declaration accepted", a.declarationAccepted ? "Yes" : "No"], ["Privacy notice accepted", a.privacyAccepted ? "Yes" : "No"]])),
    a.publicMessage ? form("Currently shown to applicant", "", h("p", { text: a.publicMessage })) : null);
  const right = h("div", { class: "col" }, statusCard, reviewCard, decisionCard);
  root.replaceChildren(topbar(), h("main", { class: "admin-main" },
    h("p", {}, h("a", { href: "#", text: "\u2190 Back to all applications" })),
    h("div", { class: "detail-head" }, h("div", {}, h("h1", { text: a.applicantName }), h("p", { class: "mono", text: a.reference })), statusBadge(a.status)),
    h("div", { class: "detail-grid" }, left, right), composer, comms, history));
}

/* ---------- routing ---------- */
function route() {
  if (!csrf) return;
  const m = /^#application-(\d{1,9})$/.exec(location.hash);
  if (m) renderDetail(m[1]); else renderList();
}
addEventListener("hashchange", route);
(async function boot() {
  try {
    const s = await (await fetch("/api/admin/session", { credentials: "same-origin" })).json();
    if (s.authenticated) { csrf = s.csrfToken; adminEmail = s.email; route(); } else showLogin();
  } catch { root.replaceChildren(h("main", { class: "login-wrap" }, notice("Could not reach the server. Check your connection and refresh."))); }
})();
