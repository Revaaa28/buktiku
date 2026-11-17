// BuktiKu — design screenshot helper (dev-only, not shipped logic).
// Serves public/ on :3100, loads the page in Chromium via the local
// proxy relay, clicks the first sample + Check, waits for results,
// and saves full-page + viewport screenshots under scripts/shots/.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3100;
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const { chromium } = require('playwright-core');
  const server = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await new Promise(r => setTimeout(r, 1200));
    const browser = await chromium.launch({
      executablePath: '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome',
      args: [
        '--no-sandbox',
        '--proxy-server=http://127.0.0.1:18081',
        '--proxy-bypass-list=localhost;127.0.0.1',
      ],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#samples button', { timeout: 30000 });
    await page.waitForTimeout(1800); // let the hero entrance animation settle
    await page.screenshot({ path: path.join(OUT, '01-hero.png') });
    await page.click('#samples button');
    await page.click('#check');
    await page.waitForSelector('#results-card:not([hidden])', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, '02-results.png'), fullPage: true });
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
    await mobile.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
    await mobile.waitForTimeout(1500);
    await mobile.screenshot({ path: path.join(OUT, '03-mobile.png') });
    await browser.close();
    console.log('shots saved to', OUT);
  } finally {
    server.kill();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
