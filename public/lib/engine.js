// BuktiKu deterministic comparator engine.
//
// Pure JavaScript, no DOM, no network — importable from the browser app
// and from Node tests alike.
//
// Philosophy (same lesson as AIJajan): the models propose, the engine
// decides. Numbers, dates and names extracted from the CLAIM are compared
// against the SOURCE text by code, never by a language model. The source
// text the user pasted is the only ground truth — there is no open-web
// fact-checking here.
//
// Verdicts per point:
//   matches       — the value appears in the source
//   not-in-source — the value does not appear, and the source has no
//                   competing value of the same kind
//   contradicted  — the source states a different value of the same kind
//   needs-cloud   — code cannot settle this point; a model should look
//                   (the engine itself never emits this for numbers/dates,
//                   but the router may upgrade semantic points to it)

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9,
  sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n) { return String(n).padStart(2, '0'); }

function isoDate(y, m, d) {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// ---------------------------------------------------------------- numbers

/**
 * Extract numeric values from text.
 * Returns [{ raw, value, category }] where category is one of
 * 'currency' | 'percent' | 'plain'. Thousand separators ( , . ) are
 * normalised: "10,000,000" -> 10000000, "1.000.000" -> 1000000.
 * A standalone decimal like "3.50" stays 3.5.
 */
export function extractNumbers(text) {
  const out = [];
  const re = /(rp|idr|usd|us\$|\$|€|£)?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(%|percent|persen)?/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const rawNum = m[2];
    let value;
    if (/^\d{1,3}([.,]\d{3})+$/.test(rawNum)) {
      // pure thousands grouping, e.g. 10,000,000 or 1.000.000
      value = Number(rawNum.replace(/[.,]/g, ''));
    } else if (/^\d{1,3}([.,]\d{3})+([.,]\d+)$/.test(rawNum)) {
      const parts = rawNum.split(/[.,]/);
      const decimals = parts.pop();
      value = Number(parts.join('') + '.' + decimals);
    } else {
      value = Number(rawNum.replace(',', '.'));
    }
    if (!Number.isFinite(value)) continue;
    let category = 'plain';
    if (m[1]) category = 'currency';
    else if (m[3]) category = 'percent';
    out.push({ raw: m[0].trim(), value, category });
  }
  return out;
}

// ------------------------------------------------------------------ dates

/**
 * Extract dates and normalise them to ISO (YYYY-MM-DD).
 * Handles: "30 November 2026", "November 30, 2026", "2026-11-30",
 * "30/11/2026" and "30.11.2026" (day-first).
 */
