"""
ASCENDANT character pipeline.
Builds rigged, morphable GLB characters (male + female) from CC0 MakeHuman data:
  - base mesh hm08 + macro/regional/face morph targets (MakeHuman, CC0)
  - 53-bone game-engine skeleton + skin weights (MPFB2, CC0)
  - high-poly eyes via .mhclo proxy fitting (MakeHuman, CC0)
  - garments, footwear, hair, facial hair, accessories generated procedurally as
    offset shells of the body surface, so they inherit every morph and skin weight.
  - optional: real MakeHuman asset packs (.mhclo + .obj) dropped in ./extra_assets are fitted too.
Outputs: www/assets/hunter/{male,female}.glb, masks_*.png, normal_skin.png, eye_*.png, manifest.json
"""
import numpy as np, json, struct, os, sys, glob, math
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
# Source data (CC0). See pipeline/README.md for the two git clones that provide these folders.
MH = os.environ.get('MAKEHUMAN_DATA', os.path.join(HERE, 'src', 'makehuman', 'makehuman', 'data'))
MP = os.environ.get('MPFB_DATA', os.path.join(HERE, 'src', 'mpfb2', 'src', 'mpfb', 'data'))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'www', 'assets', 'hunter')
EXTRA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extra_assets')
os.makedirs(OUT, exist_ok=True)
S = 0.1  # MakeHuman decimetres -> metres
TEX = 1024

# ----------------------------------------------------------------- loading
def load_obj(path):
    V, VT, F = [], [], []
    grp = None
    for line in open(path):
        if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '): grp = line.split()[1]
        elif line.startswith('f '):
            vs, ts = [], []
            for t in line.split()[1:]:
                p = t.split('/')
                vs.append(int(p[0]) - 1); ts.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
            F.append((vs, ts, grp))
    return np.array(V, np.float64), np.array(VT, np.float64) if VT else None, F

V0, VT0, F0 = load_obj(f'{MH}/3dobjs/base.obj')
NV = len(V0)
GROUPS = {}
for vs, ts, g in F0: GROUPS.setdefault(g, set()).update(vs)

_tcache = {}
def T(name):
    if name in _tcache: return _tcache[name]
    d = np.zeros((NV, 3))
    for line in open(f'{MH}/targets/{name}.target'):
        if not line.strip() or line[0] == '#': continue
        p = line.split(); d[int(p[0])] = [float(p[1]), float(p[2]), float(p[3])]
    _tcache[name] = d
    return d

def LR(n): return T('armslegs/l-' + n) + T('armslegs/r-' + n)

# ----------------------------------------------------------------- morph definitions
def gender_defs(g):
    U = lambda m, w: T(f'macrodetails/universal-{g}-young-{m}muscle-{w}weight')
    eth = (T(f'macrodetails/african-{g}-young') + T(f'macrodetails/asian-{g}-young') + T(f'macrodetails/caucasian-{g}-young')) / 3
    base = U('average', 'average') + eth
    if g == 'female':
        base = base + 0.35 * T('breast/female-young-averagemuscle-averageweight-mincup-averagefirmness')
    m = {
        'muscle_up':   U('max', 'average') - U('average', 'average'),
        'muscle_down': U('min', 'average') - U('average', 'average'),
        'build_heavy': U('average', 'max') - U('average', 'average'),
        'build_slim':  U('average', 'min') - U('average', 'average'),
        'chest':       T('torso/torso-muscle-pectoral-incr') * (0.6 if g == 'female' else 1.0),
        'back':        T('torso/torso-muscle-dorsi-incr') + 0.7 * T('torso/torso-vshape-incr'),
        'shoulders':   LR('upperarm-shoulder-muscle-incr'),
        'arms':        LR('upperarm-muscle-incr') + LR('lowerarm-muscle-incr'),
        'legs':        LR('upperleg-muscle-incr') + LR('lowerleg-muscle-incr'),
        'core':        T('stomach/stomach-pregnant-decr') * 0.6,
        'face_square': 0.7 * T('head/head-square') + 0.5 * T('chin/chin-width-incr'),
        'face_oval':   0.8 * T('head/head-oval'),
        'face_round':  0.7 * T('head/head-round') + 0.3 * T('cheek/l-cheek-volume-incr') + 0.3 * T('cheek/r-cheek-volume-incr'),
        'face_angular': 0.5 * T('head/head-diamond') + 0.6 * (T('cheek/l-cheek-bones-incr') + T('cheek/r-cheek-bones-incr')) + 0.3 * T('chin/chin-prominent-incr'),
        'jaw_strong':  0.8 * T('chin/chin-width-incr') + 0.6 * T('chin/chin-prominent-incr') + 0.4 * T('chin/chin-bones-incr'),
        'nose_broad':  0.7 * T('nose/nose-scale-horiz-incr') + 0.5 * T('nose/nose-volume-incr'),
        'nose_narrow': 0.7 * T('nose/nose-scale-horiz-decr') + 0.4 * T('nose/nose-point-width-decr'),
        'breathe':     0.22 * T('torso/torso-scale-depth-incr') + 0.08 * T('torso/torso-scale-horiz-incr'),
    }
    return base, m

MORPH_ORDER = ['muscle_up', 'muscle_down', 'build_heavy', 'build_slim', 'chest', 'back', 'shoulders', 'arms', 'legs', 'core',
               'face_square', 'face_oval', 'face_round', 'face_angular', 'jaw_strong', 'nose_broad', 'nose_narrow', 'breathe']

# ----------------------------------------------------------------- skeleton + weights
RIG = json.load(open(f'{MP}/rigs/standard/rig.game_engine.json'))
WEIGHTS = json.load(open(f'{MP}/rigs/standard/weights.game_engine.json'))['weights']
BONES = list(RIG.keys())
BI = {b: i for i, b in enumerate(BONES)}

def joint_pos(spec, Vm):
    s = spec.get('strategy')
    if s == 'CUBE':
        idx = sorted(GROUPS[spec['cube_name']]); return Vm[idx].mean(0)
    if s == 'VERTEX': return Vm[spec['vertex_index']]
    if s == 'MEAN': return Vm[spec['vertex_indices']].mean(0)
    dp = spec['default_position']; return np.array([dp[0], dp[2], -dp[1]]) / S  # blender -> MH

def skeleton(Vm):
    heads = {b: joint_pos(RIG[b]['head'], Vm) for b in BONES}
    tails = {b: joint_pos(RIG[b]['tail'], Vm) for b in BONES}
    return heads, tails

# per original vertex: top-4 joints & weights
JW = [[] for _ in range(NV)]
for b, lst in WEIGHTS.items():
    for vi, w in lst:
        if vi < NV: JW[vi].append((w, BI[b]))
def skin_of(vi):
    lst = sorted(JW[vi], reverse=True)[:4]
    if not lst: return [BI['head'], 0, 0, 0], [1.0, 0, 0, 0]
    ws = np.array([w for w, _ in lst]); ws = ws / ws.sum()
    j = [b for _, b in lst] + [0] * (4 - len(lst)); w = list(ws) + [0.0] * (4 - len(lst))
    return j, w
SKIN_J = np.zeros((NV, 4), np.uint8); SKIN_W = np.zeros((NV, 4), np.float32)
for i in range(NV):
    j, w = skin_of(i); SKIN_J[i] = j; SKIN_W[i] = w

# ----------------------------------------------------------------- geometry helpers
BODY_FACES = [(vs, ts) for vs, ts, g in F0 if g == 'body']
LASH_FACES = [(vs, ts) for vs, ts, g in F0 if g and 'eyelashes-1' in g]

