// BuktiKu — on-device path: Chrome's built-in LanguageModel (Prompt API),
// which runs Gemini Nano locally in the browser.
//
// This module never pretends: if the API is absent, or the model is not
// downloadable/ready, it reports exactly that and the router falls back
// (and says so). Availability values follow the Prompt API:
// 'available' | 'downloadable' | 'downloading' | 'unavailable'.

export function getLanguageModelApi() {
  if (typeof window === 'undefined') return null;
  // Current Chrome exposes `LanguageModel`; earlier builds used `window.ai`.
  return window.LanguageModel || window.ai?.languageModel || null;
}

export async function detectNano() {
  const api = getLanguageModelApi();
  if (!api) {
    return {
      available: false,
      status: 'unsupported',
      detail: 'LanguageModel (Prompt API) not found in this browser.',
    };
  }
  try {
    const status = typeof api.availability === 'function'
      ? await api.availability()
      : (await api.capabilities?.())?.available ?? 'unknown';
    const normalised = status === 'readily' ? 'available' : status;
    return {
      available: normalised === 'available',
      status: normalised,
      detail: `Prompt API availability: ${normalised}`,
    };
  } catch (err) {
    return { available: false, status: 'error', detail: `Prompt API check failed: ${err.message}` };
  }
}

/**
 * Ask the on-device model to extract checkable points from the claim as
 * JSON. Returns { points: [{ text, kind }], latencyMs } or throws.
 * The model only EXTRACTS; verdicts on numbers/dates come from the
 * deterministic engine.
 */
export async function nanoExtractPoints(claim, source) {
  const api = getLanguageModelApi();
  if (!api) throw new Error('On-device model API unavailable');
  const started = performance.now();
  const session = await api.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  });
  try {
    const prompt =
      'Extract the checkable factual points from the CLAIM below: amounts, ' +
      'dates, deadlines, names, and stated conditions. Reply with ONLY a ' +
      'JSON array of objects like [{"text":"...","kind":"number|date|name|condition"}].\n\n' +
      `CLAIM:\n${claim}\n\nSOURCE (for context only):\n${source}`;
    const raw = await session.prompt(prompt);
    const match = String(raw).match(/\[[\s\S]*\]/);
    if (!match) throw new Error('On-device model did not return JSON');
    const points = JSON.parse(match[0]);
    return { points, latencyMs: Math.round(performance.now() - started) };
  } finally {
    session.destroy?.();
  }
}
