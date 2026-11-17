// BuktiKu — live Firestore history verification driver (dev tool).
// Runs a real check in Chromium (persistent profile, registered App
// Check debug token), waits for the "Saved to your history" status,
// reloads the page, and confirms the saved check is listed again and
// restores its stored verdict on click. Proves: anonymous auth,
// Firestore write, security rules, read-after-reload, restore path.
const { chromium } = require('playwright-core');
const { spawn } = require('node:child_process');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const PORT = 3100;
const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome';

async function main() {
  const server = spawn('node', ['server.js'], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  const cleanup = () => { try { server.kill(); } catch {} };
  process.on('exit', cleanup);
  await new Promise(r => setTimeout(r, 1200));

  const ctx = await chromium.launchPersistentContext(
    path.join(__dirname, '.pw-profile'),
    {
      executablePath: CHROME,
      args: ['--no-sandbox'],
      proxy: { server: 'http://127.0.0.1:18081', bypass: 'localhost,127.0.0.1' },
      ignoreHTTPSErrors: true,
    },
  );
  const browser = ctx.browser();
  const page = await ctx.newPage();
  const lines = [];
  page.on('console', m => { if (m.type() === 'error') lines.push(`[console error] ${m.text()}`); });
  page.on('pageerror', e => lines.push(`[pageerror] ${e.message}`));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }); } catch {}
  try { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
  const keepAlive = setInterval(() => { page.evaluate(() => 1).catch(() => {}); }, 15000);

  const status = async () => page.evaluate(() => document.querySelector('#history-status')?.innerText || '(none)');
  const itemCount = async () => page.evaluate(() => document.querySelectorAll('.history-item').length);

  try {
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#samples button', { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('#history-card')?.hidden, { timeout: 60000 });
    lines.push(`history card visible; initial status: "${await status()}"`);
    const before = await itemCount();

    await page.click('#samples button');
    await page.click('#check');
    await page.waitForFunction(
      () => document.querySelector('#history-status')?.innerText.includes('Saved to your history'),
      { timeout: 180000 },
    ).catch(() => {});
    lines.push(`after check: status = "${await status()}"`);
    const afterSave = await itemCount();
    lines.push(`history items: before=${before} after-save=${afterSave}`);

    await page.reload({ waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('#history-card')?.hidden, { timeout: 60000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.history-item').length > 0,
      { timeout: 60000 },
    ).catch(() => {});
    const afterReload = await itemCount();
    lines.push(`after reload: items=${afterReload}; status = "${await status()}"`);

    let restored = '(not attempted)';
    if (afterReload > 0) {
      await page.click('.history-item');
      await page.waitForTimeout(800);
      restored = await page.evaluate(() => {
        const o = document.querySelector('#overall');
        const hidden = document.querySelector('#results-card')?.hidden;
        return `overall="${o?.innerText}" results-hidden=${hidden} claim-prefix="${document.querySelector('#claim')?.value.slice(0, 40)}"`;
      });
    }
    lines.push(`restore on click: ${restored}`);
    const pass = afterSave > before && afterReload >= afterSave && restored.includes('results-hidden=false');
    lines.push(pass ? 'STORE VERIFY: PASS' : 'STORE VERIFY: FAIL');
  } finally {
    clearInterval(keepAlive);
  }
  for (const l of lines) console.log(l.slice(0, 500));
  await browser.close();
  cleanup();
  process.exit(0);
}

main().catch(e => { console.error('DRIVER FAILED:', e.message); process.exit(1); });
