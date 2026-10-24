import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:5173/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UTF8 = resolve(process.cwd(), 'public/samples/shanhai-utf8.txt');
const GBK = resolve(process.cwd(), 'public/samples/shanhai-gbk.txt');

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

async function readerText() {
  return page.evaluate(() => {
    const doc = document.querySelector('.reader-mount iframe')?.contentDocument;
    return (doc?.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 60);
  });
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

await page.locator('input[type=file]').setInputFiles(UTF8);
await page.waitForTimeout(2600);
console.log('books:', await page.locator('.book-main').count());
console.log('title:', await page.locator('.book-title').first().textContent());
console.log('author:', await page.locator('.book-author').first().textContent());
console.log('badge:', await page.locator('.book-badge').first().textContent());
await shot('t1-library');

await page.locator('.book-main').first().click();
await page.waitForTimeout(2600);
console.log('reader text:', await readerText());
await shot('t2-reader');

await page.mouse.click(640, 430);
await page.waitForTimeout(600);
console.log('chapter:', await page.locator('.reader-title .s').textContent());
await shot('t3-overlay');

await page.locator('.tool', { hasText: '目录' }).click();
await page.waitForTimeout(500);
console.log('toc items:', await page.locator('.toc-item').count());
await shot('t4-toc');

await page.locator('.toc-item').nth(4).click();
await page.waitForTimeout(1200);
await page.mouse.click(640, 430);
await page.waitForTimeout(600);
console.log('after jump:', await page.locator('.reader-title .s').textContent());
console.log('percent:', await page.locator('.progress-meta .pct').textContent());
await shot('t5-chapter5');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2600);
await ensureOverlay();
console.log('resume chapter:', await page.locator('.reader-title .s').textContent());
console.log('resume percent:', await page.locator('.progress-meta .pct').textContent());
await shot('t6-resume');

await page.getByRole('button', { name: '返回书架' }).click();
await page.waitForTimeout(800);

await page.locator('input[type=file]').setInputFiles(GBK);
await page.waitForTimeout(2600);
console.log('books after gbk:', await page.locator('.book-main').count());
await shot('t7-library-gbk');

await page.locator('.book-main').nth(1).click();
await page.waitForTimeout(2600);
console.log('gbk reader text:', await readerText());
await page.mouse.click(640, 430);
await page.waitForTimeout(600);
console.log('gbk chapter:', await page.locator('.reader-title .s').textContent());
await shot('t8-gbk-reader');

console.log('errors:', errors.length ? errors : 'none');
if (errors.length) throw new Error('console/page errors during TXT QA');
await browser.close();
