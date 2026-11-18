import { CATEGORIES, LGAS, DECLARATION, PRIVACY_CONSENT } from "./form-schema.js";
import { $, $$, h } from "./dom.js";

const root = $("#apply-root");
if (root) init();

function init() {
  let cat = null, busy = false, token = "", cfg = { turnstileSiteKey: null, captchaBypassed: false };
  const form = h("form", { class: "form", novalidate: true, id: "apply-form", "aria-label": "Membership application" });
  const summary = h("div", { class: "summary", tabindex: "-1" });
  const picker = h("fieldset", { class: "cat-picker" }, h("legend", { text: "1. Choose your membership category" }));
  const rest = h("div", { hidden: true });
  const details = h("fieldset", {}), catFields = h("fieldset", {}), decl = h("fieldset", {});
  const status = h("div", { role: "status", "aria-live": "polite", class: "small muted" });
  const submit = h("button", { class: "btn green", type: "submit", text: "Submit application" });
  const widget = h("div", { id: "turnstile" });
  const honey = h("div", { class: "hp", "aria-hidden": "true" }, h("label", { for: "website", text: "Leave this field empty" }), h("input", { id: "website", name: "website", type: "text", tabindex: "-1", autocomplete: "off" }));

  CATEGORIES.forEach((c) => picker.append(h("label", { class: "cat-option" },
    h("input", { type: "radio", name: "category", value: c.label, onchange: () => choose(c) }), h("div", {}, h("b", { text: c.label }), h("span", { text: c.summary })))));
  picker.append(h("div", { class: "err", id: "err-category", role: "alert" }));
  rest.append(details, catFields, decl);
  form.append(summary, picker, rest);
  root.replaceChildren(form);

  fetch("/api/config").then((r) => r.json()).then((c) => { cfg = c; setupCaptcha(); }).catch(() => {});

  function field(f, prefix = "f-") {
    const id = prefix + f.id, errEl = h("div", { class: "err", id: "err-" + f.id, role: "alert" });
    const lab = (text) => h("label", { for: id }, text, f.required ? h("span", { "aria-hidden": "true", text: " *" }) : null, f.help ? h("span", { class: "help", text: f.help }) : null);
    const wrap = (...k) => h("div", { class: "field", "data-field": f.id }, ...k, errEl);
    if (f.type === "checkbox") return wrap(h("label", { class: "check" }, h("input", { type: "checkbox", id, "aria-describedby": "err-" + f.id }), h("span", { text: f.label })));
    if (f.type === "checkboxes") return h("div", { class: "field", "data-field": f.id, role: "group", "aria-labelledby": id + "-l" },
      h("div", { class: "label", id: id + "-l" }, f.label, f.required ? " *" : "", f.help ? h("span", { class: "help", text: f.help }) : null),
      f.options.map((o) => h("label", { class: "check" }, h("input", { type: "checkbox", name: id, value: o }), h("span", { text: o }))), errEl);
    if (f.type === "select") return wrap(lab(f.label), h("select", { id, "aria-describedby": "err-" + f.id }, h("option", { value: "", text: "Choose\u2026" }), f.options.map((o) => h("option", { value: o, text: o }))));
    if (f.type === "textarea") return wrap(lab(f.label), h("textarea", { id, maxlength: f.max || 1000, rows: 4, "aria-describedby": "err-" + f.id }));
    const type = f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text";
    return wrap(lab(f.label), h("input", { id, type, maxlength: f.max || 200, autocomplete: f.auto || "off", inputmode: f.type === "tel" ? "tel" : null, "aria-describedby": "err-" + f.id }));
  }

  function choose(c) {
    cat = c; rest.hidden = false; clearErrors();
    const nameLabel = c.org ? "Organisation name" : "Full name";
    const common = [{ id: "applicantName", label: nameLabel, type: "text", required: true, max: 120, auto: c.org ? "organization" : "name" }];
    if (c.org) common.push({ id: "contactPerson", label: "Contact person", type: "text", required: true, max: 120, auto: "name" });
    common.push(
      { id: "email", label: "Email address", type: "email", required: true, auto: "email", help: "ASWRA will use this to contact you about your application." },
      { id: "phone", label: "Phone number", type: "tel", required: true, auto: "tel", help: "For example 08012345678." },
      { id: "address", label: c.org ? "Operational address" : "Residential or operational address", type: "textarea", required: true, max: 300 },
      { id: "lga", label: "Local Government Area", type: "select", required: true, options: LGAS });
    details.replaceChildren(h("legend", { text: "2. Your details" }), ...common.map((f) => field(f, "c-")));
    catFields.replaceChildren(h("legend", { text: c.org ? "3. About your organisation" : "3. About you" }), ...c.fields.map((f) => field(f)));
    decl.replaceChildren(h("legend", { text: "4. Declaration" }),
      field({ id: "declaration", label: DECLARATION, type: "checkbox", required: true }, "d-"),
      field({ id: "privacy", label: "", type: "checkbox", required: true }, "d-"),
      honey, widget,
      h("p", { class: "small muted", text: "Do not enter your NIN, bank details or any payment here. ASWRA will tell you if anything else is needed." }),
      submit, status);
    const pl = $("#d-privacy").closest(".check").querySelector("span");
    pl.replaceChildren(`${PRIVACY_CONSENT} `, h("a", { href: "privacy.html", target: "_blank", rel: "noopener", text: "Read the privacy notice" }), ".");
    setupCaptcha();
  }

  function setupCaptcha() {
    if (!cat || widget.dataset.ready) return;
    if (cfg.turnstileSiteKey) {
      widget.dataset.ready = "1";
      const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true;
      s.onload = () => window.turnstile.render(widget, { sitekey: cfg.turnstileSiteKey, callback: (t) => { token = t; }, "expired-callback": () => { token = ""; } });
      document.head.append(s);
    } else if (!cfg.captchaBypassed) {
      widget.replaceChildren(h("div", { class: "notice warn", text: "Online applications are temporarily unavailable because spam protection is not set up yet. Please contact the ASWRA secretariat." }));
      submit.disabled = true;
    }
  }

  const val = (id) => { const e = document.getElementById(id); return e ? e.value : ""; };
  function collect() {
    const formData = {};
    for (const f of cat.fields) {
      const id = "f-" + f.id;
      formData[f.id] = f.type === "checkbox" ? $("#" + id).checked : f.type === "checkboxes" ? $$(`input[name="${id}"]:checked`).map((x) => x.value) : val(id).trim();
    }
    return { category: cat.label, applicantName: val("c-applicantName").trim(), contactPerson: val("c-contactPerson").trim(), email: val("c-email").trim(), phone: val("c-phone").trim(),
      address: val("c-address").trim(), lga: val("c-lga"), formData, declaration: $("#d-declaration").checked, privacy: $("#d-privacy").checked, website: val("website"), turnstileToken: token };
  }

  function localErrors(p) {
    const e = {};
    if (p.applicantName.length < 2) e.applicantName = "Enter a name of at least 2 characters.";
    if (cat.org && p.contactPerson.length < 2) e.contactPerson = "Enter the name of the contact person.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email)) e.email = "Enter a valid email address.";
    if (!/^0[1-9]\d{9}$/.test(p.phone.replace(/[\s\-().]/g, "").replace(/^(\+234|234)/, "0"))) e.phone = "Enter a valid Nigerian phone number, for example 08012345678.";
    if (p.address.length < 5) e.address = "Enter your address.";
    if (!p.lga) e.lga = "Choose your Local Government Area.";
    for (const f of cat.fields) {
      const v = p.formData[f.id];
      if (f.required && (f.type === "checkbox" ? v !== true : Array.isArray(v) ? v.length === 0 : !v)) e[f.id] = f.type === "checkbox" ? "This confirmation is required." : "This field is required.";
    }
    if (!p.declaration) e.declaration = "You must accept the declaration to apply.";
    if (!p.privacy) e.privacy = "You must accept the privacy notice to apply.";
    return e;
  }

  function clearErrors() {
    summary.replaceChildren(); $$(".err", form).forEach((e) => { e.textContent = ""; });
    $$("[aria-invalid]", form).forEach((e) => e.removeAttribute("aria-invalid"));
  }
  const inputFor = (id) => document.getElementById("c-" + id) || document.getElementById("f-" + id) || document.getElementById("d-" + id) || $(`[data-field="${id}"] input`);
  function showErrors(errs, headline = "Please fix the following before submitting:") {
    clearErrors();
    const keys = Object.keys(errs); if (!keys.length) return;
    const list = h("ul", {});
    for (const k of keys) {
      const target = k === "category" ? $(".cat-option input") : inputFor(k), msg = errs[k];
      const slot = $("#err-" + k); if (slot) slot.textContent = msg;
      if (target) { target.setAttribute("aria-invalid", "true"); }
      list.append(h("li", {}, target ? h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); target.focus(); }, text: msg }) : msg));
    }
    summary.append(h("div", { class: "notice err", role: "alert" }, h("strong", { text: headline }), list));
    summary.focus(); summary.scrollIntoView({ block: "center" });
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (busy || !cat) { if (!cat) showErrors({ category: "Please choose a membership category." }); return; }
    const p = collect(), errs = localErrors(p);
    if (Object.keys(errs).length) return showErrors(errs);
    if (cfg.turnstileSiteKey && !token) return showErrors({ declaration: "Please complete the verification challenge before submitting." }, "One more step:");
    clearErrors(); busy = true; submit.disabled = true; submit.textContent = "Submitting\u2026"; form.setAttribute("aria-busy", "true"); status.textContent = "Sending your application, please wait\u2026";
    try {
      const res = await fetch("/api/applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201) return success(data.reference);
      if (res.status === 422 && data.fields) showErrors(data.fields);
      else summary.replaceChildren(h("div", { class: "notice " + (res.status === 429 || res.status === 409 ? "warn" : "err"), role: "alert", text: data.error || "Something went wrong. Please try again." }));
      if (window.turnstile) { try { window.turnstile.reset(); token = ""; } catch {} }
      summary.focus();
    } catch {
      summary.replaceChildren(h("div", { class: "notice err", role: "alert", text: "We could not reach the server. Check your connection and try again. Your answers are still on this page." }));
    } finally { busy = false; submit.disabled = !cfg.turnstileSiteKey && !cfg.captchaBypassed; submit.textContent = "Submit application"; form.removeAttribute("aria-busy"); status.textContent = ""; }
  });

  function success(ref) {
    const copy = h("button", { class: "btn outline-dark small", type: "button", text: "Copy reference", onclick: async () => { try { await navigator.clipboard.writeText(ref); copy.textContent = "Copied"; } catch { copy.textContent = "Select the reference and copy it"; } } });
    root.replaceChildren(h("div", { class: "form", role: "status", tabindex: "-1", id: "apply-done" },
      h("h2", { text: "Application received" }),
      h("p", { text: "Thank you. ASWRA has received your membership application. It is now Pending and will be reviewed. Receiving your application does not mean it has been approved." }),
      h("p", { text: "Your application reference is:" }), h("div", { class: "ref", text: ref }),
      h("p", { text: "Please keep this reference safe. You will need it to check your application status and for any enquiry to ASWRA." }),
      h("div", { class: "cta" }, copy, h("a", { class: "btn green small", href: `application-status/?ref=${encodeURIComponent(ref)}`, text: "Check application status" }))));
    $("#apply-done").focus();
  }
}
