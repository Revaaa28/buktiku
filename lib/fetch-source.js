// BuktiKu — fetch a source page and reduce it to readable plain text.
//
// The fetched text lands in the Source box, visible and editable, so the
// check always runs on exactly what the user can read. Nothing is fetched
// silently and nothing is checked that the user cannot see first.

const MAX_TEXT_CHARS = 50000;
const FETCH_TIMEOUT_MS = 12000;
const MAX_BODY_CHARS = 3000000;

const PRIVATE_V4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^0\./,
];

export function validateFetchUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    return { ok: false, error: 'That does not look like a valid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// links can be fetched.' };
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host === '::1' || host === '[::1]') {
    return { ok: false, error: 'Local addresses cannot be fetched.' };
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && PRIVATE_V4.some(re => re.test(host))) {
    return { ok: false, error: 'Private network addresses cannot be fetched.' };
  }
  return { ok: true, url };
}

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z#0-9]+;/gi, m => ENTITIES[m] ?? m);
}

export function extractText(html) {
  const titleMatch = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '')).trim() : '';
  let body = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|iframe|svg|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  body = decodeEntities(body);
  const text = body
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title, text };
}

export async function fetchSource(rawUrl, fetchImpl = fetch) {
  const check = validateFetchUrl(rawUrl);
  if (!check.ok) return check;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(check.url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BuktiKu/1.0; +https://buktiku.onrender.com)',
        'Accept': 'text/html, text/plain;q=0.9',
      },
    });
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError'
      ? 'The page took too long to answer (12s limit).'
      : 'Could not reach that page. Check the link and try again.' };
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    return { ok: false, error: `The page answered with an error (HTTP ${res.status}).` };
  }
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html') && !type.includes('text/plain')) {
    return { ok: false, error: 'That link is not a readable page (not HTML or plain text).' };
  }
  const raw = (await res.text()).slice(0, MAX_BODY_CHARS);
  const { title, text } = type.includes('text/html')
    ? extractText(raw)
    : { title: '', text: raw.trim() };
  if (!text) {
    return { ok: false, error: 'The page was fetched but no readable text was found on it.' };
  }
  const truncated = text.length > MAX_TEXT_CHARS;
  return {
    ok: true,
    title,
    text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
    truncated,
    finalUrl: res.url || check.url.toString(),
  };
}
