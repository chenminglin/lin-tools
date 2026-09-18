# 首页布局精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首页隐藏副标题、顶部导航和右侧徽章，并让工具入口在桌面、平板、手机宽度下分别显示 3、2、1 列。

**Architecture:** 保留现有单页 React 结构，在 `App` 内用当前页面派生一个首页头部显示开关，只改变相关元素的渲染条件。工具卡片继续使用现有数据和组件，仅通过 CSS Grid 及既有响应式断点调整列数。

**Tech Stack:** React 19、TypeScript、Vite、CSS Grid、Node.js 内置测试运行器

---

### Task 1: 添加首页布局回归测试

**Files:**
- Create: `frontend/tests/home-layout.test.mjs`
- Modify: `frontend/package.json`
- Test: `frontend/tests/home-layout.test.mjs`

- [ ] **Step 1: 写入失败测试**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('首页隐藏辅助头部内容，工具页继续显示', () => {
  assert.match(mainSource, /const showHeaderDetails = activeView !== 'home';/);
  assert.match(mainSource, /showHeaderDetails && \(\s*<p>Python \+ FFmpeg 后端，多格式本地视频裁剪<\/p>/);
  assert.match(mainSource, /showHeaderDetails && \(\s*<div className="header-actions">/);
  assert.match(mainSource, /showHeaderDetails && \(\s*<div className="header-badges">/);
});

test('工具入口按桌面三列、平板两列、手机一列响应', () => {
  assert.match(stylesSource, /\.tool-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(stylesSource, /@media \(max-width:\s*1020px\)[\s\S]*?\.tool-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(stylesSource, /@media \(max-width:\s*680px\)[\s\S]*?\.tool-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
});
```

在 `frontend/package.json` 的 `scripts` 中增加：

```json
"test": "node --test tests/*.test.mjs"
```

- [ ] **Step 2: 运行测试并确认失败原因正确**

Run: `cd frontend && npm test`

Expected: 两个测试均因尚未加入首页条件渲染和三列/平板两列规则而失败。

- [ ] **Step 3: 提交测试**

```bash
git add frontend/package.json frontend/tests/home-layout.test.mjs
git commit -m "test: 覆盖首页精简布局"
```

### Task 2: 实现首页头部精简与三列入口

**Files:**
- Modify: `frontend/src/main.tsx:810-865`
- Modify: `frontend/src/styles.css:165-169`
- Modify: `frontend/src/styles.css:2435-2500`
- Test: `frontend/tests/home-layout.test.mjs`

- [ ] **Step 1: 添加首页头部显示开关并条件渲染**

在 `App` 返回 JSX 之前定义：

```tsx
const showHeaderDetails = activeView !== 'home';
```

分别用 `{showHeaderDetails && (...)}` 包裹品牌副标题、`.header-actions` 和 `.header-badges`，品牌图标及标题继续显示。

- [ ] **Step 2: 调整工具网格响应式列数**

默认规则改为：

```css
.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
```

在 `@media (max-width: 1020px)` 中增加：

```css
.tool-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
```

保留 `@media (max-width: 680px)` 中现有的单列规则。

- [ ] **Step 3: 运行回归测试并确认通过**

Run: `cd frontend && npm test`

Expected: `2` tests passed, `0` failed.

- [ ] **Step 4: 运行完整前端构建**

Run: `cd frontend && npm run build`

Expected: TypeScript 检查与 Vite 构建完成，退出码为 `0`。

- [ ] **Step 5: 在浏览器验证实际布局**

启动开发服务器，在首页检查：标题保留；副标题、导航栏、右侧徽章不渲染；桌面宽度显示 3 列。缩放至 1020px 以下和 680px 以下，分别确认 2 列和 1 列；进入任一工具页确认完整头部恢复。

- [ ] **Step 6: 提交实现**

```bash
git add frontend/src/main.tsx frontend/src/styles.css
git commit -m "feat: 精简首页并改为三列入口"
```
