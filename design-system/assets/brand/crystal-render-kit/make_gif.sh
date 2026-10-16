#!/usr/bin/env sh
# frames/f_000.png ... -> crystal_logo.gif  (one global palette + ordered dither = no frame flicker)
set -e
FPS=${FPS:-25}
ffmpeg -v error -y -framerate "$FPS" -i frames/f_%03d.png \
  -vf "palettegen=max_colors=256:stats_mode=full" pal.png
ffmpeg -v error -y -framerate "$FPS" -i frames/f_%03d.png -i pal.png \
  -lavfi "paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 crystal_logo.gif
rm -f pal.png
echo "wrote crystal_logo.gif"
