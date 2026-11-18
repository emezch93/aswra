import { CATEGORIES, LGAS } from "../../assets/js/form-schema.js";

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function tidy(value, multiline = false) {
  let s = typeof value === "string" ? value : value == null ? "" : String(value);
  s = s.replace(CONTROL, "").replace(/\r\n?/g, "\n");
  s = multiline ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim();
}

export function normalisePhone(raw) {
  let d = String(raw || "").replace(/[\s\-().]/g, "");
  if (d.startsWith("+234")) d = "0" + d.slice(4);
  else if (d.startsWith("234") && d.length === 13) d = "0" + d.slice(3);
  return /^0[1-9]\d{9}$/.test(d) ? d : null;
}

const EMAIL = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/;

export function validateApplication(body) {
  const errors = {};
  const fail = (k, m) => { if (!errors[k]) errors[k] = m; };
  const cat = CATEGORIES.find((c) => c.label === body.category);
  if (!cat) fail("category", "Please choose a membership category.");

  const name = tidy(body.applicantName);
  if (name.length < 2 || name.length > 120) fail("applicantName", "Enter a name between 2 and 120 characters.");

  const contactPerson = tidy(body.contactPerson);
  if (cat?.org && (contactPerson.length < 2 || contactPerson.length > 120)) fail("contactPerson", "Enter the name of the contact person.");
  if (contactPerson.length > 120) fail("contactPerson", "Contact person name is too long.");

  const email = tidy(body.email).toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) fail("email", "Enter a valid email address.");

  const phone = normalisePhone(tidy(body.phone));
  if (!phone) fail("phone", "Enter a valid Nigerian phone number, for example 08012345678.");

  const address = tidy(body.address, true);
  if (address.length < 5 || address.length > 300) fail("address", "Enter your address (5 to 300 characters).");

  const lga = tidy(body.lga);
  if (!LGAS.includes(lga)) fail("lga", "Choose your Local Government Area.");

  const formData = {};
  if (cat) {
    const input = body.formData && typeof body.formData === "object" && !Array.isArray(body.formData) ? body.formData : {};
    for (const f of cat.fields) {
      const raw = input[f.id];
      if (f.type === "checkbox") {
        formData[f.id] = raw === true;
        if (f.required && raw !== true) fail(f.id, "This confirmation is required.");
      } else if (f.type === "checkboxes") {
        const list = Array.isArray(raw) ? [...new Set(raw.map((x) => tidy(x)))] : [];
        if (list.some((x) => !f.options.includes(x))) fail(f.id, "Choose from the listed options.");
        if (f.required && list.length === 0) fail(f.id, "Choose at least one option.");
        formData[f.id] = list.filter((x) => f.options.includes(x));
      } else if (f.type === "select") {
        const v = tidy(raw);
        if (v && !f.options.includes(v)) fail(f.id, "Choose from the listed options.");
        if (f.required && !v) fail(f.id, "Please choose an option.");
        formData[f.id] = v;
      } else {
        const multi = f.type === "textarea";
        const v = tidy(raw, multi);
        const max = f.max || (multi ? 1000 : 200);
        if (v.length > max) fail(f.id, `Please keep this under ${max} characters.`);
        if (f.required && !v) fail(f.id, "This field is required.");
        formData[f.id] = v;
      }
    }
  }
  if (body.declaration !== true) fail("declaration", "You must accept the declaration to apply.");
  if (body.privacy !== true) fail("privacy", "You must accept the privacy notice to apply.");

  if (JSON.stringify(formData).length > 8000) fail("formData", "The submitted details are too long.");

  const ok = Object.keys(errors).length === 0;
  return { ok, errors, clean: ok ? { category: cat.label, applicantName: name, contactPerson: cat.org ? contactPerson : null, email, phone, address, lga, formData } : null };
}
