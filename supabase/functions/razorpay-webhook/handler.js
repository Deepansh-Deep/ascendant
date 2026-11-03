// Razorpay calls this directly (deploy with --no-verify-jwt). Backup path so a payment is credited
// even if the phone closed before verify-payment ran. Crediting is idempotent.
import { json, fail, rpc, hmacHex, safeEqual } from "../_shared/util.js";

export default async function handler(req, env) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return fail("Webhook secret not configured", 503);
  const raw = await req.text();
  const expected = await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (!safeEqual(expected, req.headers.get("x-razorpay-signature") || "")) return fail("Bad signature", 401);
  let ev; try { ev = JSON.parse(raw); } catch (_) { return fail("Bad JSON"); }
  const pay = ev && ev.payload && ev.payload.payment && ev.payload.payment.entity;
  if ((ev.event === "payment.captured" || ev.event === "order.paid") && pay && pay.order_id) {
    try { await rpc(env, "admin_mark_paid", { p_order_id: pay.order_id, p_payment_id: pay.id }); }
    catch (e) { if (!/Unknown order/.test(e.message)) throw e; }
  }
  return json({ ok: true });
}
