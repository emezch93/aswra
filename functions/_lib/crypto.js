const enc = new TextEncoder();
const ITERATIONS = 100000; // Cloudflare Workers caps PBKDF2 at 100,000 iterations.

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
export const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

export const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
// Hash with a server secret so stored IP/dedupe hashes cannot be reversed by guessing.
export const keyed = (env, s) => sha256(`${env.APP_SECRET || ""}|${s}`);

export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  return `pbkdf2-sha256$${ITERATIONS}$${b64u(salt)}$${b64u(await pbkdf2(password, salt, ITERATIONS))}`;
}

export const DUMMY_HASH = `pbkdf2-sha256$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

export async function verifyPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored).split("$");
  if (alg !== "pbkdf2-sha256" || !salt || !hash) return false;
  const got = await pbkdf2(password, fromB64u(salt), parseInt(iter, 10) || ITERATIONS);
  return safeEqual(b64u(got), hash);
}

// 12 characters from a 32 symbol alphabet (60 bits of randomness), e.g. ASWRA-2026-7K3M9Q2XB4TD
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newReference() {
  let s = "";
  for (const byte of randomBytes(12)) s += ALPHABET[byte & 31];
  return `ASWRA-${new Date().getUTCFullYear()}-${s}`;
}
export const REFERENCE_PATTERN = /^ASWRA-\d{4}-[0-9A-HJKMNP-TV-Z]{12}$/;
