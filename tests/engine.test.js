// BuktiKu — deterministic engine tests (node:test, no dependencies).
// Run with: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractNumbers,
  extractDates,
  compareClaimToSource,
} from '../public/lib/engine.js';
import { SAMPLES } from '../public/lib/samples.js';

const byId = id => SAMPLES.find(s => s.id === id);
const contradicted = (points, needle) =>
  points.some(p => p.verdict === 'contradicted' && p.text.includes(needle));

// ------------------------------------------------------------- extractors

test('extractNumbers parses grouped currency, decimals and percents', () => {
  const nums = extractNumbers('Fee Rp 10,000,000, GPA 3.50, discount 25%');
  const values = nums.map(n => n.value);
  assert.ok(values.includes(10000000), `expected 10000000 in ${values}`);
  assert.ok(values.includes(3.5), `expected 3.5 in ${values}`);
  assert.ok(values.includes(25), `expected 25 in ${values}`);
  assert.equal(nums.find(n => n.value === 10000000).category, 'currency');
  assert.equal(nums.find(n => n.value === 25).category, 'percent');
});

test('extractDates normalises month-name and ISO dates', () => {
  const dates = extractDates('Closes 30 November 2026; opens November 1, 2026; ref 2026-11-05.');
  const isos = dates.map(d => d.iso);
  assert.ok(isos.includes('2026-11-30'), `missing 2026-11-30 in ${isos}`);
  assert.ok(isos.includes('2026-11-01'), `missing 2026-11-01 in ${isos}`);
  assert.ok(isos.includes('2026-11-05'), `missing 2026-11-05 in ${isos}`);
});

// --------------------------------------------------------- sample pairs

test('sample (a) scholarship: altered amount is contradicted', () => {
  const s = byId('scholarship');
  const { points } = compareClaimToSource(s.claim, s.source);
  assert.ok(
    contradicted(points, '15,000,000'),
    `amount mismatch not caught: ${JSON.stringify(points, null, 2)}`,
  );
});

test('sample (a) scholarship: dropped GPA condition is caught', () => {
  const s = byId('scholarship');
  const { points } = compareClaimToSource(s.claim, s.source);
  assert.ok(
    points.some(p => p.kind === 'condition' && p.text.includes('GPA')),
    `GPA condition drop not caught: ${JSON.stringify(points, null, 2)}`,
  );
});

test('sample (a) scholarship: dropped residency condition is caught', () => {
  const s = byId('scholarship');
  const { points } = compareClaimToSource(s.claim, s.source);
  assert.ok(
    points.some(p => p.kind === 'condition' && p.text.includes('East Kalimantan')),
    `residency condition drop not caught: ${JSON.stringify(points, null, 2)}`,
  );
});

test('sample (a) scholarship: overall verdict is Contradicted', () => {
  const s = byId('scholarship');
  const { overall } = compareClaimToSource(s.claim, s.source);
  assert.equal(overall, 'Contradicted');
});

test('sample (b) receipt: inflated reimbursement total is contradicted', () => {
  const s = byId('receipt');
  const { points, overall } = compareClaimToSource(s.claim, s.source);
  assert.ok(
    contradicted(points, '45,000'),
    `total mismatch not caught: ${JSON.stringify(points, null, 2)}`,
  );
  assert.notEqual(overall, 'Consistent');
});

test('sample (b) receipt: the true date still matches', () => {
  const s = byId('receipt');
  const { points } = compareClaimToSource(s.claim, s.source);
  assert.ok(
    points.some(p => p.kind === 'date' && p.verdict === 'matches'),
    `date should match: ${JSON.stringify(points, null, 2)}`,
  );
});

test('sample (c) job: inflated salary is contradicted', () => {
  const s = byId('job');
  const { points } = compareClaimToSource(s.claim, s.source);
  assert.ok(contradicted(points, '12,000,000'), `salary mismatch not caught`);
});

test('sample (c) job: moved deadline is contradicted', () => {
  const s = byId('job');
  const { points } = compareClaimToSource(s.claim, s.source);
  assert.ok(
    points.some(p => p.kind === 'date' && p.verdict === 'contradicted'),
    `deadline mismatch not caught: ${JSON.stringify(points, null, 2)}`,
  );
});

test('sample (c) job: dropped experience requirement is caught', () => {
  const s = byId('job');
  const { points } = compareClaimToSource(s.claim, s.source);
  assert.ok(
    points.some(p => p.kind === 'condition' && p.text.includes('experience')),
    `experience condition drop not caught: ${JSON.stringify(points, null, 2)}`,
  );
});

test('sample (c) job: overall verdict is Contradicted', () => {
  const s = byId('job');
  const { overall } = compareClaimToSource(s.claim, s.source);
  assert.equal(overall, 'Contradicted');
});

// ------------------------------------------------------------- control

test('control: a faithful summary is Consistent', () => {
  const source =
    'PT Sinar Tech offers a Junior Analyst role. Salary: Rp 8,000,000 ' +
    'per month. Apply before 15 December 2026.';
  const claim =
    'PT Sinar Tech offers a Junior Analyst role with salary ' +
    'Rp 8,000,000 per month. Apply before 15 December 2026.';
  const { points, overall } = compareClaimToSource(claim, source);
  assert.equal(
    points.filter(p => p.verdict === 'contradicted').length,
    0,
    `false contradictions: ${JSON.stringify(points, null, 2)}`,
  );
  assert.equal(overall, 'Consistent');
});

test('control: a number absent from the source is flagged not-in-source', () => {
  const { points } = compareClaimToSource(
    'The prize is a 500 percent bonus.',
    'The prize is announced today.',
  );
  assert.ok(points.some(p => p.kind === 'number' && p.verdict === 'not-in-source'));
});

test('names match case-insensitively against raw source text', () => {
  // Source writes the name in lowercase (as a pasted headline would);
  // capitalisation-based extraction sees no names in the source, but the
  // name is plainly there and must not be reported as missing.
  const r = compareClaimToSource(
    'Ijazah Jokowi akan ditindaklanjuti.',
    'katanya ijazah jokowi kau di tindak lanjuti oleh kampus',
  );
  const namePoint = r.points.find(p => p.kind === 'name');
  assert.equal(namePoint.verdict, 'matches');
});

test('Bahasa Indonesia: months, dot-grouped amounts, word multipliers, comma decimals', () => {
  // Indonesian date equals its English twin.
  const dates = extractDates('Pendaftaran ditutup 17 Agustus 2026.');
  assert.equal(dates[0].iso, '2026-08-17');
  // "Rp 15 juta" (word form) equals "Rp 15.000.000" (digit form).
  const a = extractNumbers('senilai Rp 15 juta per semester');
  const b = extractNumbers('sebesar Rp 15.000.000 per semester');
  assert.equal(a[0].value, 15000000);
  assert.equal(a[0].value, b[0].value);
  // Indonesian comma decimal: IPK 3,50 is 3.5.
  const gpa = extractNumbers('IPK minimal 3,50');
  assert.equal(gpa[0].value, 3.5);
});

test('Bahasa Indonesia sample: word-form amount contradicts, wajib condition drops', () => {
  const sample = SAMPLES.find(s => s.id === 'beasiswa-id');
  const r = compareClaimToSource(sample.claim, sample.source);
  const kinds = r.points.map(p => `${p.kind}:${p.verdict}`);
  assert.ok(kinds.some(k => k === 'number:contradicted'), kinds.join(','));
  assert.ok(kinds.some(k => k === 'condition:contradicted'), kinds.join(','));
  assert.equal(r.overall, 'Contradicted');
});
