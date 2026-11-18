import { $, h, fmtDate, statusBadge } from "./dom.js";

const EXPLAIN = {
  "Pending": "Your application has been received and is awaiting review.",
  "Under Review": "Your application is currently being examined by ASWRA.",
  "Requires Information": "ASWRA needs additional information from you before processing can continue.",
  "Recommended for Approval": "Your application has received a positive review recommendation and is awaiting the official decision.",
  "Recommended for Rejection": "Your application has received a negative review recommendation and is awaiting the official decision.",
  "Approved": "Your membership application has been officially approved.",
  "Rejected": "Your membership application was not approved.",
};

const form = $("#status-form"), input = $("#reference"), out = $("#status-result"), err = $("#reference-err"), btn = $("#status-btn");
let busy = false;

async function check(ref) {
  if (busy) return;
  err.textContent = ""; input.removeAttribute("aria-invalid"); out.replaceChildren();
  if (!/^ASWRA-\d{4}-[0-9A-Za-z]{12}$/.test(ref)) {
    err.textContent = "Enter your reference exactly as shown, for example ASWRA-2026-XXXXXXXXXXXX.";
    input.setAttribute("aria-invalid", "true"); input.focus(); return;
  }
  busy = true; btn.disabled = true; btn.textContent = "Checking\u2026";
  out.append(h("p", { class: "loading", role: "status", text: "Looking up your application\u2026" }));
  try {
    const res = await fetch(`/api/application-status?reference=${encodeURIComponent(ref)}`, { headers: { accept: "application/json" } });
    const data = await res.json().catch(() => ({}));
    out.replaceChildren();
    if (res.ok) {
      out.append(h("div", { class: "card status-box" },
        h("p", { class: "eyebrow", text: "Application status" }),
        statusBadge(data.status),
        h("h2", { text: data.status }),
        h("p", { text: EXPLAIN[data.status] || "" }),
        data.message ? h("div", { class: "notice" }, h("strong", { text: "Message from ASWRA" }), h("p", { text: data.message })) : null,
        h("p", { class: "small muted", text: `Last updated ${fmtDate(data.updatedAt)}` }),
        ["Recommended for Approval", "Recommended for Rejection"].includes(data.status)
          ? h("p", { class: "small muted", text: "A recommendation is not the official decision. You will be told when the decision is made." }) : null));
    } else {
      out.append(h("div", { class: "notice " + (res.status === 429 ? "warn" : "err"), role: "alert", text: data.error || "Something went wrong. Please try again." }));
    }
  } catch {
    out.replaceChildren(h("div", { class: "notice err", role: "alert", text: "We could not reach the server. Check your internet connection and try again." }));
  } finally { busy = false; btn.disabled = false; btn.textContent = "Check status"; }
}

form.addEventListener("submit", (e) => { e.preventDefault(); check(input.value.trim().toUpperCase()); });
const pre = new URLSearchParams(location.search).get("ref");
if (pre) { input.value = pre.toUpperCase(); check(input.value); }
