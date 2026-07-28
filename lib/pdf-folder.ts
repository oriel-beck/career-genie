type PermissionAwareDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
};

export async function ensureDirectoryWritePermission(
  directory: FileSystemDirectoryHandle,
): Promise<void> {
  const handle = directory as PermissionAwareDirectoryHandle;
  if (!handle.queryPermission || !handle.requestPermission) return;

  let permission = await handle.queryPermission({ mode: 'readwrite' });
  if (permission === 'prompt') {
    permission = await handle.requestPermission({ mode: 'readwrite' });
  }
  if (permission !== 'granted') {
    throw new Error('Write access to the selected folder was denied.');
  }
}

export async function writePdfsToDirectory(
  directory: FileSystemDirectoryHandle,
  files: Array<{ name: string; blob: Blob }>,
): Promise<void> {
  await ensureDirectoryWritePermission(directory);

  for (const file of files) {
    const fileHandle = await directory.getFileHandle(file.name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file.blob);
    await writable.close();
  }
}
