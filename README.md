# Ascendant 2.1

A gym tracker built as a fitness RPG. You log real sets; a realistic 3D hunter evolves with your training; your gym's guild ranks members fairly.

Offline first: everything saves on the phone and syncs to your account in the background. Distributed outside Google Play: APK from the website, payments through Razorpay.

Website: https://deepansh-deep.github.io/ascendant/ (after Pages is switched on, see Going live).

## What's inside

```
www/                      The app (PWA + Capacitor Android)
  js/core.js              Engine: dates, state, XP, levels, ranks, skills, body stages, timer, backup, reminders, demo
  js/ui.js                Catalog and rarity, evolution tiers, challenges, achievements, charts
  js/scoring.js           Guild scoring. ONE copy shared with the server (supabase/functions/_shared)
  js/cloud.js             Accounts, offline-first sync, server wallet, Razorpay checkout
  js/views.js             Home, Train, Hunter studio, Progress, Settings, onboarding, ceremonies
  js/account.js           Sign in / register, join-guild step, Guild tab, Guild Master panel, owner Admin
  js/boot.js              Startup, session restore, update check
  js/hunter3d.js          3D engine (three.js): GLB hunters, customization, morph evolution, poses
  js/config.js            Server URL + anon key + update URL (empty server = offline build)
  assets/hunter/          Generated 3D characters (CC0)
  dev/viewer.html         3D test harness
site/                     Website (landing, download, contact, terms, privacy, refunds)
pipeline/                 Python generator for the 3D characters
supabase/schema.sql       Database: tables, row level security, all functions
supabase/storage.sql      Public bucket for gym logos
supabase/functions/       Edge functions: compute-scores, upload-logo, owner-admin, create-order, verify-payment, razorpay-webhook
supabase/test/            Mock Supabase on real Postgres, server tests, browser end-to-end test
android/                  Capacitor Android project (release signing reads GitHub secrets)
.github/workflows/        build-apk (every push), release (tags v*), pages (website)
```

## Roles

| Role | How they get in | What they can do |
|---|---|---|
| Owner (you) | Register normally, then mark yourself owner in SQL (once) | Admin tab: stats, create and revoke Guild Master codes, extend or suspend gym subscriptions, view any leaderboard, search users, reset passwords |
| Guild Master | Code from the owner, then own username and password | Gym name, city, logo, join code, approve or reject join requests, remove members, see members' weekly scores and last activity |
| Participant | Username (unique) and password (8+ characters) | Train solo; join a gym guild now or later (needs approval); buy cosmetics |

Usernames are unique. Passwords are not checked for uniqueness on purpose: that would tell people other users' passwords. Forgotten passwords are reset by the owner from the Admin tab.

## Screens

- **Home**: large interactive 3D hunter, hunter name, @username, rank, level and XP, next evolution, today's workout, challenges, stats, badges, gym ranking card, last week's grade.
- **Train**: per-day logging with rest timer, last session and best set, live PR detection, editable history, skill trees.
- **Hunter**: 3D studio (views, rotate, zoom), customization, evolution, shop (Razorpay), badges.
- **Progress**: volume, consistency, strength trend, muscle split, records, bodyweight, photos, report card.
- **Guild**: participant (join with code, pending state, live leaderboards, history, leave), Guild Master (leaderboard plus Manage), owner (Admin).
- **Settings**: account (sync status, sync now, change password, sign out), profile, theme, split, exercises, reminders, backup, start fresh.

## The 3D hunter

- Real skinned, morphable meshes built from the CC0 MakeHuman base body with the MPFB2 53-bone game skeleton. Male and female GLBs, about 7.7 MB each, cached after first load.
- PBR materials, ACES tone mapping, soft shadows, image-based lighting, idle breathing and sway, smooth camera and morph transitions. Renders only while visible and drops to about 30 fps when idle.
- Evolution is gradual and per region: a beginner "untrained" morph fades over levels 1 to 12, global muscle grows slowly to level 60, and chest, back, shoulders, arms, legs and core each grow through 5 stages from the sets you log for them. At most 20 sets per region per week count, so junk volume never speeds it up. The app makes no medical or body-change claims.
- Evolution tiers: Recruit (1), Disciplined (6), Warrior (15), Elite (29), Legend (45), Ascendant (60). Crossing a tier plays a 3D evolution ceremony.
- If WebGL is missing or the model files fail to load, the stage shows a plain message and everything else keeps working.

## Economy

