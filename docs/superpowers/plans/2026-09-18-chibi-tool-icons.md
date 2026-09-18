# Q 版角色功能入口图标 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为首页 11 个功能入口生成一致的 Q 版角色透明 PNG，并接入入口卡片且保留 Lucide 加载失败后备。

**Architecture:** 每个入口使用一张位于 `frontend/public/icons/tools/` 的独立 1024×1024 PNG。`HomePage` 的工具配置同时保存图片路径与 Lucide 组件，并通过一个小型 `HomeToolIcon` 组件处理图片加载失败；顶部导航和所有功能逻辑保持不变。

**Tech Stack:** React 19、TypeScript、Vite、CSS、Node.js test runner、built-in image generation

---

## File Structure

- Create: `frontend/public/icons/tools/*.png` — 11 张角色功能图标。
- Modify: `frontend/src/main.tsx` — 为首页工具配置增加图片路径并渲染带后备的角色图标。
- Modify: `frontend/src/styles.css` — 定义角色图标图片的尺寸、适配和悬浮表现。
- Modify: `frontend/tests/home-layout.test.mjs` — 验证 11 张图片映射、首页图片渲染和 Lucide 后备。

### Task 1: Generate and validate the 11 image assets

**Files:**
- Create: `frontend/public/icons/tools/video-clip.png`
- Create: `frontend/public/icons/tools/video-merge.png`
- Create: `frontend/public/icons/tools/sync-play.png`
- Create: `frontend/public/icons/tools/extract-audio.png`
- Create: `frontend/public/icons/tools/audio-edit.png`
- Create: `frontend/public/icons/tools/audio-speed.png`
- Create: `frontend/public/icons/tools/remove-watermark.png`
- Create: `frontend/public/icons/tools/image-resize.png`
- Create: `frontend/public/icons/tools/ratio-calculator.png`
- Create: `frontend/public/icons/tools/video-download.png`
- Create: `frontend/public/icons/tools/model-download.png`

- [ ] **Step 1: Load the role reference and create the destination directory**

Inspect `/Users/bethenachan/code/make_video/actor/chibi-host-pose-sheet.png` with the image viewer, then run:

```bash
mkdir -p frontend/public/icons/tools
```

Expected: the reference shows a yellow-beret, black-bob-haired host in a white shirt and blue apron; the destination directory exists.

- [ ] **Step 2: Generate each transparent icon with the built-in image tool**

Use the reference image as the input for every generation. Repeat this shared specification in every prompt:

```text
Use case: stylized-concept
Asset type: square UI tool-entry icon
Input image: character and illustration-style reference
Primary request: create one new half-body illustration of the same chibi host character for the specified software function
Style/medium: clean polished 2D chibi illustration matching the reference; rounded shapes; dark navy bold outline; simple readable forms
Composition/framing: centered half-body character; one or two oversized functional props; generous even padding; readable at 64px
Color palette: preserve the yellow beret, black bob haircut, white shirt, blue apron, peach skin and navy outline
Constraints: genuine transparent background with alpha; exactly one character; preserve face, hair, clothing and proportions; no cropped hat, hands or props; no text; no letters; no logo; no watermark; no checkerboard baked into the image; square 1024×1024
```

Append exactly one of these function-specific requests per image:

```text
video-clip.png: The host holds oversized scissors and cuts one clearly recognizable film strip.
video-merge.png: The host joins two film-strip ends into one continuous strip.
sync-play.png: The host holds two small video windows, one in each hand; both show the same simple triangular play symbol.
extract-audio.png: The host pulls a flowing music-note audio track out of a video frame.
audio-edit.png: The host wears headphones and adjusts large sliders over a simple audio waveform.
audio-speed.png: The host holds a music note beside a speedometer with short motion lines.
remove-watermark.png: The host uses a large magic eraser to remove a faint generic mark from a picture card; no readable text.
image-resize.png: The host stretches a picture frame with clear outward arrows at its corners.
ratio-calculator.png: The host holds a calculator beside a picture frame divided into a simple proportion grid; no digits or text.
video-download.png: The host catches a descending video-file card from a cloud; use a simple play symbol only.
model-download.png: The host hugs a download box marked only with a simple neural-network node diagram; no letters.
```

Issue one built-in image generation call per asset. Copy each selected output from its generated-image location to the corresponding path under `frontend/public/icons/tools/`; do not overwrite any unrelated file.

- [ ] **Step 3: Verify file format, dimensions and alpha channel**

Run:

