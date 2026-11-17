// BuktiKu — UI wiring. All checking logic lives in lib/ (engine, nano,
// cloud, router); this file only renders state — including honest
// fallback states. If a model did not run, the UI says so.

import { SAMPLES } from './lib/samples.js';
import { HybridRouter } from './lib/router.js';
import { detectNano } from './lib/nano.js';
import { cloudConfigured } from './lib/cloud.js';
import { saveCheck, listChecks } from './lib/store.js';

const $ = id => document.getElementById(id);
const claimEl = $('claim');
const sourceEl = $('source');
const router = new HybridRouter();
let nanoStatus = null;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function updateCounts() {
  $('claim-count').textContent = claimEl.value.length;
  $('source-count').textContent = sourceEl.value.length;
}
claimEl.addEventListener('input', updateCounts);
sourceEl.addEventListener('input', updateCounts);

// ------------------------------------------------- fetch source from a link
// The server reduces the page to readable text; the text lands in the
// Source box, visible and editable — the check uses exactly what is there.
$('fetch-source').addEventListener('click', async () => {
  const note = $('fetch-note');
  const btn = $('fetch-source');
  const url = $('source-url').value.trim();
  note.hidden = false;
  if (!url) {
    note.textContent = 'Paste a link first — the Fetch button reads that page as your source.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Fetching…';
  note.textContent = 'Fetching the page…';
  try {
    const res = await fetch('/api/fetch-source', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Fetch failed.');
    sourceEl.value = data.text;
    sourceEl.dispatchEvent(new Event('input'));
    let host = '';
    try { host = new URL(data.finalUrl).hostname; } catch { /* note stays generic */ }
    note.textContent =
      `Fetched from ${host || 'the page'} — ${data.text.length.toLocaleString()} characters now in the Source box` +
      (data.truncated ? ' (the page was long; the text was trimmed to the first 50,000 characters)' : '') +
      '. Read it before you check — the check uses exactly what is in the box.';
  } catch (err) {
    note.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fetch';
  }
});

// ------------------------------------------------------------- samples
for (const s of SAMPLES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = s.label;
  b.addEventListener('click', () => {
    claimEl.value = s.claim;
    sourceEl.value = s.source;
    updateCounts();
    $('form-error').hidden = true;
  });
  $('samples').appendChild(b);
}

// -------------------------------------------------------------- status
async function refreshStatus() {
  nanoStatus = await detectNano();
  $('st-nano').textContent = nanoStatus.available
    ? 'available'
    : 'not in this browser — desktop Chrome only';
  $('st-online').textContent = navigator.onLine ? 'online' : 'offline';
  const configured = cloudConfigured();
  $('st-cloud').textContent = configured
    ? 'configured'
    : 'placeholder mode — no Firebase project connected yet';

  const note = $('fallback-note');
  const parts = [];
  if (!configured) parts.push('Cloud model unavailable — deterministic checks only');
  if (!nanoStatus.available) parts.push('Gemini Nano\'s web API ships in desktop Chrome only — on this browser its extraction stage is skipped and the cloud + code engines carry the check');
  if (!navigator.onLine) parts.push('you are offline — local checks still run');
  if (parts.length) {
    note.textContent = 'Honest status: ' + parts.join('; ') + '. Nothing here is simulated or faked.';
    note.hidden = false;
  } else {
    note.hidden = true;
  }
}
window.addEventListener('online', refreshStatus);
window.addEventListener('offline', refreshStatus);
refreshStatus();

// --------------------------------------------------------------- check
function renderResults({ overall, points }) {
  $('results-card').hidden = false;
  const overallEl = $('overall');
  overallEl.textContent = overall;
  overallEl.className = 'badge ' + overall.toLowerCase().replace(/\s+/g, '-');
  overallEl.classList.toggle('consistent', overall === 'Consistent');
  overallEl.classList.toggle('contradicted', overall === 'Contradicted');

  $('results').innerHTML = points
    .map((p, i) => {
      const badge =
        `engine: ${esc(p.engine)}` +
        (p.extractedBy ? ` · extracted by: ${esc(p.extractedBy)}` : '') +
        ` · ${p.latencyMs != null ? p.latencyMs + ' ms' : '—'}`;
      return `<div class="point ${esc(p.verdict)}" style="animation-delay:${Math.min(i * 90, 630)}ms">
        <p class="ptext"><span class="verdict-chip">${esc(p.verdict)}</span>
        <span class="route-badge">${badge}</span></p>
        <p class="ptext">${esc(p.text)}</p>
        ${p.evidence ? `<p class="evidence">Source evidence: “${esc(p.evidence)}”</p>` : '<p class="evidence">No matching evidence in the source.</p>'}
        ${p.reason ? `<p class="evidence">Why this engine: ${esc(p.reason)}</p>` : ''}
        ${p.explanation ? `<p class="explanation">Cloud explanation: ${esc(p.explanation)}</p>` : ''}
      </div>`;
    })
    .join('');
}

function renderLog() {
  if (!router.log.length) return;
  const rows = router.log
    .map(
      e => `<tr>
        <td>${esc(new Date(e.at).toLocaleTimeString())}</td>
        <td>${esc(e.engine)}</td>
        <td>${esc(e.reason)}</td>
        <td>${e.latencyMs != null ? e.latencyMs + ' ms' : '—'}</td>
      </tr>`,
    )
    .join('');
  $('routing-log').innerHTML =
    `<table class="log"><thead><tr><th>Time</th><th>Engine</th><th>Decision / reason</th><th>Latency</th></tr></thead><tbody>${rows}</tbody></table>`;
}

$('check').addEventListener('click', async () => {
  const claim = claimEl.value.trim();
  const source = sourceEl.value.trim();
  const err = $('form-error');
  if (!claim || !source) {
    err.textContent = 'Please paste both a claim and its source.';
    err.hidden = false;
    return;
  }
  err.hidden = true;
  const btn = $('check');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const result = await router.check(claim, source, { nanoStatus, online: navigator.onLine });
    renderResults(result);
    // Bring the outcome to the person: after the response completes,
    // focus and view land on the verdict, not on the spinner's ghost.
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('results-h').focus({ preventScroll: true });
    $('results-card').scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    renderLog();
    refreshStatus();
    persistCheck(claim, source, result);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check the claim';
  }
});

// ---------------------------------------------------- saved checks (Firestore)
function badgeClass(overall) {
  return 'badge mini ' + String(overall).toLowerCase().replace(/\s+/g, '-');
}

function renderHistory(items) {
  const box = $('history');
  if (!items.length) {
    box.innerHTML = '<p class="note">No saved checks yet — run your first check above.</p>';
    return;
  }
  box.innerHTML = '';
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'history-item';
    const when = item.createdAtMs ? new Date(item.createdAtMs).toLocaleString() : 'just now';
    b.innerHTML =
      `<span class="${esc(badgeClass(item.overall))}">${esc(item.overall)}</span>` +
      `<span class="h-claim">${esc(item.claim)}</span>` +
      `<span class="h-time">${esc(when)}</span>`;
    b.addEventListener('click', () => {
      claimEl.value = item.claim;
      sourceEl.value = item.source;
      updateCounts();
      renderResults({ overall: item.overall, points: item.points || [] });
      $('history-status').textContent =
        `Showing the saved check from ${when} — stored verdict re-rendered, no engine was re-run.`;
      $('results-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    box.appendChild(b);
  }
}

async function loadHistory() {
  if (!cloudConfigured()) return; // placeholder mode: no Firestore, card stays hidden
  $('history-card').hidden = false;
  try {
    const items = await listChecks();
    renderHistory(items);
    $('history-status').textContent = items.length
      ? `${items.length} saved check(s) in your private history.`
      : 'Your history is ready — checks you run will be saved here.';
  } catch (e) {
    $('history-status').textContent = `History unavailable: ${e.message}`;
  }
}

async function persistCheck(claim, source, result) {
  if (!cloudConfigured()) return;
  $('history-card').hidden = false;
  try {
    await saveCheck(claim, source, result);
    $('history-status').textContent = 'Saved to your history just now.';
    loadHistory();
  } catch (e) {
    $('history-status').textContent =
      `This check was NOT saved (${e.message}). The check itself is unaffected.`;
  }
}

loadHistory();
updateCounts();

// ------------------------------------------------- hero chip parallax
// The floating verdict chips drift against the pointer. Uses the CSS
// `translate` property so it composes with their float animation.
// Fine pointers only, and never under reduced-motion.
{
  const hero = document.querySelector('.hero');
  const chips = document.querySelectorAll('.chip');
  const fine = window.matchMedia('(pointer: fine)').matches;
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (hero && chips.length && fine && !calm) {
    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      chips.forEach((c, i) => {
        const d = (i + 1) * 8;
        c.style.translate = `${(-x * d).toFixed(1)}px ${(-y * d).toFixed(1)}px`;
      });
    });
  }
}

// ------------------------------------------------------- scroll reveal
// Cards fade/rise in as they enter the viewport. The hidden state is
// only ever applied from here, so a no-JS visit sees everything.
{
  const cards = document.querySelectorAll('.card, .sec');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('revealed');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.08 },
    );
    for (const c of cards) {
      c.classList.add('reveal-init');
      io.observe(c);
    }
    // Safety net: nothing may stay hidden if the observer misbehaves.
    setTimeout(() => cards.forEach(c => c.classList.add('revealed')), 2500);
  }
}
