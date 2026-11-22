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


// Center leadership photographs in a responsive, accessible lightbox.
if (document.body.dataset.page === "leadership") {
  let activeTrigger = null;
  const viewer = document.createElement("div");
  viewer.className = "image-lightbox";
  viewer.hidden = true;
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");
  viewer.setAttribute("aria-label", "Image viewer");
  const close = document.createElement("button");
  close.className = "image-lightbox-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close image viewer");
  close.textContent = "\u00d7";
  const image = document.createElement("img");
  viewer.append(close, image);
  document.body.append(viewer);
  const closeViewer = () => {
    if (viewer.hidden) return;
    viewer.hidden = true;
    image.removeAttribute("src");
    document.body.classList.remove("lightbox-open");
    if (activeTrigger) activeTrigger.focus();
  };
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("a[data-lightbox]");
    if (!trigger || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    activeTrigger = trigger;
    const thumbnail = trigger.querySelector("img");
    image.src = trigger.href;
    image.alt = thumbnail?.alt || trigger.getAttribute("aria-label") || "Expanded image";
    viewer.hidden = false;
    document.body.classList.add("lightbox-open");
    close.focus();
  });
  close.addEventListener("click", closeViewer);
  viewer.addEventListener("click", (event) => { if (event.target === viewer) closeViewer(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeViewer(); });
}
