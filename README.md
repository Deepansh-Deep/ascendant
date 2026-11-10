# Ascendant 3.1

A gym tracker built as a fitness RPG. You log real sets, earn XP, rank up, and your hunter's aura grows with your training. Your gym's guild ranks members fairly.

Offline first: everything saves on the phone and syncs to your account in the background. Distributed outside Google Play: APK from the website. Free for members; only gyms pay.

Website: https://deepansh-deep.github.io/ascendant/ (after Pages is switched on, see Going live).

## What's inside

```
www/                      The app (PWA + Capacitor Android)
  js/core.js              Engine: dates, state, XP, levels, ranks, skills, body stages, timer, backup, reminders, demo
  js/ui.js                Heroes, earned aura, challenges, achievements, charts, fonts
  js/scoring.js           Guild scoring. ONE copy shared with the server (supabase/functions/_shared)
  js/cloud.js             Accounts and offline-first sync
  js/views.js             Home, Train, Hunter, Progress, Settings, onboarding, ceremonies
  js/account.js           Sign in / register, join-guild step, Guild tab, Guild Master panel, owner Admin
  js/boot.js              Startup, session restore, update check
  js/hero2d.js            Hero stage: 2D character art with breathing and the outline-traced aura
  js/fx.js                Effects canvas for ceremonies (sparks, embers, shockwaves)
  js/config.js            Server URL + anon key + update URL (empty server = offline build)
  assets/hero/            Character art: 2 characters x 3 outfits (WebP, transparent)
  assets/aura/            Aura video loop (WebM + MP4)
site/                     Website (landing, download, contact, terms, privacy, refunds)
pipeline/                 Old 3D character generator (not used by the app since 3.0)
supabase/schema.sql       Database: tables, row level security, all functions
supabase/storage.sql      Public bucket for gym logos
supabase/functions/       Edge functions: compute-scores, upload-logo, owner-admin (plus unused payment functions)
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

- **Home**: your hunter with its aura, hunter name with rank glow, @username, rank, level and XP, next rank, today's workout, challenges, stats, badges, gym ranking card, last week's grade.
- **Train**: per-day logging with rest timer, last session and best set, live PR detection, editable history, skill trees.
- **Hunter**: aura power and how it is earned, aura colour by rank, hunter switch and name, badges, muscle development.
- **Progress**: volume, consistency, strength trend, muscle split, records, bodyweight, photos, report card.
- **Guild**: participant (join with code, pending state, live leaderboards, history, leave), Guild Master (leaderboard plus Manage), owner (Admin).
- **Settings**: account (sync status, sync now, change password, sign out), profile, theme, font, split, exercises, reminders, backup, start fresh.

## The hunter and the aura (3.1)

- Two characters, a hunter and a huntress, each with three outfits: Signature, Urban, Royal (`www/assets/hero/<male|female>_<outfit>.webp`). Picked at onboarding; hunter and outfit switch for free in the Hunter tab.
- `www/js/hero2d.js` draws the art with WebGL: light breathing, a contact shadow, a rim light, and the aura.
- **The aura is a video**, `www/assets/aura/aura.webm` (and `.mp4` for devices without WebM): white energy on black, a seamless 9 second loop made from the original. The stage tints it by rank and places its ground ripple under the feet.
- **Aura power** (0 to 100%) is earned: base 10, level up to 42, rank up to 14, streak up to 18, bests beaten up to 16 (`AURA_PARTS` in `ui.js`). Power drives everything, from none to full: opacity, brightness, colour (faint white-grey first, full rank colour later), size and playback speed. At about 80% and above a magic circle forms behind the head. On days you train the aura is charged a little higher and flares once.
- Nothing is for sale. Badges, titles, ranks, name glow and aura are all earned. Theme and font are free settings.

### Replacing art
- Characters: PNG or WebP, full body, front-facing, feet visible, transparent background (a plain single-colour background is keyed out automatically). The app crops to the character, so framing does not need to be exact. Current files are cut from single full-resolution renders (about 1500 to 1770 px tall) with rembg (isnet models), interiors filled solid and floor reflections trimmed at the sole line.
- **Idle videos** (character moves, breathes, gestures): green screen video per outfit, `assets/hero/<key>.webm` and `.mp4`, keyed live in the shader. Register the outfit in `HERO_VIDEO` in `hero2d.js`. The matching `.webp` must be the video's first frame at the same framing (the app skips its usual crop for these). Build: mask the generator watermark, pad and crop to 854x1280 so the figure has room, crossfade the last 0.75 s into the start for a seamless loop, encode H.264 CRF 22 and VP9 CRF 30. Outfits without a video use the still.
- Aura: any white or grey energy loop on pure black, vertical. Re-run the loop and encode commands from the 3.1 commit message to rebuild both files.
- Bump `VERSION` in `www/js/core.js` and `www/sw.js` after changing art.

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
   - Deploy the functions with the Supabase CLI: `supabase functions deploy compute-scores upload-logo owner-admin`
   - Put the Project URL and the **anon** key in `www/js/config.js`. Never put the service_role key anywhere in this repo.
4. **Make yourself owner.** Register in the app, then in the SQL editor: `update public.profiles set role = 'owner' where username = 'your_username';`
5. **Contact details.** Fill in `site/site-config.js` with your email and phone.
6. **Release the Android app.** Bump `VERSION` in `www/js/core.js` and `www/sw.js`, commit, then tag: `git tag v3.0.0 && git push --tags`. The release workflow builds a signed APK, attaches it to GitHub Releases and refreshes the website's download page and `version.json`, which installed apps check to offer the update.
7. **First gym.** Admin > Create codes (30 free days), give the code to the gym owner, help him register the gym and share his join code.

Free-tier warning: Supabase pauses free projects after a week without activity. Move to the paid plan (about $25 a month) before the first gym depends on it.

## How sync works

Every change saves on the phone first. Changed days and the settings blob are pushed in the background a few seconds later, then anything newer on the server is pulled. A day changed on this phone since the last sync wins over the server copy. Progress photos never leave the phone. Signing out syncs first and refuses to wipe unsynced data without a warning. Signing in on a new phone restores everything except photos.

## Payments

Members never pay. Gym subscriptions are invoiced by you (UPI or a payment link). After payment, extend the gym in Admin > Guilds. Leaderboards lock automatically 7 days after `paid_until`.

The server still contains the old member-payment pieces (`products`, `wallets`, `purchases` tables and the `create-order`, `verify-payment`, `razorpay-webhook` functions). The app no longer calls them and they do not need deploying. They can be removed later.

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

- Server functions not yet deployed to the live Supabase project. Everything server-side was tested against real Postgres through a mock of Supabase's HTTP APIs and a fake Razorpay.
- Not tested on a real Android phone.
- The Huntress Signature render is shot from a low angle, so she changes size and angle when switching outfits; a straight-on version should replace it.
- Account deletion is by request to the owner (the training reset in Settings is self-service).
- No gym events, posters or member profile pages yet.

## Licenses

- Sora, Inter, Barlow Condensed and the 11 optional typefaces: SIL Open Font License.
- Character art and aura video: generated by the owner with ChatGPT and Gemini for this app.

## Owner tools (2.1.1)

From the Guild tab the owner can:
- delete a user (type the username to confirm). Training data is removed, payment records are kept without a name for accounting
- delete a guild (type the name to confirm). Members keep their accounts, the master becomes a participant
- see the last 50 owner actions on the Overview tab

All of it is enforced on the server (`owner_*` functions check the caller's role), not in the app.
Re-run `supabase/schema.sql` in the SQL editor after pulling this version. It is safe to run again.

## Look and feel (2.2.0)

- **13 typefaces** in Settings > Font, bundled in `www/fonts` (all OFL), saved with the account. Each choice sets `data-font` on `<html>`; the rules live at the end of `www/css/app.css`.
- **Effects layer** `www/js/fx.js`: one additive canvas for sparks, embers, shockwaves and flashes. Runs only while something is alive, scales down on weak phones, off with reduced motion.
- **Ceremonies** (`ceremony()` in `views.js`): charge, impact, reveal. Level up, new rank (coloured by rank), skill, and a workout-complete screen with a counting XP total.
- **Rank name glow**: `.glow[data-rank]`, stronger at every rank from E to S. The Ranks list in Settings previews each one.
- **Charged hunter**: after a saved workout the Home hunter's aura is charged for the rest of the day and flares once (`setCharged`, `burst` in `hero2d.js`).
- Sounds are synthesised (`synth()` in `core.js`), no audio files.
