// ============================================================================
// BuktiKu — Firebase configuration (PLACEHOLDER — TODO: fill in for real use)
// ============================================================================
//
// This file ships with placeholder values on purpose. While the config is
// a placeholder, BuktiKu runs in "placeholder mode": the cloud path is
// skipped with an honest note in the UI and routing log, and the app runs
// fully on the deterministic engine + the on-device (Chrome Prompt API)
// path. No AI verdict is ever faked in placeholder mode.
//
// TODO (setup, done together with the project owner):
//   1. Create a Firebase project at https://console.firebase.google.com
//   2. Register a Web app and copy its firebaseConfig values below.
//   3. In the Firebase console, enable "AI Logic" (Gemini Developer API
//      backend is fine on the Spark plan) for the project.
//   4. Enable App Check for the web app (reCAPTCHA v3 provider) and paste
//      the site key into appCheckSiteKey below. During local development
//      you may instead register a debug token — see README.md.
//   5. NEVER commit real production secrets here. The values below are
//      client identifiers, not secrets, but keep production keys out of
//      this repository as a matter of policy.

export const firebaseConfig = {
  apiKey: 'TODO-REPLACE-ME',
  authDomain: 'TODO-REPLACE-ME.firebaseapp.com',
  projectId: 'TODO-REPLACE-ME',
  appId: 'TODO-REPLACE-ME',
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
