import { chromium } from 'playwright';

const CHROMIUM_PATH = '/Users/vetruvian/Library/Caches/ms-playwright/chromium-1200/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

async function run() {
  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  const page = await browser.newPage();
  page.on('console', msg => {
    console.log(`[console:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    console.error('[pageerror]', err);
  });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(15000);
  await browser.close();
}

run().catch(err => {
  console.error('Playwright script failed', err);
  process.exit(1);
});
