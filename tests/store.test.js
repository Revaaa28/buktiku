// BuktiKu — Firestore document-shape tests (node:test, no dependencies).
// Only the pure document builder is tested here; live Firestore reads
// and writes are verified end-to-end by scripts/verify-store.cjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCheckDocument } from '../public/lib/store.js';

test('buildCheckDocument keeps claim, source, overall and points', () => {
  const doc = buildCheckDocument('Claim A', 'Source B', {
    overall: 'Contradicted',
    cloudRan: true,
    points: [
      {
        text: 'Number in claim: 50',
        verdict: 'matches',
        engine: 'deterministic',
        evidence: 'offers 50 scholarships',
        latencyMs: 3,
      },
    ],
  });
  assert.equal(doc.claim, 'Claim A');
  assert.equal(doc.source, 'Source B');
  assert.equal(doc.overall, 'Contradicted');
  assert.equal(doc.cloudRan, true);
  assert.equal(doc.points.length, 1);
  assert.equal(doc.points[0].evidence, 'offers 50 scholarships');
  assert.equal(doc.points[0].latencyMs, 3);
});

test('buildCheckDocument null-fills optional point fields', () => {
  const doc = buildCheckDocument('c', 's', {
    overall: 'Consistent',
    points: [{ text: 't', verdict: 'matches', engine: 'deterministic' }],
  });
  assert.equal(doc.cloudRan, false);
  assert.equal(doc.points[0].evidence, null);
  assert.equal(doc.points[0].explanation, null);
  assert.equal(doc.points[0].reason, null);
  assert.equal(doc.points[0].extractedBy, null);
});

test('buildCheckDocument tolerates a result without points', () => {
  const doc = buildCheckDocument('c', 's', { overall: 'Consistent' });
  assert.deepEqual(doc.points, []);
});

test('buildCheckDocument stores source provenance when fetched from a link', () => {
  const withMeta = buildCheckDocument('C', 'S', { overall: 'Consistent', points: [] },
    { url: 'https://news.example/a', title: 'Judul Berita' });
  assert.equal(withMeta.sourceUrl, 'https://news.example/a');
  assert.equal(withMeta.sourceTitle, 'Judul Berita');
  const noMeta = buildCheckDocument('C', 'S', { overall: 'Consistent', points: [] });
  assert.equal(noMeta.sourceUrl, null);
  assert.equal(noMeta.sourceTitle, null);
});
