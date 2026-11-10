// ASCENDANT 3D hunter engine. Real skinned, morphable GLB characters (CC0 MakeHuman base).
import * as THREE from '../vendor/three-bundle.js';
const { GLTFLoader, RoomEnvironment } = THREE;

const BASE = new URL('../assets/hunter/', import.meta.url).href;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const SKIN_TONES = ['#EBCBB6', '#DDB39A', '#C99A7E', '#B08064', '#93664C', '#76503B', '#5A3B2B', '#3F291E'];
export const HAIR_COLORS = { black: '#1A1716', espresso: '#3A2A20', brown: '#4E3423', chestnut: '#6E3F22', auburn: '#7D3220', blonde: '#B8925A', ash: '#8F8A82', silver: '#C9C7C2', crimson: '#7E1C24', azure: '#23406E' };
export const CLOTH_COLORS = { graphite: '#2A2C30', onyx: '#121315', bone: '#D9D4CA', steel: '#5B6470', olive: '#4A5139', navy: '#1D2A44', oxblood: '#5A1E22', sand: '#B59E7C', gold: '#B8913E', white: '#E8E8E6' };

const MORPHS = ['muscle_up', 'muscle_down', 'build_heavy', 'build_slim', 'chest', 'back', 'shoulders', 'arms', 'legs', 'core',
  'face_square', 'face_oval', 'face_round', 'face_angular', 'jaw_strong', 'nose_broad', 'nose_narrow', 'breathe'];

// rest pose of the base mesh is an A-pose; these are offsets (degrees, XYZ) per bone
// fingers have their own bones; curling them (local X) makes hands read as hands, not flat paddles
const FINGERS = s => ['index', 'middle', 'ring', 'pinky'].flatMap(f => [1, 2, 3].map(i => `${f}_0${i}_${s}`));
const curl = (pose, side, deg, thumb) => { FINGERS(side).forEach(b => { pose[b] = [deg, 0, 0]; }); if (thumb) { pose['thumb_01_' + side] = [0, 0, side === 'l' ? thumb : -thumb]; pose['thumb_02_' + side] = [thumb, 0, 0]; } return pose; };
const POSES = {
  relaxed: curl(curl({ upperarm_l: [5, 0, -42], upperarm_r: [5, 0, 42], lowerarm_l: [0, 12, -12], lowerarm_r: [0, -12, 12], hand_l: [0, 0, 4], hand_r: [0, 0, -4], spine_03: [-2, 0, 0], head: [2, 0, 0] }, 'l', 28), 'r', 28),
  // double-biceps: upper arms out near horizontal, forearms vertical, closed fists
  flex: curl(curl({ upperarm_l: [0, 0, 38], upperarm_r: [0, 0, -38], lowerarm_l: [-90, 0, 0], lowerarm_r: [-90, 0, 0], spine_03: [-6, 0, 0], head: [-4, 0, 0] }, 'l', 85, 30), 'r', 85, 30),
  victory: curl(curl({ upperarm_l: [0, 0, 62], upperarm_r: [6, 0, 44], lowerarm_l: [0, -10, 25], lowerarm_r: [0, -12, 12], hand_l: [0, 0, 0], hand_r: [0, 0, -4], spine_03: [-6, 0, 0], head: [-10, 0, 0] }, 'l', 85, 30), 'r', 28),
};

const VIEWS = { front: { yaw: 0, zoom: 0 }, three: { yaw: -0.62, zoom: 0 }, side: { yaw: -Math.PI / 2, zoom: 0 }, back: { yaw: Math.PI, zoom: 0 }, face: { yaw: -0.25, zoom: 1 } };

function supportsWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

class HunterEngine {
  constructor() {
    this.supported = supportsWebGL();
    this.models = {}; this.look = null; this.body = null; this.pose = 'relaxed';
    this.yaw = 0; this.yawT = 0; this.zoom = 0; this.zoomT = 0; this.autoSpin = false; this.time = 0;
    this.morphCur = {}; this.morphTarget = {};
    this.listeners = new Set();
    this.ready = this.supported ? this._init() : Promise.resolve(false);
  }

  async _init() {
    const canvas = document.createElement('canvas');
    canvas.className = 'hunter-canvas';
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    const scene = this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 30);

