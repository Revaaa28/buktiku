// BuktiKu — saved checks: per-user history in Cloud Firestore.
//
// Every completed check is stored under users/{uid}/checks, where uid
// comes from Firebase Anonymous Authentication — no sign-up, no email,
// and the Firestore security rules (see README) let a user read and
// write ONLY their own subcollection.
//
// Restoring a saved check re-renders the stored verdict and points
// without re-running any engine — it costs no Gemini quota and works
// offline from the already-loaded page.
//
// Honesty rules, same as the router: if saving fails, the caller says
// so plainly. A check that was not saved is never shown as saved.

import { initFirebase } from './cloud.js';

const SDK_VERSION = '12.0.0';
const CDN = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const HISTORY_LIMIT = 20;

/**
 * Build the Firestore document for a finished check. Pure function —
 * the caller adds the server timestamp at write time.
 */
export function buildCheckDocument(claim, source, result, meta) {
  return {
    claim,
    source,
    sourceUrl: meta?.url ?? null,
    sourceTitle: meta?.title ?? null,
    overall: result.overall,
    cloudRan: !!result.cloudRan,
    points: (result.points || []).map(p => ({
      text: p.text,
      verdict: p.verdict,
      engine: p.engine,
      evidence: p.evidence ?? null,
      explanation: p.explanation ?? null,
      reason: p.reason ?? null,
      latencyMs: p.latencyMs ?? null,
      extractedBy: p.extractedBy ?? null,
    })),
  };
}

let storePromise = null;

async function initStore() {
  if (storePromise) return storePromise;
  storePromise = (async () => {
    const { app } = await initFirebase();
    const authModule = await import(`${CDN}/firebase-auth.js`);
    const fsModule = await import(`${CDN}/firebase-firestore.js`);
    const auth = authModule.getAuth(app);
    if (!auth.currentUser) {
      await authModule.signInAnonymously(auth);
    }
    const db = fsModule.getFirestore(app);
    return { auth, db, fsModule };
  })();
  return storePromise;
}

function checksCollection({ auth, db, fsModule }) {
  return fsModule.collection(db, 'users', auth.currentUser.uid, 'checks');
}

/** Save a finished check. Resolves with the new document id. */
export async function saveCheck(claim, source, result, meta) {
  const store = await initStore();
  const { fsModule } = store;
  const ref = await fsModule.addDoc(checksCollection(store), {
    ...buildCheckDocument(claim, source, result, meta),
    createdAt: fsModule.serverTimestamp(),
  });
  return ref.id;
}

/** Load the newest saved checks for this user, newest first. */
export async function listChecks(max = HISTORY_LIMIT) {
  const store = await initStore();
  const { fsModule } = store;
  const q = fsModule.query(
    checksCollection(store),
    fsModule.orderBy('createdAt', 'desc'),
    fsModule.limit(max),
  );
  const snap = await fsModule.getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAtMs: data.createdAt?.toMillis ? data.createdAt.toMillis() : null,
    };
  });
}
