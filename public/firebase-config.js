// ============================================================================
// BuktiKu — Firebase configuration
// ============================================================================
// Project: BuktiKu (buktiku-d5216), created 2026-11-12 for the
// #BuildHybridAI 2026 hackathon. AI Logic is enabled in the console with
// the Gemini Developer API backend (Spark plan, free tier).
//
// These values are public client identifiers for the web app (they are
// shown to every visitor's browser by design) — they are NOT secrets.
// Access is controlled by Firebase security rules and App Check.
//
// App Check: this web app is registered in the Firebase console with
// the Fraud Defense (reCAPTCHA Enterprise) provider — Google retired
// new reCAPTCHA Classic registrations, so Enterprise is the supported
// route. The Enterprise site key lives in appCheckSiteKey below (it is
// a public client identifier, shown to every visitor by design).

export const firebaseConfig = {
  apiKey: 'AIzaSyCIvjRGTCYNA-rt05RJXDyVlqsFKb_v6ZA',
  authDomain: 'buktiku-d5216.firebaseapp.com',
  projectId: 'buktiku-d5216',
  storageBucket: 'buktiku-d5216.firebasestorage.app',
  messagingSenderId: '453282732387',
  appId: '1:453282732387:web:fbf0b7fdd0cfc7af321b56',
  measurementId: 'G-SLMN86DT76',
};

// reCAPTCHA Enterprise site key for App Check (Fraud Defense provider,
// registered in the Firebase console 2026-11-17). Leave empty during
// local development to use an App Check debug token instead (cloud.js).
export const appCheckSiteKey = '6LcRvCQuAAAAAN90lRgZ9Kpl9UkL5zppUFiDhB2J';

// True while the config above is still the shipped placeholder.
export function isPlaceholderConfig() {
  return (
    !firebaseConfig.projectId ||
    firebaseConfig.projectId.includes('TODO') ||
    firebaseConfig.apiKey.includes('TODO')
  );
}
