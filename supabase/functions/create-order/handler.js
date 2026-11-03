// Starts a purchase: the PRICE comes from the products table on the server, never from the phone.
import { json, fail, getUser, rpc, cors, body } from "../_shared/util.js";

export default async function handler(req, env) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return fail("Payments are not configured on the server yet", 503);
  const user = await getUser(req, env); if (!user) return fail("Not signed in", 401);
  const { product_id } = await body(req);
  const product = await rpc(env, "admin_product", { p_product: String(product_id || "") });
  if (!product) return fail("Unknown product");
  const api = env.RAZORPAY_API_BASE || "https://api.razorpay.com";
  const r = await fetch(api + "/v1/orders", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(env.RAZORPAY_KEY_ID + ":" + env.RAZORPAY_KEY_SECRET), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: product.amount_paise, currency: "INR", receipt: ("asc_" + Date.now()).slice(0, 40),
      notes: { user_id: user.id, product_id: product.id } })
  });
  const order = await r.json().catch(() => ({}));
  if (!r.ok || !order.id) return fail("Payment provider error: " + ((order.error && order.error.description) || r.status), 502);
  await rpc(env, "admin_create_purchase", { p_user: user.id, p_product: product.id, p_order_id: order.id });
  return json({ order_id: order.id, amount: product.amount_paise, currency: "INR", key_id: env.RAZORPAY_KEY_ID, title: product.title });
}
