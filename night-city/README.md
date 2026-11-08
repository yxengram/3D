# Night City · 夜幕下的繁华都市

用 [three.js](https://threejs.org) 搭建的夜景城市，包含两个场景：

- **城市全景**（`index.html`）：程序生成的夜间大都市，有扫描贴图的楼体立面、看得到房间内部的窗户、真实的树木模型、LED 视频大屏、霓虹招牌、红绿灯和车流。
- **雨夜小巷**（`alley.html`）：街道视角的霓虹雨夜小巷，有湿地面反射、雨丝和灯光雾气。

## 运行

页面使用 ES 模块，需要通过本地服务器打开（不能直接双击 html 文件）。three.js 从 CDN 加载，所以需要联网。

```bash
cd night-city
python3 tools/serve.py        # 默认端口 8765
```

然后在浏览器打开 http://localhost:8765/ 。

### 操作

城市全景：

- 左键拖拽旋转 · 滚轮缩放 · 右键平移
- `1` 全景 · `2` 街道 · `3` 楼顶 · `4` 地标塔
- 空格：暂停 / 继续自动环绕
- URL 参数：`?scale=1.0`（最高渲染分辨率）、`?exposure=1.2`（曝光）

雨夜小巷的操作说明见页面左上角。

## 目录结构

```
index.html        城市全景页面
alley.html        雨夜小巷页面
city/             城市场景的代码（楼体、立面着色器、街道、树、天空、大屏、后期）
alley/            小巷场景的代码
assets/           贴图、模型、树和 HDRI（全部 CC0，见 assets/CREDITS.md）
tools/
  serve.py            禁用缓存的本地开发服务器
  fetch_polyhaven.py  从 Poly Haven 重新下载贴图、模型和 HDRI
  reduce_tree.py      用 Blender 把高精度扫描树精简成实时可用的版本
```

## 素材

所有贴图、模型和 HDRI 都来自 [Poly Haven](https://polyhaven.com)，采用 CC0 协议（公有领域，可自由使用）。详见 `assets/CREDITS.md`。
