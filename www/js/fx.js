/* Ascendant effects layer.
   One full-screen canvas for sparks, embers, shockwaves and flashes, drawn additively so they read as light.
   The loop runs only while something is alive. Respects reduced motion and scales down on weak phones. */
const FX = (() => {
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LOW = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 3;
  const Q = LOW ? 0.55 : 1, MAX = LOW ? 260 : 520;
  let cv = null, ctx = null, W = 0, H = 0, DPR = 1, raf = 0, last = 0;
  const P = [], emitters = [], timers = [], sprites = {};

  const rgb = c => { c = String(c || "").trim(); if (c[0] === "#"){ if (c.length === 4) c = "#" + [...c.slice(1)].map(x => x + x).join(""); const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    const m = c.match(/(\d+)[ ,]+(\d+)[ ,]+(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [201, 162, 77]; };
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--acc").trim() || "#C9A24D";
  const rnd = (a, b) => a + Math.random() * (b - a);

  function ensure(){
    if (cv) return true; if (REDUCED) return false;
    cv = document.createElement("canvas"); cv.id = "fx"; cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:90;pointer-events:none";
    document.body.appendChild(cv); ctx = cv.getContext("2d"); resize(); addEventListener("resize", resize); return true;
  }
  function resize(){ if (!cv) return; DPR = Math.min(devicePixelRatio || 1, LOW ? 1.25 : 2); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
  function sprite(col){ const k = col.join(); if (sprites[k]) return sprites[k];
    const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(255,255,255,1)`); g.addColorStop(.25, `rgba(${col},.85)`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return sprites[k] = c; }
  function kick(){ if (!raf && cv) { last = 0; raf = requestAnimationFrame(loop); } }
  function push(p){ if (P.length < MAX) P.push(p); }

  function loop(ts){
    raf = 0; const dt = Math.min(.05, last ? (ts - last) / 1000 : .016); last = ts;
    for (let i = emitters.length - 1; i >= 0; i--){ const e = emitters[i]; e.t += dt; e.acc += dt * e.rate; while (e.acc >= 1){ e.acc -= 1; e.spawn(); } if (e.t >= e.dur) emitters.splice(i, 1); }
    ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = "lighter";
    for (let i = P.length - 1; i >= 0; i--){ const p = P[i]; p.life += dt; if (p.life < 0) continue; const k = p.life / p.max; if (k >= 1){ P.splice(i, 1); continue; }
      if (p.kind === "spark"){ p.vx *= Math.pow(p.drag, dt * 60); p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        const a = (1 - k) * (1 - k), tl = p.trail; ctx.strokeStyle = `rgba(${p.c},${a})`; ctx.lineWidth = p.s * (1 - k * .6); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * tl, p.y - p.vy * tl); ctx.stroke();
        if (p.head){ ctx.globalAlpha = a; ctx.drawImage(sprite(p.c), p.x - p.s * 3, p.y - p.s * 3, p.s * 6, p.s * 6); ctx.globalAlpha = 1; } }
      else if (p.kind === "pull"){ const e = k * k; p.x = p.x0 + (p.tx - p.x0) * e; p.y = p.y0 + (p.ty - p.y0) * e; const px = p.x0 + (p.tx - p.x0) * Math.max(0, e - .09), py = p.y0 + (p.ty - p.y0) * Math.max(0, e - .09);
        ctx.strokeStyle = `rgba(${p.c},${.25 + .75 * k})`; ctx.lineWidth = p.s; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(px, py); ctx.stroke(); }
      else if (p.kind === "ember"){ p.y += p.vy * dt; p.x += Math.sin(p.life * p.w + p.ph) * p.sw * dt; const a = Math.sin(Math.min(1, k) * Math.PI) * p.a * (.7 + .3 * Math.sin(p.life * 9 + p.ph));
        ctx.globalAlpha = Math.max(0, a); ctx.drawImage(sprite(p.c), p.x - p.s, p.y - p.s, p.s * 2, p.s * 2); ctx.globalAlpha = 1; }
      else if (p.kind === "ring"){ const e = 1 - Math.pow(1 - k, 3), r = p.r0 + (p.r1 - p.r0) * e; ctx.strokeStyle = `rgba(${p.c},${(1 - k) * p.a})`; ctx.lineWidth = Math.max(.5, p.w * (1 - k)); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.stroke(); }
      else if (p.kind === "glow"){ const a = Math.sin(k * Math.PI) * p.a, r = p.r * (.7 + .5 * k); ctx.globalAlpha = a; ctx.drawImage(sprite(p.c), p.x - r, p.y - r, r * 2, r * 2); ctx.globalAlpha = 1; }
      else if (p.kind === "flash"){ ctx.fillStyle = `rgba(${p.c},${(1 - k) * (1 - k) * p.a})`; ctx.fillRect(0, 0, W, H); }
    }
    if (P.length || emitters.length) raf = requestAnimationFrame(loop); else ctx.clearRect(0, 0, W, H);
  }

  const api = {
    reduced: REDUCED, accent,
    /* centre of an element in viewport pixels */
    pos(el){ if (typeof el === "string") el = document.querySelector(el); if (!el) return [innerWidth / 2, innerHeight * .4]; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
    burst(x, y, o = {}){ if (!ensure()) return; const c = rgb(o.col || accent()), n = Math.round((o.n || 60) * Q), sp = o.speed || 620, a0 = o.angle ?? 0, spread = o.spread ?? Math.PI * 2;
      for (let i = 0; i < n; i++){ const a = a0 + (Math.random() - .5) * spread, v = sp * (.25 + Math.random() * .75) * (Math.random() < .12 ? 1.5 : 1);
        push({kind: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.g ?? 520, drag: o.drag ?? .955, life: -Math.random() * (o.jitter || .04), max: (o.life || .9) * rnd(.6, 1.15), s: (o.size || 2) * rnd(.6, 1.4), trail: o.trail || .035, c: Math.random() < (o.white ?? .25) ? [255, 255, 255] : c, head: Math.random() < .3}); }
      kick(); },
    implode(x, y, o = {}){ if (!ensure()) return; const c = rgb(o.col || accent()), n = Math.round((o.n || 70) * Q), R = o.r || Math.max(innerWidth, innerHeight) * .6, d = (o.dur || 620) / 1000;
      for (let i = 0; i < n; i++){ const a = Math.random() * 6.2832, r = R * rnd(.55, 1), dl = Math.random() * d * .55;
        push({kind: "pull", x0: x + Math.cos(a) * r, y0: y + Math.sin(a) * r, tx: x, ty: y, x: 0, y: 0, life: -dl, max: d - dl, s: rnd(1, 2.4), c: Math.random() < .3 ? [255, 255, 255] : c}); }
      kick(); },
    ring(x, y, o = {}){ if (!ensure()) return; push({kind: "ring", x, y, r0: o.r0 || 10, r1: o.r1 || Math.max(innerWidth, innerHeight) * .7, life: -(o.delay || 0) / 1000, max: (o.dur || 700) / 1000, w: o.width || 6, a: o.alpha ?? .9, c: rgb(o.col || accent())}); kick(); },
    glow(x, y, o = {}){ if (!ensure()) return; push({kind: "glow", x, y, r: o.r || 220, life: 0, max: (o.dur || 900) / 1000, a: o.alpha ?? .8, c: rgb(o.col || accent())}); kick(); },
    flash(o = {}){ if (!ensure()) return; push({kind: "flash", life: 0, max: (o.dur || 420) / 1000, a: o.alpha ?? .55, c: rgb(o.col || "#ffffff")}); kick(); },
    /* embers that drift up from the bottom of the screen for a while */
    embers(o = {}){ if (!ensure()) return; const c = rgb(o.col || accent());
      emitters.push({t: 0, acc: 0, dur: (o.dur || 4000) / 1000, rate: (o.rate || 22) * Q, tag: o.tag, spawn(){ push({kind: "ember", x: rnd(0, W), y: H + 10, vy: -rnd(60, 190), w: rnd(1.5, 4), ph: rnd(0, 6), sw: rnd(10, 46), s: rnd(2, 6), a: rnd(.35, .9), life: 0, max: rnd(2.4, 4.6), c: Math.random() < .2 ? [255, 255, 255] : c}); }}); kick(); },
    /* a fountain of sparks from a point, e.g. while a number counts up */
    fountain(x, y, o = {}){ if (!ensure()) return; const col = o.col || accent();
      emitters.push({t: 0, acc: 0, dur: (o.dur || 800) / 1000, rate: (o.rate || 60) * Q, tag: o.tag, spawn(){ api.burst(x + rnd(-(o.w || 40), o.w || 40), y, {col, n: 1 / Q, speed: o.speed || 420, angle: -Math.PI / 2, spread: o.spread || 1.1, g: 700, life: .8, size: 1.8, white: .35}); }}); kick(); },
    at(ms, fn){ const id = setTimeout(() => { timers.splice(timers.indexOf(id), 1); try { fn(); } catch(e){ console.error(e); } }, REDUCED ? 0 : ms); timers.push(id); return id; },
    /* number tween, eased. fmt gets the current integer. */
    count(el, from, to, dur, fmt, tick){ if (typeof el === "string") el = document.querySelector(el); if (!el) return; fmt = fmt || (v => String(v));
      if (REDUCED || dur <= 0){ el.textContent = fmt(to); return; } const t0 = performance.now(); let lastV = from;
      const step = now => { if (!el.isConnected) return; const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3), v = Math.round(from + (to - from) * e); if (v !== lastV){ el.textContent = fmt(v); if (tick) tick(v, k); lastV = v; } if (k < 1) requestAnimationFrame(step); };
      el.textContent = fmt(from); requestAnimationFrame(step); },
    shake(el, cls = "fx-shake"){ if (REDUCED) return; if (typeof el === "string") el = document.querySelector(el); if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); },
    /* stop everything: used when a ceremony closes */
    clear(){ timers.splice(0).forEach(clearTimeout); emitters.length = 0; for (let i = P.length - 1; i >= 0; i--){ const p = P[i]; if (p.life < 0) P.splice(i, 1); else if (p.kind !== "spark") p.max = Math.min(p.max, p.life + .25); } },
    stop(tag){ for (let i = emitters.length - 1; i >= 0; i--) if (emitters[i].tag === tag) emitters.splice(i, 1); }
  };
  return api;
})();
