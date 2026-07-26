const MAX_JOB_TEXT_CHARS = 120_000;

const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'canvas',
  'nav',
  'footer',
  'header',
  'aside',
  'form',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
].join(',');

export function extractJobText(htmlOrText: string, contentType: string): string {
  if (contentType === 'text/plain') {
    return truncate(collapseWhitespace(htmlOrText));
  }
  const doc = new DOMParser().parseFromString(htmlOrText, 'text/html');
  for (const node of Array.from(doc.querySelectorAll(REMOVE_SELECTORS))) {
    node.remove();
  }
  const title = doc.querySelector('title')?.textContent?.trim() ?? '';
  const main =
    doc.querySelector('main, article, [role="main"], #content, .job-description, .posting') ??
    doc.body;
  const body = main?.textContent ?? '';
  return truncate(collapseWhitespace([title, body].filter(Boolean).join('\n\n')));
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string): string {
  if (text.length <= MAX_JOB_TEXT_CHARS) return text;
  return text.slice(0, MAX_JOB_TEXT_CHARS);
}
