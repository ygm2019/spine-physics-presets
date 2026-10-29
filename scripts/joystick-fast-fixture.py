"""Export the measured 4.3 parameter sets as an editable JSON/atlas fixture."""
import json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

project = Path(__file__).resolve().parents[2]
report = json.loads((project / 'tests/joystick-fast-calibration/report.json').read_text(encoding='utf-8'))
out = project / 'examples/40帧摇杆方向对照'
out.mkdir(parents=True, exist_ok=True)
image = Image.new('RGBA', (1024, 2048))
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 26)
draw.rounded_rectangle((4, 0, 15, 99), radius=5, fill='white')
draw.ellipse((26, 2, 45, 21), fill='white')
atlas = 'compare.png\nsize:1024,2048\nfilter:Linear,Linear\nrepeat:none\nbar\nbounds:0,0,20,100\njoint\nbounds:24,0,24,24\n'
doc = dict(skeleton=dict(spine='4.3.26', fps=30), bones=[dict(name='root')], slots=[], skins=[dict(name='default', attachments={})], constraints=[], animations={})
directions = ['light', 'baseline', 'heavy', 'bouncy', 'viscous']
labels = ['硬', '原始', '软', '弹跳', '黏滞']
colors = ['87d7acff', 'cad2e1ff', 'bb9deaff', 'efb266ff', '79cfe3ff']
profiles = list(dict.fromkeys(r['profile'] for r in report['results']))
drivers = []

def attach(name, bone, region, width, height, **extra):
    doc['slots'].append(dict(name=name, bone=bone, attachment=name))
    doc['skins'][0]['attachments'][name] = {name: dict(path=region, width=width, height=height, **extra)}

for row, profile in enumerate(profiles):
    for col, direction in enumerate(directions):
        k = row * 5 + col
        r = next(r for r in report['results'] if r['minor'] == 3 and r['profile'] == profile and r['direction'] == direction)
        title = f'{profile}_{labels[col]}'
        px, py = (k % 2) * 512, 120 + (k // 2) * 100
        draw.text((px + 250, py + 40), f'{profile} · {labels[col]}', anchor='mm', font=font, fill='#'+colors[col][:6])
        atlas += f'title{k}\nbounds:{px},{py},500,80\n'
        x, y = col * 560, -row * 760
        attach(title+'_静态标签', 'root', f'title{k}', 500, 80, x=x, y=y+100)
        driver = title+'_驱动'
        drivers.append(driver)
        doc['bones'].append(dict(name=driver, parent='root', x=x, y=y))
        for segment in range(1, 6):
            name = f'{title}_{segment:02}'
            doc['bones'].append(dict(name=name, parent=driver if segment == 1 else f'{title}_{segment-1:02}', length=100, color=colors[col], **(dict(rotation=-90) if segment == 1 else dict(x=100))))
            c = dict(r['params'], name=name, bone=name, type='physics', order=len(doc['constraints']))
            doc['constraints'].append(c)
            attach(name+'_条', name, 'bar', 16, 100, x=50, rotation=90, color=colors[col])
            attach(name+'_点', name, 'joint', 14, 14, x=100, color=colors[col])

keys = [dict(time=f/30, value=-60*math.cos(2*math.pi*f/40)) for f in range(41)]
doc['animations']['快速摆动_40帧'] = dict(bones={name: dict(translatex=keys) for name in drivers})
# A stop clip, deliberately preserving physics across the transition in a player.
doc['animations']['停止观察'] = dict(bones={name: dict(translatex=[dict(value=-60), dict(time=40, value=-60)]) for name in drivers})
image.save(out / 'compare.png')
(out / 'compare.atlas').write_text(atlas, encoding='utf-8')
(out / '40帧摇杆方向对照.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding='utf-8')
(out / '说明.md').write_text('''# 40帧方向对照

把本目录JSON、atlas、PNG三个文件一起拖入摇杆版软件。25条五节链、每节100单位、125个旋转物理约束。
每行一种原始参数；列顺序：硬、原始、软、弹跳、黏滞。每个样本独立从原始值调整一档（标准灵敏度半屏宽/高）。
选快速摆动_40帧可持续观察；停止观察是固定根位置的40秒片段。软件切动画是否重置物理取决于播放器；严格的连续12圈后停止测量，以tests/joystick-fast-calibration报告与回放为准。
标签固定不随根部移动。JSON可在Spine导入数据，未声称本次已完成Spine编辑器视觉验收。
''', encoding='utf-8')
print(out)
