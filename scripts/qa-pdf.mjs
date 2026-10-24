import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:5173/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PDF = resolve(process.cwd(), 'public/samples/fixed-layout.pdf');

await mkdir('shots', { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
});
const page = await context.newPage();

const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
  const url = request.url();
  if (!url.includes('favicon')) errors.push(`requestfailed: ${url} ${request.failure()?.errorText ?? ''}`);
});

async function shot(name) {
  await page.screenshot({ path: `shots/${name}.png` });
  console.log(`shot: ${name}`);
}

async function ensureOverlay() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await page.locator('.reader-top').isVisible().catch(() => false)) return;
    await page.mouse.click(640, 430);
    await page.waitForTimeout(650);
  }
  throw new Error('reader overlay did not become visible');
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

await page.locator('input[type=file]').setInputFiles(PDF);
await page.waitForTimeout(6500);
await shot('p1-library');
console.log('books:', await page.locator('.book-main').count());
console.log('badge:', await page.locator('.book-badge').textContent().catch(() => 'none'));

await page.locator('.book-main').first().click();
await page.waitForTimeout(3200);
await shot('p2-reader');
console.log('canvas:', await page.locator('.pdf-page canvas').evaluate((c) => ({ w: c.width, h: c.height, cssW: c.style.width })));

await page.mouse.click(640, 430);
await page.waitForTimeout(600);
console.log('overlay:', await page.locator('.reader-top').isVisible());
console.log('page label:', await page.locator('.progress-meta .pct').textContent());
await shot('p3-overlay');

await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
const scrollTop = await page.evaluate(() => document.querySelector('.pdf-stage')?.scrollTop ?? 0);
console.log('after first ArrowRight (should scroll):', scrollTop);
await shot('p4-scrolled');

await page.keyboard.press('ArrowRight');
await page.waitForTimeout(800);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(1000);
await ensureOverlay();
console.log('after reaching bottom:', await page.locator('.progress-meta .pct').textContent());
await shot('p4b-page2');

await page.locator('.tool', { hasText: '目录' }).click();
await page.waitForTimeout(600);
const tocItems = page.locator('.toc-item');
const tocCount = await tocItems.count();
console.log('toc items:', tocCount);
console.log('toc first:', (await tocItems.first().textContent())?.trim());
console.log('toc child:', (await tocItems.nth(3).textContent())?.trim());
if (tocCount !== 7) throw new Error(`PDF outline count mismatch: ${tocCount}`);
await shot('p4c-toc');

await tocItems.nth(2).click();
await page.waitForTimeout(1000);
await ensureOverlay();
let pageLabel = await page.locator('.progress-meta .pct').textContent();
console.log('after outline jump:', pageLabel);
if (!pageLabel?.includes('第 3 页')) throw new Error(`outline jump failed: ${pageLabel}`);

// 第四项的目标是 0 起整数页号 3，应换算成第 4 页，不能全部跳到第 1 页
await page.locator('.tool', { hasText: '目录' }).click();
await page.waitForTimeout(500);
await page.locator('.toc-item').nth(4).click();
await page.waitForTimeout(1000);
await ensureOverlay();
pageLabel = await page.locator('.progress-meta .pct').textContent();
console.log('after integer dest jump:', pageLabel);
if (!pageLabel?.includes('第 4 页')) throw new Error(`integer outline dest failed: ${pageLabel}`);

await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await ensureOverlay();
await page.locator('.icon-btn[aria-label="添加书签"]').click();
await page.waitForTimeout(600);
await ensureOverlay();
await page.locator('.tool', { hasText: '书签' }).click();
await page.waitForTimeout(500);
console.log('bookmarks:', await page.locator('.bm-item').count());
console.log('bookmark excerpt:', await page.locator('.bm-quote').textContent().catch(() => 'none'));
await shot('p4d-bookmarks');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await ensureOverlay();
await page.locator('.tool', { hasText: '显示' }).click();
await page.waitForTimeout(500);
await shot('p5-settings');
await page.getByRole('button', { name: '整页' }).click();
await page.waitForTimeout(1000);
await shot('p5b-fit-page');
await page.getByRole('button', { name: '适宽' }).click();
await page.waitForTimeout(700);

await page.getByRole('button', { name: '夜间' }).click();
await page.waitForTimeout(900);
await shot('p6-night');

await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await shot('p7-night-page');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3400);
await ensureOverlay();
console.log('after reload:', await page.locator('.progress-meta .pct').textContent());
await shot('p8-resume');

await page.getByRole('button', { name: '返回书架' }).click();
await page.waitForTimeout(800);
await shot('p9-library-night');

console.log('errors:', errors.length ? errors : 'none');
if (errors.length) throw new Error('console/page errors during PDF QA');
await browser.close();
