'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { CheckboxOption, RadioOption } from '@/components/choice';
import { ModelPicker } from '@/components/model-picker';
import { backupJson, importBackup } from '@/lib/backup';
import { db } from '@/lib/db';
import { commitStagedKey, lock, stageKey, unlock } from '@/lib/keys';
import { listModels } from '@/lib/models';
import { storageEstimate } from '@/lib/storage';
import { KeyStorageMode, type CallKind as CallKindValue, type ModelInfo, type Settings, type UsageRecord } from '@/lib/types';

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [passphrase, setPassphrase] = useState('');
  const [newKey, setNewKey] = useState('');
  const [plainConfirmed, setPlainConfirmed] = useState(false);
  const [estimate, setEstimate] = useState<StorageEstimate>();
  const [usage, setUsage] = useState<UsageRecord[]>([]);
  const [deleteText, setDeleteText] = useState('');
  const [status, setStatus] = useState('');

  async function refresh() {
    const [saved, size, records] = await Promise.all([db.settings.get(1), storageEstimate(), db.usage.toArray()]);
    setSettings(saved); setEstimate(size); setUsage(records);
  }
  useEffect(() => {
    void Promise.all([db.settings.get(1), storageEstimate(), db.usage.toArray()]).then(([saved, size, records]) => {
      setSettings(saved); setEstimate(size); setUsage(records);
    });
  }, []);

  async function loadModels() {
    try { setModels(await listModels()); setStatus('Live model catalog loaded.'); }
    catch { setStatus('Unlock or validate your key before loading models.'); }
  }
  async function changeModels(kind: CallKindValue, model: string) {
    if (!settings) return;
    const next = { ...settings, models: { ...settings.models, [kind]: model }, updatedAt: Date.now() };
    await db.settings.put(next); setSettings(next);
  }
  async function changeKey(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    try {
      stageKey(newKey);
      await listModels();
      await commitStagedKey(settings.keyStorage, passphrase, plainConfirmed);
      setNewKey(''); setStatus('Key storage updated and key validated.'); await refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not update key storage.'); }
  }
  async function unlockKey(event: React.FormEvent) {
    event.preventDefault();
    try { await unlock(passphrase); setPassphrase(''); setStatus('Key unlocked.'); }
    catch { setStatus('Wrong passphrase or damaged key data.'); }
  }
  async function chooseFolder() {
    try {
      const picker = (window as unknown as { showDirectoryPicker: (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      const folderHandle = await picker({ mode: 'readwrite' });
      if (!settings) return;
      const next = { ...settings, folderHandle, updatedAt: Date.now() };
      await db.settings.put(next); setSettings(next); setStatus(`Folder selected: ${folderHandle.name}.`);
    } catch { setStatus('Folder selection was cancelled or denied. Browser downloads remain available.'); }
  }
  async function exportBackup() {
    download('career-genie-backup.json', await backupJson());
    setStatus('Backup download started. It does not include your key, folder, PDFs, or original resume.');
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (await db.profiles.count() || await db.jobs.count() || await db.usage.count()) download('career-genie-pre-import-backup.json', await backupJson());
      await importBackup(await file.text());
      setStatus('Backup replaced local profile, interview, jobs, generations, and usage. Key and folder settings were kept.');
      await refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Backup import failed.'); }
  }
  async function deleteAll() {
    if (deleteText !== 'DELETE') return setStatus('Type DELETE to confirm.');
    lock();
    await db.delete();
    location.assign('/onboarding');
  }
  const totals = usage.reduce((result, record) => {
    const name = `${record.model} · ${record.callKind}`;
    result[name] = (result[name] ?? 0) + record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens;
    return result;
  }, {} as Record<string, number>);

  return <AppShell><section className="page stack">
    <h1>Settings</h1>
    <section className="card stack"><h2>Key</h2>
      <p>Storage: {settings?.keyStorage ?? KeyStorageMode.Encrypted}. Saved key: {settings?.keyHint ? `••••${settings.keyHint}` : 'none'}.</p>
      <div className="button-row"><button type="button" onClick={() => { lock(); setStatus('Key locked.'); }}>Lock key</button><button type="button" onClick={loadModels}>Load live model catalog</button></div>
      {settings?.keyStorage === KeyStorageMode.Encrypted && <form className="stack" onSubmit={unlockKey}><label htmlFor="unlock-passphrase">Unlock passphrase<input id="unlock-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} required /></label><button>Unlock</button></form>}
      <form className="stack" onSubmit={changeKey}><h3>Change key or storage mode</h3>
        <fieldset>
          <legend>Storage mode</legend>
          {Object.values(KeyStorageMode).map((mode) => (
            <RadioOption
              key={mode}
              name="storage"
              value={mode}
              checked={settings?.keyStorage === mode}
              onChange={() => {
                if (!settings) return;
                setSettings({ ...settings, keyStorage: mode, updatedAt: Date.now() });
              }}
            >
              {mode}
            </RadioOption>
          ))}
        </fieldset>
        <label htmlFor="replacement-key">Replacement Anthropic API key<input id="replacement-key" type="password" value={newKey} onChange={(event) => setNewKey(event.target.value)} required /></label>
        {settings?.keyStorage === KeyStorageMode.Encrypted && <label htmlFor="new-passphrase">Passphrase<input id="new-passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} minLength={12} required /></label>}
        {settings?.keyStorage === KeyStorageMode.Plaintext && (
          <CheckboxOption checked={plainConfirmed} onChange={setPlainConfirmed}>
            I understand this is unencrypted.
          </CheckboxOption>
        )}
        <button>Validate and save key</button></form>
    </section>
    <section className="card stack"><h2>Model choices</h2>{models.length ? <ModelPicker models={models} selected={settings?.models ?? {}} onChange={changeModels} /> : <p>Load the live model catalog after unlocking your key.</p>}</section>
    <section className="card stack"><h2>Storage and folder</h2><p>Using {estimate?.usage ?? 0} of {estimate?.quota ?? 0} bytes.</p><button type="button" onClick={chooseFolder}>Choose download folder</button><p>{settings?.folderHandle ? `Selected folder: ${settings.folderHandle.name}` : 'No folder selected; files download normally.'}</p></section>
    <section className="card stack">
      <h2>Backup</h2>
      <button type="button" onClick={exportBackup}>Export backup</button>
      <div className="file-upload">
        <input
          id="backup-file"
          className="file-upload-input"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
        <label htmlFor="backup-file" className="file-upload-target">
          <span className="file-upload-title">Choose backup file</span>
          <span className="file-upload-hint">JSON export · replaces local data after confirmation</span>
        </label>
      </div>
    </section>
    <section className="card stack"><h2>Usage</h2><p>Token totals only. Anthropic bills usage to your key; Career Genie does not estimate cost.</p><ul>{Object.entries(totals).map(([name, tokens]) => <li key={name}>{name}: {tokens.toLocaleString()} tokens</li>)}</ul></section>
    <section className="card danger stack"><h2>Delete all local data</h2><p>This removes this browser&apos;s Career Genie database. It cannot erase downloads or browser backups.</p><label htmlFor="delete-confirmation">Type DELETE to confirm<input id="delete-confirmation" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} /></label><button type="button" onClick={deleteAll}>Delete all local data</button></section>
    <p className="status" aria-live="polite">{status}</p>
  </section></AppShell>;
}
