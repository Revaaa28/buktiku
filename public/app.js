// BuktiKu — UI wiring. All checking logic lives in lib/ (engine, nano,
// cloud, router); this file only renders state — including honest
// fallback states. If a model did not run, the UI says so.

import { SAMPLES } from './lib/samples.js';
import { HybridRouter } from './lib/router.js';
import { detectNano } from './lib/nano.js';
import { cloudConfigured } from './lib/cloud.js';

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
    : `not available (${nanoStatus.status})`;
  $('st-online').textContent = navigator.onLine ? 'online' : 'offline';
  const configured = cloudConfigured();
  $('st-cloud').textContent = configured
    ? 'configured'
    : 'placeholder mode — no Firebase project connected yet';

  const note = $('fallback-note');
  const parts = [];
  if (!configured) parts.push('Cloud model unavailable — deterministic checks only');
  if (!nanoStatus.available) parts.push('on-device Nano unavailable in this browser — its extraction stage is skipped');
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
    .map(p => {
      const badge =
        `engine: ${esc(p.engine)}` +
        (p.extractedBy ? ` · extracted by: ${esc(p.extractedBy)}` : '') +
        ` · ${p.latencyMs != null ? p.latencyMs + ' ms' : '—'}`;
      return `<div class="point ${esc(p.verdict)}">
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
    renderLog();
    refreshStatus();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check the claim';
  }
});

updateCounts();
