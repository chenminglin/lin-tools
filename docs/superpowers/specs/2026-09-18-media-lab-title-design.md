# Media Lab 产品标题设计

## 目标

将面向用户的产品名称统一为 `Media Lab`，使网站名称覆盖现有的视频、音频、图片、下载与辅助工具功能。

## 范围

- React 首页左上角品牌标题改为 `Media Lab`。
- Vite 页面 `title` 改为 `Media Lab`，用于浏览器标签页与生产构建页面。
- Flask 回退模板的 `title` 与品牌标题也改为 `Media Lab`，避免前端构建文件不可用时出现旧名称。

## 非目标

- 不修改 Python 包名、CLI 命令、仓库目录或接口路径。
- 不修改桌面 Tk 界面标题，因为该界面不属于当前 Web 产品命名范围。
- 不修改说明文档中用于描述项目历史的 “Web Video Clipper” 文字。

## 验收

- 首页左上角显示 `Media Lab`。
- 浏览器标签页显示 `Media Lab`。
- `npm run build` 通过，Flask 在提供构建版或回退模板时均不出现旧的 Web 产品标题。
