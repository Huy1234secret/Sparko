# Golden crystal S — render kit

Re-renders the rotating crystal GIF and the Lottie file from the traced logo.

## Requirements
Python 3.9+ with `numpy`, `opencv-python`, `Pillow`; `ffmpeg` on PATH.

    pip install numpy opencv-python pillow

## Steps
    python3 geometry.py                                   # polys_raw.json -> geom.npz (distance + faceted height fields)
    python3 animate.py --frames 100 --ss 2 --out frames   # ray-trace 100 frames (≈5 s/frame/core)
    ./make_gif.sh                                         # frames/ -> crystal_logo.gif (25 fps, loops forever)
    python3 lottie_build.py                               # -> crystal_logo.lottie.json (30 fps, 120 frames)

Quick previews: `python3 animate.py --frames 100 --preview 0,10,25,50` writes `preview.png`;
`python3 lottie_check.py crystal_logo.lottie.json 0,22,64` rasterises Lottie frames for a sanity check.

## What to tweak
- `geometry.py`: `T0` (side-wall height), `B1/S1`, `B2/S2`, `S3` (facet rings and slopes), `CORNER_R`.
- `render.py`: `IOR`, `SIGMA` (amber absorption — raise for deeper orange), `GLOW`, `FOCAL` (framing), the `env()` light rig.
- `animate.py`: `theta()` (spin, constant speed), `lift()`, `tilt()`, `SWEEPS`, `GLINTS`, `background()`.

Frame *i* is rendered at loop time *i/N*, so frame *N* would equal frame 0; the loop wraps seamlessly.

## The loading-screen file

`design-system/assets/icons/animated-icons/crystal-logo-loop.json` (the website's loading screen) is `lottie_build.py` with three changes, to keep it small and see-through:

- `STEP = 6` (a keyframe every 6 frames instead of 4),
- vertex positions rounded to whole pixels,
- no `bg` or `halo` layer, so it sits on the page's own background (the site draws its own glow).
