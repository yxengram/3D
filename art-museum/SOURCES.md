# 素材来源

本场景没有下载任何外部素材。所有图像要么由 GPT-Image（模型 `gpt-image-2.6-sunburst`）生成，要么用生成的原图在代码里拼合，
文字与标签用本机系统字体在代码里排版。每一项的完整提示词和后处理说明见 `sources/*.json`。

## 石材 / 混凝土 / 墙面

| 文件 | 来源 | 像素 | 说明 |
| --- | --- | --- | --- |
| `tex/travertine.webp` | 生成原图 + 代码合成 | 1024×1024 |  |
| `tex/paving.webp` | 生成原图 + 代码合成 | 1024×1024 |  |
| `tex/terrazzo.webp` | 生成原图 + 代码合成 | 1024×1024 |  |
| `tex/concrete.webp` | GPT-Image 生成 | 768×768 | 入场景后：大尺度云斑减到 30%，保留细颗粒 |
| `tex/gravel.webp` | GPT-Image 生成 | 512×512 |  |
| `tex/plaster.webp` | GPT-Image 生成 | 512×512 |  |

## 木材 / 金属 / 皮革

| 文件 | 来源 | 像素 | 说明 |
| --- | --- | --- | --- |
| `tex/parquet.webp` | 生成原图 + 代码合成 | 1024×1024 |  |
| `tex/walnut_slats.webp` | 生成原图 + 代码合成 | 512×1024 |  |
| `tex/oak.webp` | GPT-Image 生成 | 512×512 |  |
| `tex/bronze.webp` | GPT-Image 生成 | 256×256 |  |
| `tex/leather.webp` | GPT-Image 生成 | 512×512 |  |

## 天空 / 树木 / 草地

| 文件 | 来源 | 像素 | 说明 |
| --- | --- | --- | --- |
| `tex/sky.webp` | 生成原图 + 代码合成 | 2048×512 | 入场景后：缩到 2048×512 |
| `tex/tree_a.webp` | GPT-Image 生成 | 768×768 | 入场景后：缩到 768px |
| `tex/tree_b.webp` | GPT-Image 生成 | 768×768 | 入场景后：缩到 768px |
| `tex/tree_c.webp` | GPT-Image 生成 | 768×768 | 入场景后：缩到 768px |
| `tex/treeline.webp` | GPT-Image 生成 | 2048×256 |  |
| `tex/lawn.webp` | GPT-Image 生成 | 512×512 | 入场景后：饱和度 ×0.78、均值 96，缩到 512px |
| `tex/hedge.webp` | GPT-Image 生成 | 512×512 |  |

## 现代展厅画作 p01–p08

| 文件 | 来源 | 像素 | 说明 |
| --- | --- | --- | --- |
| `art/p01.webp` | GPT-Image 生成 | 1536×1024 |  |
| `art/p02.webp` | GPT-Image 生成 | 1024×683 |  |
| `art/p03.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/p04.webp` | GPT-Image 生成 | 1024×1024 |  |
| `art/p05.webp` | GPT-Image 生成 | 1024×683 |  |
| `art/p06.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/p07.webp` | GPT-Image 生成 | 1024×1024 |  |
| `art/p08.webp` | GPT-Image 生成 | 1024×683 |  |

## 现代展厅画作 p09–p16、挂毯 m01

| 文件 | 来源 | 像素 | 说明 |
| --- | --- | --- | --- |
| `art/p09.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/p10.webp` | GPT-Image 生成 | 1024×1024 |  |
| `art/p11.webp` | GPT-Image 生成 | 1024×683 |  |
| `art/p12.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/p13.webp` | GPT-Image 生成 | 1024×683 |  |
| `art/p14.webp` | GPT-Image 生成 | 1024×1024 |  |
| `art/p15.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/p16.webp` | GPT-Image 生成 | 1536×1024 |  |
| `art/m01.webp` | GPT-Image 生成 | 1536×1024 |  |

## 文字与平面（代码排版）

| 文件 | 来源 | 像素 | 说明 |
| --- | --- | --- | --- |
| `gfx/labels.webp` | 代码排版（系统字体） | 1600×1024 |  |
| `gfx/title.webp` | 代码排版（系统字体） | 1200×1300 |  |
| `gfx/text.webp` | 代码排版（系统字体） | 800×900 |  |
| `gfx/way.webp` | 代码排版（系统字体） | 1500×500 |  |
| `gfx/desk.webp` | 代码排版（系统字体） | 1600×320 |  |
| `gfx/name.webp` | 代码排版（系统字体） | 2048×342 |  |
| `gfx/banner_a.webp` | 代码排版（系统字体） | 512×1920 |  |
| `gfx/banner_b.webp` | 代码排版（系统字体） | 512×1920 |  |

## 中世纪展厅画作 md01–md11

| 文件 | 来源 | 像素 | 说明 |
| --- | --- | --- | --- |
| `art/md01.webp` | GPT-Image 生成 | 1536×1024 |  |
| `art/md02.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/md03.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/md04.webp` | GPT-Image 生成 | 1024×683 |  |
| `art/md05.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/md06.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/md07.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/md08.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/md09.webp` | GPT-Image 生成 | 683×1024 |  |
| `art/md10.webp` | GPT-Image 生成 | 1024×683 |  |
| `art/md11.webp` | GPT-Image 生成 | 1024×341 |  |

## 中世纪展厅材质

| 文件 | 来源 | 像素 | 说明 |
| --- | --- | --- | --- |
| `tex/med_wall.webp` | GPT-Image 生成 | 512×512 |  |
| `tex/med_floor.webp` | 生成原图 + 代码合成 | 1024×1024 |  |
| `tex/med_stone.webp` | 生成原图 + 代码合成 | 1024×1024 |  |

## 中世纪展厅文字与展签（代码排版）

| 文件 | 来源 | 像素 | 说明 |
| --- | --- | --- | --- |
| `gfx/labels_med.webp` | 代码排版（系统字体） | 1280×768 |  |
| `gfx/medtitle.webp` | 代码排版（系统字体） | 1100×1000 |  |
| `gfx/medsign.webp` | 代码排版（系统字体） | 1600×200 |  |

## 其他

- 光照贴图 `lm_ext.webp`、`lm_lobby.webp`、`lm_gallery.webp`：Blender 5.2 Cycles 烘焙（本项目脚本 `tools/bl/`），OIDN 降噪。
- 模型 `scene.glb`：`tools/bl/scene.py` 程序化生成。
- 运行库：three.js r187（MIT）。
- 画作的作者姓名、标题、年份均为虚构；中世纪展厅的作品是按中世纪绘画的形式和技法新作的图像，不是任何现存作品的复制或临摹。
