// BuktiKu — hybrid router.
//
// Decides, per check, which engine does what — and writes every decision
// to a visible routing log. The order is deliberate:
//
//   1. Deterministic engine (always, offline, instant).
//      Numbers, dates, names and dropped conditions are DECIDED by code.
//      This layer never needs a network and never guesses.
//   2. On-device Gemini Nano via the Chrome Prompt API (when available).
//      Extracts checkable points locally — the texts never leave the
//      device for this stage, which is the privacy point of the design.
//   3. Cloud Gemini via Firebase AI Logic (when online AND configured).
//      Deep semantic check: rephrased deadlines, softened requirements,
//      subtly dropped conditions. Points the local layers mark
//      "needs-cloud" are escalated here.
//
// Honesty rules: a layer that did not run is logged as skipped with the
// reason. Deterministic verdicts on numbers/dates always win over model
// verdicts. A fallback is stated, never hidden.

import { compareClaimToSource, extractNumbers, extractDates } from './engine.js';
import { detectNano, nanoExtractPoints } from './nano.js';
import { cloudConfigured, cloudDeepCheck } from './cloud.js';

export class HybridRouter {
  constructor() {
    /** @type {{at:string, engine:string, reason:string, latencyMs:number|null}[]} */
    this.log = [];
  }

  record(engine, reason, latencyMs = null) {
    const entry = {
      at: new Date().toISOString(),
      engine,
      reason,
      latencyMs,
    };
    this.log.push(entry);
    return entry;
  }

  async check(claim, source, env = {}) {
    const online = env.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine);

    // ---- 1. deterministic -------------------------------------------------
    const t0 = performance.now();
    const det = compareClaimToSource(claim, source);
    const detMs = Math.round(performance.now() - t0);
    const points = det.points.map(p => ({
      ...p,
      reason: 'Numbers, dates, names and dropped conditions are decided by deterministic code.',
      latencyMs: detMs,
      extractedBy: null,
      explanation: null,
    }));
    this.record(
      'deterministic',
      `Code comparison ran locally: ${points.length} point(s), overall so far "${det.overall}".`,
      detMs,
    );

    // ---- 2. on-device Nano extraction -------------------------------------
    const nanoStatus = env.nanoStatus ?? (await detectNano());
    if (nanoStatus.available) {
      try {
        const { points: nanoPoints, latencyMs } = await nanoExtractPoints(claim, source);
        let attached = 0;
        let added = 0;
        for (const np of nanoPoints) {
          const nums = extractNumbers(np.text || '').map(n => String(n.value));
          const dates = extractDates(np.text || '').map(d => d.iso);
          const host = points.find(
            p =>
              nums.some(v => p.text.includes(v)) ||
              dates.some(v => p.text.includes(v)),
          );
          if (host) {
            host.extractedBy = 'gemini-nano';
            attached++;
          } else if (np.text) {
            points.push({
              id: `nano-${added}`,
              kind: np.kind || 'semantic',
              text: np.text,
              verdict: 'needs-cloud',
              evidence: null,
              engine: 'gemini-nano',
              reason: 'Extracted on-device by Gemini Nano; semantic point escalated for cloud verification.',
              latencyMs,
              extractedBy: 'gemini-nano',
              explanation: null,
            });
            added++;
          }
        }
        this.record(
          'gemini-nano (on-device)',
          `Prompt API extraction ran on-device: ${nanoPoints.length} point(s) extracted, ${attached} matched code findings, ${added} new semantic point(s).`,
          latencyMs,
        );
      } catch (err) {
        this.record('gemini-nano (on-device)', `On-device extraction failed and was skipped: ${err.message}`);
      }
    } else {
      this.record(
        'gemini-nano (on-device)',
        `Skipped — on-device model not available (${nanoStatus.detail}). Deterministic checks still apply.`,
      );
    }

    // ---- 3. cloud deep check via Firebase AI Logic -------------------------
    let overall = det.overall;
    let cloudRan = false;
    const needsCloud = points.filter(p => p.verdict === 'needs-cloud');
    if (!cloudConfigured()) {
      this.record(
        'cloud (Firebase AI Logic)',
        'Skipped — Firebase is in placeholder mode (no real project config yet). No cloud verdict was faked.',
      );
    } else if (!online) {
      this.record(
        'cloud (Firebase AI Logic)',
        'Skipped — browser is offline. On-device and deterministic results stand.',
      );
    } else {
      try {
        const cloud = await cloudDeepCheck(claim, source, points);
        cloudRan = true;
        for (const ex of cloud.explanations) {
          const host =
            points.find(p => ex.point && p.text.toLowerCase().includes(String(ex.point).toLowerCase().slice(0, 40))) ||
            needsCloud.find(p => p.verdict === 'needs-cloud');
          if (host) {
            // Deterministic wins on numbers/dates: only upgrade rows the
            // code layer had escalated, and only attach explanations to
            // the rest.
            if (host.verdict === 'needs-cloud') {
              host.verdict = ex.verdict || 'needs-cloud';
              host.engine = 'cloud (Firebase AI Logic)';
              host.reason = 'Semantic point verified by cloud Gemini via Firebase AI Logic.';
              host.latencyMs = cloud.latencyMs;
            }
            host.explanation = ex.explanation || null;
          }
        }
        // Cloud may refine the overall verdict only when code found no
        // hard contradiction — code wins on numbers and dates.
        if (det.overall === 'Consistent' && cloud.overall) overall = cloud.overall;
        this.record(
          'cloud (Firebase AI Logic)',
          `Deep check ran via Firebase AI Logic (model ${cloud.model}, App Check: ${cloud.appCheckMode}). Overall from cloud: "${cloud.overall}".`,
          cloud.latencyMs,
        );
      } catch (err) {
        this.record(
          'cloud (Firebase AI Logic)',
          `Cloud check failed and was skipped: ${err.message}. Local results stand.`,
        );
      }
    }

    return { overall, points, log: this.log, cloudRan, nanoStatus };
  }
}
