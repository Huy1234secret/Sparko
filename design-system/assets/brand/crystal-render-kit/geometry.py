"""Build the crystal's distance/height fields from the traced logo polygons.

Output: geom.npz with a 1-unit grid (1 unit = 1 source-logo pixel) holding
  sd   - signed 2D distance to the (corner-rounded) silhouette, <0 inside
  H    - half-thickness of the crystal at each point (faceted profile)
  Hx,Hy- gradient of H (gives the planar facet normals)
  gx,gy- gradient of sd (side-wall normals)
plus the grid origin and the composition centre.
"""
import json
import numpy as np
import cv2

POLYS = json.load(open("polys_raw.json"))

SS = 4                 # rasterise at 4x for accurate distances
PAD = 40
CORNER_R = 7.0         # soften corners like the original logo

# --- faceted thickness profile (all in logo pixels) -------------------------
T0 = 13.0              # half-height of the vertical side wall (girdle)
B1, S1 = 7.0, 1.00     # steep outer bevel ring: width, slope
B2, S2 = 34.0, 0.46    # main crown facets: width, slope
S3 = 0.16              # gentle table facets rising to a ridge along each stroke


def profile(d):
    d = np.maximum(d, 0)
    return (T0 + S1 * np.minimum(d, B1) + S2 * np.clip(d - B1, 0, B2)
            + S3 * np.maximum(d - B1 - B2, 0))


def main():
    pts = np.concatenate([np.array(p, float) for p in POLYS])
    x0, y0 = pts.min(0) - PAD
    x1, y1 = pts.max(0) + PAD
    W, Hh = int(np.ceil(x1 - x0)), int(np.ceil(y1 - y0))

    m = np.zeros((Hh * SS, W * SS), np.uint8)
    for p in POLYS:
        q = ((np.array(p, float) - [x0, y0]) * SS * 16).round().astype(np.int32)
        cv2.fillPoly(m, [q], 255, lineType=cv2.LINE_AA, shift=4)
    m = (m > 127).astype(np.uint8)

    def sdist(mask):
        ins = cv2.distanceTransform(mask, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
        out = cv2.distanceTransform(1 - mask, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)
        return (out - ins) / SS

    sd = sdist(m)
    # round convex corners: erode by R, then re-grow by R through the distance
    sd = sdist((sd < -CORNER_R).astype(np.uint8)) - CORNER_R
    sd = cv2.resize(sd, (W, Hh), interpolation=cv2.INTER_AREA)

    H = profile(-sd).astype(np.float32)
    Hy, Hx = np.gradient(H)
    gy, gx = np.gradient(sd)
    n = np.sqrt(gx ** 2 + gy ** 2) + 1e-6
    gx, gy = gx / n, gy / n

    # object space has y up: flip rows so row 0 is the bottom
    flip = lambda a: a[::-1].copy()
    sd, H, Hx, gx = map(flip, (sd, H, Hx, gx))
    Hy, gy = -flip(Hy), -flip(gy)

    # composition centre (rotation axis) = centre of the logo's bounding box
    cx = (pts[:, 0].min() + pts[:, 0].max()) / 2
    cy = (pts[:, 1].min() + pts[:, 1].max()) / 2
    # grid origin in object coords: col j -> x = j + ox ; row i -> y = i + oy
    ox = x0 - cx
    oy = -(y1 - cy)        # flipped: bottom row
    field = np.stack([sd, H, Hx, Hy, gx, gy], -1).astype(np.float32)
    np.savez("geom.npz", field=field, origin=np.array([ox, oy]),
             hmax=float(H[sd < 0].max()), size=np.array([W, Hh]),
             centre=np.array([cx, cy]), polys=np.array(json.dumps(POLYS)))
    print("grid", W, Hh, "hmax", H[sd < 0].max(), "origin", ox, oy)

    viz = np.clip((H - T0) / (H.max() - T0), 0, 1)
    viz[sd >= 0] = 0
    cv2.imwrite("height_viz.png", (viz[::-1] * 255).astype(np.uint8))


if __name__ == "__main__":
    main()
