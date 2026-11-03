// Owner-only account actions that need the auth admin API (service role).
import { json, fail, getUser, rpc, cors, body } from "../_shared/util.js";

export default async function handler(req, env) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req, env); if (!user) return fail("Not signed in", 401);
  if (!(await rpc(env, "admin_is_owner", { p_user: user.id }))) return fail("Only the app owner can do this", 403);
  const b = await body(req);
  if (b.action === "reset_password") {
    if (!b.user_id || typeof b.password !== "string" || b.password.length < 8) return fail("New password must be at least 8 characters");
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(b.user_id)}`, {
      method: "PUT",
      headers: { Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY, apikey: env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ password: b.password })
    });
    if (!r.ok) return fail("Could not reset the password", 502);
    return json({ ok: true });
  }
  return fail("Unknown action");
}
