// Runs for every request: hides non-public repository files and adds security headers.
const BLOCKED = /^\/(docs|migrations|scripts|tests|functions|node_modules|\.wrangler)(\/|$)|^\/(wrangler\.toml|package(-lock)?\.json|README\.md|\.dev\.vars.*|\.gitignore)$/i;

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function secure(headers) {
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Strict-Transport-Security", "max-age=31536000");
}

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  if (BLOCKED.test(pathname)) {
    const h = new Headers({ "content-type": "text/plain; charset=utf-8" });
    secure(h);
    return new Response("Not found", { status: 404, headers: h });
  }
  const res = await context.next();
  const out = new Response(res.body, res);
  secure(out.headers);
  if (pathname.startsWith("/api/") || pathname.startsWith("/admin")) out.headers.set("Cache-Control", "no-store");
  return out;
}
