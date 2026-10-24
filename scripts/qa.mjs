import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:5173/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EPUB = resolve(process.cwd(), 'public/samples/slow-reading.epub');

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

async function typography() {
  return page.evaluate(() => {
    const frame = document.querySelector('.reader-mount iframe');
    const body = frame?.contentDocument?.body;
    if (!body) return null;
    const style = getComputedStyle(body);
    return {
      family: style.fontFamily,
      size: style.fontSize,
      lineHeight: style.lineHeight,
      width: body.clientWidth,
      color: style.color,
      background: style.backgroundColor,
    };
  });
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await shot('01-empty');

await page.locator('input[type=file]').setInputFiles(EPUB);
await page.waitForTimeout(2600);
await shot('02-library');
console.log('books:', await page.locator('.book-main').count());

await page.locator('.book-main').first().click();
await page.waitForTimeout(2800);
await shot('03-reader');
console.log('frames:', page.frames().length);
console.log('typography:', JSON.stringify(await typography()));

await ensureOverlay();
console.log('overlay visible:', await page.locator('.reader-top').isVisible());
await shot('04-overlay');

await page.getByRole('button', { name: '目录' }).click();
await page.waitForTimeout(500);
await shot('05-toc');
console.log('toc items:', await page.locator('.toc-item').count());

await page.locator('.toc-item').nth(2).click();
await page.waitForTimeout(1200);
await ensureOverlay();
await shot('06-chapter3');
console.log('after jump ->', await page.locator('.reader-title .s').textContent());

// 脚注跳转与「返回上一处」
await page.locator('.tool', { hasText: '目录' }).click();
await page.waitForTimeout(500);
await page.locator('.toc-item').nth(1).click();
await page.waitForTimeout(1000);
const footnoteClicked = await page.evaluate(() => {
  const anchor = document
    .querySelector('.reader-mount iframe')
    ?.contentDocument?.querySelector('a[href="#fn1"]');
  if (!anchor) return false;
  anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
});
if (!footnoteClicked) throw new Error('footnote anchor not found in sample chapter 2');
await page.waitForTimeout(800);
await ensureOverlay();
await page.waitForTimeout(600);
const backChipVisible = await page.locator('.back-chip').isVisible();
console.log('footnote back chip:', backChipVisible);
if (!backChipVisible) throw new Error('footnote back chip not shown');
await page.locator('.back-chip').click();
await page.waitForTimeout(700);
await ensureOverlay();
const backChipAfterReturn = await page.locator('.back-chip').isVisible().catch(() => false);
console.log('back chip after return:', backChipAfterReturn);
if (backChipAfterReturn) throw new Error('back stack not cleared after returning');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await ensureOverlay();
await page.locator('.tool', { hasText: '排版' }).click();
await page.waitForTimeout(500);
await shot('07-settings');

await page.getByRole('button', { name: '夜间' }).click();
await page.waitForTimeout(900);
await shot('08-night-settings');

await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await shot('09-night-reader');
console.log('night typography:', JSON.stringify(await typography()));

await ensureOverlay();
await page.locator('.tool', { hasText: '排版' }).click();
await page.waitForTimeout(400);
await page.locator('.stepper button[aria-label="增大字号"]').click();
await page.waitForTimeout(900);
console.log('after font+ ->', JSON.stringify(await typography()));
await shot('10-font-larger');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await ensureOverlay();
await page.locator('.tool', { hasText: '书签' }).click();
await page.waitForTimeout(600);
console.log('bookmarks (empty):', await page.locator('.bm-item').count());
await shot('11-bookmarks-empty');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await ensureOverlay();
await page.locator('.icon-btn[aria-label="添加书签"]').click();
await page.waitForTimeout(700);
await ensureOverlay();
await page.locator('.tool', { hasText: '书签' }).click();
await page.waitForTimeout(600);
console.log('bookmarks after add:', await page.locator('.bm-item').count());
await shot('12-bookmarks');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

await ensureOverlay();
const percentBefore = await page.locator('.progress-meta .pct').textContent();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(900);
const percentAfter = await page.locator('.progress-meta .pct').textContent();
console.log(`page turn: ${percentBefore} -> ${percentAfter}`);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2600);
await shot('13-reload-resume');
await ensureOverlay();
console.log('progress after reload:', await page.locator('.progress-meta .pct').textContent());
await shot('14-resume-overlay');

// 先走到全书末尾，再回书架，验证「已读完」不会被后续进度保存改回「在读」
for (let index = 0; index < 12; index += 1) {
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(450);
  const pct = (await page.locator('.progress-meta .pct').textContent())?.trim();
  if (pct === '100%') break;
}
await page.waitForTimeout(1200);
await ensureOverlay();
const endPercent = (await page.locator('.progress-meta .pct').textContent())?.trim();
console.log('end percent:', endPercent);
if (endPercent !== '100%') throw new Error(`did not reach end of sample: ${endPercent}`);
await shot('14b-end');

await page.getByRole('button', { name: '返回书架' }).click();
await page.waitForTimeout(1200);
await shot('15-library-night');

// 已读完的书再次保存进度（例如刷新后继续停在末页）不能掉回「在读」
const libraryStatus = await page.evaluate(async () => {
  const request = indexedDB.open('read-db');
  const db = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return await new Promise((resolve, reject) => {
    const getAll = db.transaction('books', 'readonly').objectStore('books').getAll();
    getAll.onsuccess = () => resolve(getAll.result.map((book) => ({ title: book.title, status: book.status })));
    getAll.onerror = () => reject(getAll.error);
  });
});
console.log('library status:', JSON.stringify(libraryStatus));
const finishedFlag = (await page.locator('.book-flag').first().textContent())?.trim();
console.log('library flag:', finishedFlag);
if (finishedFlag !== '已读完') throw new Error(`finished flag lost after reopen: ${finishedFlag}`);
if (libraryStatus.some((book) => book.status !== 'finished')) {
  throw new Error(`finished status lost in IndexedDB: ${JSON.stringify(libraryStatus)}`);
}

console.log('errors:', errors.length ? errors : 'none');
if (errors.length) throw new Error('console/page errors during EPUB QA');
await browser.close();
