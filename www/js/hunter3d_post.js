/* Anime render pass for the hunter: cel shading, ink outlines and a silhouette aura.
   The aura is traced from the body outline every frame (white core, coloured band, flame tongues, optional smoke),
   the way 2D anime draws ki around a character. */
import * as THREE from '../vendor/three-bundle.js';

const NOISE = `
  float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vn(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; } return v; }`;

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// premultiplied "over": colour adds light, alpha darkens (lets one pass draw both glow and smoke)
const PREMULT = { transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor };

export const AURA_STYLES = {
  // style: 0 flame (DBZ), 1 shadow (Solo Leveling), 2 spirit (Ultra Instinct)
  monarch:   { core: '#EAF4FF', main: '#3F8CFF', deep: '#1A2C9A', style: 1 },
  ember:     { core: '#FFF4CC', main: '#FF8A1F', deep: '#B3260E', style: 0 },
  frost:     { core: '#FFFFFF', main: '#5CCBFF', deep: '#5A3FE0', style: 2 },
  verdant:   { core: '#F0FFF4', main: '#3EDB86', deep: '#0C6B45', style: 0 },
  royal:     { core: '#F5ECFF', main: '#A970FF', deep: '#3B1B8E', style: 1 },
  warlord:   { core: '#FFE6D9', main: '#FF3B2E', deep: '#5E0610', style: 1 },
  ascendant: { core: '#FFFCE8', main: '#FFD24A', deep: '#E0780F', style: 2 },
};

/* Cel shading injected into any built-in material: two hard light bands, cool shadow tint, a thin highlight band. */
export function toonify(mat, opts = {}) {
  const prev = mat.onBeforeCompile;
  const shadow = new THREE.Color(opts.shadow || 0x9a93b8);
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uShadeTint = { value: shadow };
    sh.fragmentShader = 'uniform vec3 uShadeTint;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        float base = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.02);
        float k = lum / base;
        float lit = smoothstep(${(opts.cut || 0.42).toFixed(3)}, ${((opts.cut || 0.42) + 0.06).toFixed(3)}, k);
        float hi = smoothstep(1.32, 1.4, k);
        vec3 shade = diffuseColor.rgb * uShadeTint * 0.78;
        outgoingLight = mix(shade, diffuseColor.rgb * 1.04, lit) + diffuseColor.rgb * hi * ${(opts.hi ?? 0.16).toFixed(3)} + totalEmissiveRadiance;
      }
      #include <opaque_fragment>`);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => key() + '|toon';
  mat.needsUpdate = true;
  return mat;
}

