# -*- coding: utf-8 -*-
"""Gera favicon.png e favicon.ico com a logo JurisAI (J dourado em fundo escuro)."""
import os
from PIL import Image, ImageDraw, ImageFont

SIZE = 256
DARK = (11, 11, 20, 255)
GOLD = (234, 179, 8, 255)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=56, fill=DARK)
# borda dourada sutil
d.rounded_rectangle([6, 6, SIZE - 7, SIZE - 7], radius=48, outline=(184, 144, 47, 160), width=5)

font = None
for path in [
    "C:/Windows/Fonts/georgiab.ttf",
    "C:/Windows/Fonts/timesbd.ttf",
    "C:/Windows/Fonts/Georgia.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]:
    if os.path.exists(path):
        font = ImageFont.truetype(path, 180)
        break
if font is None:
    font = ImageFont.load_default()

text = "J"
bbox = d.textbbox((0, 0), text, font=font)
w = bbox[2] - bbox[0]
h = bbox[3] - bbox[1]
x = (SIZE - w) / 2 - bbox[0]
y = (SIZE - h) / 2 - bbox[1] - 6
d.text((x, y), text, font=font, fill=GOLD)

pub = os.path.join(os.path.dirname(__file__), "..", "public")
img.save(os.path.join(pub, "favicon.png"))
img.save(os.path.join(pub, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("favicon.png e favicon.ico gerados em public/")
