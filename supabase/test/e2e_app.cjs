// App end-to-end test in a real browser: owner, guild master and participant, each in their own "phone",
// against the mock Supabase (real Postgres). Run: node e2e_app.cjs  (app served on :8765, mock on :54321)
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const APP = process.env.APP_URL || 'http://localhost:8765/index.html', MOCK = 'http://localhost:54321';
const OUT = process.env.SHOTS || '/tmp/e2e-shots/'; fs.mkdirSync(OUT, { recursive: true });
const DB = process.env.PGDATABASE || 'asc_e2e';
const sql = q => execFileSync('psql', ['-h', '/tmp', '-p', '5499', '-U', 'postgres', '-d', DB, '-At', '-c', q], { encoding: 'utf8' }).trim();
let pass = 0, fail = 0; const ok = (c, n, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? ' :: ' + String(x).slice(0, 300) : '')); } };
const sfx = Date.now().toString(36).slice(-4);
const OWNER = 'deepansh_' + sfx, GM = 'yodha_' + sfx, P = 'rahul_' + sfx, GYM = 'Yodha Gym ' + sfx;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQ0lEQVR42u3PQREAAAgDINc/tJp8D7gAOWW3wOPj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+Pj4+fj48POqgABo0ORz8AAAAASUVORK5CYII=', 'base64');

