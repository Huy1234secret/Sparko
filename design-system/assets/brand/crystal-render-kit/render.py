"""Golden-crystal logo renderer (pure NumPy ray tracer).

The logo is an extruded, faceted solid defined by a 2D signed-distance field
and a faceted half-thickness field (see geometry.py).  Rays are sphere-traced
against it, refracted inside with internal (total) reflections and amber
absorption, and lit by a procedural studio environment so highlights sweep
across the facets as the sculpture turns.

    python3 render.py --frames 120 --out frames/          # all frames
    python3 render.py --frames 120 --only 0 --out test/   # one frame
"""
import argparse
import os
import numpy as np
from PIL import Image

# ----------------------------------------------------------------------------
# Scene constants
# ----------------------------------------------------------------------------
OUT = 512              # output size (px)
CAM_D = 2600.0         # camera distance (logo-pixel units)
FOCAL = 1270.0         # focal length in output pixels
IOR = 1.62             # lead-crystal-like
F0 = ((IOR - 1) / (IOR + 1)) ** 2
SIGMA = np.array([0.0020, 0.0135, 0.050])      # amber absorption per unit
GLOW = np.array([1.00, 0.62, 0.16])             # internal amber body colour
BOUNCES = 4
# Warm fill so dark gaps between studio lights never read as black streaks
AMB_REFL = np.array([0.045, 0.030, 0.012])


def amb_trans(d):
    up = 0.5 + 0.5 * d[:, 1:2]
    return (0.14 + 0.30 * up) * np.array([1.0, 0.60, 0.16])


LIP = 1.0 / 1.45       # Lipschitz safety factor for the crown term

G = np.load(os.path.join(os.path.dirname(os.path.abspath(__file__)), "geom.npz"))
FIELD = G["field"]                              # (rows, cols, 6)
F2 = np.ascontiguousarray(FIELD[..., :2])       # sd, H for tracing
OX, OY = G["origin"]
GW, GH = G["size"]
HMAX = float(G["hmax"])
BOX_LO = np.array([OX + 2, OY + 2, -HMAX - 2])
BOX_HI = np.array([OX + GW - 3, OY + GH - 3, HMAX + 2])