def vertex_normals(Vm, faces):
    n = np.zeros_like(Vm)
    for vs, _ in faces:
        p = Vm[vs]
        for k in range(1, len(vs) - 1):
            c = np.cross(p[k] - p[0], p[k + 1] - p[0]); n[vs[0]] += c; n[vs[k]] += c; n[vs[k + 1]] += c
    l = np.linalg.norm(n, axis=1, keepdims=True); l[l == 0] = 1
    return n / l

def vertex_normals_fast(Vm, tri):
    n = np.zeros_like(Vm)
    a, b, c = Vm[tri[:, 0]], Vm[tri[:, 1]], Vm[tri[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3): np.add.at(n, tri[:, k], fn)
    l = np.linalg.norm(n, axis=1, keepdims=True); l[l == 0] = 1
    return n / l

BODY_TRI = np.array([[vs[0], vs[k], vs[k + 1]] for vs, _ in BODY_FACES for k in range(1, len(vs) - 1)])

# ----------------------------------------------------------------- per-vertex regions
def bone_weight(bones):
    w = np.zeros(NV)
    for b in bones:
        for vi, x in WEIGHTS.get(b, []):
            if vi < NV: w[vi] += x
    return w

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# ----------------------------------------------------------------- GLB writer
class GLB:
    def __init__(self):
        self.bin = bytearray(); self.views = []; self.acc = []; self.meshes = []; self.nodes = []; self.mats = []; self.tex = []; self.imgs = []; self.samplers = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    def _view(self, data, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        off = len(self.bin); self.bin += data
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: v['target'] = target
        self.views.append(v); return len(self.views) - 1
    def acc_(self, arr, ctype, typ, target=None, normalized=False, minmax=False):
        arr = np.ascontiguousarray(arr)
        v = self._view(arr.tobytes(), target)
        a = {'bufferView': v, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if normalized: a['normalized'] = True
        if minmax: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
        self.acc.append(a); return len(self.acc) - 1
    def sparse_vec3(self, count, delta, eps=1e-6):
        idx = np.where(np.abs(delta).max(1) > eps)[0].astype(np.uint32)
        a = {'componentType': 5126, 'count': int(count), 'type': 'VEC3'}
        if len(idx) == 0:
            a['min'] = [0, 0, 0]; a['max'] = [0, 0, 0]
            self.acc.append(a); return len(self.acc) - 1
        vals = delta[idx].astype(np.float32)
        iv = self._view(idx.tobytes()); vv = self._view(vals.tobytes())
        a['sparse'] = {'count': int(len(idx)), 'indices': {'bufferView': iv, 'componentType': 5125}, 'values': {'bufferView': vv}}
        a['min'] = [float(x) for x in np.minimum(vals.min(0), 0)]; a['max'] = [float(x) for x in np.maximum(vals.max(0), 0)]
        self.acc.append(a); return len(self.acc) - 1
    def image(self, path):
        data = open(path, 'rb').read(); v = self._view(data)
        self.imgs.append({'bufferView': v, 'mimeType': 'image/png' if path.endswith('png') else 'image/jpeg'})
        self.tex.append({'sampler': 0, 'source': len(self.imgs) - 1}); return len(self.tex) - 1
    def write(self, path, scene_nodes, skin):
        gl = {'asset': {'version': '2.0', 'generator': 'ascendant-pipeline', 'copyright': 'Base human CC0 (MakeHuman/MPFB2). Generated assets CC0.'},
              'scene': 0, 'scenes': [{'nodes': scene_nodes}], 'nodes': self.nodes, 'meshes': self.meshes, 'materials': self.mats,
              'accessors': self.acc, 'bufferViews': self.views, 'buffers': [{'byteLength': len(self.bin)}], 'skins': [skin]}
        if self.tex: gl['textures'] = self.tex; gl['images'] = self.imgs; gl['samplers'] = self.samplers
        js = json.dumps(gl, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        while len(self.bin) % 4: self.bin.append(0)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(self.bin)))
            f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(self.bin), 0x004E4942)); f.write(self.bin)

# ----------------------------------------------------------------- primitive builder
def build_prim(g, name, src, pos, nrm, uv, tri, morph_d, morph_n, mat, extras=None):
    """src: original base-vertex index per output vertex (for morphs/skin); pos/nrm in MH units."""
    attrs = {
        'POSITION': g.acc_((pos * S).astype(np.float32), 5126, 'VEC3', 34962, minmax=True),
        'NORMAL': g.acc_(nrm.astype(np.float32), 5126, 'VEC3', 34962),
        'TEXCOORD_0': g.acc_(uv.astype(np.float32), 5126, 'VEC2', 34962),
        'JOINTS_0': g.acc_(SKIN_J[src] if src is not None else np.tile(np.array([[BI['head'], 0, 0, 0]], np.uint8), (len(pos), 1)), 5121, 'VEC4', 34962),
        'WEIGHTS_0': g.acc_(SKIN_W[src] if src is not None else np.tile(np.array([[1, 0, 0, 0]], np.float32), (len(pos), 1)), 5126, 'VEC4', 34962),
    }
    targets = []
    for k in MORPH_ORDER:
        if src is None:
            d = np.zeros((len(pos), 3)); n = d
        else:
            d = morph_d[k][src] * S; n = morph_n[k][src] if morph_n is not None else np.zeros_like(d)
        t = {'POSITION': g.sparse_vec3(len(pos), d)}
        if np.abs(n).max() > 0: t['NORMAL'] = g.sparse_vec3(len(pos), n, 1e-3)
        targets.append(t)
    ind = g.acc_(tri.astype(np.uint16 if len(pos) < 65535 else np.uint32).reshape(-1), 5123 if len(pos) < 65535 else 5125, 'SCALAR', 34963)
    g.meshes.append({'name': name, 'primitives': [{'attributes': attrs, 'indices': ind, 'material': mat, 'targets': targets}],
                     'weights': [0.0] * len(MORPH_ORDER), 'extras': dict({'targetNames': MORPH_ORDER}, **(extras or {}))})
    return len(g.meshes) - 1

def split_uv(faces, VT):
    """unique (v,vt) pairs -> output verts. returns src index array, uv array, triangle array"""
    key = {}; src = []; uvs = []; tri = []
    for vs, ts in faces:
        ids = []
        for v, t in zip(vs, ts):
            k = (v, t)
            if k not in key: key[k] = len(src); src.append(v); uvs.append(VT[t] if t >= 0 else (0, 0))
            ids.append(key[k])
        for k in range(1, len(ids) - 1): tri.append([ids[0], ids[k], ids[k + 1]])
    uv = np.array(uvs); uv[:, 1] = 1 - uv[:, 1]
    return np.array(src), uv, np.array(tri)

