# Contact sheet of screenshots: .venv/bin/python tools/sheet.py <dir> <out.png> [cols] [thumb_w]
import sys, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3; tw = int(sys.argv[4]) if len(sys.argv) > 4 else 520
names = sorted(f for f in os.listdir(d) if f.endswith('.png') and not f.startswith('sheet'))
if len(sys.argv) > 5: names = [n for n in names if any(n.startswith(p) for p in sys.argv[5].split(','))]
ims = [Image.open(os.path.join(d, n)).convert('RGB') for n in names]
th = int(tw * ims[0].size[1] / ims[0].size[0]); rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 16)), (20, 20, 20)); dr = ImageDraw.Draw(sheet)
for i, (n, im) in enumerate(zip(names, ims)):
    x, y = (i % cols) * tw, (i // cols) * (th + 16); sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 16)); dr.text((x + 4, y + 2), n[:-4], fill=(230, 230, 230))
sheet.save(out)
