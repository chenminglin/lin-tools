import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const themeSource = await readFile(new URL('../src/theme.css', import.meta.url), 'utf8');

test('首页隐藏工具导航和底部栏，工具页继续显示', () => {
  assert.match(mainSource, /const showHeaderDetails = activeView !== 'home';/);
  assert.match(mainSource, /showHeaderDetails && \(\s*<div className="header-actions">/);
  assert.match(mainSource, /showHeaderDetails && \(\s*<footer className="footer">/);
});

test('工具入口按桌面三列、平板两列、手机一列响应', () => {
  assert.match(stylesSource, /\.tool-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(stylesSource, /@media \(max-width:\s*1020px\)[\s\S]*?\.tool-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(stylesSource, /@media \(max-width:\s*680px\)[\s\S]*?\.tool-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
});

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

test('角色插画不继承 Lucide 图标底板', () => {
  assert.match(mainSource, /className=\{`tool-icon\$\{failed \? '' : ' character'\}`\}/);
  assert.match(themeSource, /\.tool-entry \.tool-icon\.character\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border:\s*0\s*!important;/s);
});

test('品牌图标使用 Media Lab 角色应用图标', () => {
  assert.match(mainSource, /className="brand-icon character"/);
  assert.match(mainSource, /src="\/icons\/app\/icon-64\.png\?v=media-lab-1"/);
  assert.match(themeSource, /\.brand-icon\.character\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border:\s*0\s*!important;/s);
});
