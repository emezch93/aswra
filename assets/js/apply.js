import { CATEGORIES, LGAS, DECLARATION, PRIVACY_CONSENT } from "./form-schema.js";
import { $, $$, h } from "./dom.js";

const root = $("#apply-root");
if (root) init();

function init() {
  let cat = null, busy = false, token = "", cfg = null, widgetId = null, scriptLoading = null;
  const form = h("form", { class: "form", novalidate: true, id: "apply-form", "aria-label": "Membership application" });
  const summary = h("div", { class: "summary", tabindex: "-1" });
  const picker = h("fieldset", { class: "cat-picker" }, h("legend", { text: "1. Choose your membership category" }));
  const rest = h("div", { hidden: true });
  const details = h("fieldset", {}), catFields = h("fieldset", {}), decl = h("fieldset", {});
  const status = h("div", { role: "status", "aria-live": "polite", class: "small muted" });
  const submit = h("button", { class: "btn green", type: "submit", text: "Submit application" });
  const widget = h("div", { id: "turnstile" });
  const captchaErr = h("div", { class: "err", id: "err-turnstile", role: "alert" });
  const honey = h("div", { class: "hp", "aria-hidden": "true" }, h("label", { for: "website", text: "Leave this field empty" }), h("input", { id: "website", name: "website", type: "text", tabindex: "-1", autocomplete: "off" }));

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

  // The declaration block is built ONCE. The verification widget lives inside it and is never moved or rebuilt,
  // because moving a rendered Turnstile iframe reloads it and invalidates its token.
  decl.append(h("legend", { text: "4. Declaration" }), field({ id: "declaration", label: DECLARATION, type: "checkbox", required: true }, "d-"), field({ id: "privacy", label: "", type: "checkbox", required: true }, "d-"),
    honey, h("div", { class: "field", id: "captcha-box" }, h("div", { class: "label", text: "Security check *" }), widget, captchaErr),
    h("p", { class: "small muted", text: "Do not enter your NIN, bank details or any payment here. The ASWRA administrator will tell you if anything else is needed." }), submit, status);
  $("span", $("#d-privacy", decl).closest(".check")).replaceChildren(`${PRIVACY_CONSENT} `, h("a", { href: "privacy.html", target: "_blank", rel: "noopener", text: "Read the privacy notice" }), ".");

  CATEGORIES.forEach((c) => picker.append(h("label", { class: "cat-option" },
    h("input", { type: "radio", name: "category", value: c.label, onchange: () => choose(c) }), h("div", {}, h("b", { text: c.label }), h("span", { text: c.summary })))));
  picker.append(h("div", { class: "err", id: "err-category", role: "alert" }));
  rest.append(details, catFields, decl);
  form.append(summary, picker, rest);
  root.replaceChildren(form);

  fetch("/api/config").then((r) => r.json()).then((c) => { cfg = c; prepareCaptcha(); }).catch(() => { cfg = { turnstileSiteKey: null, captchaBypassed: false, failed: true }; prepareCaptcha(); });

  function choose(c) {
    const keep = {}; $$("#apply-form [id^='c-']").forEach((e) => { keep[e.id] = e.value; }); // do not lose what was already typed
    cat = c; rest.hidden = false; clearErrors();
    const common = [{ id: "applicantName", label: c.org ? "Organisation name" : "Full name", type: "text", required: true, max: 120, auto: c.org ? "organization" : "name" }];
    if (c.org) common.push({ id: "contactPerson", label: "Contact person", type: "text", required: true, max: 120, auto: "name" });
    common.push(
      { id: "email", label: "Email address", type: "email", required: true, auto: "email", help: "ASWRA will use this to contact you about your application." },
      { id: "phone", label: "Phone number", type: "tel", required: true, auto: "tel", help: "For example 08012345678." },
      { id: "address", label: c.org ? "Operational address" : "Residential or operational address", type: "textarea", required: true, max: 300 },
      { id: "lga", label: "Local Government Area", type: "select", required: true, options: LGAS });
    details.replaceChildren(h("legend", { text: "2. Your details" }), ...common.map((f) => field(f, "c-")));
    for (const [id, v] of Object.entries(keep)) { const e = document.getElementById(id); if (e && v) e.value = v; }
    catFields.replaceChildren(h("legend", { text: c.org ? "3. About your organisation" : "3. About you" }), ...c.fields.map((f) => field(f)));
    prepareCaptcha();
  }

  /* ---------- Cloudflare Turnstile ---------- */
  function captchaMessage(msg) { captchaErr.textContent = msg || ""; }
  function loadScript() {
    // The global can exist before the API is ready; only resolve when render() is callable.
    if (typeof window.turnstile?.render === "function") return Promise.resolve();
    if (!scriptLoading) {
      scriptLoading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        s.async = true;
        // Prevent Cloudflare Rocket Loader from reordering or delaying the Turnstile API.
        s.setAttribute("data-cfasync", "false");
        s.onload = () => {
          const started = Date.now();
          const waitUntilReady = () => {
            if (typeof window.turnstile?.render === "function") return resolve();
            if (Date.now() - started >= 10000) return reject(new Error("Turnstile API did not become ready"));
            window.setTimeout(waitUntilReady, 50);
          };
          waitUntilReady();
        };
        s.onerror = () => reject(new Error("Turnstile script failed to load"));
        document.head.append(s);
      }).catch((error) => {
        scriptLoading = null;
        throw error;
      });
    }
    return scriptLoading;
  }
  function prepareCaptcha() {
    if (!cfg || !cat) return;                      // needs the configuration and a visible form
    if (!cfg.turnstileSiteKey) {
      if (!cfg.captchaBypassed) { widget.replaceChildren(h("div", { class: "notice warn", text: cfg.failed ? "The form could not load its security settings. Please reload the page." : "Online applications are temporarily unavailable because spam protection is not set up yet. Please contact the ASWRA secretariat." })); submit.disabled = true; }
      return;
    }
    if (widgetId !== null) return;                 // render exactly once
    widgetId = -1;                                  // mark as in progress
    loadScript().then(() => {
      try {
        widgetId = window.turnstile.render(widget, {
          sitekey: cfg.turnstileSiteKey, action: cfg.turnstileAction || "membership_application", theme: "light", retry: "auto", "refresh-expired": "auto",
          callback: (t) => { token = t; captchaMessage(""); },
          "expired-callback": () => { token = ""; captchaMessage("The verification expired. Please complete it again."); },
          "timeout-callback": () => { token = ""; captchaMessage("The verification timed out. Please complete it again."); },
          "error-callback": (code) => { token = ""; captchaMessage(`The verification widget reported a problem${code ? ` (code ${code})` : ""}. Reload the page. If it keeps happening, contact the ASWRA secretariat.`); return true; },
        });
      } catch (error) {
        widgetId = null;
        captchaMessage("The verification widget could not be initialized. Please reload the page. If it keeps happening, contact the ASWRA secretariat.");
        console.error("ASWRA Turnstile initialization failed:", error);
      }
    }).catch((error) => {
      widgetId = null;
      captchaMessage("The verification could not be loaded. Check your connection, turn off any content blocker for this site, then reload the page.");
      console.error("ASWRA Turnstile script loading failed:", error);
    });
  }
  function resetCaptcha() { token = ""; if (window.turnstile && widgetId !== null && widgetId !== -1) { try { window.turnstile.reset(widgetId); } catch { /* widget already gone */ } } }

  /* ---------- collect, validate, submit ---------- */
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
      const target = k === "category" ? $(".cat-option input") : k === "turnstile" ? widget : inputFor(k), msg = errs[k];
      const slot = $("#err-" + k); if (slot) slot.textContent = msg;
      if (target && k !== "turnstile") target.setAttribute("aria-invalid", "true");
      list.append(h("li", {}, target ? h("a", { href: "#", onclick: (ev) => { ev.preventDefault(); (target.focus ? target : widget).focus?.(); }, text: msg }) : msg));
    }
    summary.append(h("div", { class: "notice err", role: "alert" }, h("strong", { text: headline }), list));
    summary.focus(); summary.scrollIntoView({ block: "center" });
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (busy || !cat) { if (!cat) showErrors({ category: "Please choose a membership category." }); return; }
    const p = collect(), errs = localErrors(p);
    if (Object.keys(errs).length) return showErrors(errs);
    if (cfg && cfg.turnstileSiteKey && !token) return showErrors({ turnstile: "Please complete the security check before submitting." }, "One more step:");
    clearErrors(); busy = true; submit.disabled = true; submit.textContent = "Submitting\u2026"; form.setAttribute("aria-busy", "true"); status.textContent = "Sending your application, please wait\u2026";
    try {
      const res = await fetch("/api/applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201) return success(data.reference);
      if (res.status === 422 && data.fields) showErrors(data.fields);
      else summary.replaceChildren(h("div", { class: "notice " + (res.status === 429 || res.status === 409 ? "warn" : "err"), role: "alert", text: data.error || "Something went wrong. Please try again." }));
      // A Turnstile token works once. It is used up by verification, so ask for a fresh one unless the server rejected the form first.
      if (res.status !== 422 && res.status !== 429) resetCaptcha();
      if (/^captcha_/.test(data.code || "")) captchaMessage(data.error);
      summary.focus();
    } catch {
      summary.replaceChildren(h("div", { class: "notice err", role: "alert", text: "We could not reach the server. Check your connection and try again. Your answers are still on this page." }));
    } finally { busy = false; submit.disabled = !!cfg && !cfg.turnstileSiteKey && !cfg.captchaBypassed; submit.textContent = "Submit application"; form.removeAttribute("aria-busy"); status.textContent = ""; }
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