# ----------------------------------------------------------------- mhclo proxy fitting
def load_mhclo(path):
    meta = {'scale': {}}; refs = []; obj = None; mode = None
    for line in open(path):
        p = line.split()
        if not p or p[0].startswith('#'): continue
        if p[0] in ('x_scale', 'y_scale', 'z_scale'): meta['scale'][p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
        elif p[0] == 'obj_file': obj = p[1]
        elif p[0] == 'verts': mode = 'v'
        elif p[0] in ('weights', 'delete_verts'): mode = None
        elif mode == 'v' and len(p) >= 9:
            refs.append(([int(p[0]), int(p[1]), int(p[2])], [float(p[3]), float(p[4]), float(p[5])], [float(p[6]), float(p[7]), float(p[8])]))
        elif mode == 'v' and len(p) == 1:
            refs.append(([int(p[0]), int(p[0]), int(p[0])], [1, 0, 0], [0, 0, 0]))
    return meta, refs, os.path.join(os.path.dirname(path), obj)

def fit_proxy(meta, refs, Vm):
    sc = []
    for ax, i in (('x', 0), ('y', 1), ('z', 2)):
        if ax in meta['scale']:
            a, b, den = meta['scale'][ax]; sc.append(abs(Vm[a][i] - Vm[b][i]) / den)
        else: sc.append(1.0)
    sc = np.array(sc)
    out = np.zeros((len(refs), 3))
    for k, (v, w, o) in enumerate(refs):
        out[k] = w[0] * Vm[v[0]] + w[1] * Vm[v[1]] + w[2] * Vm[v[2]] + np.array(o) * sc
    return out

def proxy_skin(refs):
    J = np.zeros((len(refs), 4), np.uint8); W = np.zeros((len(refs), 4), np.float32)
    for k, (v, w, _) in enumerate(refs):
        acc = {}
        for vi, wi in zip(v, w):
            for jj, ww in zip(SKIN_J[vi], SKIN_W[vi]):
                if ww > 0: acc[int(jj)] = acc.get(int(jj), 0) + ww * wi
        top = sorted(acc.items(), key=lambda x: -x[1])[:4]
        s = sum(x for _, x in top) or 1
        for q, (jj, ww) in enumerate(top): J[k, q] = jj; W[k, q] = ww / s
    return J, W

# ----------------------------------------------------------------- texture painting (UV rasterizer)
BODY_SRC, BODY_UV, BODY_TRI_OUT = split_uv(BODY_FACES, VT0)

def paint(field, size=TEX, blur=1.5):
    """rasterize per-base-vertex scalar field into UV texture (body UV layout)."""
    img = np.zeros((size, size), np.float32)
    vals = field[BODY_SRC]
    keep = vals[BODY_TRI_OUT].max(1) > 1e-3
    for t in BODY_TRI_OUT[keep]:
        uv = BODY_UV[t] * (size - 1)
        x0, x1 = int(max(0, np.floor(uv[:, 0].min()))), int(min(size - 1, np.ceil(uv[:, 0].max())))
        y0, y1 = int(max(0, np.floor(uv[:, 1].min()))), int(min(size - 1, np.ceil(uv[:, 1].max())))
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        (ax, ay), (bx, by), (cx, cy) = uv
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-9: continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        l3 = 1 - l1 - l2
        m = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
        v = l1 * vals[t[0]] + l2 * vals[t[1]] + l3 * vals[t[2]]
        sub = img[y0:y1 + 1, x0:x1 + 1]; sub[m] = np.maximum(sub[m], v[m])
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    return im.filter(ImageFilter.GaussianBlur(blur)) if blur else im

def mpfb_mask(n):
    return Image.open(f'{MP}/textures/mpfb_{n}.jpg').convert('L').resize((TEX, TEX), Image.LANCZOS)

# ----------------------------------------------------------------- build one gender
def build(g):
    base, md = gender_defs(g)
    Vb = V0 + base
    nb = vertex_normals_fast(Vb, BODY_TRI)
    mn = {}
    for k in MORPH_ORDER:
        nk = vertex_normals_fast(Vb + md[k], BODY_TRI); mn[k] = nk - nb
    heads, tails = skeleton(Vb)
    glb = GLB()

    # --- landmarks (MH units, from fitted base)
    eyeL = Vb[sorted(GROUPS['joint-l-eye'])].mean(0); eyeR = Vb[sorted(GROUPS['joint-r-eye'])].mean(0)
    headc = np.array([0, (eyeL[1] + Vb[:, 1].max()) / 2 - 0.15, 0.45])
    body_ids = np.array(sorted(GROUPS['body']))
    inbody = np.zeros(NV, bool); inbody[body_ids] = True
    X, Y, Z = Vb[:, 0], Vb[:, 1], Vb[:, 2]
    top = Y[body_ids].max(); chin_y = eyeL[1] - 1.08
    is_f = g == 'female'

    # ---------------- texture masks
    eye_y = eyeL[1]
    def brow_field(thick):
        f = np.zeros(NV)
        for side in (1, -1):
            ex = abs(eyeL[0]) * side
            xi, xo = 0.10 * side, (abs(ex) + 0.33) * side
            t = np.clip((X - xi) / (xo - xi), 0, 1)
            yc = eye_y + 0.205 + 0.055 * np.sin(np.pi * np.clip(t * 1.25, 0, 1)) - 0.03 * t
            w = thick * (1.0 - 0.55 * t)
            d = np.abs(Y - yc)
            inside = ((X - xi) * side > -0.02) & ((X - xo) * side < 0.03) & (Z > 1.0)
            v = np.where(inside, 1 - smoothstep(w * 0.55, w, d), 0)
            v *= smoothstep(-0.02, 0.06, (X - xi) * side) * (1 - smoothstep(-0.02, 0.04, (X - xo) * side))
            f = np.maximum(f, v)
        return f * inbody
    lips_y = eye_y - 0.56
    front = Z > 0.55
    rad = np.sqrt(X ** 2)
    jaw_zone = (Y < eye_y - 0.33) & (Y > chin_y - 0.25) & front
    # beard: lower face, sides back to ears, under-jaw slightly
    cheek_line = (eye_y - 0.36 - 0.05 * smoothstep(0.45, 0.7, rad)) * smoothstep(0.22, 0.42, rad) + (lips_y - 0.05) * (1 - smoothstep(0.22, 0.42, rad))
    beard = (1 - smoothstep(cheek_line - 0.08, cheek_line, Y)) * smoothstep(chin_y - 0.32, chin_y - 0.12, Y) * smoothstep(0.35, 0.62, Z) * (np.abs(X) < 0.72)
    mouth_hole = np.exp(-(((Y - (lips_y - 0.02)) / 0.06) ** 2 + (X / 0.24) ** 2)) * smoothstep(1.2, 1.4, Z)
    mous = np.exp(-(((Y - (lips_y + 0.105)) / 0.055) ** 2 + (X / 0.3) ** 4)) * smoothstep(1.25, 1.45, Z) * inbody
    beard_full = np.maximum(np.clip(beard - 0.95 * mouth_hole, 0, 1), mous) * inbody
    goatee = np.clip(np.exp(-(((Y - (chin_y + 0.12)) / 0.2) ** 2 + (X / 0.2) ** 4)) * smoothstep(0.9, 1.2, Z) - mouth_hole, 0, 1) * inbody
    goatee = np.maximum(goatee, mous)
    stubble = beard_full
    blush = np.exp(-(((Y - (eye_y - 0.33)) / 0.18) ** 2 + ((np.abs(X) - 0.42) / 0.16) ** 2)) * front * inbody

    lips = mpfb_mask('lips'); nails = Image.fromarray(np.maximum(np.array(mpfb_mask('fingernails')), np.array(mpfb_mask('toenails'))))
    red = Image.fromarray(np.maximum(np.array(mpfb_mask('ears')), np.array(mpfb_mask('eyelids'))))
    aur = mpfb_mask('aureolae')
    Image.merge('RGBA', (lips, nails, red, aur)).save(f'{OUT}/{g}_maskA.png', optimize=True)
    Image.merge('RGBA', (paint(brow_field(0.07)), paint(brow_field(0.095)), paint(stubble, blur=3), paint(beard_full, blur=2))).save(f'{OUT}/{g}_maskB.png', optimize=True)
    _maskC_parts = (mous, goatee, blush)

    # ---------------- body
    pos = Vb[BODY_SRC]; nrm = nb[BODY_SRC]
    glb.mats.append({'name': 'skin', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.6}})
    mesh_ids = [build_prim(glb, 'body', BODY_SRC, pos, nrm, BODY_UV, BODY_TRI_OUT, md, mn, 0, {'slot': 'body'})]

    # ---------------- eyelashes
    lsrc, luv, ltri = split_uv(LASH_FACES, VT0)
    glb.mats.append({'name': 'lash', 'pbrMetallicRoughness': {'baseColorFactor': [0.05, 0.04, 0.04, 1], 'metallicFactor': 0, 'roughnessFactor': 0.8}, 'doubleSided': True})
    ln = vertex_normals_fast(Vb, np.array([[vs[0], vs[k], vs[k + 1]] for vs, _ in LASH_FACES for k in range(1, len(vs) - 1)]))
    pass  # lash helper geometry intentionally not exported

    # ---------------- eyes (mhclo proxy)
    meta, refs, objp = load_mhclo(f'{MH}/eyes/high-poly/high-poly.mhclo')
    EV, EVT, EF = load_obj(objp)
    epos = fit_proxy(meta, refs, Vb)
    efaces = [(vs, ts) for vs, ts, _ in EF]
    esrc, euv, etri = split_uv(efaces, EVT)
    etri_base = np.array([[vs[0], vs[k], vs[k + 1]] for vs, _ in efaces for k in range(1, len(vs) - 1)])
    en = vertex_normals_fast(epos, etri_base)
    cen = np.where(epos[:, :1] >= 0, epos[epos[:, 0] >= 0].mean(0), epos[epos[:, 0] < 0].mean(0))
    if (np.sum(en * (epos - cen), 1) < 0).mean() > 0.5:
        etri = etri[:, [0, 2, 1]]; en = -en
        print('eyes: flipped winding')
    glb.mats.append({'name': 'eyes', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.15}})
    # eye morphs: refit proxy on morphed bodies
    emd = {k: (fit_proxy(meta, refs, Vb + md[k]) - epos) for k in MORPH_ORDER}
    EJ, EW = proxy_skin(refs)
    glob_J, glob_W = SKIN_J, SKIN_W
    attrsJ = EJ[esrc]; attrsW = EW[esrc]
    # temporarily route skin through proxy tables
    def build_proxy(name, P, src, uv, tri, nrm, pmd, J, W, mat, extras):
        attrs = {'POSITION': glb.acc_((P[src] * S).astype(np.float32), 5126, 'VEC3', 34962, minmax=True),
                 'NORMAL': glb.acc_(nrm[src].astype(np.float32), 5126, 'VEC3', 34962),
                 'TEXCOORD_0': glb.acc_(uv.astype(np.float32), 5126, 'VEC2', 34962),
                 'JOINTS_0': glb.acc_(J[src], 5121, 'VEC4', 34962), 'WEIGHTS_0': glb.acc_(W[src], 5126, 'VEC4', 34962)}
        targets = [{'POSITION': glb.sparse_vec3(len(src), pmd[k][src] * S)} for k in MORPH_ORDER]
        ind = glb.acc_(tri.astype(np.uint16).reshape(-1), 5123, 'SCALAR', 34963)
        glb.meshes.append({'name': name, 'primitives': [{'attributes': attrs, 'indices': ind, 'material': mat, 'targets': targets}],
                           'weights': [0.0] * len(MORPH_ORDER), 'extras': dict({'targetNames': MORPH_ORDER}, **extras)})
        return len(glb.meshes) - 1
    mesh_ids.append(build_proxy('eyes', epos, esrc, euv, etri, en, emd, EJ, EW, 2, {'slot': 'eyes'}))

    # ---------------- shells: garments / hair / beard / accessories, CLIPPED along smooth scalar fields
    Wb = lambda bones: bone_weight(bones)
    torso = Wb(['spine_01', 'spine_02', 'spine_03', 'pelvis', 'clavicle_l', 'clavicle_r'])
    headw = Wb(['head']); neckw = Wb(['neck_01'])
    hipY = heads['thigh_l'][1]; ankleY = heads['foot_l'][1]; neckY = heads['neck_01'][1]; shoulderY = heads['upperarm_l'][1]
    def seg_dist(P, a, b):
        ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
    def arm_dist(side):
        pts = [heads['upperarm_' + side], heads['lowerarm_' + side], heads['hand_' + side], tails['middle_03_' + side]]
        return np.min([seg_dist(Vb, pts[i], pts[i + 1]) for i in range(3)], 0)
    dist_arm = np.minimum(arm_dist('l'), arm_dist('r'))
    def arm_t(side):
        a = heads['upperarm_' + side]; b = heads['hand_' + side]; ab = b - a
        return ((Vb - a) @ ab) / (ab @ ab)
    armt = np.where(X >= 0, arm_t('l'), arm_t('r'))
    on_arm = (dist_arm < 1.3) & (np.abs(X) > 0.75)
    legt = (hipY - Y) / (hipY - ankleY)
    hd = Vb - headc; ang = np.arctan2(hd[:, 0], hd[:, 2]); front_w = np.cos(ang).clip(0, 1); back_w = (-np.cos(ang)).clip(0, 1)
    BIG = 9.0
    def F(*terms): return np.min(np.stack(terms), 0)
    arm_only = np.where(on_arm, 1.0, -1.0)
    not_arm = np.where(on_arm & (Y < shoulderY - 0.3), -1.0, 1.0)
    neck_front = neckY - 0.22 - 0.22 * front_w ** 2
    f_body = np.where(inbody, BIG, -BIG)
    armw = Wb(['upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r'] + [b for b in BONES if any(f in b for f in ('thumb', 'index', 'middle', 'ring', 'pinky'))])
    shoulder_plane = 0.45 - armw - 0.25 * smoothstep(neckY - 0.5, neckY - 0.1, Y)
    fields = {
        'top_tee':      (F(neck_front - Y, Y - (hipY + 0.2), np.where(on_arm, 0.42 - armt, BIG), f_body), 0.045),
        'top_long':     (F(neck_front + 0.04 - Y, Y - (hipY - 0.2), np.where(on_arm, 0.94 - armt, BIG), f_body), 0.035),
        'top_hoodie':   (F(neckY + 0.1 - Y + 0.2 * front_w ** 2 * 0, Y - (hipY - 0.3), np.where(on_arm, 0.96 - armt, BIG), 0.45 - headw, f_body), 0.1),
        'top_tank':     (F(neckY - 0.42 - 0.18 * front_w ** 2 - Y + 0.0, Y - (hipY + 0.2), shoulder_plane, f_body), 0.05 if is_f else 0.04),
        'top_sportsbra':(F(neckY - 0.40 - 0.2 * front_w ** 2 - Y, Y - (shoulderY - 0.62 * (shoulderY - hipY)), shoulder_plane, f_body), 0.06),
        'bottom_shorts':  (F(hipY + 0.55 - Y, 0.42 - legt, not_arm, f_body), 0.075),
        'bottom_joggers': (F(hipY + 0.6 - Y, 0.965 - legt, not_arm, f_body), 0.08),
        'bottom_tights':  (F(hipY + 0.6 - Y, 0.975 - legt, not_arm, f_body), 0.022),
        'shoes_trainer': (F(ankleY + 0.3 - Y, f_body, not_arm), 0.2),
        'shoes_high':    (F(ankleY + 0.72 - Y, f_body, not_arm), 0.2),
        'acc_gloves':  (F(0.62 - np.minimum(seg_dist(Vb, heads['hand_l'], tails['middle_01_l']), seg_dist(Vb, heads['hand_r'], tails['middle_01_r'])), f_body), 0.025),
        'acc_wraps':   (F(0.06 - np.abs(armt - 0.96), np.where(on_arm, 1, -1.0), f_body), 0.04),
        'acc_belt':    (F(0.17 - np.abs(Y - (hipY + 0.42)), not_arm, f_body), 0.11),
    }
    hairline = (eye_y + 0.62) * front_w ** 2 + (eye_y + 0.02) * (1 - front_w ** 2) - back_w * 0.55
    ear_d = np.minimum(np.linalg.norm(Vb - np.array([0.78, eye_y - 0.05, 0.45]), axis=1), np.linalg.norm(Vb - np.array([-0.78, eye_y - 0.05, 0.45]), axis=1)) - 0.36
    head_zone = 0.4 - neckw
    f_scalp = F(Y - hairline, ear_d, head_zone + 0.1 * (headw > 0.5), f_body)
    # mask C: moustache, goatee, blush, soft scalp shading under short hair
    Image.merge('RGBA', (paint(_maskC_parts[0], blur=2), paint(_maskC_parts[1], blur=2), paint(_maskC_parts[2], blur=3),
                         paint(np.clip(smoothstep(-0.12, 0.1, f_scalp), 0, 1), blur=3))).save(f'{OUT}/{g}_maskC.png', optimize=True)
    low_hairline = hairline - back_w * 0.5 - (1 - front_w) * 0.5
    f_long = F(Y - low_hairline, ear_d, np.where(Z > 0.7, Y - hairline, BIG), f_body)
    top_w = smoothstep(eye_y + 0.15, top, Y)
    hairs = {
        'hair_buzz':  (f_scalp, 0.012, None),
        'hair_short': (f_scalp, 0.03, top_w * 0.07),
        'hair_fade':  (F(f_scalp, 0.62 - np.abs(X) + 0.3 * (Y > eye_y + 0.7)), 0.015, smoothstep(eye_y + 0.55, top - 0.05, Y) * 0.16),
        'hair_quiff': (f_scalp, 0.025, smoothstep(eye_y + 0.5, top - 0.1, Y) * (0.12 + 0.3 * front_w ** 3) * (np.abs(X) < 0.62)),
        'hair_crop':  (f_scalp - 0.05, 0.04, top_w * 0.14 + front_w ** 4 * 0.06 * smoothstep(eye_y + 0.5, eye_y + 0.7, Y)),
        'hair_bob':   (f_long, 0.05, top_w * 0.08 + (1 - top_w) * 0.12),
        'hair_long':  (f_long, 0.05, top_w * 0.06 + (1 - top_w) * 0.1),
        'hair_ponytail': (f_scalp, 0.03, top_w * 0.04),
        'hair_bun':   (f_scalp, 0.03, top_w * 0.04),
        'acc_headband': (F(0.1 - np.abs(Y - (eye_y + 0.6 - back_w * 0.25)), ear_d, head_zone + 0.1, f_body), 0.08, None),
    }
    if not is_f:
        hairs['beard_full'] = (beard_full - 0.3, 0.02, beard_full * 0.035)
        hairs['beard_goatee'] = (goatee - 0.3, 0.018, None)
        hairs['beard_moustache'] = (mous - 0.3, 0.015, None)

    glb.mats.append({'name': 'fabric', 'pbrMetallicRoughness': {'baseColorFactor': [0.2, 0.2, 0.22, 1], 'metallicFactor': 0, 'roughnessFactor': 0.85}})
    glb.mats.append({'name': 'shoe', 'pbrMetallicRoughness': {'baseColorFactor': [0.9, 0.9, 0.9, 1], 'metallicFactor': 0, 'roughnessFactor': 0.6}})
    glb.mats.append({'name': 'leather', 'pbrMetallicRoughness': {'baseColorFactor': [0.1, 0.08, 0.07, 1], 'metallicFactor': 0, 'roughnessFactor': 0.45}})
    glb.mats.append({'name': 'hair', 'pbrMetallicRoughness': {'baseColorFactor': [0.05, 0.04, 0.035, 1], 'metallicFactor': 0, 'roughnessFactor': 0.55}, 'doubleSided': True})
    MAT = {'fabric': 3, 'shoe': 4, 'leather': 5, 'hair': 6}

    # body triangles with uv corners
    BTRI = [((vs[0], ts[0]), (vs[k], ts[k]), (vs[k + 1], ts[k + 1])) for vs, ts in BODY_FACES for k in range(1, len(vs) - 1)]
    def clip_shell(field):
        """Sutherland-Hodgman clip of every body triangle against field>0. Output vertices are (a, b, t, uv)."""
        key = {}; verts = []; tris = []
        def vid(a, b, t, uva, uvb):
            if a > b: a, b, t, uva, uvb = b, a, 1 - t, uvb, uva
            if t <= 1e-6: k = (a, a, 0.0, tuple(uva))
            elif t >= 1 - 1e-6: k = (b, b, 0.0, tuple(uvb))
            else: k = (a, b, round(t, 5), tuple(np.round(uva, 6)))
            if k not in key:
                key[k] = len(verts)
                tt = 0.0 if k[0] == k[1] else t
                verts.append((k[0], k[1], tt, (1 - tt) * np.array(uva) + tt * np.array(uvb) if k[0] != k[1] else np.array(uva)))
            return key[k]
        for tri in BTRI:
            f = [field[v] for v, _ in tri]
            if min(f) <= 0 and max(f) <= 0: continue
            uvs = [VT0[t] for _, t in tri]
            if min(f) > 0:
                tris.append([vid(tri[i][0], tri[i][0], 0, uvs[i], uvs[i]) for i in range(3)]); continue
            poly = []
            for i in range(3):
                j = (i + 1) % 3; fa, fb = f[i], f[j]
                if fa > 0: poly.append(vid(tri[i][0], tri[i][0], 0, uvs[i], uvs[i]))
                if (fa > 0) != (fb > 0):
                    t = fa / (fa - fb); poly.append(vid(tri[i][0], tri[j][0], t, uvs[i], uvs[j]))
            for k in range(1, len(poly) - 1): tris.append([poly[0], poly[k], poly[k + 1]])
        return verts, np.array(tris)

    # garment bases: region-smoothed body (fabric bridges anatomy detail: chest for tops, toes for shoes)
    from collections import defaultdict
    NBR = defaultdict(set)
    for vs, _ in BODY_FACES:
        for i in range(len(vs)): NBR[vs[i]].add(vs[(i + 1) % len(vs)]); NBR[vs[(i + 1) % len(vs)]].add(vs[i])
    def region_smooth(V, region, iters):
        V = V.copy(); idx = np.where(region)[0]; nbl = [np.array(sorted(NBR[i])) for i in idx]
        for _ in range(iters):
            V[idx] = V[idx] * 0.4 + 0.6 * np.array([V[n].mean(0) for n in nbl])
        return V
    chest_zone = inbody & (torso > 0.4) & (Y < shoulderY - 0.15) & (Y > shoulderY - 0.62 * (shoulderY - hipY) - 0.2) & (Z > 0.0) & (np.abs(X) < 1.25)
    garment_base = region_smooth(Vb, chest_zone, 120 if is_f else 6)
    shoe_base = region_smooth(Vb, inbody & (Y < ankleY + 0.5), 140)
    def emit(name, field, off, vol, mat, extra=None, smooth=0):
        verts, tri = clip_shell(field)
        if len(tri) == 0: print('empty', name); return
        A = np.array([v[0] for v in verts]); Bv = np.array([v[1] for v in verts]); t = np.array([v[2] for v in verts])[:, None]
        uv = np.array([v[3] for v in verts]); uv[:, 1] = 1 - uv[:, 1]
        lerp = lambda arr: arr[A] * (1 - t) + arr[Bv] * t
        n = lerp(nb); n /= np.linalg.norm(n, axis=1, keepdims=True)
        fval = lerp(field[:, None])[:, 0]
        o = off + (lerp(vol[:, None])[:, 0] if vol is not None else np.zeros(len(verts)))
        if mat == 'hair': o = o * smoothstep(0.0, 0.12, fval)  # soft hairline
        VB = garment_base if name.startswith('top') else shoe_base if name.startswith('shoes') else Vb
        P = lerp(VB) + n * np.asarray(o)[:, None]
        if name.startswith('shoes'):
            floor = Vb[body_ids, 1].min()
            for side in ('l', 'r'):
                m = (P[:, 0] > 0) if side == 'l' else (P[:, 0] <= 0)
                ank = heads['foot_' + side]; toe = tails['ball_' + side]
                fwd = toe - ank; fwd[1] = 0; fwd /= np.linalg.norm(fwd); lat = np.cross([0, 1, 0], fwd)
                rel = P[m] - ank; sp = rel @ fwd; lp = rel @ lat; hp = P[m, 1]
                bins = np.linspace(sp.min(), sp.max(), 16); bi = np.clip(np.digitize(sp, bins) - 1, 0, 14)
                Q = P[m].copy()
                for b in range(15):
                    k = bi == b
                    if k.sum() < 4: continue
                    lc = (lp[k].max() + lp[k].min()) / 2; lw = (lp[k].max() - lp[k].min()) / 2 + 0.06
                    h0 = floor - 0.03; h1 = hp[k].max(); hc = (h0 + h1) / 2; hh = (h1 - h0) / 2 + 0.02
                    a = np.arctan2((hp[k] - hc) / max(hh, 1e-3), (lp[k] - lc) / max(lw, 1e-3))
                    nl = lc + lw * np.cos(a); nh = hc + hh * np.sin(a)
                    blend = smoothstep(ank[1] + 0.05, ank[1] - 0.15, hp[k])  # keep the collar on the ankle
                    lp_new = lp[k] * (1 - blend) + nl * blend; hp_new = hp[k] * (1 - blend) + nh * blend
                    Q[k] = ank + np.outer(sp[k], fwd) + np.outer(lp_new, lat); Q[k, 1] = hp_new
                P[m] = Q
            P[:, 1] = np.maximum(P[:, 1], floor - 0.03)
        if smooth:
            # Laplacian smoothing with the garment edge pinned (no gaps, no shrink at the hem)
            from collections import Counter
            gkey = {}; gid = np.array([gkey.setdefault((int(A[i]), int(Bv[i]), round(float(t[i, 0]), 5)), len(gkey)) for i in range(len(P))])
            NG = len(gkey); gt = gid[tri]
            ec = Counter()
            for a_, b_, c_ in gt:
                for e in ((a_, b_), (b_, c_), (c_, a_)):
                    if e[0] != e[1]: ec[(min(e), max(e))] += 1
            pinned = np.zeros(NG, bool)
            for (a_, b_), c in ec.items():
                if c == 1: pinned[a_] = pinned[b_] = True
            adj = [[] for _ in range(NG)]
            for a_, b_, c_ in gt: adj[a_] += [b_, c_]; adj[b_] += [a_, c_]; adj[c_] += [a_, b_]
            adj = [np.unique(x) for x in adj]
            G = np.zeros((NG, 3)); G[gid] = P; G0 = G.copy()
            for _ in range(smooth):
                Q = np.array([G[a].mean(0) if len(a) else G[i] for i, a in enumerate(adj)])
                G = np.where(pinned[:, None], G0, G * 0.4 + Q * 0.6)
            ring1 = np.zeros(NG, bool)
            for i in np.where(pinned)[0]: ring1[adj[i]] = True
            push = np.where(pinned, 0, np.where(ring1, 0.02, 0.05))
            # recompute normals on the smoothed surface
            GN = np.zeros((NG, 3)); fa, fb, fc = G[gt[:, 0]], G[gt[:, 1]], G[gt[:, 2]]; fn = np.cross(fb - fa, fc - fa)
            for k in range(3): np.add.at(GN, gt[:, k], fn)
            GN /= np.maximum(np.linalg.norm(GN, axis=1, keepdims=True), 1e-9)
            if (np.sum(GN[gid] * n, 1) < 0).mean() > 0.5: GN = -GN
            n = GN[gid]
            P = G[gid] + n * push[gid][:, None]
        Jc = np.zeros((len(P), 4), np.uint8); Wc = np.zeros((len(P), 4), np.float32)
        for i in range(len(P)):
            acc = {}
            for vi, wgt in ((A[i], 1 - t[i, 0]), (Bv[i], t[i, 0])):
                if wgt <= 0: continue
                for jj, ww in zip(SKIN_J[vi], SKIN_W[vi]):
                    if ww > 0: acc[int(jj)] = acc.get(int(jj), 0) + ww * wgt
            top4 = sorted(acc.items(), key=lambda x: -x[1])[:4]; ssum = sum(x for _, x in top4) or 1
            for q, (jj, ww) in enumerate(top4): Jc[i, q] = jj; Wc[i, q] = ww / ssum
        Pl, UVl, Tl, Nl, Jl, Wl, MDl, MNl = [P], [uv], [tri], [n], [Jc], [Wc], [{k: lerp(md[k]) for k in MORPH_ORDER}], [{k: lerp(mn[k]) for k in MORPH_ORDER}]
        if extra:
            for (gp, guv, gtri, gn) in extra:
                base_i = sum(len(x) for x in Pl)
                Pl.append(gp); UVl.append(guv); Tl.append(gtri + base_i); Nl.append(gn)
                jj = np.zeros((len(gp), 4), np.uint8); jj[:, 0] = BI['head']; ww = np.zeros((len(gp), 4), np.float32); ww[:, 0] = 1
                Jl.append(jj); Wl.append(ww); MDl.append({k: np.zeros((len(gp), 3)) for k in MORPH_ORDER}); MNl.append({k: np.zeros((len(gp), 3)) for k in MORPH_ORDER})
        P_all = np.vstack(Pl); uv_all = np.vstack(UVl); tri_all = np.vstack(Tl); n_all = np.vstack(Nl)
        if mat == 'hair': uv_all = hair_uv(P_all, headc)
        attrs = {'POSITION': glb.acc_((P_all * S).astype(np.float32), 5126, 'VEC3', 34962, minmax=True),
                 'NORMAL': glb.acc_(n_all.astype(np.float32), 5126, 'VEC3', 34962),
                 'TEXCOORD_0': glb.acc_(uv_all.astype(np.float32), 5126, 'VEC2', 34962),
                 'JOINTS_0': glb.acc_(np.vstack(Jl), 5121, 'VEC4', 34962), 'WEIGHTS_0': glb.acc_(np.vstack(Wl), 5126, 'VEC4', 34962)}
        targets = []
        for k in MORPH_ORDER:
            d = np.vstack([m_[k] for m_ in MDl]); nn = np.vstack([m_[k] for m_ in MNl])
            tt = {'POSITION': glb.sparse_vec3(len(P_all), d * S)}
            if np.abs(nn).max() > 0: tt['NORMAL'] = glb.sparse_vec3(len(P_all), nn, 1e-3)
            targets.append(tt)
        ind = glb.acc_(tri_all.astype(np.uint16).reshape(-1), 5123, 'SCALAR', 34963)
        glb.meshes.append({'name': name, 'primitives': [{'attributes': attrs, 'indices': ind, 'material': MAT[mat], 'targets': targets}],
                           'weights': [0.0] * len(MORPH_ORDER), 'extras': {'targetNames': MORPH_ORDER, 'slot': name.split('_')[0], 'item': name}})
        mesh_ids.append(len(glb.meshes) - 1)

    COVER = []
    for name, (field, off) in fields.items():
        if not is_f and name == 'top_sportsbra': continue
        mat = 'shoe' if name.startswith('shoes') else 'leather' if name in ('acc_gloves', 'acc_belt') else 'fabric'
        sm = 6 if name.startswith('shoes') else 0
        emit(name, field, off, None, mat, smooth=sm)
        if name.startswith(('top', 'bottom', 'shoes', 'acc_gloves')): COVER.append((name, field))
    for name, (field, off, vol) in hairs.items():
        extra = None
        if name in ('hair_ponytail', 'hair_long'): extra = gen_hair_extras({'tail': True}, None, None, None, Vb, headc, heads, eye_y, nb)
        if name == 'hair_bun': extra = gen_hair_extras({'bun': True}, None, None, None, Vb, headc, heads, eye_y, nb)
        emit(name, field, off, vol, 'fabric' if name == 'acc_headband' else 'hair', extra)

    # body cover masks: hide skin under worn garments (no poke-through at any morph/pose)
    cover = np.zeros((NV, 12), np.float32)
    for ci, (name, field) in enumerate(COVER[:12]):
        cover[:, ci] = smoothstep(0.08, 0.16, field)
    cov_out = (cover[BODY_SRC] * 255).astype(np.uint8)
    body_prim = glb.meshes[0]['primitives'][0]['attributes']
    for q in range(3):
        body_prim[f'_COVER{q}'] = glb.acc_(np.ascontiguousarray(cov_out[:, q * 4:(q + 1) * 4]), 5121, 'VEC4', 34962, normalized=True)
    glb.meshes[0]['extras']['cover'] = [n for n, _ in COVER[:12]]

    # ---------------- optional real asset packs (MakeHuman .mhclo)
    for clo in sorted(glob.glob(f'{EXTRA}/**/*.mhclo', recursive=True)):
        try:
            meta, refs, objp = load_mhclo(clo)
            PV, PVT, PF = load_obj(objp)
            pfaces = [(vs, ts) for vs, ts, _ in PF]
            ppos = fit_proxy(meta, refs, Vb)
            psrc, puv, ptri = split_uv(pfaces, PVT if PVT is not None else np.zeros((1, 2)))
            ptb = np.array([[vs[0], vs[k], vs[k + 1]] for vs, _ in pfaces for k in range(1, len(vs) - 1)])
            pn = vertex_normals_fast(ppos, ptb)
            pmd = {k: fit_proxy(meta, refs, Vb + md[k]) - ppos for k in MORPH_ORDER}
            PJ, PW = proxy_skin(refs)
            nm = 'pack_' + os.path.splitext(os.path.basename(clo))[0]
            mesh_ids.append(build_proxy(nm, ppos, psrc, puv, ptri, pn, pmd, PJ, PW, MAT['fabric'], {'slot': 'pack', 'item': nm}))
            print('fitted asset pack item', nm)
        except Exception as e:
            print('skip', clo, e)

    # ---------------- nodes: skeleton + meshes
    bone_nodes = []
    for b in BONES:
        par = RIG[b].get('parent')
        h = heads[b] * S; ph = heads[par] * S if par else np.zeros(3)
        glb.nodes.append({'name': b, 'translation': [float(x) for x in (h - ph)]})
        bone_nodes.append(len(glb.nodes) - 1)
    for b in BONES:
        par = RIG[b].get('parent')
        if par:
            pn_ = glb.nodes[BI[par]]; pn_.setdefault('children', []).append(BI[b])
    roots = [BI[b] for b in BONES if not RIG[b].get('parent')]
    ibm = np.zeros((len(BONES), 16), np.float32)
    for i, b in enumerate(BONES):
        m = np.eye(4); m[:3, 3] = -heads[b] * S; ibm[i] = m.T.reshape(-1)
    ibm_acc = glb.acc_(ibm, 5126, 'MAT4')
    skin = {'joints': bone_nodes, 'inverseBindMatrices': ibm_acc, 'skeleton': roots[0]}
    mesh_nodes = []
    for mi in mesh_ids:
        glb.nodes.append({'name': glb.meshes[mi]['name'], 'mesh': mi, 'skin': 0}); mesh_nodes.append(len(glb.nodes) - 1)
    rig_node = len(glb.nodes); glb.nodes.append({'name': 'hunter', 'children': roots + mesh_nodes})
    glb.write(f'{OUT}/{g}.glb', [rig_node], skin)
    info = {'bones': BONES, 'meshes': [glb.meshes[m]['name'] for m in mesh_ids], 'morphs': MORPH_ORDER,
            'heights': {'ground': float(Vb[body_ids, 1].min() * S), 'top': float(top * S), 'eye': float(eye_y * S)}}
    print(g, 'GLB', round(os.path.getsize(f'{OUT}/{g}.glb') / 1e6, 2), 'MB', len(mesh_ids), 'meshes')
    return info