def norm(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def sample(arr, x, y):
    """Bilinear sample of a (rows, cols, C) grid at object coords x, y."""
    c = np.clip(x - OX, 0, GW - 1.001)
    r = np.clip(y - OY, 0, GH - 1.001)
    c0 = c.astype(np.int32)
    r0 = r.astype(np.int32)
    fc = (c - c0)[:, None]
    fr = (r - r0)[:, None]
    a = arr[r0, c0]
    b = arr[r0, c0 + 1]
    d = arr[r0 + 1, c0]
    e = arr[r0 + 1, c0 + 1]
    return (a * (1 - fc) + b * fc) * (1 - fr) + (d * (1 - fc) + e * fc) * fr


def sdf(p):
    s = sample(F2, p[:, 0], p[:, 1])
    return np.maximum(s[:, 0], (np.abs(p[:, 2]) - s[:, 1]) * LIP)


def normal_obj(p):
    s = sample(FIELD, p[:, 0], p[:, 1])
    sd, H, Hx, Hy, gx, gy = s.T
    crown = (np.abs(p[:, 2]) - H) * LIP
    wall = sd > crown
    sz = np.sign(p[:, 2]) + (p[:, 2] == 0)
    n = np.stack([-Hx, -Hy, sz], -1)
    n = np.where(wall[:, None], np.stack([gx, gy, np.zeros_like(gx)], -1), n)
    return norm(n)


def box_hit(o, d):
    inv = 1.0 / np.where(np.abs(d) < 1e-9, 1e-9, d)
    t0 = (BOX_LO - o) * inv
    t1 = (BOX_HI - o) * inv
    tn = np.minimum(t0, t1).max(-1)
    tf = np.maximum(t0, t1).min(-1)
    return np.maximum(tn, 0), tf, tf > np.maximum(tn, 0)


def march(o, d, t, tmax, inside, steps=160, eps=0.25, minstep=0.15):
    """Sphere trace; returns t and hit flag. inside=True traces to the exit."""
    n = len(o)
    hit = np.zeros(n, bool)
    act = np.arange(n)
    for _ in range(steps):
        if act.size == 0:
            break
        p = o[act] + d[act] * t[act, None]
        f = sdf(p)
        if inside:
            f = -f
        h = f < eps
        hit[act[h]] = True
        t[act] += np.maximum(f, minstep) * (~h)
        keep = (~h) & (t[act] < tmax[act])
        act = act[keep]
    if inside:          # rays that ran out of steps: treat as exited
        hit[:] = True
    return t, hit


def refract(I, N, eta):
    cosi = -np.sum(I * N, -1)
    k = 1 - eta ** 2 * (1 - cosi ** 2)
    tir = k < 0
    T = eta * I + (eta * cosi - np.sqrt(np.maximum(k, 0)))[:, None] * N
    return norm(T), tir


def schlick(c):
    return F0 + (1 - F0) * (1 - np.clip(c, 0, 1)) ** 5


# ----------------------------------------------------------------------------
# Procedural studio environment (world space: x right, y up, z to camera)
# ----------------------------------------------------------------------------
def _box_light(d, centre, up, half_u, half_v, colour, soft=0.25):
    c = norm(np.array(centre, float))
    a = norm(np.cross(np.array(up, float), c))
    b = np.cross(c, a)
    p = d @ c
    ok = p > 0.05
    ps = np.where(ok, p, 1)
    u = np.abs(d @ a) / ps / half_u
    v = np.abs(d @ b) / ps / half_v
    m = (np.clip((1 + soft - u) / soft, 0, 1) * np.clip((1 + soft - v) / soft, 0, 1))
    m = m * m * (3 - 2 * m) * ok
    return m[:, None] * np.array(colour)


def env(d):
    y = d[:, 1:2]
    col = (0.012 + 0.03 * np.clip(y, 0, 1)) * np.array([1.0, 0.9, 0.75])
    col = col + 0.05 * np.clip(-y, 0, 1) * np.array([0.9, 0.55, 0.2])   # warm floor bounce
    W = [1.0, 0.94, 0.82]          # champagne white
    col = col + _box_light(d, (-0.55, 0.55, 0.65), (0, 1, 0), 0.42, 0.55, np.multiply(W, 5.0))
    col = col + _box_light(d, (0.75, 0.15, 0.55), (0, 1, 0), 0.16, 0.75, [3.2, 2.7, 1.9])
    col = col + _box_light(d, (0.0, 1.0, 0.25), (0, 0, -1), 1.2, 0.07, np.multiply(W, 6.0))
    col = col + _box_light(d, (0.0, 0.15, -1.0), (0, 1, 0), 0.55, 0.55, [2.6, 1.8, 0.85])
    col = col + _box_light(d, (-0.85, 0.05, -0.5), (0, 1, 0), 0.05, 0.9, np.multiply(W, 9.0))
    col = col + _box_light(d, (0.85, 0.05, -0.5), (0, 1, 0), 0.05, 0.9, np.multiply(W, 9.0))
    col = col + _box_light(d, (0.2, -0.35, 0.9), (0, 1, 0), 0.6, 0.06, [1.6, 1.25, 0.8])
    return col


# ----------------------------------------------------------------------------
def rot(theta, tilt):
    cy, sy = np.cos(theta), np.sin(theta)
    cx, sx = np.cos(tilt), np.sin(tilt)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    return Rx @ Ry


def render(theta, tilt, lift, sweep_pos, ss=2, sweep_amp=1.0):
    """Return linear RGB (OUT*ss)^2 image, coverage alpha, depth (object units)."""
    R = OUT * ss
    f = FOCAL * ss
    jj, ii = np.meshgrid(np.arange(R), np.arange(R))
    dw = np.stack([(jj + 0.5 - R / 2) / f, -(ii + 0.5 - R / 2) / f,
                   -np.ones((R, R))], -1).reshape(-1, 3)
    dw = norm(dw)
    ow = np.array([0.0, 0.0, CAM_D])
    centre = np.array([0.0, lift, 0.0])
    M = rot(theta, tilt)
    o = np.broadcast_to(M.T @ (ow - centre), dw.shape).copy()
    d = dw @ M                      # = (M.T @ dw.T).T

    t0, t1, inbox = box_hit(o, d)
    idx = np.nonzero(inbox)[0]
    t, hit = march(o[idx], d[idx], t0[idx].copy(), t1[idx], inside=False)
    idx, t = idx[hit], t[hit]

    img = np.zeros((R * R, 3))
    alpha = np.zeros(R * R)
    depth = np.full(R * R, np.inf)
    if idx.size == 0:
        return img.reshape(R, R, 3), alpha.reshape(R, R), depth.reshape(R, R)

    p = o[idx] + d[idx] * t[:, None]
    n_o = normal_obj(p)
    V = dw[idx]
    n = n_o @ M.T
    cosi = np.clip(-np.sum(V * n, -1), 0, 1)
    Fr = schlick(cosi)
    refl = V + 2 * cosi[:, None] * n
    col = Fr[:, None] * (env(refl) + AMB_REFL)

    # ---- transmission with internal reflections --------------------------
    T, _ = refract(V, n, 1 / IOR)
    q = p.copy()
    w = (1 - Fr)
    absorb = np.ones((len(idx), 3))
    trans = np.zeros((len(idx), 3))
    first_len = None
    for b in range(BOUNCES):
        To = T @ M                                # world -> object
        start = q + To * 0.6
        tt = np.zeros(len(idx))
        tt, _ = march(start, To, tt, np.full(len(idx), 4000.0), inside=True,
                      steps=120, eps=0.2, minstep=0.3)
        L = tt + 0.6
        q = start + To * tt[:, None]
        if first_len is None:
            first_len = L
        absorb *= np.exp(-SIGMA[None] * L[:, None])
        ne = normal_obj(q) @ M.T                  # outward normal (world)
        Tout, tir = refract(T, -ne, IOR)
        c_out = np.clip(np.sum(Tout * ne, -1), 0, 1)
        Fi = np.where(tir, 1.0, schlick(c_out))
        trans += (w * (1 - Fi))[:, None] * absorb * (env(Tout) + amb_trans(Tout))
        w = w * Fi
        T = norm(T - 2 * np.sum(T * ne, -1)[:, None] * ne)
    trans += w[:, None] * absorb * GLOW * 0.35
    # soft sub-surface "body" glow so the crystal reads as amber-gold
    body = (1 - np.exp(-first_len / 90.0))[:, None] * GLOW * 0.22 * (1 - Fr)[:, None]
    col = col + trans + body

    # ---- light sweep pinned to the surface --------------------------------
    if sweep_pos is not None:
        s = p[:, 0] * 0.78 + p[:, 1] * 0.62
        band = np.exp(-((s - sweep_pos) / 38.0) ** 2)
        col = col + band[:, None] * np.array([1.0, 0.9, 0.7]) * 1.1 * sweep_amp * (0.35 + Fr[:, None] * 6)

    img[idx] = col
    alpha[idx] = 1
    depth[idx] = t
    return img.reshape(R, R, 3), alpha.reshape(R, R), depth.reshape(R, R)
