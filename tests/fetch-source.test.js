import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFetchUrl, extractText, fetchSource } from '../lib/fetch-source.js';

test('validateFetchUrl accepts a public https URL', () => {
  const r = validateFetchUrl('https://example.com/news/1');
  assert.equal(r.ok, true);
  assert.equal(r.url.hostname, 'example.com');
});

test('validateFetchUrl rejects non-http schemes and garbage', () => {
  assert.equal(validateFetchUrl('ftp://example.com/x').ok, false);
  assert.equal(validateFetchUrl('not a url').ok, false);
  assert.equal(validateFetchUrl('').ok, false);
});

test('validateFetchUrl rejects local and private addresses', () => {
  assert.equal(validateFetchUrl('http://localhost:3000/').ok, false);
  assert.equal(validateFetchUrl('http://127.0.0.1/admin').ok, false);
  assert.equal(validateFetchUrl('http://192.168.1.1/').ok, false);
  assert.equal(validateFetchUrl('http://10.0.0.5/').ok, false);
  assert.equal(validateFetchUrl('http://172.16.0.9/').ok, false);
  assert.equal(validateFetchUrl('http://172.32.0.9/').ok, true); // public range
});

test('extractText strips scripts, styles and chrome, keeps paragraphs', () => {
  const html = `<html><head><title>Big &amp; News</title><style>.x{}</style></head>
  <body><nav>menu</nav><script>evil()</script>
  <p>First para with Rp 10,000,000.</p><p>Second&nbsp;para.</p>
  <footer>bye</footer></body></html>`;
  const { title, text } = extractText(html);
  assert.equal(title, 'Big & News');
  assert.match(text, /First para with Rp 10,000,000\./);
  assert.match(text, /Second para\./);
  assert.doesNotMatch(text, /evil|menu|bye/);
});

test('fetchSource extracts HTML via the injected fetch', async () => {
  const stub = async () => ({
    ok: true, status: 200, url: 'https://example.com/a',
    headers: { get: () => 'text/html; charset=utf-8' },
    text: async () => '<title>T</title><p>Hello source.</p>',
  });
  const r = await fetchSource('https://example.com/a', stub);
  assert.equal(r.ok, true);
  assert.equal(r.title, 'T');
  assert.match(r.text, /Hello source\./);
});

test('fetchSource passes plain text through and reports HTTP errors', async () => {
  const plain = async () => ({
    ok: true, status: 200, url: 'https://example.com/a.txt',
    headers: { get: () => 'text/plain' },
    text: async () => 'raw source text',
  });
  const r1 = await fetchSource('https://example.com/a.txt', plain);
  assert.equal(r1.text, 'raw source text');
  const failing = async () => ({
    ok: false, status: 404, url: 'https://example.com/x',
    headers: { get: () => 'text/html' },
    text: async () => '',
  });
  const r2 = await fetchSource('https://example.com/x', failing);
  assert.equal(r2.ok, false);
  assert.match(r2.error, /404/);
});

test('validateFetchUrl meets public pasting habits halfway', () => {
  const bare = validateFetchUrl('example.com/news/1');
  assert.equal(bare.ok, true);
  assert.equal(bare.url.protocol, 'https:');
  const comma = validateFetchUrl('https://example.com/news/1,');
  assert.equal(comma.ok, true);
  assert.equal(comma.url.pathname, '/news/1');
});
