// Shared behaviour for the public pages: navigation, current page, celebrations, WhatsApp form.
const $ = (s) => document.querySelector(s);

const toggle = $("#nav-toggle"), nav = $("#site-nav");
if (toggle && nav) {
  const set = (open) => {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggle.textContent = open ? "\u2715" : "\u2630";
  };
  toggle.addEventListener("click", () => set(!nav.classList.contains("open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
  addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
}

const page = document.body.dataset.page;
document.querySelectorAll("#site-nav a[data-page]").forEach((a) => {
  if (a.dataset.page === page) a.setAttribute("aria-current", "page");
});
const year = $("#year"); if (year) year.textContent = new Date().getFullYear();

// Environmental days with a live countdown (home page).
const cel = $("#celebrations");
if (cel) {
  const days = [
    { n: "World Environment Day", s: "5 June every year", d: (y) => new Date(y, 5, 5) },
    { n: "World Clean Up Day", s: "Third Saturday of September", d: (y) => { const f = new Date(y, 8, 1); return new Date(y, 8, 1 + ((6 - f.getDay() + 7) % 7) + 14); } },
  ];
  const next = (c) => { const y = new Date().getFullYear(); let d = c.d(y); if (d.getTime() + 864e5 < Date.now()) d = c.d(y + 1); return d; };
  for (const c of days) {
    const d = next(c), box = document.createElement("div"), t = document.createElement("span");
    const h3 = document.createElement("h3"), p = document.createElement("p");
    h3.textContent = c.n; p.textContent = `${c.s}. Next: ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
    t.className = "cd"; t.dataset.t = String(d.getTime() + 288e5);
    box.append(h3, p, t); cel.append(box);
  }
  const tick = () => document.querySelectorAll(".cd").forEach((e) => {
    const s = Math.max(0, Math.floor((+e.dataset.t - Date.now()) / 1000));
    e.textContent = `${Math.floor(s / 86400)} days ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  });
  tick(); setInterval(tick, 30000);
}

// Contact page: opens WhatsApp with the message prepared.
const wa = $("#wa-form");
if (wa) wa.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#wa-name").value.trim(), msg = $("#wa-msg").value.trim();
  open(`https://wa.me/2347085379538?text=${encodeURIComponent(`From ${name}: ${msg}`)}`, "_blank", "noopener");
  wa.reset();
});
