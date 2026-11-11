# BuktiKu

**Check the claim against its source — offline first.**

BuktiKu is an offline-first claim checker, built for the
[Firebase #BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/)
hackathon. You paste two texts:

- a **claim** — a viral summary, a recruiter's pitch, a reimbursement note; and
- its **source** — the original announcement, receipt, or posting.

BuktiKu checks the claim *against that source only*. There is no open-web
fact-checking and no invented "facts": the source you paste is the ground
truth.

## How hybrid routing works

Every check runs through three layers, and every routing decision is
written to a visible routing log in the UI. A fallback is stated, never
hidden.

1. **Deterministic engine (always, offline, instant).**
   Numbers, dates, names and dropped source conditions are extracted and
   compared by plain code (`public/lib/engine.js`). A number the claim
   changed, a deadline it moved, a condition it quietly dropped — code
   catches these, and code's verdict on numbers and dates always wins
   over any model's.

2. **On-device Gemini Nano (Chrome Prompt API).**
   When the browser exposes the `LanguageModel` API, Nano extracts the
   claim's checkable points locally. *Why on-device:* the texts — which
   may be sensitive documents — never leave the device for this stage;
   it costs no data and works with no signal. Extraction is a small
   task Nano handles well.

3. **Cloud Gemini via Firebase AI Logic.**
   When the browser is online and a real Firebase project is configured,
   points the local layers mark `needs-cloud` — plus a full deep check —
   are escalated to Gemini through **Firebase AI Logic** (the Gemini API
   is never called directly; there is no standalone Gemini API key in
   this app). *Why cloud:* semantic mismatches — a deadline rephrased, a
   requirement softened — need the bigger model.

Each result row carries a **routing badge**: which engine produced the
verdict, why, and its latency in milliseconds. The overall verdict is
`Consistent`, `Partly off`, or `Contradicted`.

**Honest fallback labelling.** If Nano is unavailable in the browser, or
Firebase is still in placeholder mode, the UI says so in plain language
(e.g. "Cloud model unavailable — deterministic checks only") and no AI
verdict is ever simulated or faked.

## Setup

### Run locally (works out of the box, placeholder mode)

```bash
npm start          # serves http://localhost:3000 (or $PORT)
npm test           # deterministic engine tests (node:test)
```

No dependencies to install — the server is a dependency-free Node
static server, and the Firebase SDK is loaded from Google's CDN in the
browser only when a real config is present.

### Connect a real Firebase project (enables the cloud path)

1. Create a project at <https://console.firebase.google.com> and register
   a **Web app**.
2. In the console, enable **AI Logic** for the project (the Gemini
   Developer API backend works on the Spark plan).
3. Enable **App Check** for the web app with the reCAPTCHA v3 provider —
   Firebase AI Logic requires App Check. For local development you can
   instead register a debug token: leave `appCheckSiteKey` empty, load
   the app once, copy the debug token printed to the browser console,
   and register it under *App Check → Apps → Manage debug tokens* in the
   console.
4. Copy your web app's `firebaseConfig` values into
   `public/firebase-config.js` (replacing the `TODO` placeholders) and
   set `appCheckSiteKey` if you use reCAPTCHA v3.

Until step 4 is done, BuktiKu runs in **placeholder mode**: cloud calls
are skipped with an honest log entry, and the deterministic + on-device
paths carry the check.

## Architecture

```
server.js                  dependency-free static server (npm start)
public/
  index.html               single-page UI (English)
  styles.css
  app.js                   UI wiring and rendering only
  firebase-config.js       Firebase config (placeholder, TODO-marked)
  lib/
    engine.js              deterministic comparator (pure JS, unit-tested)
    samples.js             3 built-in claim/source pairs with planted errors
    nano.js                on-device path: Chrome Prompt API (LanguageModel)
    cloud.js               cloud path: Firebase AI Logic (firebase/ai) + App Check
    router.js              hybrid router + routing log
tests/
  engine.test.js           engine tests over all 3 sample pairs + controls
```

The models propose; the engine decides. Nano and the cloud model extract
and explain — verdicts on numbers, dates and names are computed by
`engine.js`, which is why the sample pairs' planted mismatches (an
altered scholarship amount and a dropped GPA condition, an inflated
reimbursement total, an inflated salary and a moved deadline) are caught
even fully offline with no model at all.

## License

Apache-2.0 — see [LICENSE](LICENSE).