def shell_rings(faces, src):
    """ring distance (0 = boundary) per output vertex of a shell, using base-vertex topology"""
    from collections import defaultdict, deque
    ec = defaultdict(int); nbr = defaultdict(set)
    for vs, _ in faces:
        for i in range(len(vs)):
            a, b = vs[i], vs[(i + 1) % len(vs)]; ec[(min(a, b), max(a, b))] += 1; nbr[a].add(b); nbr[b].add(a)
    bnd = set()
    for (a, b), c in ec.items():
        if c == 1: bnd.add(a); bnd.add(b)
    dist = {v: 0 for v in bnd}; q = deque(bnd)
    while q:
        v = q.popleft()
        if dist[v] >= 6: continue
        for w in nbr[v]:
            if w not in dist: dist[w] = dist[v] + 1; q.append(w)
    return np.array([dist.get(v, 9) for v in src])

def smooth_shell(P, faces, src, ring, iters):
    """relax the boundary loop (removes the saw-tooth of face-based cuts); optional full Laplacian smoothing"""
    from collections import defaultdict
    pos_of = defaultdict(list)
    for i, v in enumerate(src): pos_of[v].append(i)
    nbr = defaultdict(set); ec = defaultdict(int)
    for vs, _ in faces:
        for i in range(len(vs)):
            a, b = vs[i], vs[(i + 1) % len(vs)]; nbr[a].add(b); nbr[b].add(a); ec[(min(a, b), max(a, b))] += 1
    bnbr = defaultdict(set)
    for (a, b), c in ec.items():
        if c == 1: bnbr[a].add(b); bnbr[b].add(a)
    base = {v: P[pos_of[v][0]].copy() for v in pos_of}
    cur = dict(base)
    for _ in range(8):  # boundary relaxation
        new = dict(cur)
        for v, ns in bnbr.items():
            if len(ns) == 2: new[v] = cur[v] * 0.4 + 0.3 * sum(cur[n] for n in ns)
        cur = new
    for _ in range(iters):  # full smoothing (shoes)
        new = dict(cur)
        for v, ns in nbr.items():
            if ns: new[v] = cur[v] * 0.5 + 0.5 * np.mean([cur[n] for n in ns], 0)
        cur = new
    out = P.copy()
    for v, idx in pos_of.items():
        for i in idx: out[i] = cur[v]
    return out

