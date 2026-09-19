# Media Lab 项目图标设计

## 目标

为 Media Lab 设计一套带 Q 版角色的项目图标，用于浏览器 favicon、移动端书签、Web 应用资源，以及未来 macOS 与 Windows 桌面打包。

## 视觉方向

- 角色以现有主持人作为身份参考：黄色贝雷帽、黑色短发、圆润五官、深墨色粗描边。
- 主图为正面微笑的角色头像，保留少量蓝色围裙领口。
- 使用薄荷绿圆角方形作为主背景，暖白高光，黄色帽子和深墨描边与现有界面一致。
- 只加入极简的播放三角与声波点缀，表达视频、音频和图片工具集合；不使用文字、字母、商标或复杂道具。
- 小尺寸版本只保留角色头部、帽子和深色描边，不保留围裙及媒体点缀。

## 资产交付

- 一张 1024×1024 透明 PNG 主图，作为所有平台导出源。
- PNG 尺寸：512、256、180、64、32、16px。
- `favicon.ico` 包含 16、32、48px 图层。
- `MediaLab.icns` 由标准 macOS iconset 生成。
- `site.webmanifest` 声明 192px 和 512px Web App 图标。

## Web 接入

- 图标资产放入 `frontend/public/icons/app/`，Vite 构建时复制到生产目录。
- 在 `frontend/index.html` 添加 favicon、Apple touch icon 和 manifest 引用。
- 不更改首页工具入口的人物图标、导航图标、功能逻辑或路由。

## 验收

- 主图与角色参考的外观、颜色和描边一致，没有文字或水印。
- 所有 PNG 均为正方形，主图保留透明通道。
- 16px favicon 中角色帽子与脸部轮廓清晰，不出现难辨识的小道具。
- 生产构建后，`/icons/app/favicon.ico`、`/icons/app/icon-192.png` 和 `/site.webmanifest` 可被 Flask 提供。
- 浏览器标签页加载新 favicon，manifest 引用的图标路径有效。
