from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
image = Image.new('RGBA', (512, 512), '#292a2c')
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((28, 28, 484, 484), 56, fill='#333538', outline='#66686c', width=5)
draw.line([(135, 370), (245, 265), (352, 138)], fill='#f2c94c', width=18)
draw.polygon([(151, 350), (184, 354), (245, 265), (174, 323)], fill='#f2c94c')
draw.polygon([(261, 246), (291, 247), (352, 138), (280, 208)], fill='#a3c9df')
for x, y in [(135, 370), (245, 265), (352, 138)]:
    draw.ellipse((x - 24, y - 24, x + 24, y + 24), fill='#333538', outline='#eeeeef', width=10)
(root / 'build').mkdir(exist_ok=True)
image.save(root / 'build/icon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
image.resize((256, 256)).save(root / 'src/renderer/icon.png')
print('Generated Windows icon and window PNG')