def hair_uv(P, headc):
    d = P - headc
    u = (np.arctan2(d[:, 0], d[:, 2]) / (2 * np.pi) + 0.5) * 6
    v = d[:, 1] * 2.2
    return np.stack([u, v], 1)

def gen_hair_extras(spec, P, src, tri, Vb, headc, heads, eye_y, nb):
    out = []
    if spec.get('bun'):
        c = headc + np.array([0, 1.05, -0.55])
        out.append(sphere(c, np.array([0.42, 0.36, 0.42]), 18, 12))
    if spec.get('tail'):
        c0 = headc + np.array([0, 0.55, -0.92])
        pts = [c0 + np.array([0, -0.0, -0.1]), c0 + np.array([0, -0.6, -0.35]), c0 + np.array([0, -1.4, -0.45]), c0 + np.array([0, -2.3, -0.35])]
        out.append(tube(pts, [0.2, 0.22, 0.17, 0.05], 14))
        out.append(sphere(c0, np.array([0.2, 0.2, 0.2]), 12, 8))
    if spec.get('curtain'):
        L = spec['curtain']
        # ring around head below the scalp shell, extruded downwards and outwards (behind face only)
        ring = []
        for a in np.linspace(-np.pi * 0.62, np.pi * 0.62, 34):
            ang = np.pi + a  # centred at back
            dirv = np.array([np.sin(ang), 0, np.cos(ang)])
            ring.append(ang)
        rows = 9
        verts = []; uvs = []; norms = []
        for i, ang in enumerate(ring):
            dirv = np.array([np.sin(ang), 0, np.cos(ang)])
            for r in range(rows):
                t = r / (rows - 1)
                y = eye_y + 0.35 - t * L
                rad = 0.98 + 0.25 * t + 0.25 * max(0, (0.6 - (eye_y - y)) * -0.4)
                # push out over shoulders
                if y < eye_y - 1.0: rad += 0.35 * min(1, (eye_y - 1.0 - y) / 0.6)
                p = np.array([headc[0], y, headc[2] - 0.05]) + dirv * rad
                verts.append(p); uvs.append([i / 6, t * 2]); norms.append(dirv)
        tris = []
        for i in range(len(ring) - 1):
            for r in range(rows - 1):
                a = i * rows + r; b = (i + 1) * rows + r
                tris += [[a, b, a + 1], [b, b + 1, a + 1]]
        out.append((np.array(verts), np.array(uvs), np.array(tris), np.array(norms)))
    return out

