"""The wizard mascot: Mike's rhino sheets (Nov 10 2026) cut into one PNG per pose.

Each sheet is 1536 x 1024 with 4 x 2 rhinos. Every connected stroke goes to the cell its centre falls in, so sparks
that cross a cell edge stay with their rhino. The output is ink only: black with the line darkness as alpha, so the
page shows through the body and Studio draws it in the theme's ink colour (a CSS mask), light or dark.

The sitting rhino's heart paw pads are replaced with hex nuts (Mike: "change the hearts to something appropriate").

Usage: python3 scripts/wizard_art.py "<Tech Crew sheet.png>" "<Builder sheet.png>" [out_dir]
Needs Pillow, numpy and scipy (a dev venv, not the app).
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

# Pose names, row by row (see src/brand/mascot.ts for where each one is used)
SHEETS = [
    ['wrench', 'connect', 'spindle', 'laser', 'calipers', 'spool-sit', 'zapped', 'meter'],
    ['thumbsup', 'pipewrench', 'screwdriver', 'shocked', 'cable', 'spool', 'pendant', 'carry'],
]
# the two heart paw pads on the Tech Crew sheet (sheet pixels): box to clear, centre of the nut
HEARTS = [((460, 936, 526, 1004), (491, 972)), ((682, 938, 742, 1002), (712, 972))]
HEIGHT = 360  # px; shown at 168 px or less, so this is sharp on a 2x screen


def nut(draw, cx, cy, r=19, w=4):
    pts = [(cx + r * np.cos(np.pi / 6 + k * np.pi / 3), cy + r * np.sin(np.pi / 6 + k * np.pi / 3)) for k in range(7)]
    draw.line(pts, fill=0, width=w, joint='curve')
    draw.ellipse((cx - r * .45, cy - r * .45, cx + r * .45, cy + r * .45), outline=0, width=w)


def poses(path, names, hearts=()):
    g = Image.open(path).convert('L')
    if hearts:
        arr = np.array(g)
        for (x0, y0, x1, y1), (cx, cy) in hearts:
            # clear only the heart: strokes wholly inside the box (the pad's outline runs past it)
            lab, _ = ndimage.label(arr[y0:y1, x0:x1] < 160, structure=np.ones((3, 3)))
            edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
            for i in range(1, lab.max() + 1):
                if i in edge:
                    continue
                ys, xs = np.nonzero(ndimage.binary_dilation(lab == i, iterations=2))
                arr[ys + y0, xs + x0] = 255
        g = Image.fromarray(arr)
        d = ImageDraw.Draw(g)
        for _, (cx, cy) in hearts:
            nut(d, cx, cy)
    a = np.array(g)
    ink = a < 200
    lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
    boxes = ndimage.find_objects(lab)
    cw, ch = a.shape[1] // 4, a.shape[0] // 2
    owner = np.zeros(n + 1, dtype=int) - 1
    for i, b in enumerate(boxes, 1):
        cy, cx = (b[0].start + b[0].stop) / 2, (b[1].start + b[1].stop) / 2
        owner[i] = int(cy // ch) * 4 + min(3, int(cx // cw))
    for k, name in enumerate(names):
        mine = np.isin(lab, np.nonzero(owner == k)[0])
        mine = ndimage.binary_dilation(mine, iterations=1)  # keep the anti-aliased edge
        ys, xs = np.nonzero(mine)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        alpha = np.where(mine, 255 - a, 0)[y0:y1, x0:x1].astype(np.uint8)
        im = Image.merge('LA', [Image.new('L', alpha.shape[::-1], 0), Image.fromarray(alpha)])
        im = im.resize((round(im.width * HEIGHT / im.height), HEIGHT), Image.LANCZOS)
        yield name, im


if __name__ == '__main__':
    out = sys.argv[3] if len(sys.argv) > 3 else 'src/assets/wizard'
    os.makedirs(out, exist_ok=True)
    for i, (sheet, names) in enumerate(zip(sys.argv[1:3], SHEETS)):
        for name, im in poses(sheet, names, HEARTS if i == 0 else ()):
            im.save(os.path.join(out, f'rhino-{name}.png'), optimize=True)
            print(name, im.size)
