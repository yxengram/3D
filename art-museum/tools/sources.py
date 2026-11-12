"""Collect the per-group manifests (raw/<group>/manifest.json, raw/paint*/meta.json) into sources/ and write SOURCES.md.
   python3 tools/sources.py"""
import json, os, shutil
R = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')); os.makedirs(os.path.join(R, 'sources'), exist_ok=True)
GROUPS = [('stone', '石材 / 混凝土 / 墙面'), ('wood', '木材 / 金属 / 皮革'), ('nature', '天空 / 树木 / 草地'), ('paintA', '画作 p01–p08'), ('paintB', '画作 p09–p16、挂毯 m01'), ('gfx', '文字与平面（代码排版）')]
ADJ = {'tex/concrete.webp': '入场景后：大尺度云斑减到 30%，保留细颗粒', 'tex/lawn.webp': '入场景后：饱和度 ×0.78、均值 96，缩到 512px', 'tex/sky.webp': '入场景后：缩到 2048×512',
       'tex/tree_a.webp': '入场景后：缩到 768px', 'tex/tree_b.webp': '入场景后：缩到 768px', 'tex/tree_c.webp': '入场景后：缩到 768px'}
KIND = {'generated': 'GPT-Image 生成', 'composed': '代码合成'}
out = ['# 素材来源', '', '本场景没有下载任何外部素材。所有图像要么由 GPT-Image（模型 `gpt-image-2.6-sunburst`）生成，要么用生成的原图在代码里拼合，',
       '文字与标签用本机系统字体在代码里排版。每一项的完整提示词和后处理说明见 `sources/*.json`。', '']
for g, title in GROUPS:
    src = os.path.join(R, 'raw', g, 'manifest.json')
    if not os.path.exists(src): continue
    m = json.load(open(src)); m = m if isinstance(m, list) else m.get('files', [])
    json.dump(m, open(os.path.join(R, 'sources', g + '.json'), 'w'), ensure_ascii=False, indent=1)
    meta = os.path.join(R, 'raw', g, 'meta.json')
    if os.path.exists(meta): shutil.copy(meta, os.path.join(R, 'sources', g + '_meta.json'))
    out += ['## ' + title, '', '| 文件 | 来源 | 像素 | 说明 |', '| --- | --- | --- | --- |']
    for e in m:
        f = e['file'].replace('assets/', ''); kind = KIND.get(e.get('source'), e.get('source'))
        if g == 'gfx': kind = '代码排版（系统字体）'
        elif e.get('source') == 'composed': kind = '生成原图 + 代码合成'
        px = '×'.join(str(v) for v in (e.get('px') or []))
        note = ADJ.get(f, '')
        if f in ADJ and f.startswith('tex/') and ('sky' in f or 'tree' in f or 'lawn' in f or 'concrete' in f): px = {'tex/sky.webp': '2048×512', 'tex/lawn.webp': '512×512'}.get(f, '768×768')
        out.append('| `%s` | %s | %s | %s |' % (f, kind, px, note))
    out.append('')
out += ['## 其他', '', '- 光照贴图 `lm_ext.webp`、`lm_lobby.webp`、`lm_gallery.webp`：Blender 5.2 Cycles 烘焙（本项目脚本 `tools/bl/`），OIDN 降噪。',
        '- 模型 `scene.glb`：`tools/bl/scene.py` 程序化生成。', '- 运行库：three.js r187（MIT）。', '- 画作的作者姓名、标题、年份均为虚构。', '']
open(os.path.join(R, 'SOURCES.md'), 'w').write('\n'.join(out)); print('SOURCES.md', len(out), 'lines')
