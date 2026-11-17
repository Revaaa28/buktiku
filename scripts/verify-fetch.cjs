// BuktiKu — end-to-end check of link fetching + source attribution.
// Serves the app, fetches a real page through the UI, runs a check, and
// asserts the Result card names the article (title + link) it used.
const { spawn } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3102;

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
      args: ['--no-sandbox', '--proxy-server=http://127.0.0.1:18081', '--proxy-bypass-list=localhost;127.0.0.1'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
    await page.fill('#source-url', 'example.com');
    await page.click('#fetch-source');
    await page.waitForFunction(
      () => document.querySelector('#source').value.length > 50,
      { timeout: 30000 },
    );
    const note = await page.textContent('#fetch-note');
    await page.fill('#claim', 'This domain is for use in documentation examples.');
    await page.click('#check');
    await page.waitForSelector('#results-card:not([hidden])', { timeout: 60000 });
    await page.waitForTimeout(800);
    const attrib = await page.evaluate(() => {
      const el = document.querySelector('#source-attrib');
      const a = el.querySelector('a');
      return { hidden: el.hidden, text: el.textContent, href: a ? a.href : null };
    });
    console.log('fetch note:', note.trim());
    console.log('attribution:', JSON.stringify(attrib));
    const pass = !attrib.hidden
      && attrib.text.includes('Example Domain')
      && attrib.href === 'https://example.com/';
    console.log(pass ? 'VERIFY-FETCH: PASS' : 'VERIFY-FETCH: FAIL');
    await page.screenshot({ path: path.join(__dirname, 'shots', '04-attrib.png') });
    await browser.close();
    if (!pass) process.exitCode = 1;
  } finally {
    server.kill();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