def sphere(c, r, nu, nv):
    verts, uvs, norms, tris = [], [], [], []
    for j in range(nv + 1):
        th = np.pi * j / nv
        for i in range(nu + 1):
            ph = 2 * np.pi * i / nu
            n = np.array([np.sin(th) * np.sin(ph), np.cos(th), np.sin(th) * np.cos(ph)])
            verts.append(c + n * r); norms.append(n); uvs.append([i / nu * 2, j / nv])
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i; b = a + nu + 1
            tris += [[a, b, a + 1], [b, b + 1, a + 1]]
    return np.array(verts), np.array(uvs), np.array(tris), np.array(norms)

def tube(pts, radii, seg):
    pts = np.array(pts)
    # catmull-rom resample
    P = []; R = []
    for k in range(len(pts) - 1):
        for t in np.linspace(0, 1, 6, endpoint=False):
            P.append(pts[k] * (1 - t) + pts[k + 1] * t); R.append(radii[k] * (1 - t) + radii[k + 1] * t)
    P.append(pts[-1]); R.append(radii[-1]); P = np.array(P)
    verts, uvs, norms, tris = [], [], [], []
    for k, (p, r) in enumerate(zip(P, R)):
        tng = P[min(k + 1, len(P) - 1)] - P[max(k - 1, 0)]; tng /= np.linalg.norm(tng)
        a = np.cross(tng, [1, 0, 0]); a /= np.linalg.norm(a); b = np.cross(tng, a)
        for i in range(seg + 1):
            ang = 2 * np.pi * i / seg; n = a * np.cos(ang) + b * np.sin(ang)
            verts.append(p + n * r); norms.append(n); uvs.append([i / seg * 2, k / len(P) * 3])
    for k in range(len(P) - 1):
        for i in range(seg):
            a_ = k * (seg + 1) + i; b_ = a_ + seg + 1
            tris += [[a_, a_ + 1, b_], [b_, a_ + 1, b_ + 1]]
    return np.array(verts), np.array(uvs), np.array(tris), np.array(norms)

