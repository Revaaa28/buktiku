import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCloudError } from '../public/lib/router.js';

test('cloud errors are summarised for humans, never dumped raw', () => {
  const raw429 = new Error('AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent: [429 Too Many Requests] You exceeded your current quota {"@type":"type.googleapis.com/google.rpc.QuotaFailure"} ... (hundreds more characters of JSON)');
  const s = summarizeCloudError(raw429);
  assert.match(s, /quota/i);
  assert.ok(s.length < 140, s);
  assert.doesNotMatch(s, /googleapis|@type/);
  assert.match(summarizeCloudError(new Error('Firebase App Check token is invalid [401]')), /App Check/);
  const long = summarizeCloudError(new Error('x'.repeat(500)));
  assert.ok(long.length <= 160, String(long.length));
});
