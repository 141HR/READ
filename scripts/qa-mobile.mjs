import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const EPUB = resolve(process.cwd(), 'public/samples/slow-reading.epub');

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

async function assertNoHorizontalOverflow(target, label) {
  const metrics = await target.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  console.log(`${label} overflow:`, JSON.stringify(metrics));
  if (metrics.scrollWidth > metrics.clientWidth) {
    throw new Error(`${label} has horizontal overflow: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
  }
}

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/m1-empty.png' });

await page.locator('input[type=file]').setInputFiles(EPUB);
await page.waitForTimeout(2400);
await page.screenshot({ path: 'shots/m2-library.png' });

await page.locator('.book-main').first().click();
await page.waitForTimeout(2400);
await page.screenshot({ path: 'shots/m3-reader.png' });
await assertNoHorizontalOverflow(page, 'mobile reader');

await page.touchscreen.tap(195, 420);
await page.waitForTimeout(700);
const pctBefore = await page.locator('.progress-meta .pct').textContent();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.touchscreen.tap(340, 420);
await page.waitForTimeout(800);
await page.touchscreen.tap(195, 420);
await page.waitForTimeout(700);
const pctAfter = await page.locator('.progress-meta .pct').textContent();
console.log(`mobile page turn: ${pctBefore} -> ${pctAfter}`);
if (pctBefore === pctAfter) throw new Error('touch page turn did not change progress');
console.log('overlay:', await page.locator('.reader-top').isVisible());
await page.screenshot({ path: 'shots/m4-overlay.png' });

await page.locator('.tool', { hasText: '目录' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/m5-toc.png' });

await page.locator('.toc-item').nth(1).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: 'shots/m6-chapter2.png' });

await page.touchscreen.tap(195, 420);
await page.waitForTimeout(600);
await page.locator('.tool', { hasText: '排版' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/m7-settings.png' });
await assertNoHorizontalOverflow(page, 'mobile settings');

const typography = await page.evaluate(() => {
  const body = document.querySelector('.reader-mount iframe')?.contentDocument?.body;
  if (!body) return null;
  const style = getComputedStyle(body);
  return { width: body.clientWidth, size: style.fontSize };
});
console.log('mobile typography:', typography);

// PRD 要求 320px 可用：单独开一个窄屏 context，检查书架与正文不横向溢出
const narrowContext = await browser.newContext({
  viewport: { width: 320, height: 640 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
});
const narrowErrors = [];
const narrow = await narrowContext.newPage();
narrow.on('console', (message) => {
  if (message.type() === 'error') narrowErrors.push(`console: ${message.text()}`);
});
narrow.on('pageerror', (error) => narrowErrors.push(`pageerror: ${error.message}`));

await narrow.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await narrow.waitForTimeout(400);
await assertNoHorizontalOverflow(narrow, '320 empty');
await narrow.locator('input[type=file]').setInputFiles(EPUB);
await narrow.waitForTimeout(2400);
await assertNoHorizontalOverflow(narrow, '320 library');
await narrow.locator('.book-main').first().click();
await narrow.waitForTimeout(2400);
await assertNoHorizontalOverflow(narrow, '320 reader');
await narrow.screenshot({ path: 'shots/m8-320-reader.png' });
console.log('320 errors:', narrowErrors.length ? narrowErrors : 'none');
await narrowContext.close();

console.log('errors:', errors.length ? errors : 'none');
if (errors.length || narrowErrors.length) throw new Error('console/page errors during mobile QA');

await browser.close();