| Item | Price | Notes |
|---|---|---|
| Common items | free | |
| Rare items | 1 crystal | |
| Epic items | 3 crystals | |
| Legendary items | earned only | Warlord flame aura Lv 37, Ascendant radiance Lv 60, Gold colorway Lv 45, Flex pose Lv 13, Victory pose Lv 29 |
| Night Ops Pack | 29 crystals | Hoodie, joggers, high-tops, onyx |
| Body or face redesign | 29 crystals | Free with the Pass; hunter name is always free |
| Ascendant Pass | ₹149 one time | Every crystal-priced item, free redesigns |
| Crystal packs | ₹10 = 10, ₹49 = 55, ₹99 = 120 | |

Free crystals: 5 starting, 5 per rank, 2 per full week, 3 per skill, 1 / 2 / 5 / 10 per common / rare / epic / legendary badge. Nothing purchasable affects XP, rankings or guild scores.

Crystal packs and the Pass are sold through Razorpay with server-side prices and verification (see Payments). The offline build shows no purchase buttons. Prices can be changed in the `products` table without a new app release.

Users upgrading from 1.x keep their purchases where a 3D equivalent exists; items with no equivalent (eye styles, mouths, name fonts, name colors) are refunded as crystals automatically.

## XP

| Action | XP |
|---|---|
| Finish a workout | +50 |
| Each set (max 20 a day) | +2 |
| Beat your last session on an exercise | +25 |
| Each daily challenge completed | +15 |
| Beat 3 bests in a week | +50 |
| Weigh in during a week | +20 (+10 base) |
| Unlock a skill | +40 |
| Train every planned day in a week | +100 |
| Rest-day check-in | +5 |

Level `L` needs `200 × (L−1) + 25 × L × (L−1)` total XP. Everything is recomputed from the logs, so XP cannot drift or be faked locally by editing a counter.

## Going live (your checklist)

Everything below is a one-time setup only you can do, because it needs your accounts. In order:

1. **Turn on the website.** GitHub repo > Settings > Pages > Source: **GitHub Actions**. Then Actions > "Publish website" > Run workflow. The site appears at https://deepansh-deep.github.io/ascendant/.
2. **Add the signing secrets.** Follow `ASCENDANT-SIGNING-KEY-README.txt` in your `Ascendant/signing-key` folder (four secrets). Keep that folder backed up; it is not in this repository.
3. **Create the Supabase project** (supabase.com, free to start, Mumbai region).
   - SQL editor: run `supabase/schema.sql`, then `supabase/storage.sql`.
   - Authentication > Providers > Email: turn **off** "Confirm email" (usernames map to hidden addresses that cannot receive mail).
   - Install the Supabase CLI and deploy the functions:
     `supabase functions deploy compute-scores upload-logo owner-admin create-order verify-payment`
     `supabase functions deploy razorpay-webhook --no-verify-jwt`
   - Put the Project URL and the **anon** key in `www/js/config.js`. Never put the service_role key anywhere in this repo.