export class AnimePost {
  constructor(renderer, low) {
    this.r = renderer; this.low = low;
    const opt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
    this.mask = new THREE.WebGLRenderTarget(4, 4, opt);
    this.ba = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.bb = this.ba.clone();
    this.normalMat = new THREE.MeshNormalMaterial();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false;
    this.qs = new THREE.Scene(); this.qs.add(this.quad);

    this.blurMat = new THREE.ShaderMaterial({ depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VERT,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){ float a = 0.0, w = 0.0;
          for (int i = -7; i <= 7; i++){ float fi = float(i); float g = exp(-fi * fi / 22.0); a += texture2D(tSrc, vUv + uDir * fi).a * g; w += g; }
          gl_FragColor = vec4(0.0, 0.0, 0.0, a / w); }` });

    const common = { tMask: { value: this.mask.texture }, tWide: { value: this.bb.texture }, uTime: { value: 0 }, uPow: { value: 0 }, uBurst: { value: 0 },
      uCore: { value: new THREE.Color() }, uMain: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uStyle: { value: 1 },
      uAspect: { value: 1 }, uPx: { value: new THREE.Vector2() }, uLine: { value: 1 }, uRim: { value: 0.18 }, uInk: { value: new THREE.Color(0x0e0d14) } };
    this.u = common;

    this.backMat = new THREE.ShaderMaterial(Object.assign({}, PREMULT, { uniforms: common, vertexShader: VERT, fragmentShader: `
      uniform sampler2D tMask, tWide; uniform float uTime, uPow, uBurst, uStyle, uAspect; uniform vec3 uCore, uMain, uDeep; varying vec2 vUv;
      ${NOISE}
      void main(){
        if (uPow < 0.002){ gl_FragColor = vec4(0.0); return; }
        vec2 p = vec2(vUv.x * uAspect, vUv.y);
        float t = uTime;
        float n  = fbm(p * vec2(5.0, 2.6) - vec2(0.0, t * 1.2));
        float n2 = fbm(p * vec2(13.0, 5.5) - vec2(t * 0.2, t * 2.4));
        float streak = fbm(p * vec2(30.0, 3.2) - vec2(0.0, t * 3.4));
        float grow = 1.0 + uBurst * 0.7;
        // displaced silhouette: sampled below and sideways, so the outline is pulled upward into tongues
        // flames rise: the higher above the body, the further the outline is dragged up, so tongues form over head and shoulders
        float lift = 0.018 + n * 0.085 + n2 * 0.075 + streak * 0.03;
        vec2 off = vec2((n - 0.5) * 0.06 + (n2 - 0.5) * 0.03, -lift) * grow;
        float w = texture2D(tWide, vUv + off).a;
        float w0 = texture2D(tWide, vUv).a;
        float reach = w * (0.4 + 1.15 * n2) * (1.0 + uBurst * 0.9);
        float flick = 0.9 + 0.1 * sin(t * 14.0 + n * 11.0);
        float outer = smoothstep(0.13, 0.16, reach * flick) * (0.55 + 0.45 * smoothstep(0.35, 0.7, streak + n2 * 0.4));
        float mid   = smoothstep(0.33, 0.36, reach * (0.75 + 0.5 * streak));
        float core  = smoothstep(0.30, 0.36, w0) * (0.65 + 0.35 * n2);
        float hot   = smoothstep(0.52, 0.56, reach * (0.7 + 0.6 * streak));
        vec3 col = uDeep * outer * (0.38 + 0.3 * streak);
        col += uMain * mid * (0.55 + 0.6 * streak);
        col += mix(uMain, uCore, 0.75) * hot * 0.7;
        col += mix(uMain, uCore, 0.9) * core * 0.9;
        float a = 0.0;
        // soft bloom that lights the background, like the glow around Goku
        float glow = smoothstep(0.0, 0.5, w0) * 0.6 + smoothstep(0.0, 0.7, w) * 0.4;
        col += uMain * glow * 0.16;
        // Solo Leveling style: dark smoke wisps that darken the background around the light
        if (uStyle > 0.5 && uStyle < 1.5){
          float s = fbm(p * vec2(4.0, 2.4) - vec2(t * 0.1, t * 0.55) + n2 * 0.4);
          float wide = texture2D(tWide, vUv + vec2(0.0, -0.06 - s * 0.05)).a;
          float smoke = smoothstep(0.04, 0.1, wide * (0.5 + s)) * (1.0 - mid) * smoothstep(0.45, 0.66, s);
          a = max(a, smoke * 0.62); col *= 1.0 - smoke * 0.55;
          col += uDeep * smoke * 0.18;
        }
        // Ultra Instinct style: tiny sparks drifting up near the body
        if (uStyle > 1.5){
          vec2 g = vec2(p.x * 46.0, p.y * 46.0 - t * 4.0); vec2 id = floor(g); vec2 fr = fract(g) - 0.5;
          float rnd = h21(id); float on = step(0.93, rnd) * smoothstep(0.03, 0.15, w) * (1.0 - smoothstep(0.55, 0.9, w0));
          float tw = 0.5 + 0.5 * sin(t * 7.0 + rnd * 40.0);
          col += mix(uMain, uCore, 0.7) * on * tw * smoothstep(0.16, 0.02, length(fr)) * 1.6;
        }
        col *= uPow; a *= min(uPow, 1.0);
        gl_FragColor = vec4(col, a);
      }` }));

    this.frontMat = new THREE.ShaderMaterial(Object.assign({}, PREMULT, { uniforms: common, vertexShader: VERT, fragmentShader: `
      uniform sampler2D tMask, tWide; uniform float uTime, uPow, uBurst, uAspect, uLine, uRim; uniform vec2 uPx; uniform vec3 uCore, uMain, uDeep, uInk; varying vec2 vUv;
      ${NOISE}
      vec4 S(vec2 o){ return texture2D(tMask, vUv + o * uPx * uLine); }
      void main(){
        vec4 c = S(vec2(0.0));
        // ink: silhouette plus creases where the surface turns sharply (arm against torso, jaw, folds)
        vec4 l = S(vec2(-1, 0)), r = S(vec2(1, 0)), d = S(vec2(0, -1)), u = S(vec2(0, 1));
        float sil = max(max(abs(l.a - c.a), abs(r.a - c.a)), max(abs(d.a - c.a), abs(u.a - c.a)));
        vec3 gx = (r.rgb - l.rgb) * min(r.a, l.a), gy = (u.rgb - d.rgb) * min(u.a, d.a);
        float crease = smoothstep(0.32, 0.6, length(gx) + length(gy));
        float ink = max(sil, crease * 0.75);
        // rim light on the inner edge of the body, coloured by the aura
        float wt = texture2D(tWide, vUv).a;
        float rimBand = c.a * smoothstep(0.86, 0.66, wt);
        vec2 p = vec2(vUv.x * uAspect, vUv.y);
        float n2 = fbm(p * vec2(15.0, 7.0) - vec2(uTime * 0.15, uTime * 2.6));
        float charge = min(uPow, 1.6);
        vec3 rimCol = mix(vec3(0.82, 0.88, 1.0) * uRim, mix(uMain, uCore, 0.55), min(charge, 1.0));
        float rimA = rimBand * (uRim + charge * 0.5) * (0.6 + 0.6 * n2);
        // a few flame tongues pass in front of the body edge
        float wu = texture2D(tWide, vUv + vec2(0.0, -0.03 - n2 * 0.04)).a;
        float tongue = smoothstep(0.6, 0.66, n2 * wu * 1.4) * (1.0 - smoothstep(0.86, 0.98, wt)) * charge * 0.4;
        vec3 col = rimCol * rimA + mix(uMain, uCore, 0.6) * tongue + uCore * c.a * uBurst * 0.35 * rimBand;
        float inkA = ink * 0.88 * (1.0 - min(rimA * 0.6, 0.5));
        gl_FragColor = vec4(col * (1.0 - inkA) + uInk * inkA, inkA);
      }` }));
  }

  setSize(w, h) {
    if (w === this.w && h === this.h) return; this.w = w; this.h = h;
    this.mask.setSize(w, h);
    const d = this.low ? 6 : 4; this.ba.setSize(Math.max(8, Math.round(w / d)), Math.max(8, Math.round(h / d))); this.bb.setSize(this.ba.width, this.ba.height);
    this.u.uAspect.value = w / h; this.u.uPx.value.set(1 / w, 1 / h);
    this.u.uLine.value = Math.max(1, Math.min(2.2, h / 620));
  }
  setPalette(pal) {
    if (!pal) return; this.u.uCore.value.set(pal.core); this.u.uMain.value.set(pal.main); this.u.uDeep.value.set(pal.deep); this.u.uStyle.value = pal.style;
  }
  _pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qs, this.cam); }

  /* hide: objects that are not part of the character (ground, particles) */
  render(scene, camera, hide, time, pow, burst) {
    const r = this.r, size = r.getDrawingBufferSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
    this.u.uTime.value = time; this.u.uPow.value = pow; this.u.uBurst.value = burst;
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    // 1. normals + coverage of the character only
    const vis = hide.map(o => o.visible); hide.forEach(o => { o.visible = false; });
    scene.overrideMaterial = this.normalMat; r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.mask); r.clear(); r.render(scene, camera);
    scene.overrideMaterial = null; hide.forEach((o, i) => { o.visible = vis[i]; });
    // 2. blurred silhouette (drives aura shape and rim)
    this.blurMat.uniforms.tSrc.value = this.mask.texture; this.blurMat.uniforms.uDir.value.set(2.2 / this.mask.width, 0); this._pass(this.blurMat, this.ba);
    this.blurMat.uniforms.tSrc.value = this.ba.texture; this.blurMat.uniforms.uDir.value.set(0, 2.2 / this.mask.height); this._pass(this.blurMat, this.bb);
    // 3. aura behind, character, then ink + rim + front tongues
    r.setRenderTarget(null); r.clear();
    const ac = r.autoClear; r.autoClear = false;
    if (pow > 0.002) this._pass(this.backMat, null);
    r.shadowMap.needsUpdate = true; r.render(scene, camera);
    this._pass(this.frontMat, null);
    r.autoClear = ac; r.setClearColor(prevClear, prevAlpha);
  }
}