    // lighting: warm key, cool rim, soft fill
    const key = this.key = new THREE.DirectionalLight(0xfff1e2, 2.4); key.position.set(1.4, 2.6, 2.2);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -1; key.shadow.camera.right = 1; key.shadow.camera.top = 2.2; key.shadow.camera.bottom = -0.2; key.shadow.bias = -0.0006; key.shadow.normalBias = 0.045; key.shadow.radius = 4;
    const rim = this.rim = new THREE.DirectionalLight(0x9fb7ff, 2.2); rim.position.set(-2.2, 2.0, -2.4);
    const rim2 = this.rim2 = new THREE.DirectionalLight(0xffd9a8, 0.9); rim2.position.set(2.4, 1.2, -1.8);
    const fill = new THREE.HemisphereLight(0xc8d2e0, 0x1a1512, 0.55);
    scene.add(key, rim, rim2, fill);

    // ground: shadow catcher + subtle aura disc
    const g = new THREE.Mesh(new THREE.CircleGeometry(1.4, 64), new THREE.ShadowMaterial({ opacity: 0.42 }));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
    const discTex = this._radialTexture();
    this.aura = new THREE.Mesh(new THREE.CircleGeometry(0.9, 64), new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xd4a84f, opacity: 0 }));
    this.aura.rotation.x = -Math.PI / 2; this.aura.position.y = 0.002; scene.add(this.aura);
    this.motes = this._motes(); scene.add(this.motes);
    // charged aura (after a workout) and burst (level up, workout saved): energy column, back glow, ground shockwave
    this.column = this._auraColumn(); scene.add(this.column);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex, color: 0xd4a84f, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.set(2.3, 3.1, 1); this.halo.position.set(0, 1.0, -0.5); scene.add(this.halo);
    this.shock = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 96), new THREE.MeshBasicMaterial({ color: 0xd4a84f, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.shock.rotation.x = -Math.PI / 2; this.shock.position.y = 0.004; this.shock.visible = false; scene.add(this.shock);
    this._charge = 0; this._chargeT = 0; this._burst = 0; this._moteBase = 0; this._moteVis = false;

    this.root = new THREE.Group(); scene.add(this.root);
    this.loader = new GLTFLoader();
    this.texLoader = new THREE.TextureLoader();
    this.tex = {};
    const [skinN, fabN, hairS, hairN] = await Promise.all(['skin_normal.png', 'fabric_normal.png', 'hair_strands.png', 'hair_normal.png'].map(f => this._tex(f)));
    skinN.colorSpace = THREE.NoColorSpace; fabN.colorSpace = THREE.NoColorSpace; hairN.colorSpace = THREE.NoColorSpace;
    [fabN, hairS, hairN].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
    fabN.repeat.set(8, 8);
    this.tex = { skinN, fabN, hairS, hairN };
    this._bindInput(canvas);
    this._loop = this._loop.bind(this);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._kick(); });
    return true;
  }

  _radialTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(.45, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  _motes() {
    const n = 84, geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.45; p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = Math.random() * 1.9; p[i * 3 + 2] = Math.sin(a) * r; s[i] = Math.random(); }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(s, 1));
    const m = new THREE.PointsMaterial({ size: 0.018, color: 0xd4a84f, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: this._radialTexture() });
    const pts = new THREE.Points(geo, m); pts.visible = false; return pts;
  }
  // Flame aura: one layer behind the body (the silhouette glows and licks upward) and a faint layer of wisps in front.
  _auraColumn() {
    const geo = new THREE.PlaneGeometry(2.6, 3.2); geo.translate(0, 1.6, 0);
    const make = (front) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: !front, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPow: { value: 0 }, uCol: { value: new THREE.Color(0xd4a84f) }, uFront: { value: front ? 1 : 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uPow; uniform float uFront; uniform vec3 uCol; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
        float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
        void main(){
          float x = (vUv.x - 0.5) * 2.6; float y = vUv.y * 3.2;
          float n = fbm(vec2(x * 2.0, y * 1.5 - uTime * 1.5));
          float n2 = fbm(vec2(x * 4.6 + 3.0, y * 2.6 - uTime * 2.7));
          float w = mix(0.60, 0.40, smoothstep(0.0, 1.6, y)) * (1.0 - smoothstep(1.75, 2.75 + n * 0.5, y));
          float d = abs(x) / max(w, 0.001) + (n - 0.5) * 0.7;
          float core = 1.0 - smoothstep(0.5, 1.05, d);
          float tongues = smoothstep(0.42, 0.85, n2) * (1.0 - smoothstep(0.6, 1.55, d));
          float a = mix(core * 0.55 + tongues * 0.5, tongues * 0.22, uFront);
          a *= smoothstep(0.0, 0.14, y) * (1.0 - smoothstep(1.85, 2.95, y + (n - 0.5) * 1.1));
          a *= 1.0 - smoothstep(1.0, 1.3, abs(x));
          a = pow(a, 1.45) * 1.9;
          gl_FragColor = vec4(mix(uCol, vec3(1.0), core * core * 0.28 + tongues * 0.3), a * uPow);
        }` });
    const g = new THREE.Group();
    const back = new THREE.Mesh(geo, make(false)); back.position.z = -0.3; back.renderOrder = -1;
    const front = new THREE.Mesh(geo, make(true)); front.position.z = 0.42; front.renderOrder = 6;
    g.add(back, front); g.visible = false; g.userData.mats = [back.material, front.material]; return g;
  }
  // Models normally ship as .glb. Hosts that cannot serve binary files get a JSON wrapper {"glb": base64} instead (config.modelExt = '.glb.json').
  async _loadGLB(gender) {
    const ext = (window.ASCENDANT_CONFIG && window.ASCENDANT_CONFIG.modelExt) || '.glb';
    if (!ext.endsWith('.json')) return new Promise((res, rej) => this.loader.load(BASE + gender + ext, res, undefined, rej));
    const r = await fetch(BASE + gender + ext); if (!r.ok) throw new Error('model ' + r.status);
    const bin = atob((await r.json()).glb), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return this.loader.parseAsync(buf.buffer, BASE);
  }
  _tex(f) { return new Promise((res, rej) => this.texLoader.load(BASE + f, t => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, rej)); }
  _img(f) { return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = BASE + f; }); }

  async _model(gender) {
    if (this.models[gender]) return this.models[gender];
    const p = (async () => {
      const [gltf, mA, mB, mC] = await Promise.all([
        this._loadGLB(gender),
        this._img(gender + '_maskA.png'), this._img(gender + '_maskB.png'), this._img(gender + '_maskC.png')]);
      const masks = [mA, mB, mC].map(im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; });
      const model = { scene: gltf.scene, meshes: {}, bones: {}, masks, size: mA.width };
      gltf.scene.traverse(o => {
        if (o.isSkinnedMesh || o.isMesh) { model.meshes[o.name] = o; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
        if (o.isBone) model.bones[o.name] = o;
      });
      // materials
      const skinCanvas = document.createElement('canvas'); skinCanvas.width = skinCanvas.height = model.size;
      model.skinCanvas = skinCanvas;
      model.skinMap = new THREE.CanvasTexture(skinCanvas); model.skinMap.colorSpace = THREE.SRGBColorSpace; model.skinMap.flipY = false;
      model.skinMap.anisotropy = 4;
      const skin = new THREE.MeshPhysicalMaterial({ map: model.skinMap, normalMap: this.tex.skinN, normalScale: new THREE.Vector2(0.09, 0.09), roughness: 0.7, metalness: 0, envMapIntensity: 0.6, sheen: 0.12, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffc2ad), clearcoat: 0.03, clearcoatRoughness: 0.6 });
      model.worn = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
      skin.onBeforeCompile = sh => {
        sh.uniforms.uWorn0 = { value: model.worn[0] }; sh.uniforms.uWorn1 = { value: model.worn[1] }; sh.uniforms.uWorn2 = { value: model.worn[2] };
        sh.vertexShader = 'attribute vec4 _cover0;\nattribute vec4 _cover1;\nattribute vec4 _cover2;\nvarying vec4 vCov0;\nvarying vec4 vCov1;\nvarying vec4 vCov2;\n' +
          sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCov0 = _cover0; vCov1 = _cover1; vCov2 = _cover2;');
        // hide skin under worn garments + cheap subsurface-ish wrap lighting
        sh.fragmentShader = 'uniform vec4 uWorn0;\nuniform vec4 uWorn1;\nuniform vec4 uWorn2;\nvarying vec4 vCov0;\nvarying vec4 vCov1;\nvarying vec4 vCov2;\n' +
          sh.fragmentShader.replace('void main() {', 'void main() {\n if (dot(vCov0, uWorn0) + dot(vCov1, uWorn1) + dot(vCov2, uWorn2) > 0.5) discard;')
          .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(0.045, 0.016, 0.01);`);
      };
      model.mats = { skin };
      const eyesTex = await this._tex('eye_brown.png'); eyesTex.flipY = false;
      model.mats.eyes = new THREE.MeshPhysicalMaterial({ map: eyesTex, color: 0xaca69f, roughness: 0.12, clearcoat: 0.55, clearcoatRoughness: 0.08, envMapIntensity: 0.5, alphaTest: 0.5 });
      model.mats.lashes = new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: 0.9, side: THREE.DoubleSide });
      for (const [name, m] of Object.entries(model.meshes)) {
        if (name === 'body') m.material = skin;
        else if (name === 'eyes') m.material = model.mats.eyes;
        else if (name === 'lashes') m.material = model.mats.lashes;
        else if (name.startsWith('hair_') || name.startsWith('beard_')) m.material = this._hairMat();
        else if (name.startsWith('shoes_')) m.material = new THREE.MeshPhysicalMaterial({ color: 0xe8e8e6, roughness: 0.55, normalMap: this.tex.fabN, normalScale: new THREE.Vector2(0.2, 0.2), clearcoat: 0.3, clearcoatRoughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
        else if (name === 'acc_gloves' || name === 'acc_belt') m.material = new THREE.MeshPhysicalMaterial({ color: 0x1a1512, roughness: 0.42, clearcoat: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        else m.material = new THREE.MeshPhysicalMaterial({ color: 0x2a2c30, roughness: 0.82, normalMap: this.tex.fabN, normalScale: new THREE.Vector2(0.35, 0.35), sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x888888), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide });
        m.visible = ['body', 'eyes', 'lashes'].includes(name);
      }
      // layered shell hair (fur shells): breaks the solid silhouette into strands
      model.fur = {};
      for (const [name, m] of Object.entries(model.meshes)) {
        if (!(name.startsWith('hair_') || name.startsWith('beard_'))) continue;
        const beard = name.startsWith('beard_'), layers = beard ? 4 : 6, step = beard ? 0.0011 : 0.0016, base = beard ? 0.5 : 0.28;
        model.fur[name] = [];
        for (let i = 1; i <= layers; i++) {
          const c = m.clone(); c.name = name + '#fur' + i; c.castShadow = false; c.receiveShadow = false; c.frustumCulled = false;
          c.material = this._furMat(i * step, base + i * ((0.83 - base) / layers));
          m.parent.add(c); model.fur[name].push(c); c.visible = false;
        }
      }
      // ground the model
      const box = new THREE.Box3().setFromObject(gltf.scene); model.height = box.max.y - box.min.y; model.floor = box.min.y;
      gltf.scene.position.y = -box.min.y;
      for (const b of Object.values(model.bones)) b.userData.rest = b.quaternion.clone();
      return model;
    })();
    this.models[gender] = p; return p;
  }
  _furMat(off, cut) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1412, map: this.tex.hairS, alphaMap: this.tex.hairS, alphaTest: cut, normalMap: this.tex.hairN, roughness: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => { sh.uniforms.uOff = { value: off }; sh.vertexShader = 'uniform float uOff;\n' + sh.vertexShader.replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * uOff;\n#include <project_vertex>'); };
    mat.customProgramCacheKey = () => 'fur';
    return mat;
  }
  _hairMat() {
    return new THREE.MeshPhysicalMaterial({ color: 0x1a1412, map: this.tex.hairS, normalMap: this.tex.hairN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.56, sheen: 0.3, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x4a3c34), envMapIntensity: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  }

  // --------------------------------------------------------------- public API
  mount(el, opts = {}) {
    if (!this.supported || !this.renderer) return false;
    this.el = el; this.opts = Object.assign({ mode: 'hero', interactive: true }, opts);
    el.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = this.opts.interactive ? 'pan-y' : 'auto';
    this.zoomT = this.opts.mode === 'face' ? 1 : 0;
    this._resize(); this._kick();
    if (!this._ro) { this._ro = new ResizeObserver(() => this._resize()); }
    this._ro.disconnect(); this._ro.observe(el);
    return true;
  }
  async setLook(look) {
    if (!this.supported) return;
    await this.ready;
    const model = await this._model(look.gender || 'male');
    if (this.current !== model) {
      this.root.clear(); this.root.add(model.scene); this.current = model;
      this.morphCur = {}; // snap on gender switch
    }
    this.look = look;
    this._paintSkin(model, look);
    const show = new Set(['body', 'eyes', 'lashes']);
    const pick = (slot, v) => { if (v && v !== 'none' && model.meshes[`${slot}_${v}`]) show.add(`${slot}_${v}`); };
    pick('hair', look.hair); pick('beard', look.gender === 'male' ? look.beard : 'none');
    pick('top', look.top); pick('bottom', look.bottom || 'shorts'); pick('shoes', look.shoes);
    (look.acc || []).forEach(a => pick('acc', a));
    for (const [n, m] of Object.entries(model.meshes)) {
      m.visible = show.has(n);
      if (n.startsWith('beard_') && m.visible) { m.visible = false; model.fur[n].forEach(f => { f.visible = true; f.material.color.set(HAIR_COLORS[look.hairColor] || HAIR_COLORS.black); }); continue; }
      if (model.fur[n]) model.fur[n].forEach(f => { f.visible = m.visible; if (m.visible) f.material.color.set(HAIR_COLORS[look.hairColor] || HAIR_COLORS.black); });
      if (!m.visible) continue;
      if (n.startsWith('hair_') || n.startsWith('beard_')) m.material.color.set(HAIR_COLORS[look.hairColor] || HAIR_COLORS.black).multiplyScalar(0.8);
      if (n.startsWith('top_')) m.material.color.set(CLOTH_COLORS[look.topColor] || CLOTH_COLORS.graphite);
      if (n.startsWith('bottom_')) m.material.color.set(CLOTH_COLORS[look.bottomColor] || CLOTH_COLORS.onyx);
      if (n.startsWith('shoes_')) m.material.color.set(CLOTH_COLORS[look.shoesColor] || CLOTH_COLORS.white);
      if (n === 'acc_headband' || n === 'acc_wraps') m.material.color.set(CLOTH_COLORS[look.accColor] || CLOTH_COLORS.oxblood);
    }
    if (look.eyes && model.eyeTex !== look.eyes) {
      model.eyeTex = look.eyes;
      this._tex(`eye_${look.eyes}.png`).then(t => { t.flipY = false; model.mats.eyes.map = t; model.mats.eyes.needsUpdate = true; this._kick(); }).catch(() => {});
    }
    const cov = (model.meshes.body && model.meshes.body.userData.cover) || [];
    const flags = cov.map(n => show.has(n) ? 1 : 0); while (flags.length < 12) flags.push(0);
    model.worn.forEach((v, q) => v.set(flags[q * 4], flags[q * 4 + 1], flags[q * 4 + 2], flags[q * 4 + 3]));
    this._applyMorphTargets();
    this._kick();
  }
  setBody(b) { this.body = b; this._applyMorphTargets(); this._kick(); }
  setPose(p) { if (POSES[p]) { this.pose = p; this._kick(); } }
  view(v) { const d = VIEWS[v]; if (!d) return; this.yawT = d.yaw; this.zoomT = d.zoom; this._kick(); }
  setAura(color, level) {
    if (!this.aura) return; this._auraLevel = level;
    const c = new THREE.Color(color || '#D4A84F');
    this.aura.material.color.copy(c); this.motes.material.color.copy(c);
    this.aura.material.opacity = 0.08 + 0.42 * level;
    this._moteVis = level > 0.55 && !REDUCED; this._moteBase = this._moteVis ? 0.25 + 0.5 * (level - 0.55) : 0;
    this.motes.visible = this._moteVis; this.motes.material.opacity = this._moteBase;
    this.rim.color.copy(new THREE.Color(0x9fb7ff).lerp(c, 0.35 * level));
    this._kick();
  }
  _fxColor(color) {
    if (!color || !this.column) return; const c = new THREE.Color(color);
    this.column.userData.mats.forEach(m => m.uniforms.uCol.value.copy(c)); this.halo.material.color.copy(c); this.shock.material.color.copy(c);
    if (!this._moteVis) this.motes.material.color.copy(c);
  }
  // steady aura after training today
  setCharged(on, color) { if (!this.column) return; this._chargeT = on ? 1 : 0; this._fxColor(color); this._kick(); }
  // one-off surge: shockwave on the ground, flare, sparks
  burst(color) { if (!this.column || REDUCED) return; this._fxColor(color); this._burst = 1; this._kick(); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  async snapshot(w = 720, h = 960) {
    await this.ready; if (!this.current) return null;
    const r = this.renderer, prevSize = r.getSize(new THREE.Vector2()), prevPR = r.getPixelRatio();
    r.setPixelRatio(1); r.setSize(w, h, false); this.camera.aspect = w / h; this._frame(); this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera); const url = r.domElement.toDataURL('image/png');
    r.setPixelRatio(prevPR); r.setSize(prevSize.x, prevSize.y, false); this._resize();
    return url;
  }

  // --------------------------------------------------------------- internals
  _paintSkin(model, look) {
    const key = [look.gender, look.skin, look.brows, look.beard, look.hairColor, look.hair].join('|');
    if (model.skinKey === key) return; model.skinKey = key;
    const N = model.size, ctx = model.skinCanvas.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
    const [A, B, C] = model.masks;
    const tone = new THREE.Color(SKIN_TONES[look.skin ?? 2]); const tr = tone.r * 255, tg = tone.g * 255, tb = tone.b * 255;
    const hair = new THREE.Color(HAIR_COLORS[look.hairColor] || HAIR_COLORS.black); const hr = hair.r * 255 * 0.8, hg = hair.g * 255 * 0.8, hb = hair.b * 255 * 0.8;
    const lip = [tr * 0.78 + 25, tg * 0.55, tb * 0.55 + 4];
    const brow = look.brows === 'bold' ? 1 : look.brows === 'none' ? -1 : 0;
    const beard = look.gender === 'male' ? (look.beard || 'none') : 'none';
    const isF = look.gender === 'female';
    const scalp = !look.hair || look.hair === 'none' ? 0 : look.hair === 'buzz' ? 0.75 : 0.95;
    let seed = 1234567;
    for (let i = 0, p = 0; i < N * N; i++, p += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff; const rnd = seed / 0x7fffffff;
      let r = tr, g = tg, b = tb;
      const red = A[p + 2] / 255 * 0.22 + C[p + 2] / 255 * 0.16;
      r += (255 - r) * red * 0.25; g -= g * red * 0.18; b -= b * red * 0.2;
      const lp = A[p] / 255 * 0.8; r += (lip[0] - r) * lp; g += (lip[1] - g) * lp; b += (lip[2] - b) * lp;
      const nl = A[p + 1] / 255 * 0.55; r += (r * 1.08 + 18 - r) * nl; g += (g * 0.98 + 14 - g) * nl; b += (b * 1.0 + 16 - b) * nl;
      if (!isF) { const au = A[p + 3] / 255 * 0.5; r -= r * au * 0.3; g -= g * au * 0.38; b -= b * au * 0.36; }
      const v = 0.97 + rnd * 0.05; r *= v; g *= v; b *= v;
      // eyebrows
      if (brow >= 0) { const bm = (brow ? B[p + 1] : B[p]) / 255; const s = bm * (0.75 + 0.25 * rnd); r += (hr - r) * s; g += (hg - g) * s; b += (hb - b) * s; }
      // facial hair (texture layer, geometry adds volume for full styles)
      let fh = 0;
      if (beard === 'stubble') fh = (B[p + 2] / 255) * (rnd > 0.55 ? 0.55 : 0.18);
      else if (beard === 'full') fh = (B[p + 3] / 255) * (rnd > 0.35 ? 0.62 : 0.3);
      else if (beard === 'goatee') fh = (C[p + 1] / 255) * (rnd > 0.4 ? 0.8 : 0.45) + (B[p + 2] / 255) * (rnd > 0.7 ? 0.25 : 0.05);
      else if (beard === 'moustache') fh = (C[p] / 255) * (rnd > 0.4 ? 0.8 : 0.45) + (B[p + 2] / 255) * (rnd > 0.7 ? 0.25 : 0.05);
      if (fh > 0) { r += (hr - r) * fh; g += (hg - g) * fh; b += (hb - b) * fh; }
      if (scalp) { const sc = C[p + 3] / 255 * (0.55 + 0.35 * rnd) * scalp; r += (hr - r) * sc; g += (hg - g) * sc; b += (hb - b) * sc; }
      d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); model.skinMap.needsUpdate = true;
  }

  _applyMorphTargets() {
    const L = this.look || {}, B = this.body || { level: 1, stages: {} }, t = {};
    MORPHS.forEach(k => t[k] = 0);
    const lvl = Math.max(1, B.level || 1);
    // evolution: beginner slack fades over the first 12 levels, global muscle grows slowly to level 60
    t.muscle_down = Math.max(0, 0.55 * (1 - (lvl - 1) / 11));
    t.muscle_up = Math.min(0.85, Math.pow(Math.max(0, lvl - 4) / 56, 0.8) * 0.85);
    const st = B.stages || {}; const s = k => Math.max(0, ((st[k] || 1) - 1) / 4);
    t.chest = s('chest') * 0.9; t.back = s('back') * 0.85; t.shoulders = s('shoulders') * 0.9; t.arms = s('arms') * 0.85; t.legs = s('legs') * 0.8; t.core = s('core') * 0.9;
    // build (user's chosen frame)
    if (L.build === 'lean') t.build_slim = 0.5; else if (L.build === 'solid') t.build_heavy = 0.35; else if (L.build === 'heavy') t.build_heavy = 0.75;
    // face structure
    const face = { square: 'face_square', oval: 'face_oval', round: 'face_round', angular: 'face_angular' }[L.face]; if (face) t[face] = 0.8;
    if (L.jaw === 'strong') t.jaw_strong = 0.7; else if (L.jaw === 'soft') t.jaw_strong = -0.35;
    if (L.nose === 'broad') t.nose_broad = 0.7; else if (L.nose === 'narrow') t.nose_narrow = 0.7;
    this.morphTarget = t;
  }

  _resize() {
    if (!this.el || !this.renderer) return;
    const w = this.el.clientWidth || 300, h = this.el.clientHeight || 400;
    this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = w + 'px'; this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this._kick();
  }

  _frame() {
    const H = (this.current && this.current.height) || 1.7;
    const z = this.zoom; // 0 = full body, 1 = face
    const tgtY = H * (0.53 + 0.4 * z), fit = H * (1 - 0.84 * z) * 0.62;
    const dist = fit / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.min(1, this.camera.aspect * 1.6);
    this.camera.position.set(0, tgtY + 0.08 - 0.06 * z, dist);
    this.camera.lookAt(0, tgtY, 0);
  }

  _bindInput(c) {
    let down = false, sx = 0, sy = 0, sYaw = 0, moved = false, pinch = 0, sZoom = 0;
    const pts = new Map();
    c.addEventListener('pointerdown', e => { if (!this.opts || !this.opts.interactive) return; pts.set(e.pointerId, e); down = true; moved = false; sx = e.clientX; sy = e.clientY; sYaw = this.yawT; c.setPointerCapture(e.pointerId); this._kick(); });
    c.addEventListener('pointermove', e => {
      if (!down || !pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const dd = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (!pinch) { pinch = dd; sZoom = this.zoomT; } this.zoomT = Math.min(1, Math.max(0, sZoom + (dd - pinch) / 220)); this._kick(); return; }
      const dx = e.clientX - sx; if (Math.abs(dx) > 4) moved = true;
      this.yawT = sYaw + dx * 0.012; this._kick();
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (!pts.size) down = false; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', e => { if (!this.opts || !this.opts.interactive) return; e.preventDefault(); this.zoomT = Math.min(1, Math.max(0, this.zoomT - e.deltaY / 600)); this._kick(); }, { passive: false });
    c.addEventListener('dblclick', () => { this.zoomT = this.zoomT > 0.5 ? 0 : 1; this._kick(); });
  }

  _kick() { this._idleFrames = 0; if (!this._raf && this.renderer) this._raf = requestAnimationFrame(this._loop); }

  _loop(ts) {
    this._raf = null;
    if (document.hidden || !this.el || !this.el.isConnected) return;
    const dt = Math.min(0.05, ((ts - (this._last || ts)) / 1000) || 0.016); this._last = ts; this.time += dt;
    const k = 1 - Math.pow(0.0008, dt);
    this.yaw += (this.yawT - this.yaw) * k; this.zoom += (this.zoomT - this.zoom) * k;
    let changing = Math.abs(this.yawT - this.yaw) > 1e-3 || Math.abs(this.zoomT - this.zoom) > 1e-3;
    // morph easing (gradual, believable transitions)
    const model = this.current;
    if (model) {
      const breathe = REDUCED ? 0.3 : (Math.sin(this.time * 1.25) * 0.5 + 0.5) * 0.7;
      const mk = 1 - Math.pow(0.02, dt);
      for (const name of MORPHS) {
        const tgt = name === 'breathe' ? breathe : (this.morphTarget[name] || 0);
        const cur = this.morphCur[name] === undefined ? tgt : this.morphCur[name];
        const nv = cur + (tgt - cur) * mk; this.morphCur[name] = nv;
        if (Math.abs(tgt - nv) > 1e-3 && name !== 'breathe') changing = true;
      }
      for (const m of Object.values(model.meshes)) {
        if (!m.visible || !m.morphTargetInfluences) continue;
        const dict = m.morphTargetDictionary;
        for (const name of MORPHS) { const i = dict[name]; if (i !== undefined) m.morphTargetInfluences[i] = this.morphCur[name]; }
      }
      // pose + idle
      const pose = POSES[this.pose] || POSES.relaxed; const pk = 1 - Math.pow(0.003, dt);
      const idle = REDUCED ? 0 : 1, t = this.time;
      for (const [name, bone] of Object.entries(model.bones)) {
        const r = pose[name] || [0, 0, 0];
        let [x, y, z] = r;
        if (idle) {
          if (name === 'spine_02') x += Math.sin(t * 1.25) * 0.8;
          if (name === 'head') { y += Math.sin(t * 0.37) * 3; x += Math.sin(t * 0.53) * 1.2; }
          if (name === 'pelvis') z += Math.sin(t * 0.31) * 0.8;
          if (name === 'upperarm_l' && this.pose !== 'flex') z += Math.sin(t * 1.25 + 0.6) * 0.8;
          if (name === 'upperarm_r' && this.pose !== 'flex') z -= Math.sin(t * 1.25 + 0.6) * 0.8;
        }
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180, 'XYZ'));
        q.premultiply(bone.userData.rest);
        bone.quaternion.slerp(q, pk);
      }
      model.scene.rotation.y = this.yaw;
    }
    // charged aura + burst
    if (this.column) {
      this._charge += (this._chargeT - this._charge) * (1 - Math.pow(0.02, dt));
      if (this._burst > 0) this._burst = Math.max(0, this._burst - dt / 1.5);
      const b = this._burst, e = b * b, ch = REDUCED ? 0 : this._charge;
      const pow = ch * (0.8 + 0.12 * Math.sin(this.time * 2.1)) + e * 1.5;
      this.column.visible = pow > 0.01; this.column.userData.mats.forEach(m => { m.uniforms.uTime.value = this.time; m.uniforms.uPow.value = pow; });
      this.halo.material.opacity = Math.min(0.7, this._charge * 0.1 + e * 0.45);
      if (b > 0) { const k = 1 - b, o = 1 - Math.pow(1 - k, 3); this.shock.visible = true; this.shock.scale.setScalar(0.25 + o * 2.2); this.shock.material.opacity = b * b * 0.9; } else this.shock.visible = false;
      this.key.intensity = 2.4 + e * 3.2;
      this.motes.visible = this._moteVis || ch > 0.05 || b > 0;
      this.motes.material.opacity = Math.max(this._moteBase, 0.6 * ch + 0.4 * e);
      this._moteSpeed = 1 + 3.5 * ch + 9 * e;
      if (ch > 0.02 || b > 0 || Math.abs(this._chargeT - this._charge) > 0.01) changing = true;
    }
    if (this.motes.visible) {
      const p = this.motes.geometry.attributes.position, s = this.motes.geometry.attributes.seed, ms = this._moteSpeed || 1;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * (0.08 + s.getX(i) * 0.1) * ms; if (y > 1.95) y = 0; p.setY(i, y); }
      p.needsUpdate = true;
    }
    // idle only: render at ~30 fps to save battery on phones
    this._odd = !this._odd;
    if (!changing && this._odd && !this.motes.visible) { this._raf = requestAnimationFrame(this._loop); return; }
    this._frame();
    this.renderer.render(this.scene, this.camera);
    // keep animating only while something moves, idle animation runs at a gentle rate
    if (changing || !REDUCED) this._raf = requestAnimationFrame(this._loop);
  }
}

const engine = new HunterEngine();
engine._poses = POSES; // dev harness hook (dev/viewer.html)
window.Hunter3D = engine;
window.dispatchEvent(new CustomEvent('hunter3d-ready'));
export default engine;
