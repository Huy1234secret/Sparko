"""Build a Lottie (bodymovin) JSON: 2D-vector golden-crystal version of the logo.

Every vertex is projected from real 3D geometry each keyframe, so the logo is a
solid faceted block (side walls, 3D bevels, flat table) rather than a stack of
flat copies.  Lottie still can't refract light or re-sort shapes per frame, so:
  * facet / wall colours come from a precomputed light rig (keyframed fills)
  * back-facing walls and facets are collapsed to zero area (back-face culling)
  * the three pieces (S body, lower block, diamond) keep a fixed draw order
  * the light sweep is a band clipped by a track matte; glints are star shapes

    python3 lottie_build.py           # -> crystal_logo.lottie.json
"""
import json
import numpy as np

FR, N, W = 30, 120, 512
STEP = 4                       # keyframe every 3 frames (linear in between)
S = 0.488                      # source px -> canvas px (matches the GIF framing)
POLYS = [   # draw order bottom -> top
    [[550, 138], [515, 143], [174, 314], [152, 333], [141, 361], [142, 469], [170, 506],
     [692, 694], [537, 771], [468, 751], [469, 857], [523, 889], [548, 885], [790, 750],
     [799, 728], [799, 627], [782, 599], [316, 399], [485, 322], [607, 392], [620, 389],
     [712, 268], [712, 253]],
    [[270, 603], [245, 642], [253, 744], [450, 885], [455, 737], [534, 691], [312, 600]],
    [[775, 280], [697, 356], [768, 433], [845, 358]],
]
NAMES = ["S body", "lower block", "diamond"]
CX, CY = 493.0, 513.5          # rotation axis (source px)
HW = 20 * S                    # half-height of the side wall
HF = 34 * S                    # half-thickness at the table (bevel rises HW -> HF)
BEVEL = 8.0                    # bevel width (canvas px)
CAM_D, FOCAL = 2600 * S, 1270.0


# --------------------------------------------------------------------------- motion
def theta(t):                  # constant speed, 360 deg per loop
    return 2 * np.pi * t


def lift(t):
    return 15.0 * S * np.sin(2 * np.pi * t)


def tilt(t):
    return np.radians(-9.0 + 2.2 * np.sin(2 * np.pi * t + 0.8))


def rot(t):
    th, tl = theta(t), tilt(t)
    cy, sy, cx, sx = np.cos(th), np.sin(th), np.cos(tl), np.sin(tl)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    return Rx @ Ry


def world(P, t):
    """object pts (n,3) (x right, y up, canvas px) -> camera-space pts"""
    return P @ rot(t).T + np.array([0, lift(t), 0])


def project(Pw):
    k = FOCAL / (CAM_D - Pw[:, 2])
    return np.stack([W / 2 + Pw[:, 0] * k, W / 2 - Pw[:, 1] * k], -1)


def facing(Pw, n_w):
    c = Pw.mean(0)
    return np.dot(n_w, np.array([0, 0, CAM_D]) - c) > 0


# --------------------------------------------------------------------------- 2D geometry
def obj2d(p):
    p = np.asarray(p, float)
    return np.stack([(p[:, 0] - CX) * S, -(p[:, 1] - CY) * S], -1)


