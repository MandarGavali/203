# Crops ref/plan.png into one reference image per piece: ref/crops/<piece>.png (2x upscaled).
import json, re, sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
src = (root / 'src' / 'plan.js').read_text(encoding='utf-8-sig')
block = src[src.index('export const pieces'):]
im = Image.open(root / 'ref' / 'plan.png').convert('RGB')
out = root / 'ref' / 'crops'
out.mkdir(parents=True, exist_ok=True)
for m in re.finditer(r"(\w+):\s*\{\s*rooms:.*?crop:\s*\[([\d,\s]+)\]", block):
    pid, box = m.group(1), [int(v) for v in m.group(2).split(',')]
    c = im.crop(box)
    c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    c.save(out / f'{pid}.png')
    print(pid, box, '->', out / f'{pid}.png')
