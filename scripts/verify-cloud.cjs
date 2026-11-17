// BuktiKu — live cloud verification driver (dev tool, not shipped).
// Serves the app locally, drives a real Chromium through the egress
// relay, runs the scholarship sample through the hybrid router, and
// prints the routing log + browser console so a human can see exactly
// what the cloud stage did (or why it was skipped).
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

  // Persistent profile: the App Check debug token is generated once and
  // stored in localStorage — a fresh context would mint a new token on
  // every run and the console-registered one would never match.
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
  const consoleLines = [];
  page.on('console', m => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => consoleLines.push(`[pageerror] ${e.message}`));
  const t0 = Date.now();
  page.on('request', r => {
    const u = r.url();
    if (u.includes('googleapis.com') || u.includes('firebase') || u.includes('gstatic')) {
      consoleLines.push(`[req +${Math.round((Date.now() - t0) / 1000)}s] ${r.method()} ${u.slice(0, 130)}`);
    }
  });
  page.on('response', r => {
    const u = r.url();
    if (u.includes('googleapis.com') || u.includes('firebase') || u.includes('gstatic')) {
      consoleLines.push(`[net +${Math.round((Date.now() - t0) / 1000)}s] ${r.status()} ${u.slice(0, 130)}`);
    }
  });
  page.on('requestfailed', r => {
    consoleLines.push(`[net FAIL] ${r.failure()?.errorText} ${r.url().slice(0, 130)}`);
  });

  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  // Keep the page in the foreground/active lifecycle state: a frozen
  // headless page suspends setTimeout, which silently disables the
  // app's own cloud-attempt timeouts and makes a stalled request look
  // like an infinite hang. Real user browsers are foreground; the
  // harness must simulate that.
  try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }); } catch {}
  try { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
  const servedCloud = await page.evaluate(async () => {
    const t = await (await fetch('/lib/cloud.js')).text();
    return t.includes('ATTEMPT_TIMEOUT') ? 'new (timeout code present)' : 'OLD (no timeout code)';
  });
  consoleLines.push(`[driver] served cloud.js: ${servedCloud}`);
  await page.waitForSelector('#samples button', { timeout: 30000 });
  await page.click('#samples button'); // first sample = scholarship
  await page.click('#check');
  // Keep-alive pings: an evaluate round-trip every 15s keeps the
  // renderer thawed so page timers (the app's timeout race) can fire.
  const keepAlive = setInterval(() => { page.evaluate(() => 1).catch(() => {}); }, 15000);
  try {
    await page.waitForFunction(
      () => document.querySelector('#routing-log')?.innerText.includes('Firebase AI Logic'),
      { timeout: 240000 },
    );
  } catch {
    const btn = await page.evaluate(() => document.querySelector('#check')?.textContent);
    consoleLines.push(`[driver] routing log never mentioned Firebase AI Logic within 240s; check button text: "${btn}"`);
    try {
      const alive = await Promise.race([
        page.evaluate(() => new Promise(r => setTimeout(() => r('timer-alive'), 1000))),
        new Promise((_, rej) => setTimeout(() => rej(new Error('probe-timeout')), 8000)),
      ]);
      consoleLines.push(`[driver] page timer probe: ${alive}`);
    } catch (e) {
      consoleLines.push(`[driver] page timer probe FAILED: ${e.message} (page main thread/timers appear frozen)`);
    }
  }
  clearInterval(keepAlive);
  const logText = await page.evaluate(() => document.querySelector('#routing-log')?.innerText || '(no log)');
  const overall = await page.evaluate(() => document.querySelector('#overall')?.innerText || '(none)');
  const cloudStatus = await page.evaluate(() => document.querySelector('#st-cloud')?.innerText || '(none)');
  console.log('=== OVERALL ==='); console.log(overall);
  console.log('=== CLOUD STATUS LINE ==='); console.log(cloudStatus);
  console.log('=== ROUTING LOG ==='); console.log(logText);
  console.log('=== CONSOLE ===');
  for (const line of consoleLines) console.log(line.slice(0, 600));
  await browser.close();
  cleanup();
  process.exit(0);
}

main().catch(e => { console.error('DRIVER FAILED:', e.message); process.exit(1); });
