# 诗弦（暂定名）

以中国古典诗词为内容、以可拨动的文字弦幕为核心交互的浏览器体验。

第一期作品：《琵琶行》正文全篇，不展示序文。

核心形态：一整面可拨动的巨型文字帘，以古籍竖排方式从右向左横向展开；每列容纳两段原文，用户通过连续长卷浏览正文，拨动文字时触发琵琶声音。

## 当前阶段

当前已完成可运行的 V3 产品概念 Demo：进入后无需按钮，抵住左右卷缘、拖动底部卷轴、使用方向键或点击顶部“播放”即可阅卷。自动播放会以慢速匀速展开，并支持随时暂停或由手动操作接管。卷轴从右侧卷首向左展开；开场题字、44 行正文与“曲终”处于同一连续空间，并分别使用开场与收尾琵琶句衔接。22 列文字弦支持抓取、横扫、分列音阶、方向音色和旋律短句。

## 技术方向

- Vite + TypeScript
- Canvas 2D：文字弦幕渲染
- Verlet Integration：粒子与绳索物理
- Web Audio API：琵琶音色与交互发声
- 原生 DOM/CSS：页面外壳、内容说明与控制界面

## 目录

```text
.
├── docs/                     # 架构、内容模型、路线和许可边界
├── public/assets/            # 不参与打包转换的图片、声音和字体
├── src/
│   ├── app/                  # 应用启动与顶层编排
│   ├── content/              # 诗词正文与内容数据模型
│   ├── core/                 # 与具体诗词无关的底层能力
│   │   ├── audio/            # Web Audio 音频引擎
│   │   ├── physics/          # 粒子、约束和模拟循环
│   │   ├── rendering/        # Canvas 与字形渲染
│   │   └── viewport/         # 长卷坐标、镜头和可见区域管理
│   ├── features/             # 面向用户的功能模块
│   ├── styles/               # 全局样式与设计令牌
│   └── themes/               # 作品旋律与声音映射
└── outputs/                  # 可交付截图与恢复备份
```

详细规则见 `docs/ARCHITECTURE.md`。

## 本地运行

```bash
npm install
npm run dev
```

质量门禁：`npm run typecheck`、`npm run build`。

## 部署

仓库通过 GitHub Actions 自动部署到 GitHub Pages。推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会安装依赖、构建 `dist` 并更新线上网站。