4. **Make yourself owner.** Register in the app, then in the SQL editor: `update public.profiles set role = 'owner' where username = 'your_username';`
5. **Razorpay.** Sign up and complete KYC (PAN, bank account, this website's terms, privacy, refunds and contact pages). Fill in `site/site-config.js` with your email and phone first: Razorpay checks the contact page.
   - Supabase > Edge Functions > Secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
   - Razorpay Dashboard > Webhooks: URL `https://<project>.supabase.co/functions/v1/razorpay-webhook`, events `payment.captured` and `order.paid`, same webhook secret.
   - Test with Razorpay test keys first, then switch to live keys.
6. **Release the Android app.** Bump `VERSION` in `www/js/core.js` and `www/sw.js`, commit, then tag: `git tag v2.1.0 && git push --tags`. The release workflow builds a signed APK, attaches it to GitHub Releases and refreshes the website's download page and `version.json`, which installed apps check to offer the update.
7. **First gym.** Admin > Create codes (30 free days), give the code to the gym owner, help him register the gym and share his join code.

Free-tier warning: Supabase pauses free projects after a week without activity. Move to the paid plan (about $25 a month) before the first gym depends on it.

## How sync works

Every change saves on the phone first. Changed days and the settings blob are pushed in the background a few seconds later, then anything newer on the server is pulled. A day changed on this phone since the last sync wins over the server copy. Progress photos never leave the phone. Signing out syncs first and refuses to wipe unsynced data without a warning. Signing in on a new phone restores everything except photos.

## Payments

Prices live only in the `products` table on the server. The app asks the server to create a Razorpay order, Razorpay takes the payment, and crystals or the Pass are credited only after the server verifies Razorpay's signature (in `verify-payment`, with `razorpay-webhook` as the backup if the app closed). Crediting is idempotent, so no payment counts twice. Earned crystals are still computed on the phone from training; a tampered phone could fake earned crystals for cosmetics, but never bought crystals, the Pass, or any ranking.

Gym subscriptions are invoiced by you (UPI or a Razorpay payment link). After payment, extend the gym in Admin > Guilds. Leaderboards lock automatically 7 days after `paid_until`.

## Guild scoring (transparent)

- **Consistency**: planned days trained ÷ planned days so far in the period (at most 6 per week count).
- **Strength**: average estimated 1RM of your 3 strongest weighted lifts ÷ bodyweight (1.5× = 100), or skill-tree mastery if higher.
- **Progress**: average estimated-1RM gain against your own previous 4 weeks, capped at 4% a week or 15% a month, plus 10 per skill unlocked in the period.
- **Overall**: 40% consistency + 30% progress + 30% strength.

The server recomputes all four from synced workouts (`compute-scores`) with the same `scoring.js` the app uses. The phone cannot write scores. A user can still log workouts they did not do; that is self-reported training, and guild masters can remove members.

## Run and test locally

```
cd www && python3 -m http.server 8765                 # offline build at http://localhost:8765
```

Full server and account testing without Supabase (needs PostgreSQL 16 and Node 22):

```
cd supabase/test && npm install
createdb asc_test && psql -d asc_test -f mock_supabase.sql -f ../schema.sql
PGDATABASE=asc_test node mock-server.mjs &             # mock Supabase on :54321, real Postgres behind it
PGDATABASE=asc_test node run_tests.mjs                 # 79 server tests
node e2e_app.cjs                                       # browser test: owner, guild master, participant, new phone (Playwright)
```
After editing `www/js/scoring.js`, copy it to `supabase/functions/_shared/scoring.js` (a test fails if they differ).

## Known gaps

- Not yet run against a live Supabase project or live Razorpay keys. Everything server-side was tested against real Postgres through a mock of Supabase's HTTP APIs and a fake Razorpay.
- Not tested on a real Android phone. First 3D load downloads about 7.7 MB per model; no compression or lower-detail models yet.
- Character art: hair reads as a helmet up close, the full beard is weak, garments have no wrinkles.
- Razorpay inside the Android app uses Razorpay's web checkout; UPI apps open via QR or UPI ID rather than a one-tap intent. The native Razorpay Android SDK would add one-tap UPI.
- Account deletion is by request to the owner (the training reset in Settings is self-service).
- No gym events, posters or member profile pages yet.

## Licenses

- Human base mesh, morph targets, skeleton, weights, eye mesh and textures: MakeHuman and MPFB2 assets, CC0.
- Generated garments, hair, beards and textures: CC0 (made by the pipeline in this repo).
- three.js: MIT. Sora, Inter, Barlow Condensed: SIL Open Font License.

## Owner tools (2.1.1)

The owner account (set with the one SQL line in the Going live checklist) always has the Pass, so every cosmetic is unlocked. From the Guild tab the owner can:
- grant or remove crystals for any user (positive or negative, clamped at zero, every change logged with a reason)
- delete a user (type the username to confirm). Training data is removed, payment records are kept without a name for accounting
- delete a guild (type the name to confirm). Members keep their accounts, the master becomes a participant
- see the last 50 owner actions on the Overview tab

All of it is enforced on the server (`owner_*` functions check the caller's role), not in the app.
Re-run `supabase/schema.sql` in the SQL editor after pulling this version. It is safe to run again.

## Look and feel (2.2.0)

- **13 typefaces** in Settings > Font, bundled in `www/fonts` (all OFL), saved with the account. Each choice sets `data-font` on `<html>`; the rules live at the end of `www/css/app.css`.
- **Effects layer** `www/js/fx.js`: one additive canvas for sparks, embers, shockwaves and flashes. Runs only while something is alive, scales down on weak phones, off with reduced motion.
- **Ceremonies** (`ceremony()` in `views.js`): charge, impact, reveal. Level up, new rank (coloured by rank), skill, evolution, and a workout-complete screen with a counting XP total.
- **Rank name glow**: `.glow[data-rank]`, stronger at every rank from E to S. The Ranks list in Settings previews each one.
- **Charged hunter**: after a saved workout the Home hunter carries a flame aura for the rest of the day and bursts once (`setCharged`, `burst` in `hunter3d.js`).
- Sounds are synthesised (`synth()` in `core.js`), no audio files.