# ----------------------------------------------------------------- shared textures
def noise(size, scale, seed):
    rng = np.random.default_rng(seed)
    small = rng.random((size // scale + 2, size // scale + 2)).astype(np.float32)
    im = Image.fromarray((small * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)
    return np.asarray(im, np.float32) / 255

def normal_from_height(h, strength):
    gx = np.roll(h, -1, 1) - np.roll(h, 1, 1); gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    n = np.stack([-gx * strength, -gy * strength, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8))

def shared_textures():
    rng = np.random.default_rng(11)
    pores = rng.random((1024, 1024)).astype(np.float32)
    pores = np.asarray(Image.fromarray((pores * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255
    h = pores * 0.6 + noise(1024, 3, 2) * 0.3 + noise(1024, 16, 3) * 0.1
    normal_from_height(h, 1.4).save(f'{OUT}/skin_normal.png', optimize=True)
    # fabric weave
    s = 256; y, x = np.mgrid[0:s, 0:s]
    weave = (np.sin(x * np.pi / 2) * 0.5 + 0.5) * (np.sin(y * np.pi / 2) * 0.5 + 0.5) * 0.6 + noise(s, 2, 7) * 0.4
    normal_from_height(weave, 3).save(f'{OUT}/fabric_normal.png', optimize=True)
    # hair strands (u around head, v down)
    s = 512; rng = np.random.default_rng(5)
    strands = np.zeros((s, s), np.float32)
    for i in range(1400):
        x0 = rng.integers(0, s); w = rng.random() * 0.8 + 0.2
        col = np.clip(1 - np.abs(np.arange(s) - x0) / (1.5 + rng.random()), 0, 1) * w
        strands = np.maximum(strands, np.tile(col[None, :], (s, 1)) * (0.6 + 0.4 * noise(s, 64, i)[:, :1] ))
    hairim = (0.35 + 0.65 * strands)
    Image.fromarray((hairim * 255).astype(np.uint8)).save(f'{OUT}/hair_strands.png', optimize=True)
    normal_from_height(strands, 1.5).save(f'{OUT}/hair_normal.png', optimize=True)
    # eyes: brown (original) + recoloured hazel / grey-blue / green
    eyeA = Image.open(f'{MH}/eyes/materials/brown_eye.png').convert('RGBA').resize((512, 512), Image.LANCZOS)
    eyeA.save(f'{OUT}/eye_brown.png', optimize=True)
    alpha = np.asarray(eyeA)[..., 3:4]
    arr = np.asarray(eyeA.convert('RGB'), np.float32) / 255
    sat = arr.max(-1) - arr.min(-1)
    iris = np.clip((sat - 0.08) / 0.15, 0, 1)[..., None]
    lum = arr.mean(-1, keepdims=True)
    for name, tint in (('hazel', [0.55, 0.42, 0.2]), ('grey', [0.45, 0.55, 0.62]), ('green', [0.32, 0.5, 0.3]), ('dark', [0.18, 0.12, 0.08])):
        col = np.clip(lum * np.array(tint) * 2.6, 0, 1)
        out = arr * (1 - iris) + col * iris
        Image.fromarray(np.concatenate([(out * 255).astype(np.uint8), alpha], -1)).save(f'{OUT}/eye_{name}.png', optimize=True)

if __name__ == '__main__':
    shared_textures()
    man = {'version': 2, 'license': 'Human base CC0 (MakeHuman, MPFB2). All generated garments, hair and textures CC0.'}
    for g in ('male', 'female'):
        man[g] = build(g)
    json.dump(man, open(f'{OUT}/manifest.json', 'w'), indent=1)
    print('done')