export function extractDates(text) {
  const out = [];
  const push = (raw, iso) => { if (iso) out.push({ raw: raw.trim(), iso }); };

  const monthAlt = Object.keys(MONTHS).join('|');
  let m;
  const reDMY = new RegExp(`\\b(\\d{1,2})\\s+(${monthAlt})\\s+(\\d{4})\\b`, 'gi');
  while ((m = reDMY.exec(text)) !== null) push(m[0], isoDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]));
  const reMDY = new RegExp(`\\b(${monthAlt})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi');
  while ((m = reMDY.exec(text)) !== null) push(m[0], isoDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]));
  const reISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = reISO.exec(text)) !== null) push(m[0], isoDate(+m[1], +m[2], +m[3]));
  const reSlash = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g;
  while ((m = reSlash.exec(text)) !== null) push(m[0], isoDate(+m[3], +m[2], +m[1]));

  // de-duplicate by iso value, keep first raw form
  const seen = new Set();
  return out.filter(d => (seen.has(d.iso) ? false : (seen.add(d.iso), true)));
}

// ------------------------------------------------------------------ names

const NAME_STOPWORDS = new Set([
  'The', 'This', 'That', 'It', 'In', 'On', 'At', 'For', 'With', 'From',
  'Apply', 'Applications', 'Deadline', 'Salary', 'Total', 'Payment',
  'Requirements', 'Payment', 'Receipt', 'Great', 'Viral', 'Anyone',
  'Reimbursement', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
  'Friday', 'Saturday', 'Sunday',
  ...Object.keys(MONTHS).map(s => s[0].toUpperCase() + s.slice(1)),
]);

/**
 * Extract name-like tokens: sequences of 2+ capitalised words
 * ("Cendekia Foundation", "East Kalimantan") and ALL-CAPS acronyms
 * of length >= 2 ("GPA" is intentionally skipped as it is a metric,
 * acronyms ending in common metric words are filtered by the caller
 * through context — here we only return multi-word names to stay
 * precise).
 */
export function extractNames(text) {
  const out = new Set();
  const re = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim();
    const firstWord = name.split(/\s+/)[0];
    if (NAME_STOPWORDS.has(firstWord)) {
      // drop the leading stopword but keep the rest if it still has 2+ words
      const rest = name.split(/\s+/).slice(1).join(' ');
      if (rest.includes(' ')) out.add(rest);
      continue;
    }
    out.add(name);
  }
  return [...out];
}

// -------------------------------------------------------------- evidence

function snippetAround(text, needle, radius = 90) {
  const idx = text.toLowerCase().indexOf(String(needle).toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + String(needle).length + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

function firstSentenceWith(text, predicate) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.find(s => predicate(s)) || null;
}

// --------------------------------------------------------------- compare

const CONDITION_MARKERS = [
  /\bmust\b/i, /\bonly\b/i, /\bminimum\b/i, /\bat least\b/i,
  /\brequired\b/i, /\brequirements?\b/i, /\beligib/i, /\bno later than\b/i,
];

/**
 * Compare a claim against its source.
 * Returns { points, overall } where each point is
 * { id, kind, text, verdict, evidence, engine } and overall is
 * 'Consistent' | 'Partly off' | 'Contradicted'.
 */
export function compareClaimToSource(claim, source) {
  const points = [];
  let id = 0;
  const nextId = () => `p${++id}`;

  const claimNumbers = extractNumbers(claim);
  const sourceNumbers = extractNumbers(source);
  const claimDates = extractDates(claim);
  const sourceDates = extractDates(source);
  const claimNames = extractNames(claim);
  const sourceNames = extractNames(source);
  const sourceNameSet = new Set(sourceNames.map(n => n.toLowerCase()));

  // Day / year components of a claim date are part of that date, not
  // standalone plain numbers — do not double-report them.
  const dateComponents = new Set();
  for (const d of claimDates) {
    const [y, , day] = d.iso.split('-').map(Number);
    dateComponents.add(y);
    dateComponents.add(day);
  }
  const claimNumbersToCheck = claimNumbers.filter(
    n => !(n.category === 'plain' && dateComponents.has(n.value)),
  );

  // --- numbers in the claim -------------------------------------------
  for (const n of claimNumbersToCheck) {
    const hit = sourceNumbers.find(s => s.value === n.value && s.category === n.category)
      || sourceNumbers.find(s => s.value === n.value);
    if (hit) {
      points.push({
        id: nextId(), kind: 'number',
        text: `Number in claim: ${n.raw}`,
        verdict: 'matches',
        evidence: snippetAround(source, hit.raw) || hit.raw,
        engine: 'deterministic',
      });
    } else {
      const rival = sourceNumbers.find(s => s.category === n.category);
      if (rival) {
        points.push({
          id: nextId(), kind: 'number',
          text: `Number in claim: ${n.raw} — the source states ${rival.raw}`,
          verdict: 'contradicted',
          evidence: snippetAround(source, rival.raw) || rival.raw,
          engine: 'deterministic',
        });
      } else {
        points.push({
          id: nextId(), kind: 'number',
          text: `Number in claim: ${n.raw} — not found in the source`,
          verdict: 'not-in-source',
          evidence: null,
          engine: 'deterministic',
        });
      }
    }
  }

  // --- dates in the claim ----------------------------------------------
  const claimNumberValues = new Set(claimNumbers.map(n => n.value));
  for (const d of claimDates) {
    // skip bare years already covered as plain numbers
    const hit = sourceDates.find(s => s.iso === d.iso);
    if (hit) {
      points.push({
        id: nextId(), kind: 'date',
        text: `Date in claim: ${d.raw}`,
        verdict: 'matches',
        evidence: snippetAround(source, hit.raw) || hit.raw,
        engine: 'deterministic',
      });
    } else if (sourceDates.length > 0) {
      const rival = sourceDates[0];
      points.push({
        id: nextId(), kind: 'date',
        text: `Date in claim: ${d.raw} — the source states ${rival.raw}`,
        verdict: 'contradicted',
        evidence: snippetAround(source, rival.raw) || rival.raw,
        engine: 'deterministic',
      });
    } else {
      points.push({
        id: nextId(), kind: 'date',
        text: `Date in claim: ${d.raw} — no date in the source`,
        verdict: 'not-in-source',
        evidence: null,
        engine: 'deterministic',
      });
    }
  }
  void claimNumberValues;

  // --- names in the claim ----------------------------------------------
  // A name counts as present when the source's own name extraction found
  // it OR the name appears verbatim (case-insensitive, whole words) in
  // the source text — public sources often write names in lowercase or
  // ALL-CAPS, where capitalisation-based extraction sees nothing.
  const nameInText = name =>
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(source);
  for (const name of claimNames) {
    if (sourceNameSet.has(name.toLowerCase()) || nameInText(name)) {
      points.push({
        id: nextId(), kind: 'name',
        text: `Name in claim: ${name}`,
        verdict: 'matches',
        evidence: snippetAround(source, name) || name,
        engine: 'deterministic',
      });
    } else {
      points.push({
        id: nextId(), kind: 'name',
        text: `Name in claim: ${name} — not found in the source`,
        verdict: 'not-in-source',
        evidence: null,
        engine: 'deterministic',
      });
    }
  }

  // --- conditions in the source that the claim dropped ------------------
  // A source sentence carrying a condition marker AND at least one
  // checkable entity (number, date or name) whose entities are ALL
  // absent from the claim is a dropped condition.
  const sentences = source.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (!CONDITION_MARKERS.some(re => re.test(sentence))) continue;
    const nums = extractNumbers(sentence).map(n => n.value);
    const dates = extractDates(sentence).map(d => d.iso);
    const names = extractNames(sentence).map(n => n.toLowerCase());
    if (nums.length + dates.length + names.length === 0) continue;
    const claimNumSet = new Set(claimNumbers.map(n => n.value));
    const claimDateSet = new Set(claimDates.map(d => d.iso));
    const claimNameSet = new Set(claimNames.map(n => n.toLowerCase()));
    const numKept = nums.some(v => claimNumSet.has(v));
    const dateKept = dates.some(v => claimDateSet.has(v));
    const nameKept = names.some(v => claimNameSet.has(v));
    if (numKept || dateKept || nameKept) continue;
    points.push({
      id: nextId(), kind: 'condition',
      text: `Condition in the source is missing from the claim: "${sentence.trim()}"`,
      verdict: 'contradicted',
      evidence: sentence.trim(),
      engine: 'deterministic',
    });
  }

  // --- overall -----------------------------------------------------------
  const contradicted = points.filter(p => p.verdict === 'contradicted').length;
  const missing = points.filter(p => p.verdict === 'not-in-source').length;
  let overall = 'Consistent';
  if (contradicted >= 2) overall = 'Contradicted';
  else if (contradicted === 1 || missing >= 1) overall = 'Partly off';

  return { points, overall };
}

// Re-export helper used by the UI for character counts / debugging.
export { firstSentenceWith, snippetAround };
