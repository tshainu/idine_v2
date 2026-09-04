#!/usr/bin/env python3
"""Pick the best downloaded search image per Manjal item, square-crop it to 600px
and write it to packages/web/public/menu/manjal/<CODE>.jpg.

Search images land in /home/user/Images/<query-slug>_N.jpg via the web_search tool.
Run repeatedly; it only processes items whose target file is missing.
"""
import glob
import json
import os
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packages/web/public/menu/manjal")
SRC = "/home/user/Images"
QUERIES = "/tmp/manjal_queries.json"

os.makedirs(OUT, exist_ok=True)
items = json.load(open(QUERIES))
force = "--force" in sys.argv

done, missing = [], []
for it in items:
    target = os.path.join(OUT, f"{it['code']}.jpg")
    if os.path.exists(target) and not force:
        done.append(it["code"])
        continue
    cands = sorted(glob.glob(os.path.join(SRC, f"{it['slug']}_*")))
    picked = None
    for c in cands:
        try:
            im = Image.open(c)
            im.load()
        except Exception:
            continue
        w, h = im.size
        if min(w, h) < 400:
            continue
        ar = w / h
        if ar < 0.55 or ar > 1.9:
            continue
        picked = (c, im)
        break
    if not picked:
        # relax: accept anything openable >= 300px
        for c in cands:
            try:
                im = Image.open(c)
                im.load()
            except Exception:
                continue
            if min(im.size) >= 300:
                picked = (c, im)
                break
    if not picked:
        missing.append(it["code"] + " " + it["query"])
        continue
    _, im = picked
    im = ImageOps.exif_transpose(im).convert("RGB")
    im = ImageOps.fit(im, (600, 600), Image.LANCZOS, centering=(0.5, 0.5))
    im.save(target, "JPEG", quality=82, optimize=True)
    done.append(it["code"])

print(f"images ready: {len(done)}/{len(items)}")
if missing:
    print("missing:")
    for m in missing:
        print("  ", m)
