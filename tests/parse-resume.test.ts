import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync } from 'fflate';
import { MAX_RESUME_BYTES, parseResume } from '../lib/parse-resume';
import { MAX_DOCX_EXPANDED_BYTES, preflightDocx } from '../lib/docx-preflight.worker';
import type { ModelInfo } from '../lib/types';

const model: ModelInfo = {
  id: 'test',
  display_name: 'test',
  max_input_tokens: 1,
  max_tokens: 1,
  capabilities: {},
};

function file(bytes: Uint8Array, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function docx(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files);
}

test('rejects invalid PDF and DOCX signatures before calling Claude', async () => {
  await assert.rejects(
    parseResume(file(new Uint8Array([1, 2]), 'resume.pdf', 'application/pdf'), model),
    /PDF signature/,
  );
  await assert.rejects(
    parseResume(file(new Uint8Array([1, 2]), 'resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), model),
    /DOCX signature/,
  );
});

test('rejects files over 10 MiB before parsing', async () => {
  await assert.rejects(
    parseResume(
      file(new Uint8Array(MAX_RESUME_BYTES + 1), 'resume.pdf', 'application/pdf'),
      model,
    ),
    /10 MiB/,
  );
});

test('rejects ZIP64, path traversal, expansion limits, and empty DOCX archives', () => {
  assert.throws(() => preflightDocx(new Uint8Array([0x50, 0x4b, 0x06, 0x06])), /ZIP64/);
  assert.throws(
    () => preflightDocx(docx({
      '[Content_Types].xml': new Uint8Array(),
      'word/document.xml': new Uint8Array(),
      '../escape.xml': new Uint8Array(),
    })),
    /unsafe path/,
  );
  assert.throws(
    () => preflightDocx(docx({
      '[Content_Types].xml': new Uint8Array(),
      'word/document.xml': new Uint8Array(MAX_DOCX_EXPANDED_BYTES + 1),
    })),
    /expands/,
  );
  assert.throws(() => preflightDocx(docx({})), /missing required files/);
});
