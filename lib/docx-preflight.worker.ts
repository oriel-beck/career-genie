import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';

export const MAX_DOCX_ENTRIES = 1_000;
export const MAX_DOCX_EXPANDED_BYTES = 20 * 1024 * 1024;

function isZip64(bytes: Uint8Array): boolean {
  for (let index = 0; index + 3 < bytes.length; index += 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      ((bytes[index + 2] === 0x06 && bytes[index + 3] === 0x06) ||
        (bytes[index + 2] === 0x06 && bytes[index + 3] === 0x07))
    )
      return true;
  }
  return false;
}

function unsafePath(name: string): boolean {
  return (
    name.includes('\0') ||
    name.startsWith('/') ||
    name.startsWith('\\') ||
    /^[a-zA-Z]:/.test(name) ||
    name.replaceAll('\\', '/').split('/').includes('..')
  );
}

export function preflightDocx(bytes: Uint8Array): void {
  if (isZip64(bytes)) throw new Error('DOCX ZIP64 archives are not supported');

  let entries = 0;
  let expanded = 0;
  let hasContentTypes = false;
  let hasDocument = false;
  let failure: Error | undefined;
  const fail = (message: string) => {
    if (!failure) failure = new Error(message);
  };
  const unzip = new Unzip((file) => {
    entries += 1;
    if (entries > MAX_DOCX_ENTRIES) return fail('DOCX has too many entries');
    if (unsafePath(file.name)) return fail('DOCX contains an unsafe path');
    if (file.name === '[Content_Types].xml') hasContentTypes = true;
    if (file.name === 'word/document.xml') hasDocument = true;
    file.ondata = (error, chunk) => {
      if (error) return fail('DOCX is malformed');
      expanded += chunk.length;
      if (expanded > MAX_DOCX_EXPANDED_BYTES) fail('DOCX expands beyond the allowed size');
    };
    try {
      file.start();
    } catch {
      fail('DOCX is malformed');
    }
  });
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);
  try {
    unzip.push(bytes, true);
  } catch {
    fail('DOCX is malformed');
  }
  if (failure) throw failure;
  if (!entries || !hasContentTypes || !hasDocument)
    throw new Error('DOCX is missing required files');
}

type WorkerRequest = { bytes: ArrayBuffer };
type WorkerResponse = { ok: true } | { ok: false; error: string };

const workerScope = typeof self === 'undefined' ? undefined : self;
if (workerScope) {
  workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
    let response: WorkerResponse;
    try {
      preflightDocx(new Uint8Array(event.data.bytes));
      response = { ok: true };
    } catch (error) {
      response = { ok: false, error: error instanceof Error ? error.message : 'Invalid DOCX' };
    }
    workerScope.postMessage(response);
  };
}
