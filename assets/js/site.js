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

// Contact page: opens WhatsApp with the message prepared.
const wa = $("#wa-form");
if (wa) wa.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#wa-name").value.trim(), msg = $("#wa-msg").value.trim();
  open(`https://wa.me/2347085379538?text=${encodeURIComponent(`From ${name}: ${msg}`)}`, "_blank", "noopener");
  wa.reset();
});