def signed_area(p):
    x, y = p[:, 0], p[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def make_ccw(p):
    return p if signed_area(p) > 0 else p[::-1].copy()


def inset(p, d):
    """Miter inset of a CCW polygon (y up) by d."""
    out = []
    n = len(p)
    for i in range(n):
        a, b, c = p[i - 1], p[i], p[(i + 1) % n]
        e1, e2 = b - a, c - b
        n1 = np.array([-e1[1], e1[0]]) / np.linalg.norm(e1)   # inward for CCW
        n2 = np.array([-e2[1], e2[0]]) / np.linalg.norm(e2)
        p1, p2 = a + n1 * d, b + n2 * d
        A = np.array([e1, -e2]).T
        if abs(np.linalg.det(A)) < 1e-6:
            out.append(b + n1 * d)
        else:
            out.append(p1 + e1 * np.linalg.solve(A, p2 - p1)[0])
    return np.array(out)


def outward(p):
    e = np.roll(p, -1, 0) - p
    return np.stack([e[:, 1], -e[:, 0]], -1) / np.linalg.norm(e, axis=1, keepdims=True)


# --------------------------------------------------------------------------- lighting
LIGHTS = [  # direction (camera space: x right, y up, z to viewer), weight, sharpness
    (np.array([-0.55, 0.55, 0.65]), 1.25, 10),
    (np.array([0.75, 0.15, 0.55]), 0.60, 14),
    (np.array([0.0, 1.0, 0.25]), 0.85, 18),
    (np.array([-0.85, 0.05, -0.5]), 0.9, 24),
    (np.array([0.85, 0.05, -0.5]), 0.9, 24),
]
LIGHTS = [(l / np.linalg.norm(l), w, k) for l, w, k in LIGHTS]
RAMP = np.array([
    [0.00, 0.36, 0.16, 0.02],
    [0.35, 0.80, 0.48, 0.05],
    [0.65, 0.99, 0.77, 0.13],
    [0.85, 1.00, 0.90, 0.48],
    [1.00, 1.00, 0.97, 0.86],
])


def ramp(b):
    b = float(np.clip(b, 0, 1))
    return [float(np.interp(b, RAMP[:, 0], RAMP[:, i])) for i in (1, 2, 3)]


def shade(n, base=0.30):
    n = n / np.linalg.norm(n)
    v = np.array([0, 0, -1.0])
    r = v - 2 * np.dot(v, n) * n
    b = base * (0.55 + 0.45 * max(n[2], 0))
    for l, w, k in LIGHTS:
        b += w * max(np.dot(r, l), 0) ** k
    return b


# --------------------------------------------------------------------------- lottie helpers
def static(v):
    return {"a": 0, "k": v}


def lin(d):
    return {"o": {"x": [0.0] * d, "y": [0.0] * d}, "i": {"x": [1.0] * d, "y": [1.0] * d}}


def anim(values, frames):
    ks = []
    for i, (f, v) in enumerate(zip(frames, values)):
        kf = {"t": int(f), "s": [round(float(x), 3) for x in v]}
        if i < len(frames) - 1:
            kf.update(lin(len(v)))
        ks.append(kf)
    return {"a": 1, "k": ks}


def shape_anim(polys, frames):
    """polys: list (per keyframe) of (n,2) screen vertex arrays."""
    ks = []
    for i, (f, p) in enumerate(zip(frames, polys)):
        v = [[round(float(x), 1), round(float(y), 1)] for x, y in p]
        z = [[0, 0]] * len(v)
        kf = {"t": int(f), "s": [{"i": z, "o": z, "v": v, "c": True}]}
        if i < len(frames) - 1:
            kf["o"] = {"x": 0, "y": 0}
            kf["i"] = {"x": 1, "y": 1}
        ks.append(kf)
    return {"ty": "sh", "ks": {"a": 1, "k": ks}}


def path(pts):
    v = [[round(float(x), 2), round(float(y), 2)] for x, y in pts]
    z = [[0, 0]] * len(v)
    return {"ty": "sh", "ks": static({"i": z, "o": z, "v": v, "c": True})}


def fill(c, o=100):
    return {"ty": "fl", "c": c if isinstance(c, dict) else static(list(c) + [1]),
            "o": o if isinstance(o, dict) else static(o), "r": 1}


def stroke(c, w, o=100):
    return {"ty": "st", "c": static(list(c) + [1]), "o": static(o), "w": static(w),
            "lc": 2, "lj": 2, "ml": 4}


def gtr():
    return {"ty": "tr", "p": static([0, 0]), "a": static([0, 0]), "s": static([100, 100]),
            "r": static(0), "o": static(100), "sk": static(0), "sa": static(0)}


def group(items, name="g"):
    return {"ty": "gr", "nm": name, "it": items + [gtr()]}


def tf(p=(0, 0), s=None, o=None, r=0):
    return {"o": o or static(100), "r": static(r),
            "p": p if isinstance(p, dict) else static(list(p) + [0]),
            "a": static([0, 0, 0]), "s": s or static([100, 100, 100])}


def layer(name, shapes, ks=None, **kw):
    L = {"ddd": 0, "ind": 0, "ty": 4, "nm": name, "sr": 1,
         "ks": ks or tf(), "ao": 0, "shapes": shapes, "ip": 0, "op": N, "st": 0, "bm": 0}
    L.update(kw)
    return L


# --------------------------------------------------------------------------- build
def component(p2):
    """Animated shape groups for one solid piece + its matte paths."""
    p2 = make_ccw(p2)
    inner = inset(p2, BEVEL)
    ref = inset(p2, BEVEL + 6)
    nrm = outward(p2)
    n = len(p2)
    kf = list(range(0, N + 1, STEP))
    sinb = (HF - HW) / np.hypot(HF - HW, BEVEL)
    cosb = BEVEL / np.hypot(HF - HW, BEVEL)

    walls = [[] for _ in range(n)]
    wall_col = [[] for _ in range(n)]
    facets = [[] for _ in range(n)]
    fac_col = [[] for _ in range(n)]
    table, table_g, refl, outline = [], [], [], []
    P = lambda xy, z: np.c_[xy, np.full(len(xy), z)]
    for f in kf:
        t = f / N
        R = rot(t)
        side = 1.0 if (R @ np.array([0, 0, 1.0]))[2] > 0 else -1.0
        fo = world(P(p2, side * HW), t)
        bo = world(P(p2, -side * HW), t)
        fi = world(P(inner, side * HF), t)
        so, si = project(fo), project(fi)
        # walls use fixed +HW / -HW rims so they never collapse when the face flips
        wa, wb = world(P(p2, HW), t), world(P(p2, -HW), t)
        sa, sb = project(wa), project(wb)
        for i in range(n):
            j = (i + 1) % n
            nw = R @ np.array([nrm[i][0], nrm[i][1], 0.0])
            if facing(np.array([wa[i], wa[j], wb[j], wb[i]]), nw):
                walls[i].append(np.array([sa[i], sa[j], sb[j], sb[i]]))
            else:
                mid = (sa[[i, j]] + sb[[i, j]]) / 2
                walls[i].append(np.array([mid[0], mid[1], mid[1], mid[0]]))
            wall_col[i].append(ramp(0.75 * shade(nw, base=0.38)) + [1])
            nf = R @ np.array([nrm[i][0] * sinb, nrm[i][1] * sinb, side * cosb])
            if facing(np.array([fo[i], fo[j], fi[j], fi[i]]), nf):
                facets[i].append(np.array([so[i], so[j], si[j], si[i]]))
            else:
                facets[i].append(np.array([so[i], so[j], so[j], so[i]]))
            fac_col[i].append(ramp(shade(nf)) + [1])
        table.append(si)
        bt = min(shade(R @ np.array([0, 0, side]), base=0.62), 0.62)
        lo, hi = si.min(0), si.max(0)
        stops = [0] + ramp(bt + 0.3) + [0.55] + ramp(bt - 0.02) + [1] + ramp(bt - 0.32)
        table_g.append((list(lo), list(hi), stops))
        refl.append(project(world(P(ref, 0.0), t)))      # mid-depth: parallax vs the face
        outline.append(so)

    items = [
        group([shape_anim(refl, kf), stroke([1.0, 0.9, 0.6], 1.1, 45)], "inner reflection"),
        group([shape_anim(table, kf), stroke([1.0, 0.96, 0.84], 1.1, 80)], "girdle"),
        group([shape_anim(table, kf),
               {"ty": "gf", "o": static(100), "r": 1, "t": 1,
                "s": anim([g[0] for g in table_g], kf), "e": anim([g[1] for g in table_g], kf),
                "g": {"p": 3, "k": anim([g[2] for g in table_g], kf)},
                "h": static(0), "a": static(0)}], "table"),
    ]
    items += [group([shape_anim(facets[i], kf), fill(anim(fac_col[i], kf))], f"bevel {i}")
              for i in range(n)]
    items += [group([shape_anim(walls[i], kf), fill(anim(wall_col[i], kf))], f"wall {i}")
              for i in range(n)]
    matte = [shape_anim(outline, kf)] + [shape_anim(walls[i], kf) for i in range(n)]
    return items, matte


def build():
    frames = list(range(0, N + 1))
    comps, matte_paths = {}, []
    depth_sign = {}
    for p, name in zip(POLYS, NAMES):
        p2 = obj2d(p)
        items, m = component(p2)
        comps[name] = items
        matte_paths += m
        c = np.r_[p2.mean(0), 0.0]
        depth_sign[name] = [world(c[None], f / N)[0, 2] > 0 for f in frames]

    def hold(vis):          # opacity 100/0 with hold keyframes
        ks, last = [], None
        for f, v in zip(frames, vis):
            if v != last:
                ks.append({"t": f, "s": [100 if v else 0], "h": 1})
                last = v
        return {"a": 1, "k": ks} if len(ks) > 1 else static(ks[0]["s"][0])

    # the small pieces are drawn twice, in front of or behind the S body,
    # and only the copy matching their current depth is shown
    piece_layers = []
    for name in ("diamond", "lower block"):
        piece_layers.append(layer(name + " (front)", comps[name], tf(o=hold(depth_sign[name]))))
    piece_layers.append(layer("S body", comps["S body"]))
    for name in ("lower block", "diamond"):
        piece_layers.append(layer(name + " (behind)", comps[name],
                                  tf(o=hold([not v for v in depth_sign[name]]))))

    # glints: (source x, y, face side, loop time)
    GL = [((771, 356), +1, 0.06), ((168, 372), +1, 0.135), ((782, 640), -1, 0.505),
          ((771, 356), -1, 0.590), ((548, 162), +1, 0.905)]
    star_pts = [[np.cos(k * np.pi / 4 + 0.35) * (50 if k % 2 == 0 else 5.5),
                 np.sin(k * np.pi / 4 + 0.35) * (50 if k % 2 == 0 else 5.5)] for k in range(8)]
    glints = []
    for (gx, gy), side, tc in GL:
        fr_ = sorted(set(min(max(int(round((tc + d) * N)), 0), N)
                         for d in np.linspace(-0.055, 0.055, 9)))
        sc, op, pos = [], [], []
        for f in fr_:
            t = f / N
            e = np.cos(((t - tc + 0.5) % 1 - 0.5) / 0.055 * np.pi / 2) ** 2
            pw = world(np.array([[(gx - CX) * S, -(gy - CY) * S, side * HF]]), t)
            vis = max((rot(t) @ np.array([0, 0, side]))[2], 0) ** 0.5
            pos.append(list(project(pw)[0]) + [0])
            sc.append([100 * (0.4 + 0.6 * e)] * 2 + [100])
            op.append([100 * e * vis])
        star = group([path(star_pts), fill([1.0, 0.96, 0.86])], "star")
        core = group([{"ty": "el", "p": static([0, 0]), "s": static([16, 16])},
                      fill([1.0, 0.98, 0.9], 70)], "core")
        glints.append(layer(f"glint {tc:.2f}", [star, core],
                            {"o": anim(op, fr_), "r": static(20), "p": anim(pos, fr_),
                             "a": static([0, 0, 0]), "s": anim(sc, fr_)}))

    # light sweep clipped to the logo
    def sweep(t):
        for a, b, k in [(0.0, 0.17, 1.0), (0.5, 0.66, 0.6)]:
            if a <= t <= b:
                u = (t - a) / (b - a)
                return -330 + 660 * u * u * (3 - 2 * u), k * np.sin(np.pi * u)
        return -400, 0
    sw = [sweep(f / N) for f in frames]
    band = group([path([[-40, -400], [40, -400], [40, 400], [-40, 400]]),
                  {"ty": "gf", "o": static(100), "r": 1, "t": 1, "s": static([-40, 0]),
                   "e": static([40, 0]),
                   "g": {"p": 3, "k": static([0, 1, .93, .78, .5, 1, .97, .9, 1, 1, .93, .78,
                                              0, 0, .5, 1, 1, 0])},
                   "h": static(0), "a": static(0)}], "band")
    sweep_l = layer("sweep", [band], {"o": anim([[70 * k] for _, k in sw], frames),
                                      "r": static(-38),
                                      "p": anim([[W / 2 + x, W / 2, 0] for x, _ in sw], frames),
                                      "a": static([0, 0, 0]), "s": static([100, 100, 100])}, tt=1)
    matte_l = layer("sweep matte", [group(matte_paths + [fill([1, 1, 1])], "silhouette")], td=1)

    halo = layer("halo", [group([{"ty": "el", "p": static([0, 0]), "s": static([520, 520])},
                                 {"ty": "gf", "o": static(100), "r": 1, "t": 2, "s": static([0, 0]),
                                  "e": static([260, 0]),
                                  "g": {"p": 2, "k": static([0, .30, .21, .09, 1, .30, .21, .09,
                                                             0, .55, 1, 0])},
                                  "h": static(0), "a": static(0)}], "halo")], tf([W / 2, W / 2 - 6]))
    pool = layer("floor glow", [group([{"ty": "el", "p": static([0, 0]), "s": static([300, 34])},
                                       {"ty": "gf", "o": static(100), "r": 1, "t": 2,
                                        "s": static([0, 0]), "e": static([150, 0]),
                                        "g": {"p": 2, "k": static([0, .55, .38, .16, 1, .55, .38, .16,
                                                                   0, .6, 1, 0])},
                                        "h": static(0), "a": static(0)}], "pool")],
                 tf([W / 2, 468], o=anim([[100 - 30 * np.sin(2 * np.pi * f / N)] for f in frames], frames)))
    bg = layer("background", [group([{"ty": "rc", "p": static([W / 2, W / 2]), "s": static([W, W]),
                                      "r": static(0)}, fill([0.035, 0.031, 0.028])], "bg")])

    ordered = glints + [matte_l, sweep_l] + piece_layers + [pool, halo, bg]
    for i, L in enumerate(ordered, 1):
        L["ind"] = i
    return {"v": "5.7.4", "fr": FR, "ip": 0, "op": N, "w": W, "h": W,
            "nm": "Golden crystal logo", "ddd": 0, "assets": [], "layers": ordered, "markers": []}


if __name__ == "__main__":
    doc = build()
    s = json.dumps(doc, separators=(",", ":"))
    open("crystal_logo.lottie.json", "w").write(s)
    print("bytes", len(s), "layers", len(doc["layers"]))