async function phone(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push(m.text().slice(0, 200)); });
  await p.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.ASCENDANT_CONFIG={supabaseUrl:"${MOCK}",supabaseAnonKey:"anon-test-key",updateUrl:""};` }));
  // stand-in for Razorpay checkout: "pays" through the mock and returns Razorpay's signed response to the app
  await p.route('https://checkout.razorpay.com/**', r => r.fulfill({ contentType: 'text/javascript', body: `window.Razorpay=function(o){this.o=o};
    Razorpay.prototype.on=function(){};Razorpay.prototype.open=function(){var o=this.o;window.__rzOpened=o;
    fetch("${MOCK}/__test/pay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order_id:o.order_id})}).then(r=>r.json()).then(o.handler)};` }));
  p.shot = async n => { await p.waitForTimeout(300); await p.screenshot({ path: OUT + name + '-' + n + '.png' }); };
  p.name = name; return p;
}
const click = async (p, sel) => { await p.click(sel); await p.waitForTimeout(250); };
const textOf = async (p, sel) => (await p.textContent(sel) || '').replace(/\s+/g, ' ').trim();
async function onboard(p, opts = {}) {
  await p.waitForSelector('#w', { timeout: 20000 });
  ok(await p.$eval('#n', e => e.readOnly), p.name + ': username locked to the account in onboarding');
  await p.fill('#w', '74'); await click(p, '[data-act=onb-next]');
  await click(p, '[data-act=onb-next]');
  const today = (new Date().getDay() + 6) % 7;
  await click(p, `[data-act=onb-day][data-d="${today}"][data-m="Chest"]`);
  await click(p, '[data-act=onb-next]'); await click(p, '[data-act=onb-next]');
  await p.waitForSelector('[data-act=onb-next]'); await click(p, '[data-act=onb-next]');
  await p.waitForSelector('.hero', { timeout: 20000 });
}
async function logWorkout(p) {
  await click(p, '[data-act=go-today]');
  const ins = await p.$$('input[data-in]');
  for (let i = 0; i < Math.min(ins.length, 6); i++) { await ins[i].fill(String(i % 2 ? 8 : 50)); await ins[i].dispatchEvent('change'); }
  await click(p, '[data-act=finish]');
  for (let i = 0; i < 6; i++) { if (await p.$('#layer [data-act=close]')) await click(p, '#layer [data-act=close]'); if (await p.$('[data-act=cer-close]')) await click(p, '[data-act=cer-close]'); }
}
const tab = (p, t) => click(p, `[data-act=tab][data-v=${t}]`);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  console.log('owner');
  const o = await phone(browser, 'owner'); await o.goto(APP, { waitUntil: 'domcontentloaded' });
  await o.waitForSelector('[data-act=ac-step][data-v=role]'); await o.shot('welcome');
  ok(await o.$('[data-act=ac-step][data-v=signin]') && await o.$('[data-act=demo]'), 'welcome shows create, sign in, demo');
  await click(o, '[data-act=ac-step][data-v=role]'); await o.shot('role');
  await click(o, '[data-act=ac-step][data-v=participant]');
  await o.fill('#af-display', 'Deepansh Deep'); await o.fill('#af-username', OWNER); await o.waitForTimeout(1600);
  ok(/available/.test(await textOf(o, '#hint-username')), 'live username availability check', await textOf(o, '#hint-username'));
  await o.fill('#af-password', 'short'); await o.fill('#af-password2', 'short'); await click(o, '[data-act=ac-signup-p]');
  ok(/at least 8/.test(await textOf(o, '.err')), 'short password rejected in the app');
  await o.fill('#af-password', 'ownerpass1'); await o.fill('#af-password2', 'ownerpass1'); await click(o, '[data-act=ac-signup-p]');
  await o.waitForSelector('[data-act=ac-join-skip]', { timeout: 15000 }); await o.shot('join-step');
  ok(true, 'participant signup leads to "join your gym\'s guild?" step');
  await click(o, '[data-act=ac-join-skip]');
  await onboard(o);
  sql(`update public.profiles set role = 'owner' where username = '${OWNER}'`);
  await o.reload(); await o.waitForSelector('.hero', { timeout: 20000 });
  await tab(o, 'guild'); await o.waitForSelector('[data-act=ac-atab]', { timeout: 15000 });
  await click(o, '[data-act=ac-grefresh]'); await o.waitForSelector('.cmp', { timeout: 15000 });
  ok(/Admin/.test(await textOf(o, '.page-h h1')), 'owner sees the Admin panel in the Guild tab');
  await o.fill('#cc-note', 'Yodha Gym, paid Nov'); await click(o, '[data-act=ac-mkcodes]');
  await o.waitForSelector('.newcodes .code', { timeout: 10000 }); await o.shot('admin-codes');
  const CODE = await textOf(o, '.newcodes .code'); ok(/^GM-[A-Z2-9]{8}$/.test(CODE), 'owner creates a guild master code in the app', CODE);

  console.log('guild master');
  const g = await phone(browser, 'master'); await g.goto(APP, { waitUntil: 'domcontentloaded' });
  await g.waitForSelector('[data-act=ac-step][data-v=role]'); await click(g, '[data-act=ac-step][data-v=role]'); await click(g, '[data-act=ac-step][data-v=master]');
  await g.fill('#af-code', 'GM-WRONG123'); await g.waitForTimeout(1600);
  ok(/Invalid/.test(await textOf(g, '#hint-code')), 'wrong code flagged live');
  await g.fill('#af-code', CODE); await g.waitForTimeout(1600);
  ok(/accepted/.test(await textOf(g, '#hint-code')), 'valid code accepted live');
  await g.fill('#af-gym', GYM); await g.fill('#af-city', 'Bokaro Steel City'); await g.fill('#af-display', 'Vikram Singh');
  await g.fill('#af-username', GM); await g.fill('#af-password', 'gympass123'); await g.fill('#af-password2', 'gympass123'); await g.shot('master-form');
  await click(g, '[data-act=ac-signup-m]');
  await onboard(g);
  await tab(g, 'guild'); await g.waitForSelector('[data-act=ac-mtab]', { timeout: 15000 });
  await click(g, '[data-act=ac-mtab][data-v=manage]'); await g.waitForSelector('.code-big', { timeout: 15000 });
  const JOIN = await textOf(g, '.code-big'); ok(/^[A-Z2-9]{6}$/.test(JOIN), 'master sees his gym join code', JOIN);
  await g.setInputFiles('#logoFile', { name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await g.waitForSelector('.logo-pick img.glogo', { timeout: 15000 }); ok(true, 'master uploads gym logo from the app');
  await g.fill('#mg-city', 'Bokaro'); await click(g, '[data-act=ac-gsave]'); await g.waitForTimeout(800);
  ok(sql(`select city from public.guilds where name = '${GYM}'`) === 'Bokaro', 'gym profile edit saved on server');
  await g.shot('manage');

  console.log('participant');
  const r = await phone(browser, 'participant'); await r.goto(APP, { waitUntil: 'domcontentloaded' });
  await r.waitForSelector('[data-act=ac-step][data-v=role]'); await click(r, '[data-act=ac-step][data-v=role]'); await click(r, '[data-act=ac-step][data-v=participant]');
  await r.fill('#af-display', 'Rahul Kumar'); await r.fill('#af-username', OWNER); await r.waitForTimeout(1600);
  ok(/taken/.test(await textOf(r, '#hint-username')), 'taken username flagged live');
  await r.fill('#af-username', P); await r.fill('#af-password', 'rahulpass1'); await r.fill('#af-password2', 'rahulpass1');
  await click(r, '[data-act=ac-signup-p]'); await r.waitForSelector('[data-act=ac-join-yes]', { timeout: 15000 });
  await click(r, '[data-act=ac-join-yes]'); await r.fill('#af-join', 'ZZZZZZ'); await click(r, '[data-act=ac-join-onb]'); await r.waitForTimeout(600);
  ok(/No gym uses this join code/.test(await textOf(r, '.err')), 'wrong join code shows a clear error');
  await r.fill('#af-join', JOIN.toLowerCase()); await click(r, '[data-act=ac-join-onb]');
  await onboard(r);
  ok(/Waiting for approval/.test(await textOf(r, '.guild-card')), 'home shows pending guild request');
  await logWorkout(r); await r.waitForTimeout(3500);
  ok(+sql(`select count(*) from public.user_logs l join public.profiles p on p.id = l.user_id where p.username = '${P}'`) >= 1, 'workout synced to the server in the background');
  await tab(r, 'guild'); await r.waitForTimeout(800); await r.shot('pending');
  ok(/needs to approve/.test(await textOf(r, '#app')), 'guild tab explains the pending state');

  console.log('approval');
  await click(g, '[data-act=ac-grefresh]'); await g.waitForSelector('[data-act=ac-approve]', { timeout: 15000 }); await g.shot('request');
  await click(g, '[data-act=ac-approve]'); await g.waitForTimeout(1200);
  ok(/Member approved/.test(await textOf(g, 'body')) || +sql(`select count(*) from public.memberships where status = 'approved'`) === 2, 'master approves the request');
  await click(r, '[data-act=ac-grefresh]'); await r.waitForSelector('.board li', { timeout: 20000 }); await r.waitForTimeout(500); await r.shot('board');
  const rows = await r.$$eval('.board li', ls => ls.map(l => l.innerText.replace(/\s+/g, ' ')));
  ok(rows.length === 2 && rows.some(t => t.includes('Rahul Kumar')), 'participant sees live leaderboard with both members', JSON.stringify(rows));
  ok(/Your position/.test(await textOf(r, '.me-pos')), 'personal position shown');
  await click(r, '[data-act=gcat][data-v=strength]'); await r.waitForSelector('.board li', { timeout: 15000 }); ok(true, 'switching category loads that board');

  console.log('purchase');
  await tab(r, 'hunter'); await click(r, '[data-act=htab][data-v=shop]'); await r.waitForSelector('[data-act=ac-buy]', { timeout: 15000 }); await r.shot('shop');
  ok(!(await r.$('[data-act=buy-crystals]')), 'no free test-purchase buttons left');
  const before = +(await textOf(r, '.balance .big'));
  await click(r, '[data-act=ac-buy][data-v=crystals_55]'); await r.waitForTimeout(3000);
  ok(await r.evaluate(() => window.__rzOpened && window.__rzOpened.amount === 4900), 'checkout opened with the server price (₹49)');
  await r.waitForFunction(b => +document.querySelector('.balance .big').textContent.trim() === b + 55, before, { timeout: 15000 }).then(() => ok(true, 'balance rises by 55 after server-verified payment')).catch(async () => ok(false, 'balance rises by 55', await textOf(r, '.balance .big')));
  ok(sql(`select bought from public.wallets w join public.profiles p on p.id = w.user_id where p.username = '${P}'`) === '55', 'wallet on server holds the 55 crystals');

  console.log('owner controls');
  await click(o, '[data-act=ac-atab][data-v=guilds]'); await o.waitForSelector('[data-act=ac-gextend]', { timeout: 15000 }); await o.shot('admin-guilds');
  ok((await textOf(o, '#app')).includes(GYM) && await o.$('#app img.glogo'), 'owner sees the gym with its logo');
  sql(`update public.guilds set paid_until = current_date - 30 where name = '${GYM}'`);
  await click(r, '[data-act=tab][data-v=guild]'); await click(r, '[data-act=ac-grefresh]'); await r.waitForTimeout(2500);
  ok(/inactive|expired/i.test(await textOf(r, '#app')), 'expired subscription shown to members', await textOf(r, '#app'));
  await click(o, '[data-act=ac-grefresh]'); await o.waitForSelector('[data-act=ac-gextend][data-d="30"]', { timeout: 15000 });
  await click(o, '[data-act=ac-gextend][data-d="365"]'); await o.waitForTimeout(1200);
  ok(sql(`select paid_until > current_date + 300 from public.guilds where name = '${GYM}'`) === 't', 'owner extends subscription by a year from the app');
  await click(o, '[data-act=ac-atab][data-v=users]'); await o.fill('#us-q', 'rahul'); await click(o, '[data-act=ac-usearch]');
  await o.waitForSelector('[data-act=ac-resetpw]', { timeout: 15000 }); await click(o, '[data-act=ac-resetpw]');
  await o.fill('#rpw', 'freshpass9'); await click(o, '[data-act=ac-resetpw-save]'); await o.waitForTimeout(1000);
  ok(/Password reset/.test(await textOf(o, 'body')), 'owner resets a member password');
  // crystals grant through the owner screen
  await click(o, '[data-act=ac-grant]'); await o.fill('#gr-n', '25'); await o.fill('#gr-r', 'e2e'); await click(o, '[data-act=ac-grant-save]'); await o.waitForTimeout(1200);
  ok(sql(`select coalesce(max(w.bought),0) from public.wallets w join public.profiles p on p.id = w.user_id where p.username = '${P}'`) !== '0' && sql(`select count(*) from public.owner_log where action = 'grant_crystals' and target_name = '${P}'`) === '1', 'owner grants crystals from the app and it is logged');
  // delete needs the exact username typed
  await o.waitForSelector('[data-act=ac-deluser]', { timeout: 15000 }); await click(o, '[data-act=ac-deluser]');
  await o.fill('#du-c', 'wrong'); await click(o, '[data-act=ac-deluser-do]'); await o.waitForTimeout(400);
  ok(/does not match/.test(await textOf(o, 'body')) && sql(`select count(*) from public.profiles where username = '${P}'`) === '1', 'delete is refused until the username is typed correctly');
  await click(o, '[data-act=close]');
  // owner has no delete button on his own row
  await o.fill('#us-q', OWNER); await click(o, '[data-act=ac-usearch]'); await o.waitForTimeout(1500);
  ok(await o.$$eval('[data-act=ac-deluser]', n => n.length) === 0, 'owner row has no delete button');

  console.log('new phone restore');
  await tab(r, 'home'); await r.waitForTimeout(3500);
  const errs = [o, g, r].map(p => [p.name, p.errs]);
  for (const p of [o, g, r]) await p.context().close();
  const r2 = await phone(browser, 'newphone'); await r2.goto(APP, { waitUntil: 'domcontentloaded' });
  await r2.waitForSelector('[data-act=ac-step][data-v=signin]'); await click(r2, '[data-act=ac-step][data-v=signin]');
  await r2.fill('#af-username', P); await r2.fill('#af-password', 'rahulpass1'); await click(r2, '[data-act=ac-signin]'); await r2.waitForTimeout(800);
  ok(/Wrong username or password/.test(await textOf(r2, '.err')), 'old password no longer works');
  await r2.fill('#af-password', 'freshpass9'); await click(r2, '[data-act=ac-signin]');
  await r2.waitForSelector('.hero', { timeout: 30000 }); await r2.waitForTimeout(800); await r2.shot('restored');
  const wk = await r2.evaluate(() => S && Object.keys(S.logs).length);
  ok(wk >= 1, 'new phone restores the training from the server', wk);
  await tab(r2, 'settings'); await r2.waitForSelector('[data-act=ac-signout]'); await r2.shot('settings');
  await click(r2, '[data-act=ac-signout]'); await click(r2, '[data-act=ac-signout-yes]');
  await r2.waitForSelector('[data-act=ac-step][data-v=role]', { timeout: 20000 });
  ok(await r2.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ascendant_v1:')).length === 0), 'sign out removes the training from the phone');

  for (const [n, e] of errs.concat([[r2.name, r2.errs]])) ok(e.length === 0, n + ': no console errors', e.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
