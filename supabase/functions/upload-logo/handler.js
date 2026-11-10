// Guild masters upload their gym logo. Only the master of a guild can set its logo.
// Requires a PUBLIC storage bucket named "guild-logos" (see supabase/storage.sql).
import { json, fail, getUser, rpc, cors, body, adminHeaders } from "../_shared/util.js";
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export default async function handler(req, env) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req, env); if (!user) return fail("Not signed in", 401);
  const guild = await rpc(env, "admin_master_guild", { p_user: user.id });
  if (!guild) return fail("Only a guild master can change the logo", 403);
  const { image } = await body(req);
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image || "");
  if (!m) return fail("Send a PNG, JPEG or WebP image");
  const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
  if (bytes.length > 300 * 1024) return fail("Logo must be under 300 KB");
  const path = `${guild.id}/logo-${Date.now()}.${TYPES[m[1]]}`;
  const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/guild-logos/${path}`, {
    method: "POST",
    headers: adminHeaders(env, { "Content-Type": m[1], "x-upsert": "true" }),
    body: bytes
  });
  if (!up.ok) return fail("Upload failed: " + (await up.text()).slice(0, 120), 502);
  const url = `${env.SUPABASE_URL}/storage/v1/object/public/guild-logos/${path}`;
  await rpc(env, "admin_set_logo", { p_guild: guild.id, p_url: url });
  return json({ logo_url: url });
}
