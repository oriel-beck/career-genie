import assert from 'node:assert/strict';
import test from 'node:test';
import { writePdfsToDirectory } from '../lib/pdf-folder';

test('requests access and writes each PDF to the selected directory', async () => {
  const written: Array<{ name: string; content: string }> = [];
  let requested = false;

  const directory = {
    name: 'Applications',
    queryPermission: async () => 'prompt',
    requestPermission: async () => {
      requested = true;
      return 'granted';
    },
    getFileHandle: async (name: string) => ({
      createWritable: async () => ({
        write: async (blob: Blob) => {
          written.push({ name, content: await blob.text() });
        },
        close: async () => undefined,
      }),
    }),
  } as unknown as FileSystemDirectoryHandle;

  await writePdfsToDirectory(directory, [
    { name: 'resume-v2.pdf', blob: new Blob(['resume']) },
    { name: 'cover-letter-v2.pdf', blob: new Blob(['cover']) },
  ]);

  assert.equal(requested, true);
  assert.deepEqual(written, [
    { name: 'resume-v2.pdf', content: 'resume' },
    { name: 'cover-letter-v2.pdf', content: 'cover' },
  ]);
});

test('does not write when directory access is denied', async () => {
  let openedFile = false;
  const directory = {
    queryPermission: async () => 'denied',
    requestPermission: async () => 'denied',
    getFileHandle: async () => {
      openedFile = true;
    },
  } as unknown as FileSystemDirectoryHandle;

  await assert.rejects(
    writePdfsToDirectory(directory, [{ name: 'resume.pdf', blob: new Blob() }]),
    /Write access to the selected folder was denied/,
  );
  assert.equal(openedFile, false);
});
