# Lin Tools

这是从原来的 Web Video Clipper 改出来的 Python 本地视频裁剪工具。新版提供前后端分离的 Web 界面，不再依赖浏览器录屏能力，而是使用 FFmpeg 处理视频，所以可以选择更多输入/输出格式。

## 功能

- 选择本地视频文件并裁剪指定时间段
- 支持常见输入格式：MP4、MKV、MOV、AVI、WebM、FLV、WMV、M4V、MPG、3GP、TS、MTS、OGG 等
- 支持多种导出格式：MP4、MKV、MOV、WebM、AVI、GIF、MP3、WAV、AAC、FLAC、OGG
- 可选择是否保留音频
- 可按 100%、75%、50%、25% 缩放分辨率
- 时间轴缩略图、左右手柄裁剪、播放头拖动、选区放大/返回
- 起点/终点微调、播放速度预览、创意滤镜预览与导出
- 可选择导出裁剪区间或完整视频
- 多视频按队列顺序合并导出为 MP4
- 多视频并排同步播放，默认静音并支持单独开启某个视频的声音
- 内置本地测试样本生成，不依赖外网
- 比例与分辨率计算器
- 提供 Web 界面、命令行入口，旧版 Tk GUI 也保留

## 安装

```powershell
cd D:\CodeWordspaces\python\lin-tools
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e .
```

建议安装系统版 FFmpeg 并加入 PATH，这样视频信息探测会更完整。项目也依赖 `imageio-ffmpeg`，在没有系统 FFmpeg 时可提供基础转码能力。

## 启动 Web 工具

先构建前端：

```powershell
cd D:\CodeWordspaces\python\lin-tools\frontend
npm install
npm run build
```

再启动后端：

```powershell
cd D:\CodeWordspaces\python\lin-tools
python run_web.py
```

然后打开：

```text
http://127.0.0.1:5000
```

独立页面地址：

```text
http://127.0.0.1:5000/video
http://127.0.0.1:5000/merge
http://127.0.0.1:5000/sync-play
http://127.0.0.1:5000/calculator
http://127.0.0.1:5000/audio
http://127.0.0.1:5000/extract-audio
http://127.0.0.1:5000/downloader
http://127.0.0.1:5000/model
```

安装为可编辑项目后也可以运行：

```powershell
lin-video-clipper-web
```

上传和导出的运行文件会放在 `runtime/`，该目录已加入 `.gitignore`。

## 前后端分离开发

一个终端启动后端：

```powershell
cd D:\CodeWordspaces\python\lin-tools
python run_web.py
```

另一个终端启动前端开发服务器：

```powershell
cd D:\CodeWordspaces\python\lin-tools\frontend
npm run dev
```

然后访问 `http://127.0.0.1:5173`。Vite 会把 `/api` 和 `/download` 代理到 Flask 后端。

## 启动桌面图形界面

```powershell
lin-video-clipper-gui
```

不安装项目时，也可以直接运行：

```powershell
python run_gui.py
```

## 命令行示例

裁剪 00:10 到 00:25，并导出 MP4：

```powershell
lin-video-clipper input.mov --start 00:10 --end 00:25 --format mp4
```

不安装项目时，把 `lin-video-clipper` 换成 `python run_cli.py` 即可。

导出 WebM，缩放到 50%：

```powershell
lin-video-clipper input.mp4 --start 5 --end 18 --format webm --scale 0.5
```

只提取裁剪区间音频为 MP3：

```powershell
lin-video-clipper input.mp4 --start 00:01:00 --end 00:02:00 --format mp3
```

查看支持的导出格式：

```powershell
lin-video-clipper --list-formats
```
