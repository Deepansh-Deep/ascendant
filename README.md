# Ascendant 2.0

A gym tracker built as a fitness RPG. You log real sets; a realistic 3D hunter evolves with your training; your gym's guild ranks members fairly.

Offline first. Training data never leaves the phone. The optional guild server only receives a nickname and four scores.

## What's inside

```
www/                      The app (installable PWA, also wrapped by Capacitor for Android)
  index.html              Shell: loads the CSS and scripts below
  css/app.css             Design system (tokens, components, themes)
  js/core.js              Engine: dates, state, XP, levels, ranks, skills, body stages, timer, backup, reminders, demo data
  js/ui.js                Catalog (rarity, prices), evolution tiers, challenges, achievements, guild scoring + server client, charts
  js/views.js             Every screen, onboarding, actions, boot
  js/hunter3d.js          3D engine (three.js): loads the GLB hunters, customization, morph evolution, poses, camera, aura
  js/config.js            Guild server URL + anon key (empty = offline only)
  vendor/three-bundle.js  three.js r187 + GLTFLoader + RoomEnvironment (MIT, see THREE-LICENSE.txt)
  assets/hunter/          Generated 3D characters and textures (CC0)
  fonts/                  Sora, Inter, Barlow Condensed (OFL)
  dev/viewer.html         3D test harness (URL params: look, body, pose, view, zoom, aura)
pipeline/                 Python generator for the 3D characters (see pipeline/README.md)
supabase/schema.sql       Guild server: tables, row-level security, RPC functions
android/                  Capacitor Android project
.github/workflows/        Cloud build that produces an installable debug APK
```

## Screens

- **Home**: large interactive 3D hunter, hunter name and @username, rank badge, level and XP bar, next evolution milestone, today's workout status, daily and weekly challenges, badges, streak, consistency, bodyweight, gym ranking, last week's grade.
- **Train**: Workout (week strip, per-day log, sets, reps, weight, rest timer, "same as last time", last session and all-time best per exercise, live PR detection), Skills (calisthenics trees), History (every session with sets, volume and PR count). Past logs can be edited or discarded; missed days stay missed.
- **Hunter**: 3D studio with Front, Angle, Side, Back and Face views, drag to rotate, pinch or scroll to zoom. Customize (body, skin, face shape, jaw, nose, eyes, brows, frame, hunter name, hair and color, facial hair, tops, bottoms, footwear, garment colors, gear, aura, pose), Evolution (tier ladder and per-muscle stages), Shop, Badges.
- **Progress**: week, month or all time; weekly volume chart, consistency chart, strength trend per exercise (estimated 1RM, Epley), muscles trained, personal records, bodyweight trend, progress photos, report card.
- **Guild**: join with a gym code and nickname, leaderboards (Overall, Consistency, Strength, Progress; weekly, monthly, all time), your position and change since your last visit, competition history, leave and delete. Without a configured server it says so and only shows your locally computed scores.
- **Plan and settings** (gear icon on Home): profile, theme, training style, weekly split, exercises, reminders, rest timer, sound, rank ladder, XP rules, backup and restore, demo data, reset.

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

**Payments are not connected.** The crystal pack and Pass buttons are labelled "test, no charge" and grant items without payment. Before charging real money, integrate Google Play Billing in `www/js/views.js` (actions `buy-crystals` and `buy-pass`).

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

## Guild scoring (transparent)

- **Consistency**: planned days trained ÷ planned days so far in the period (at most 6 days per week count).
- **Strength**: average estimated 1RM of your 3 strongest weighted lifts ÷ bodyweight, where 1.5× = 100; or skill-tree mastery if higher (bodyweight athletes).
- **Progress**: average estimated-1RM gain against your own previous 4 weeks, capped at 4% a week or 15% a month, plus 10 per skill unlocked in the period.
- **Overall**: 40% consistency + 30% progress + 30% strength.

Beginners can top Consistency and Progress because both compare you with yourself.

## Guild server setup (Supabase)

