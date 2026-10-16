"""Minimal Lottie rasteriser for the subset used by lottie_build.py.
Used only to sanity-check the JSON (geometry, keyframes, mattes, parenting).

    python3 lottie_check.py crystal_logo.lottie.json 0,8,20,30,60,90
"""
import json
import sys
import numpy as np
import cv2

SS = 2


def val(prop, f):
    if prop.get("a", 0) == 0:
        return np.array(prop["k"], float) if not isinstance(prop["k"], dict) else prop["k"]
    ks = prop["k"]
    if f <= ks[0]["t"]:
        return np.array(ks[0]["s"], float)
    for a, b in zip(ks, ks[1:]):
        if a["t"] <= f <= b["t"]:
            if a.get("h") and f < b["t"]:
                return np.array(a["s"], float)
            u = (f - a["t"]) / max(b["t"] - a["t"], 1e-9)
            return np.array(a["s"], float) * (1 - u) + np.array(b["s"], float) * u
    return np.array(ks[-1]["s"], float)


def mat(tr, f, layer=True):
    p = val(tr["p"], f)[:2]
    a = val(tr["a"], f)[:2] if "a" in tr else np.zeros(2)
    s = val(tr["s"], f)[:2] / 100 if "s" in tr else np.ones(2)
    r = np.radians(float(np.atleast_1d(val(tr["r"], f))[0])) if "r" in tr else 0
    T = lambda x, y: np.array([[1, 0, x], [0, 1, y], [0, 0, 1.0]])
    R = np.array([[np.cos(r), -np.sin(r), 0], [np.sin(r), np.cos(r), 0], [0, 0, 1]])
    Sm = np.diag([s[0], s[1], 1.0])
    return T(*p) @ R @ Sm @ T(-a[0], -a[1])


def poly_of(item, f):
    if item["ty"] == "sh":
        ks = item["ks"]
        if ks.get("a", 0) == 0:
            return np.array(ks["k"]["v"], float)
        k = ks["k"]
        V = lambda kf: np.array(kf["s"][0]["v"], float)
        if f <= k[0]["t"]:
            return V(k[0])
        for a, b in zip(k, k[1:]):
            if a["t"] <= f <= b["t"]:
                u = (f - a["t"]) / max(b["t"] - a["t"], 1e-9)
                return V(a) * (1 - u) + V(b) * u
        return V(k[-1])
    if item["ty"] == "el":
        p, s = val(item["p"], f), val(item["s"], f)
        t = np.linspace(0, 2 * np.pi, 64, endpoint=False)
        return np.stack([p[0] + s[0] / 2 * np.cos(t), p[1] + s[1] / 2 * np.sin(t)], -1)
    if item["ty"] == "rc":
        p, s = val(item["p"], f), val(item["s"], f) / 2
        return np.array([[p[0] - s[0], p[1] - s[1]], [p[0] + s[0], p[1] - s[1]],
                         [p[0] + s[0], p[1] + s[1]], [p[0] - s[0], p[1] + s[1]]])


def xf(M, P):
    return (np.c_[P, np.ones(len(P))] @ M.T)[:, :2]


def draw_group(items, M, f, rgb, alpha, op, W):
    tr = [i for i in items if i["ty"] == "tr"]
    if tr:
        M = M @ mat(tr[0], f)
        op = op * float(np.atleast_1d(val(tr[0]["o"], f))[0]) / 100
    polys = [xf(M, poly_of(i, f)) for i in items if i["ty"] in ("sh", "el", "rc")]
    for it in items:
        if it["ty"] == "gr":
            draw_group(it["it"], M, f, rgb, alpha, op, W)
        elif it["ty"] in ("fl", "gf", "st"):
            m = np.zeros((W * SS, W * SS), np.float32)
            pts = [(p * SS * 16).round().astype(np.int32) for p in polys]
            if it["ty"] == "st":
                w = float(np.atleast_1d(val(it["w"], f))[0]) * SS * abs(np.linalg.det(M[:2, :2])) ** .5
                cv2.polylines(m, pts, True, 1.0, max(1, int(round(w))), cv2.LINE_AA, shift=4)
            else:
                cv2.fillPoly(m, pts, 1.0, cv2.LINE_AA, shift=4)
            o = float(np.atleast_1d(val(it["o"], f))[0]) / 100 * op
            if it["ty"] == "gf":
                g = val(it["g"]["k"], f)
                n = it["g"]["p"]
                cs = g[:4 * n].reshape(n, 4)
                al = g[4 * n:].reshape(-1, 2) if len(g) > 4 * n else None
                s0, e0 = xf(M, val(it["s"], f)[None])[0] * SS, xf(M, val(it["e"], f)[None])[0] * SS
                yy, xx = np.mgrid[0:W * SS, 0:W * SS] + 0.5
                if it["t"] == 1:
                    d = e0 - s0
                    u = ((xx - s0[0]) * d[0] + (yy - s0[1]) * d[1]) / (d @ d + 1e-9)
                else:
                    u = np.hypot(xx - s0[0], yy - s0[1]) / (np.linalg.norm(e0 - s0) + 1e-9)
                u = np.clip(u, 0, 1)
                col = np.stack([np.interp(u, cs[:, 0], cs[:, k]) for k in (1, 2, 3)], -1)
                a = np.interp(u, al[:, 0], al[:, 1]) if al is not None else 1.0
                m = m * a
            else:
                col = val(it["c"], f)[:3]
            k = (m * o)[..., None]
            rgb[:] = rgb * (1 - k) + col * k
            alpha[:] = alpha * (1 - k[..., 0]) + k[..., 0]


def render(doc, f):
    W = doc["w"]
    by_ind = {L["ind"]: L for L in doc["layers"]}

    def lmat(L):
        M = mat(L["ks"], f)
        if "parent" in L:
            M = lmat(by_ind[L["parent"]]) @ M
        return M

    out = np.zeros((W * SS, W * SS, 3), np.float32)
    layers = doc["layers"]
    for li in range(len(layers) - 1, -1, -1):
        L = layers[li]
        if L["ty"] != 4 or L.get("td"):
            continue
        rgb = np.zeros_like(out)
        al = np.zeros(out.shape[:2], np.float32)
        lo = float(np.atleast_1d(val(L["ks"]["o"], f))[0]) / 100
        draw_group(L["shapes"], lmat(L), f, rgb, al, 1.0, W)
        if L.get("tt") == 1:          # matte = the layer directly above
            Mt = layers[li - 1]
            mr = np.zeros_like(out)
            ma = np.zeros(out.shape[:2], np.float32)
            draw_group(Mt["shapes"], lmat(Mt), f, mr, ma, 1.0, W)
            al = al * ma
        k = (al * lo)[..., None]
        out = out * (1 - k) + rgb * k
    out = cv2.resize(out, (W, W), interpolation=cv2.INTER_AREA)
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


if __name__ == "__main__":
    doc = json.load(open(sys.argv[1]))
    fs = [int(x) for x in sys.argv[2].split(",")]
    ims = [render(doc, f) for f in fs]
    cv2.imwrite("lottie_preview.png", cv2.cvtColor(np.concatenate(ims, 1), cv2.COLOR_RGB2BGR))