```bash
file frontend/public/icons/tools/*.png
for image in frontend/public/icons/tools/*.png; do
  sips -g pixelWidth -g pixelHeight -g hasAlpha "$image"
done
```

Expected: exactly 11 PNG files; every image is 1024×1024 and reports `hasAlpha: yes`.

- [ ] **Step 4: Visually inspect a contact sheet at UI-like size**

Use ImageMagick if available:

```bash
magick montage frontend/public/icons/tools/*.png -thumbnail 72x72 -tile 6x2 -geometry 96x96+12+12 /tmp/lin-tools-icon-contact-sheet.png
```

If `magick` is unavailable, inspect every PNG individually with the image viewer at original size and again as a file-browser thumbnail. Confirm the character identity, transparent background, unclipped edges, lack of text/watermarks, and distinct function props. Regenerate only assets that fail a check, changing one prompt detail at a time.

- [ ] **Step 5: Commit the accepted image assets**

```bash
git add frontend/public/icons/tools
git commit -m "assets: add chibi tool entry icons"
```

Expected: one commit containing exactly the 11 PNG assets.

### Task 2: Add failing source-level tests for the icon contract

**Files:**
- Modify: `frontend/tests/home-layout.test.mjs`

- [ ] **Step 1: Add tests for all paths, image rendering and fallback behavior**

Append:

```js
test('首页 11 个工具入口映射独立角色图标', () => {
  const iconPaths = [
    '/icons/tools/video-clip.png',
    '/icons/tools/video-merge.png',
    '/icons/tools/sync-play.png',
    '/icons/tools/extract-audio.png',
    '/icons/tools/audio-edit.png',
    '/icons/tools/audio-speed.png',
    '/icons/tools/remove-watermark.png',
    '/icons/tools/image-resize.png',
    '/icons/tools/ratio-calculator.png',
    '/icons/tools/video-download.png',
    '/icons/tools/model-download.png'
  ];

  for (const iconPath of iconPaths) {
    assert.ok(mainSource.includes(`image: '${iconPath}'`), `missing ${iconPath}`);
  }
  assert.equal((mainSource.match(/image: '\/icons\/tools\//g) || []).length, 11);
});

test('首页角色图标加载失败时显示 Lucide 后备', () => {
  assert.match(mainSource, /function HomeToolIcon\(/);
  assert.match(mainSource, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(mainSource, /failed \? <Icon size=\{22\} \/> : <img src=\{image\}/);
  assert.match(stylesSource, /\.tool-character-icon\s*\{[^}]*object-fit:\s*contain/s);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
cd frontend && npm test
```

Expected: the two new tests fail because `image`, `HomeToolIcon`, and `.tool-character-icon` do not exist yet; the earlier layout tests continue to pass.

- [ ] **Step 3: Commit the failing tests**

```bash
git add frontend/tests/home-layout.test.mjs
git commit -m "test: define home character icon contract"
```

### Task 3: Render character icons with a Lucide fallback

**Files:**
- Modify: `frontend/src/main.tsx:1279-1340`
- Modify: `frontend/src/styles.css:397-415`

- [ ] **Step 1: Add the reusable icon renderer before `HomePage`**

Add this component immediately before `function HomePage`:

```tsx
function HomeToolIcon({
  image,
  icon: Icon
}: {
  image: string;
  icon: React.ComponentType<{ size?: number }>;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="tool-icon" aria-hidden="true">
      {failed ? <Icon size={22} /> : <img src={image} alt="" className="tool-character-icon" onError={() => setFailed(true)} />}
    </span>
  );
}
```

The button already exposes the visible tool title, so the decorative image uses an empty `alt` and its wrapper is hidden from the accessibility tree.

- [ ] **Step 2: Add the image property and the 11 paths to the tool configuration**

Add `image: string;` to the tool item type, then replace the tool array with:

