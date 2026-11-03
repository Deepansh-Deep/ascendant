// Recomputes the caller's guild scores from the workouts synced to the server. The phone never submits scores.
import { json, fail, getUser, rpc, cors } from "../_shared/util.js";
import "../_shared/scoring.js";
const Scoring = globalThis.AscendantScoring;

export default async function handler(req, env) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req, env); if (!user) return fail("Not signed in", 401);
  const data = await rpc(env, "admin_user_data", { p_user: user.id });
  const st = data && data.state;
  const S = st ? { profile: st.profile, planHistory: st.planHistory, weights: st.weights || [], logs: data.logs || {} } : null;
  if (!Scoring.validState(S)) return fail("Sync your training first", 409);
  const today = Scoring.indiaToday();
  const rows = ["week", "month", "all"].map(p => { const s = Scoring.guildScores(S, p, today); delete s.detail; return s; });
  await rpc(env, "admin_write_scores", { p_user: user.id, p_rows: rows });
  return json({ scores: rows });
}
