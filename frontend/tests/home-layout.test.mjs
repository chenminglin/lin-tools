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
  assert.match(mainSource, /showHeaderDetails && \(\s*<footer className="footer">/);
});

test('工具入口按桌面三列、平板两列、手机一列响应', () => {
  assert.match(stylesSource, /\.tool-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(stylesSource, /@media \(max-width:\s*1020px\)[\s\S]*?\.tool-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(stylesSource, /@media \(max-width:\s*680px\)[\s\S]*?\.tool-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
});
