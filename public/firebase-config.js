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
// App Check: enable the reCAPTCHA v3 provider for this web app in the
// Firebase console and paste the site key into appCheckSiteKey below.
// Until a site key is set, the app uses an App Check debug token flow
// during development (see cloud.js and README.md).

export const firebaseConfig = {
  apiKey: 'AIzaSyCIvjRGTCYNA-rt05RJXDyVlqsFKb_v6ZA',
  authDomain: 'buktiku-d5216.firebaseapp.com',
  projectId: 'buktiku-d5216',
  storageBucket: 'buktiku-d5216.firebasestorage.app',
  messagingSenderId: '453282732387',
  appId: '1:453282732387:web:fbf0b7fdd0cfc7af321b56',
  measurementId: 'G-SLMN86DT76',
};

// reCAPTCHA v3 site key for App Check. Leave empty during local
// development to use an App Check debug token instead (see cloud.js).
export const appCheckSiteKey = '';

// True while the config above is still the shipped placeholder.
export function isPlaceholderConfig() {
  return (
    !firebaseConfig.projectId ||
    firebaseConfig.projectId.includes('TODO') ||
    firebaseConfig.apiKey.includes('TODO')
  );
}
