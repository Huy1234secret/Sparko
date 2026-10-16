"""Render the seamless loop: rotation + float + light sweeps + sparkle glints.

    python3 animate.py --frames 120 --ss 2 --jobs 2      # -> frames/f_000.png ...
    python3 animate.py --preview 0,30,60,90              # contact sheet only

Frame i is rendered at loop time t = i / N, so frame N would equal frame 0:
playing frames 0..N-1 on repeat is perfectly seamless.
"""
import argparse
import os
from multiprocessing import Pool
import numpy as np
from PIL import Image
import render as R

OUT = R.OUT
CX, CY = R.G["centre"]

# ---------------------------------------------------------------------------
# Motion (all periodic in t in [0,1))
# ---------------------------------------------------------------------------
def theta(t):      # constant-speed spin, exactly 360 deg per loop (no easing)
    return 2 * np.pi * t


def lift(t):       # gentle float (logo units, + is up)
    return 15.0 * np.sin(2 * np.pi * t)


def tilt(t):       # viewed slightly from above, with a tiny sway
    return np.radians(-9.0 + 2.2 * np.sin(2 * np.pi * t + 0.8))


SWEEPS = [  # (start, end, strength) - band moves across the surface
    (0.00, 0.17, 1.0),
    (0.50, 0.66, 0.6),
]


def sweep(t):
    for a, b, k in SWEEPS:
        if a <= t <= b:
            u = (t - a) / (b - a)
            u = u * u * (3 - 2 * u)
            return -700 + 1400 * u, k
    return None, 0.0


# sparkle glints: (x, y in source-logo px, face +1 front / -1 back, loop time)
GLINTS = [
    (771, 356, +1, 0.045),   # diamond apex
    (168, 372, +1, 0.135),   # S upper-left shoulder
    (782, 640, -1, 0.505),   # lower-right corner (seen from the back)
    (771, 356, -1, 0.590),   # diamond apex, back
    (548, 162, +1, 0.905),   # S top corner
]
GLINT_HALF = 0.055


def glint_env(t, tc):
    dt = (t - tc + 0.5) % 1.0 - 0.5          # periodic distance
    if abs(dt) >= GLINT_HALF:
        return 0.0
    return np.cos(dt / GLINT_HALF * np.pi / 2) ** 2


# ---------------------------------------------------------------------------
def aces(x):
    return np.clip(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)


def srgb(x):
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.maximum(x, 0), 1 / 2.4) - 0.055)


def background(R_, ss, lft):
    y, x = (np.mgrid[0:R_, 0:R_] + 0.5) / ss
    r2 = (x - 256) ** 2 + (y - 250) ** 2
    bg = np.ones((R_, R_, 3)) * np.array([0.0065, 0.0058, 0.0052])
    bg += np.exp(-r2 / (2 * 165 ** 2))[..., None] * np.array([0.040, 0.027, 0.013])
    pool = 1.0 - 0.3 * lft / 15.0          # floor glow dims as the logo rises
    fl = np.exp(-((x - 256) ** 2) / (2 * 120 ** 2) - ((y - 468) ** 2) / (2 * 13 ** 2))
    bg += (fl * pool)[..., None] * np.array([0.060, 0.040, 0.017])
    vig = 1 - 0.55 * np.clip(r2 / (2 * 256 ** 2), 0, 1)
    return bg * vig[..., None]


def star(img, cx, cy, size, ang, amp):
    h, w, _ = img.shape
    y, x = np.mgrid[0:h, 0:w] + 0.5
    dx, dy = x - cx, y - cy
    out = np.zeros((h, w))
    for k, (a, ln, wd) in enumerate([(ang, 1.0, 1.0), (ang + np.pi / 2, 1.0, 1.0),
                                     (ang + np.pi / 4, 0.45, 0.7), (ang - np.pi / 4, 0.45, 0.7)]):
        u = dx * np.cos(a) + dy * np.sin(a)
        v = -dx * np.sin(a) + dy * np.cos(a)
        out += (0.9 if k < 2 else 0.5) * np.exp(-np.abs(u) / (size * ln * 0.33)) * np.exp(-(v / wd) ** 2)
    rr = dx ** 2 + dy ** 2
    out += 1.3 * np.exp(-rr / (2 * 1.6 ** 2)) + 0.45 * np.exp(-rr / (2 * (size * 0.3) ** 2))
    col = np.array([1.0, 0.95, 0.84])
    img += (amp * out)[..., None] * col


def frame(i, N, ss):
    t = i / N
    th, lf, tl = theta(t), lift(t), tilt(t)
    sp, sk = sweep(t)
    img, a, depth = R.render(th, tl, lf, sp, ss=ss, sweep_amp=sk)
    R_ = OUT * ss
    bg = background(R_, ss, lf)
    col = img * a[..., None] + bg * (1 - a[..., None])
    disp = srgb(aces(col * 1.05))
    disp = disp.reshape(OUT, ss, OUT, ss, 3).mean((1, 3))

    # sparkle glints (only if that point is visible and facing the camera)
    M = R.rot(th, tl)
    f = R.FOCAL * ss
    for gx, gy, side, tc in GLINTS:
        e = glint_env(t, tc)
        if e <= 0:
            continue
        xo, yo = gx - CX, -(gy - CY)
        H = R.sample(R.F2, np.array([xo]), np.array([yo]))[0, 1]
        p = M @ np.array([xo, yo, side * H]) + np.array([0, lf, 0])
        zc = R.CAM_D - p[2]
        jx = f * p[0] / zc + R_ / 2
        iy = -f * p[1] / zc + R_ / 2
        dist = np.linalg.norm(p - np.array([0, 0, R.CAM_D]))
        ii, jj = int(iy), int(jx)
        win = depth[max(ii - 3, 0):ii + 4, max(jj - 3, 0):jj + 4]
        if win.size == 0 or not np.any(np.abs(win - dist) < 12):
            continue
        facing = np.clip((M @ np.array([0, 0, side]))[2], 0, 1) ** 0.5
        amp = e * facing
        if amp < 0.02:
            continue
        star(disp, jx / ss, iy / ss, 20 + 22 * e, 0.35 + 0.9 * t, amp * 1.15)

    return (np.clip(disp, 0, 1) * 255 + 0.5).astype(np.uint8)


def _job(args):
    i, N, ss, out = args
    Image.fromarray(frame(i, N, ss)).save(os.path.join(out, f"f_{i:03d}.png"))
    return i


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", type=int, default=120)
    ap.add_argument("--ss", type=int, default=2)
    ap.add_argument("--jobs", type=int, default=os.cpu_count())
    ap.add_argument("--out", default="frames")
    ap.add_argument("--preview", default="")
    a = ap.parse_args()
    if a.preview:
        ids = [int(s) for s in a.preview.split(",")]
        with Pool(a.jobs) as p:
            ims = p.starmap(frame, [(i, a.frames, a.ss) for i in ids])
        Image.fromarray(np.concatenate(ims, 1)).save("preview.png")
    else:
        os.makedirs(a.out, exist_ok=True)
        with Pool(a.jobs) as p:
            for i in p.imap_unordered(_job, [(i, a.frames, a.ss, a.out) for i in range(a.frames)]):
                print("frame", i, flush=True)
