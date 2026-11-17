// BuktiKu — cloud path: Firebase AI Logic (official Firebase Web SDK).
//
// ALL cloud AI inference in BuktiKu goes through Firebase AI Logic —
// the Gemini API is never called directly and no standalone Gemini API
// key is used anywhere in this app.
//
// The Firebase SDK is loaded from Google's CDN as ES modules only when
// a real (non-placeholder) config is present. In placeholder mode this
// module is never invoked and the router logs why.
//
// App Check: Firebase AI Logic requires App Check. If a reCAPTCHA v3
// site key is configured we use ReCaptchaV3Provider; otherwise we switch
// on the App Check debug token flow (the token is printed to the browser
// console and must be registered in the Firebase console — see README).

import { firebaseConfig, appCheckSiteKey, isPlaceholderConfig } from '../firebase-config.js';

const SDK_VERSION = '12.0.0';
const CDN = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

let initPromise = null;

// Shared Firebase app initialisation — cloud.js (AI Logic) and store.js
// (Firestore history) must use the SAME app instance and App Check
// setup, so the initialiser lives here and is exported for reuse.
export async function initFirebase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const { initializeApp } = await import(`${CDN}/firebase-app.js`);
    const appCheck = await import(`${CDN}/firebase-app-check.js`);
    const aiModule = await import(`${CDN}/firebase-ai.js`);

    const app = initializeApp(firebaseConfig);

    // --- App Check (required by Firebase AI Logic) ---------------------
    let appCheckMode;
    if (appCheckSiteKey) {
      appCheck.initializeAppCheck(app, {
        provider: new appCheck.ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckMode = 'reCAPTCHA v3';
    } else {
      // Debug-token friendly setup for local development: App Check will
      // print a debug token to the console; register it in the Firebase
      // console under App Check > Apps > Manage debug tokens.
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      appCheck.initializeAppCheck(app, {
        provider: new appCheck.CustomProvider({
          getToken: () =>
            Promise.reject(
              new Error(
                'App Check debug token not registered yet — see the token ' +
                  'printed in the browser console and README.md.',
              ),
            ),
        }),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckMode = 'debug token (no site key configured)';
    }

    const ai = aiModule.getAI(app, { backend: new aiModule.GoogleAIBackend() });
    return { app, ai, appCheckMode, aiModule };
  })();
  return initPromise;
}

export function cloudConfigured() {
  return !isPlaceholderConfig();
}

/**
 * Deep semantic check via Firebase AI Logic.
 * Returns { overall, explanations, latencyMs, appCheckMode, model }.
 * Throws on any failure — the router catches, logs honestly, and falls
 * back; a cloud failure is never dressed up as a verdict.
 */
export async function cloudDeepCheck(claim, source, deterministicPoints) {
  const { ai, appCheckMode, aiModule } = await initFirebase();
  const modelName = 'gemini-3.8-flash';
  const model = aiModule.getGenerativeModel(ai, {
    model: modelName,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const started = performance.now();
  const prompt =
    'You are the deep-check stage of a claim checker. The SOURCE text is ' +
    'the only ground truth. The CLAIM is checked against it. Deterministic ' +
    'code has already verified numbers and dates; your job is the semantic ' +
    'layer: dropped conditions, rephrased deadlines, softened requirements, ' +
    'meaning changes. Reply with ONLY JSON of the form ' +
    '{"overall":"Consistent|Partly off|Contradicted",' +
    '"explanations":[{"point":"...","verdict":"matches|not-in-source|contradicted",' +
    '"explanation":"..."}]}.\n\n' +
    `SOURCE:\n${source}\n\nCLAIM:\n${claim}\n\n` +
    `DETERMINISTIC FINDINGS SO FAR:\n${JSON.stringify(
      deterministicPoints.map(p => ({ text: p.text, verdict: p.verdict })),
    )}`;

  // Firebase AI Logic is actually CALLED here at runtime. The call is
  // bounded: a per-attempt timeout plus retries on transient errors
  // (the free-tier endpoint occasionally answers 500 "high demand" or
  // stalls). If every attempt fails we throw and the router logs the
  // skip honestly — a hung cloud call must never hang the whole check.
  const ATTEMPT_TIMEOUT_MS = 45_000;
  const MAX_ATTEMPTS = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await Promise.race([
        model.generateContent(prompt),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Cloud attempt timed out after ${ATTEMPT_TIMEOUT_MS / 1000}s`)),
            ATTEMPT_TIMEOUT_MS,
          ),
        ),
      ]);
      const text = result.response.text();
      const match = String(text).match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Cloud model did not return JSON');
      const parsed = JSON.parse(match[0]);
      return {
        overall: parsed.overall || null,
        explanations: Array.isArray(parsed.explanations) ? parsed.explanations : [],
        latencyMs: Math.round(performance.now() - started),
        appCheckMode,
        model: modelName,
        attempts: attempt,
      };
    } catch (err) {
      lastError = err;
      // Errors that will not clear in seconds are never retried: quota
      // exhaustion, unknown model, bad request, auth failures. (The SDK
      // appends "(AI/fetch-error)" to every failure, so that marker alone
      // must never mark an error transient.)
      if (/quota|404|not found|400|401|403/i.test(err.message || '')) throw err;
      const transient = /500|503|high demand|timed out|unavailable|deadline/i.test(err.message || '');
      if (!transient || attempt === MAX_ATTEMPTS) throw err;
      await new Promise(r => setTimeout(r, attempt * 4000));
    }
  }
  throw lastError;
}
