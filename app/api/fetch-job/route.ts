import { fetchPublicJob, SafeFetchError, SafeFetchErrorKind } from '@/lib/safe-fetch';

export const runtime = 'nodejs';

const MAX_JSON_BYTES = 4 * 1024;
const MAX_URL_LENGTH = 2_048;
const NO_STORE = { 'Cache-Control': 'no-store' };

const STATUS_BY_KIND = {
  [SafeFetchErrorKind.Invalid]: 400,
  [SafeFetchErrorKind.Blocked]: 403,
  [SafeFetchErrorKind.Timeout]: 504,
  [SafeFetchErrorKind.Mime]: 415,
  [SafeFetchErrorKind.TooLarge]: 413,
  [SafeFetchErrorKind.Upstream]: 502,
} as const;

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return errorResponse(403);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await readJson(request));
  } catch {
    return errorResponse(400);
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    typeof (payload as { url?: unknown }).url !== 'string' ||
    (payload as { url: string }).url.length > MAX_URL_LENGTH
  ) {
    return errorResponse(400);
  }

  try {
    return Response.json(await fetchPublicJob((payload as { url: string }).url), {
      headers: NO_STORE,
    });
  } catch (caught) {
    if (!(caught instanceof SafeFetchError)) return errorResponse(502);
    return errorResponse(STATUS_BY_KIND[caught.kind]);
  }
}

async function readJson(request: Request): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function errorResponse(status: number): Response {
  return new Response(null, { status, headers: NO_STORE });
}
