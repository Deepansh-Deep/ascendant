/* Ascendant hero stage: one 2D character image (assets/hero/male.png or female.png) brought to life with WebGL.
   - The aura is traced from the character's own outline, so it hugs the body and rises into flame tongues.
   - Aura strength comes from progress (level, rank, streak, bests). Colour and style follow the rank.
   - After a workout the hero is "charged" for the day; burst() flares it once.
   Art can be any PNG: transparent background preferred, a flat single-colour background is keyed out automatically.
   The character is cropped to its outline, so framing does not need to be exact. */
const Hero2D = (() => {
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LOW = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 3;
  const PALETTES = {
    // style: 0 flame, 1 shadow and smoke, 2 calm spirit with sparks
    E: {core: "#F2F6FF", main: "#9FB4D6", deep: "#34425E", style: 2},
    D: {core: "#F0FFF6", main: "#3EDB86", deep: "#0C6B45", style: 0},
    C: {core: "#EAF4FF", main: "#3F8CFF", deep: "#1A2C9A", style: 0},
    B: {core: "#F5ECFF", main: "#A970FF", deep: "#3B1B8E", style: 1},
    A: {core: "#FFFCE8", main: "#FFD24A", deep: "#E0780F", style: 0},
    S: {core: "#FFE6D9", main: "#FF3B2E", deep: "#5E0610", style: 1},
    SS: {core: "#FFFFFF", main: "#FFE9A8", deep: "#C9862A", style: 0},
    SSS: {core: "#F3E8FF", main: "#8E4DFF", deep: "#0B0614", style: 1},
    ASC: {core: "#FFFFFF", main: "#BFE8FF", deep: "#3A5BFF", style: 2}
  };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  const VS = `attribute vec2 aP; varying vec2 vF; void main(){ vF = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }`;
  const FS = `precision highp float;
    varying vec2 vF;
    uniform sampler2D tImg, tMask; uniform vec2 uRes; uniform vec4 uRect; uniform float uT, uPow, uCharge, uBurst, uStyle, uBreath;
    uniform vec3 uCore, uMain, uDeep;
    float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vn(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; } return v; }
    vec4 M(vec2 p){ if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec4(0.0); return texture2D(tMask, p); }
    vec4 I(vec2 p){ if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec4(0.0); return texture2D(tImg, p); }
    void main(){
      vec2 px = vF * uRes;
      vec2 p = (px - uRect.xy) / uRect.zw;                       // 0..1 inside the character image, y up
      float br = uBreath * smoothstep(0.25, 0.75, p.y);           // breathing lifts the upper body only
      vec2 pi = vec2(0.5 + (p.x - 0.5) / (1.0 + br * 0.35), p.y / (1.0 + br));
      vec2 q = vec2(p.x * uRect.z / uRect.w, p.y);                // isotropic coordinates for noise
      float t = uT, charge = uCharge, pw = uPow;
      vec4 c = I(pi);
      vec4 m0 = M(pi);

      // ---- aura
      float n  = fbm(q * vec2(5.0, 2.6) - vec2(0.0, t * 1.1));
      float n2 = fbm(q * vec2(13.0, 5.5) - vec2(t * 0.2, t * 2.3));
      float streak = fbm(q * vec2(30.0, 3.0) - vec2(0.0, t * 3.2));
      float reach = 0.45 + 0.8 * pw + 0.5 * charge + 0.9 * uBurst;
      float lift = (0.010 + n * 0.06 + n2 * 0.055 + streak * 0.022) * reach;
      vec2 off = vec2((n - 0.5) * 0.05 + (n2 - 0.5) * 0.025, -lift);
      float w = M(pi + off).g;
      float w0 = m0.r;
      float f = w * (0.4 + 1.15 * n2) * (0.55 + 0.6 * pw + 0.35 * charge + 0.6 * uBurst);
      float flick = 0.9 + 0.1 * sin(t * 13.0 + n * 11.0);
      float outer = smoothstep(0.13, 0.16, f * flick) * (0.55 + 0.45 * smoothstep(0.35, 0.7, streak + n2 * 0.4));
      float mid   = smoothstep(0.33, 0.36, f * (0.75 + 0.5 * streak)) * (1.0 - smoothstep(0.7, 0.95, w0) * 0.8);
      float hot   = smoothstep(0.52, 0.56, f * (0.7 + 0.6 * streak));
      float core  = smoothstep(0.28, 0.36, w0) * (1.0 - smoothstep(0.62, 0.9, w0)) * (0.6 + 0.4 * n2);
      float k = clamp(0.35 + 0.6 * pw + 0.35 * charge, 0.0, 1.15) + uBurst * 0.8;
      vec3 au = uDeep * outer * (0.38 + 0.3 * streak) + uMain * mid * (0.5 + 0.6 * streak)
              + mix(uMain, uCore, 0.6) * hot * 0.5 + mix(uMain, uCore, 0.8) * core * 0.5;
      au += uMain * (smoothstep(0.0, 0.5, w0) * 0.5 + smoothstep(0.0, 0.7, M(pi).g) * 0.35) * 0.14;   // soft light on the background
      float smokeA = 0.0;
      if (uStyle > 0.5 && uStyle < 1.5){                          // shadow style: dark smoke around the light
        float s = fbm(q * vec2(4.0, 2.4) - vec2(t * 0.1, t * 0.5) + n2 * 0.4);
        float wide = M(pi + vec2(0.0, -0.05 - s * 0.05)).g;
        float smoke = smoothstep(0.04, 0.1, wide * (0.5 + s)) * (1.0 - mid) * smoothstep(0.45, 0.66, s);
        smokeA = smoke * 0.55 * min(k, 1.0); au *= 1.0 - smoke * 0.5;
      }
      if (uStyle > 1.5){                                           // spirit style: small sparks rising near the body
        vec2 g = vec2(q.x * 46.0, q.y * 46.0 - t * 3.0); vec2 id = floor(g); vec2 fr = fract(g) - 0.5;
        float rnd = h21(id), on = step(0.94, rnd) * smoothstep(0.03, 0.15, M(pi).g) * (1.0 - smoothstep(0.55, 0.9, w0));
        au += mix(uMain, uCore, 0.7) * on * (0.5 + 0.5 * sin(t * 7.0 + rnd * 40.0)) * smoothstep(0.16, 0.02, length(fr)) * 1.4;
      }
      au *= k;

      // ---- ground: contact shadow plus a pool of aura light under the feet
      vec2 gp = vec2((p.x - 0.5) * 1.9, (p.y - 0.012) * 9.0);
      float pool = exp(-dot(gp, gp) * 1.6);
      float shadow = pool * 0.55;
      au += uMain * pool * (0.05 + 0.2 * pw + 0.25 * charge + 0.6 * uBurst);

      // ---- rim light inside the body edge, coloured by the aura
      float rim = c.a * smoothstep(0.97, 0.72, m0.b) * (0.12 + 0.3 * pw + 0.4 * charge + 0.7 * uBurst) * (0.6 + 0.6 * n2);
      vec3 body = c.rgb + mix(uMain, uCore, 0.5) * rim * c.a;
      // a few tongues pass in front of the body edge
      float tongue = smoothstep(0.6, 0.66, n2 * M(pi + vec2(0.0, -0.03 - n2 * 0.04)).g * 1.4) * (1.0 - smoothstep(0.9, 0.99, m0.b)) * (0.3 * pw + 0.45 * charge + uBurst) * 0.5;
      body += mix(uMain, uCore, 0.6) * tongue;

      float auA = clamp(max(max(au.r, au.g), au.b) * 0.92 + smokeA + shadow * (1.0 - c.a), 0.0, 1.0);
      vec3 rgb = body + au * (1.0 - c.a);
      float a = c.a + auA * (1.0 - c.a);
      gl_FragColor = vec4(min(rgb, vec3(a)), a);
    }`;

  let cv = null, gl = null, prog = null, U = {}, raf = 0, el = null, ro = null, t0 = performance.now(), lastDraw = 0;
  const cache = {};
  const st = {hero: null, power: 0.3, charge: 0, chargeT: 0, burst: 0, pal: PALETTES.E, still: false};
  let supported = true;

  function init(){
    if (gl || !supported) return !!gl;
    cv = document.createElement("canvas"); cv.className = "hero-canvas";
    gl = cv.getContext("webgl", {premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false});
    if (!gl){ supported = false; return false; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aP"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ["tImg", "tMask", "uRes", "uRect", "uT", "uPow", "uCharge", "uBurst", "uStyle", "uBreath", "uCore", "uMain", "uDeep"].forEach(n => U[n] = gl.getUniformLocation(prog, n));
    gl.uniform1i(U.tImg, 0); gl.uniform1i(U.tMask, 1);
    cv.addEventListener("webglcontextlost", e => { e.preventDefault(); Object.keys(cache).forEach(k => delete cache[k]); gl = null; });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
    return true;
  }

  /* load, key out a flat background if needed, crop to the character, pad to 2:3 with the feet near the bottom, build blurred outline masks */
  function load(hero){
    if (cache[hero]) return cache[hero];
    return cache[hero] = new Promise((res, rej) => {
      const im = new Image(); im.decoding = "async";
      im.onload = () => {
        try {
          const W0 = im.naturalWidth, H0 = im.naturalHeight, c0 = document.createElement("canvas"); c0.width = W0; c0.height = H0;
          const x0 = c0.getContext("2d", {willReadFrequently: true}); x0.drawImage(im, 0, 0);
          const d = x0.getImageData(0, 0, W0, H0), px = d.data;
          const opaque = [0, W0 - 1, (H0 - 1) * W0, H0 * W0 - 1].every(i => px[i * 4 + 3] > 250);
          if (opaque){ // flat background: key out pixels close to the average corner colour
            const cs = [0, W0 - 1, (H0 - 1) * W0, H0 * W0 - 1].map(i => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
            const bg = [0, 1, 2].map(j => cs.reduce((a, c) => a + c[j], 0) / 4);
            for (let i = 0; i < px.length; i += 4){ const dd = Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]); px[i + 3] = Math.round(255 * Math.min(1, Math.max(0, (dd - 18) / 26))); }
            x0.putImageData(d, 0, 0);
          }
          let minX = W0, minY = H0, maxX = 0, maxY = 0;
          for (let y = 0; y < H0; y += 2) for (let x = 0; x < W0; x += 2) if (px[(y * W0 + x) * 4 + 3] > 24){ if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
          if (maxX <= minX) { minX = 0; minY = 0; maxX = W0 - 1; maxY = H0 - 1; }
          const cw = maxX - minX + 1, ch = maxY - minY + 1;
          // final image: character fills 84% of the height, centred, feet 1.5% above the bottom, 2:3 frame
          const H = Math.min(2048, Math.round(ch / 0.84)), sc = H / (ch / 0.84), W = Math.round(H * 2 / 3);
          const c1 = document.createElement("canvas"); c1.width = W; c1.height = H; const x1 = c1.getContext("2d");
          const dw = cw * sc, dh = ch * sc; x1.drawImage(c0, minX, minY, cw, ch, (W - dw) / 2, H - dh - H * 0.015, dw, dh);
          // masks at low resolution: R = near blur, G = wide blur, B = tight blur (edges)
          const mw = LOW ? 120 : 168, mh = Math.round(mw * 1.5), c2 = document.createElement("canvas"); c2.width = mw; c2.height = mh;
          const x2 = c2.getContext("2d", {willReadFrequently: true}); x2.drawImage(c1, 0, 0, mw, mh);
          const md = x2.getImageData(0, 0, mw, mh), A = new Float32Array(mw * mh);
          for (let i = 0; i < A.length; i++) A[i] = md.data[i * 4 + 3] / 255;
          const tiny = blur(A, mw, mh, Math.max(1, Math.round(mw * 0.012))), near = blur(A, mw, mh, Math.round(mw * 0.03)), wide = blur(A, mw, mh, Math.round(mw * 0.085));
          for (let i = 0; i < A.length; i++){ md.data[i * 4] = Math.min(255, near[i] * 255); md.data[i * 4 + 1] = Math.min(255, wide[i] * 290); md.data[i * 4 + 2] = tiny[i] * 255; md.data[i * 4 + 3] = 255; }
          x2.putImageData(md, 0, 0);
          res({img: c1, mask: c2, aspect: W / H, tex: null});
        } catch(err){ rej(err); }
      };
      im.onerror = () => rej(new Error("Character image missing: assets/hero/" + hero + ".png"));
      im.src = "assets/hero/" + hero + ".png";
    });
  }
  function blur(src, w, h, r){ // three box blurs approximate a gaussian
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    for (let pass = 0; pass < 3; pass++){
      for (let y = 0; y < h; y++){ let s = 0; for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++){ b[y * w + x] = s / (2 * r + 1); s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } }
      for (let x = 0; x < w; x++){ let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++){ a[y * w + x] = s / (2 * r + 1); s += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; } }
    }
    return a;
  }
  function upload(entry){
    if (entry.tex) return entry.tex;
    const mk = (src, flip) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, flip);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    return entry.tex = {img: mk(entry.img, true), mask: mk(entry.mask, false)};
  }

  function size(){
    if (!el || !cv) return [0, 0];
    const dpr = Math.min(devicePixelRatio || 1, LOW ? 1.5 : 2), w = Math.max(1, Math.round(el.clientWidth * dpr)), h = Math.max(1, Math.round(el.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
    return [w, h];
  }
  function kick(){ if (!raf && el) raf = requestAnimationFrame(loop); }
  function loop(now){
    raf = 0;
    if (!el || !el.isConnected || document.hidden || !gl) return;
    const entry = st.entry; if (!entry){ return; }
    if (LOW && now - lastDraw < 30 && !st.still){ raf = requestAnimationFrame(loop); return; }
    const dt = Math.min(0.05, (now - (lastDraw || now)) / 1000); lastDraw = now;
    st.charge += (st.chargeT - st.charge) * (1 - Math.pow(0.04, dt));
    if (st.burst > 0) st.burst = Math.max(0, st.burst - dt / 1.6);
    const [w, h] = size(); gl.viewport(0, 0, w, h);
    // character rect: as tall as the stage allows, bottom aligned, centred
    const rh = Math.min(h * 0.94, (w * 0.98) / entry.aspect), rw = rh * entry.aspect, rx = (w - rw) / 2, ry = h * 0.005;
    const t = REDUCED || st.still ? 4.0 : (now - t0) / 1000, e = st.burst * st.burst * (3 - 2 * st.burst);
    const tex = upload(entry);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.img); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.mask);
    gl.uniform2f(U.uRes, w, h); gl.uniform4f(U.uRect, rx, ry, rw, rh); gl.uniform1f(U.uT, t);
    gl.uniform1f(U.uPow, st.power); gl.uniform1f(U.uCharge, REDUCED ? Math.min(st.charge, 0.6) : st.charge); gl.uniform1f(U.uBurst, e);
    gl.uniform1f(U.uBreath, REDUCED || st.still ? 0 : 0.006 * Math.sin(t * 1.35));
    gl.uniform1f(U.uStyle, st.pal.style); gl.uniform3fv(U.uCore, hex(st.pal.core)); gl.uniform3fv(U.uMain, hex(st.pal.main)); gl.uniform3fv(U.uDeep, hex(st.pal.deep));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!REDUCED && !st.still) raf = requestAnimationFrame(loop);
  }

  return {
    PALETTES,
    get supported(){ return supported && !!(window.WebGLRenderingContext); },
    /* opts: hero 'male'|'female', rank letter, power 0..1, charged bool, still bool (no animation) */
    async mount(target, opts = {}){
      if (!init()) throw new Error("WebGL unavailable");
      el = target; st.still = !!opts.still;
      if (opts.rank && PALETTES[opts.rank]) st.pal = PALETTES[opts.rank];
      if (typeof opts.power === "number") st.power = Math.max(0, Math.min(1, opts.power));
      st.chargeT = opts.charged ? 1 : 0; if (opts.instant) st.charge = st.chargeT;
      const hero = opts.hero === "female" ? "female" : "male";
      if (cv.parentNode !== el) el.appendChild(cv);
      if (!ro){ ro = new ResizeObserver(() => kick()); } ro.disconnect(); ro.observe(el);
      st.entry = await load(hero); st.hero = hero;
      if (!el.isConnected) return false;
      lastDraw = 0; kick(); if (REDUCED || st.still) requestAnimationFrame(loop);
      return true;
    },
    setCharged(on){ st.chargeT = on ? 1 : 0; kick(); },
    burst(){ if (REDUCED) return; st.burst = 1; kick(); },
    /* the character art as a canvas (for share cards) */
    async art(hero){ return (await load(hero === "female" ? "female" : "male")).img; },
    state: st
  };
})();