```tsx
  const tools: Array<{
    view: Exclude<PageView, 'home'>;
    title: string;
    description: string;
    category: string;
    image: string;
    icon: React.ComponentType<{ size?: number }>;
    featured?: boolean;
  }> = [
    { view: 'clipper', title: '视频裁剪', description: '截取片段、转换格式并调整画面。', category: '视频', image: '/icons/tools/video-clip.png', icon: Scissors, featured: true },
    { view: 'merge', title: '视频合并', description: '按顺序拼接多个视频文件。', category: '视频', image: '/icons/tools/video-merge.png', icon: Layers, featured: true },
    { view: 'syncPlay', title: '同步播放', description: '并排打开多个视频并同时播放。', category: '视频', image: '/icons/tools/sync-play.png', icon: Play, featured: true },
    { view: 'extractAudio', title: '提取音频', description: '从视频中导出指定音轨。', category: '音频', image: '/icons/tools/extract-audio.png', icon: Music, featured: true },
    { view: 'audio', title: '音频编辑', description: '查看信息、裁剪并插入静音。', category: '音频', image: '/icons/tools/audio-edit.png', icon: SlidersHorizontal },
    { view: 'audioSpeed', title: '音频变速', description: '调整播放速度并导出新文件。', category: '音频', image: '/icons/tools/audio-speed.png', icon: Clock3 },
    { view: 'watermark', title: '图片去水印', description: '检测并处理图片中的水印。', category: '图片', image: '/icons/tools/remove-watermark.png', icon: Wand2 },
    { view: 'imageResize', title: '图片改尺寸', description: '快速缩放图片并保持比例。', category: '图片', image: '/icons/tools/image-resize.png', icon: ImageIcon },
    { view: 'calculator', title: '比例计算器', description: '计算画面比例与目标分辨率。', category: '辅助', image: '/icons/tools/ratio-calculator.png', icon: Calculator },
    { view: 'downloader', title: '视频下载', description: '从链接下载在线视频资源。', category: '下载', image: '/icons/tools/video-download.png', icon: CloudDownload },
    { view: 'model', title: '模型下载', description: '通过镜像下载 Hugging Face 模型。', category: '下载', image: '/icons/tools/model-download.png', icon: Database }
  ];
```

- [ ] **Step 3: Replace the homepage Lucide-only renderer**

Remove the local `const Icon = tool.icon;` line inside `tools.map`, and replace:

```tsx
<span className="tool-icon"><Icon size={22} /></span>
```

with:

```tsx
<HomeToolIcon image={tool.image} icon={tool.icon} />
```

- [ ] **Step 4: Style the larger transparent character art**

Update `.tool-icon` and its hover treatment, then add `.tool-character-icon`:

```css
.tool-icon {
  width: 64px;
  height: 64px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  color: var(--brand-600);
}

.tool-character-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 4px 7px rgba(15, 23, 42, 0.12));
  transform: scale(1);
  transition: transform var(--t-base) var(--ease), filter var(--t-base) var(--ease);
}

.tool-entry:hover .tool-character-icon {
  filter: drop-shadow(0 7px 10px rgba(79, 70, 229, 0.18));
  transform: scale(1.06) rotate(-1deg);
}
```

Do not apply the old solid indigo hover background to `.tool-icon`; the transparent art must remain unobscured. Keep the `.tool-icon` color so the Lucide fallback inherits the brand color.

- [ ] **Step 5: Run tests and build**

Run:

```bash
cd frontend && npm test && npm run build
```

Expected: all Node tests pass; TypeScript reports no errors; Vite creates the production build successfully.

- [ ] **Step 6: Commit the homepage integration**

```bash
git add frontend/src/main.tsx frontend/src/styles.css
git commit -m "feat: use chibi icons on home tool entries"
```

### Task 4: Final visual and repository verification

**Files:**
- Verify: `frontend/public/icons/tools/*.png`
- Verify: `frontend/src/main.tsx`
- Verify: `frontend/src/styles.css`
- Verify: `frontend/tests/home-layout.test.mjs`

- [ ] **Step 1: Start the frontend and inspect responsive layouts**

Run the backend and frontend in separate terminals:

```bash
python run_web.py
```

```bash
cd frontend && npm run dev
```

Open the homepage and inspect desktop, tablet and phone widths. Expected: 3/2/1 card columns; 11 distinct character icons; no clipped artwork; labels and arrows stay aligned; the top navigation on tool pages still uses Lucide icons.

- [ ] **Step 2: Verify fallback behavior**

Temporarily change one image path in browser developer tools to a missing URL. Expected: that card switches to its Lucide icon without affecting other cards. Revert the browser-only change; do not alter source files.

- [ ] **Step 3: Run the complete final checks**

```bash
cd frontend && npm test && npm run build
cd .. && git diff --check && git status --short
```

Expected: tests and build pass; `git diff --check` reports no whitespace errors; the working tree is clean after the planned commits.

- [ ] **Step 4: Review the final commit range**

```bash
git log --oneline -4
git diff HEAD~3..HEAD --stat
```

Expected: the range contains the asset, test, and integration commits, with 11 PNGs plus the three intended frontend source/test files and no unrelated changes.
