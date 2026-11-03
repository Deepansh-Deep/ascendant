// Called by the app right after Razorpay checkout. Credits only if Razorpay's signature checks out.
import { json, fail, getUser, rpc, cors, body, hmacHex, safeEqual } from "../_shared/util.js";

export default async function handler(req, env) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!env.RAZORPAY_KEY_SECRET) return fail("Payments are not configured on the server yet", 503);
  const user = await getUser(req, env); if (!user) return fail("Not signed in", 401);
  const b = await body(req);
  const { razorpay_order_id: o, razorpay_payment_id: p, razorpay_signature: s } = b;
  if (!o || !p || !s) return fail("Missing payment details");
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, o + "|" + p);
  if (!safeEqual(expected, String(s))) return fail("Payment signature did not match", 400);
  const res = await rpc(env, "admin_mark_paid", { p_order_id: o, p_payment_id: p });
  return json({ ok: true, ...res });
}