1. Create a Supabase project and run `supabase/schema.sql` in its SQL editor.
2. Authentication > Providers: enable **Anonymous sign-ins**.
3. Add each partner gym: `insert into public.guilds (code, name, city) values ('YODHA-24', 'Yodha Gym', 'City');`
4. Put the project URL and anon key in `www/js/config.js`, then `npx cap sync android` and rebuild.

Tested: the SQL was run on PostgreSQL 16 with Supabase's auth functions mocked, and the app's guild client was driven end to end against those real functions (join, wrong code, taken nickname, score submission, leaderboards per category, history, leave and delete). Not tested: a live Supabase project (PostgREST, anonymous sign-in, token refresh). Scores are computed on the phone; the server validates ranges, the overall formula and that only the current period is written, but a modified app could still submit false scores.

## Run and test

```
cd www && python3 -m http.server 8765
```
Open http://localhost:8765. Use "Try demo data" on the welcome screen to explore with generated workouts (clearly bannered; demo data cannot join a guild). The 3D harness is at http://localhost:8765/dev/viewer.html.

Android APK without Android Studio: push this folder to a private GitHub repo, open Actions, run "Build Android APK", download **ascendant-debug-apk**.

After any change in `www/`: `npx cap sync android`, and bump `VERSION` in `www/js/core.js` and `www/sw.js`.

## Publish on Google Play

1. Google Play Console account, Android Studio, `npm install`, `npx cap open android`.
2. Build > Generate Signed Bundle. Back up the keystore; losing it means you can never update the app.
3. Integrate Google Play Billing before selling crystals or the Pass.
4. Privacy policy: training data stays on the phone; guild members share a nickname and four scores.

## For developers: known gaps and next steps

Honest state of the build, in rough priority order:

1. **3D asset weight.** `male.glb` and `female.glb` are about 7.7 MB each, uncompressed, with no LOD. Next step: meshopt or Draco geometry compression and KTX2 textures via `@gltf-transform/cli`, plus the matching decoders in `vendor/three-bundle.js`. Not yet tested on a real mid-range Android phone.
2. **Character art.** Hair and clothes are procedural shells. Up close the hair reads as a helmet (fade is the weakest), the full beard is mediocre, fingers stay open in every pose, the hoodie has no hood, garments have no wrinkles. Real fixes: MakeHuman CC0 asset packs via `pipeline/extra_assets`, hair cards, or an artist working in Blender.
3. **Guild server.** `supabase/schema.sql` runs on Postgres 16 and the client was driven end to end against it with mocked Supabase auth, but it has never run on a live Supabase project. Scores are computed on the phone, so a modified client can cheat; server-side recomputation needs log sync.
4. **Guild features not built:** gym logos (gyms get a letter badge), member profiles, gym achievements, a top-performers page, a gym owner panel, events and posters.
5. **Payments.** Not connected. Crystal packs and the Pass are test buttons labelled "no charge". Integrate Google Play Billing in `www/js/views.js` (`buy-crystals`, `buy-pass`).
6. **Hosted previews.** Hosts that refuse `.glb` files can use `config.modelExt = ".glb.json"` with the models wrapped as `{"glb": "<base64>"}` (see `_loadGLB` in `www/js/hunter3d.js`).

### Testing used so far

- `www/dev/viewer.html`: 3D harness, driven by Playwright with SwiftShader WebGL for screenshots.
- End-to-end browser runs through onboarding, demo data, every tab, logging, PRs, shop purchase, identity redesign, ceremonies and the guild flow, with zero console errors at 360 px and 400 px widths.
- There is no automated test suite in the repo yet. Adding one (Playwright) is a good first task.

## Licenses

- Human base mesh, morph targets, skeleton, weights, eye mesh and textures: MakeHuman and MPFB2 assets, CC0.
- Generated garments, hair, beards and textures: CC0 (made by the pipeline in this repo).
- three.js: MIT. Sora, Inter, Barlow Condensed: SIL Open Font License.
