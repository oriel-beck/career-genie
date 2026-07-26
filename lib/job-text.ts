export function extractJobText(htmlOrText: string, contentType: string): string {
  if (contentType === 'text/plain') {
    return collapseWhitespace(htmlOrText);
  }
  const doc = new DOMParser().parseFromString(htmlOrText, 'text/html');
  const title = doc.querySelector('title')?.textContent?.trim() ?? '';
  const body = doc.body?.textContent ?? '';
  return collapseWhitespace([title, body].filter(Boolean).join('\n\n'));
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
