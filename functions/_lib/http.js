export class ApiError extends Error {
  constructor(status, message, code = "error", details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

export async function readJson(request, max = 20000) {
  if (!(request.headers.get("content-type") || "").includes("application/json"))
    throw new ApiError(415, "Unsupported content type.", "bad_content_type");
  const text = await request.text();
  if (text.length > max) throw new ApiError(413, "The request is too large.", "too_large");
  try {
    const v = JSON.parse(text);
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error("shape");
    return v;
  } catch {
    throw new ApiError(400, "The request body must be valid JSON.", "bad_json");
  }
}

// Wraps a handler so that errors never leak internals to the client.
export const handle = (fn) => async (ctx) => {
  try {
    return await fn(ctx);
  } catch (e) {
    if (e instanceof ApiError) {
      const headers = e.details.retryAfter ? { "retry-after": String(e.details.retryAfter) } : {};
      return json({ error: e.message, code: e.code, ...(e.details.fields ? { fields: e.details.fields } : {}) }, e.status, headers);
    }
    console.error("unhandled_api_error", e && e.message);
    return json({ error: "Something went wrong. Please try again later.", code: "server_error" }, 500);
  }
};

export const clientIp = (request) => request.headers.get("cf-connecting-ip") || "unknown";
export const isLocalhost = (request) => ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);

export function parseId(value) {
  if (!/^\d{1,9}$/.test(String(value))) throw new ApiError(404, "Not found.", "not_found");
  return Number(value);
}
