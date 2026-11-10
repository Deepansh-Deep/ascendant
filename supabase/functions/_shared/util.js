// Shared helpers for Ascendant edge functions. Plain fetch + WebCrypto: runs on Supabase (Deno) and Node 18+.
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
export const fail = (message, status = 400) => json({ error: message }, status);

/* Keys: new projects get SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS ({"default": "sb_..."}); older ones the legacy JWT keys. */
function pick(json, legacy) { try { const o = JSON.parse(json || "null"); if (o && o.default) return o.default; } catch (_) {} return legacy; }
export const secretKey = env => pick(env.SUPABASE_SECRET_KEYS, env.SUPABASE_SERVICE_ROLE_KEY);
export const publicKey = env => pick(env.SUPABASE_PUBLISHABLE_KEYS, env.SUPABASE_ANON_KEY) || secretKey(env);
/* New sb_ keys are not JWTs: they go in the apikey header only. Legacy JWT keys also go in Authorization. */
export function adminHeaders(env, extra) {
  const k = secretKey(env), h = { apikey: k, ...(extra || {}) };
  if (k && !k.startsWith("sb_")) h.Authorization = "Bearer " + k;
  return h;
}

export async function getUser(req, env) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers: { Authorization: auth, apikey: publicKey(env) } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

export async function rpc(env, fn, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: adminHeaders(env, { "Content-Type": "application/json" }),
    body: JSON.stringify(args || {})
  });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (_) { j = t; }
  if (!r.ok) throw new Error((j && j.message) || `${fn} failed (${r.status})`);
  return j;
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0;
}
export async function body(req) { try { return await req.json(); } catch (_) { return {}; } }
