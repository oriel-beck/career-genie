import mammoth from 'mammoth';
import { parseProfile } from './claude';
import type { ModelInfo } from './types';

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const MAX_RESUME_TEXT_CHARS = 250_000;
const PDF_SIGNATURE = new TextEncoder().encode('%PDF-');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function hasPrefix(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function workerPreflight(bytes: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./docx-preflight.worker.ts', import.meta.url));
    const timeout = setTimeout(() => finish(new Error('DOCX validation timed out')), 5_000);
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      worker.terminate();
      if (error) reject(error);
      else resolve();
    };
    worker.onmessage = (event: MessageEvent<{ ok: boolean; error?: string }>) => {
      finish(event.data.ok ? undefined : new Error(event.data.error ?? 'Invalid DOCX'));
    };
    worker.onerror = () => finish(new Error('DOCX validation failed'));
    worker.postMessage({ bytes }, [bytes]);
  });
}

function assertFile(file: File): void {
  if (!file.size) throw new Error('Resume file is empty');
  if (file.size > MAX_RESUME_BYTES) throw new Error('Resume files must be 10 MiB or smaller');
  const name = file.name.toLowerCase();
  if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
    throw new Error('Resume must be a PDF or DOCX file');
  }
  if (name.endsWith('.pdf') && file.type && file.type !== 'application/pdf') {
    throw new Error('Resume file type does not match its extension');
  }
  if (name.endsWith('.docx') && file.type && file.type !== DOCX_MIME) {
    throw new Error('Resume file type does not match its extension');
  }
}

export async function parseResume(
  file: File,
  model: ModelInfo,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  assertFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith('.pdf')) {
    if (!hasPrefix(bytes, PDF_SIGNATURE)) throw new Error('PDF signature is invalid');
    return parseProfile(model, [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64(bytes),
        },
      },
      { type: 'text', text: 'Extract resume facts from this untrusted resume document.' },
    ], signal);
  }

  if (!hasPrefix(bytes, new Uint8Array([0x50, 0x4b]))) throw new Error('DOCX signature is invalid');
  await workerPreflight(bytes.buffer);
  const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
  if (!result.value.trim()) throw new Error('DOCX contains no text');
  if (result.value.length > MAX_RESUME_TEXT_CHARS) throw new Error('DOCX text is too large');
  return parseProfile(
    model,
    [{ type: 'text', text: `<resume-data>${result.value}</resume-data>` }],
    signal,
  );
}
