'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { CheckboxOption, RadioOption } from '@/components/choice';
import { useFeedback } from '@/components/feedback';
import { Interview } from '@/components/interview';
import { ModelPicker } from '@/components/model-picker';
import { ProfileEditor } from '@/components/profile-editor';
import { db } from '@/lib/db';
import { stageKey, commitStagedKey } from '@/lib/keys';
import { listModels } from '@/lib/models';
import { parseResume } from '@/lib/parse-resume';
import { persistStorage } from '@/lib/storage';
import { CallKind, KeyStorageMode, type CallKind as CallKindValue, type ModelInfo, type Profile } from '@/lib/types';

function id() { return crypto.randomUUID(); }
function claim(text: string) { return { id: id(), text }; }
function optional(value: unknown): string | undefined { return typeof value === 'string' && value ? value : undefined; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }

function hydrateProfile(raw: Record<string, unknown>): Profile {
  const basics = raw.basics as Record<string, unknown>;
  return {
    id: 1,
    basics: {
      fullName: String(basics?.fullName ?? ''),
      email: String(basics?.email ?? ''),
      phone: optional(basics?.phone),
      location: optional(basics?.location),
      links: Array.isArray(basics?.links) ? basics.links.map((link) => {
        const item = link as Record<string, unknown>;
        return { id: id(), label: String(item.label ?? ''), url: String(item.url ?? '') };
      }) : [],
    },
    headline: optional(raw.headline) ? claim(String(raw.headline)) : undefined,
    summary: optional(raw.summary) ? claim(String(raw.summary)) : undefined,
    roles: (Array.isArray(raw.roles) ? raw.roles : []).map((role) => {
      const item = role as Record<string, unknown>;
      return { id: id(), company: String(item.company ?? ''), title: String(item.title ?? ''), location: optional(item.location), startDate: String(item.startDate ?? ''), endDate: optional(item.endDate), current: item.current === true, bullets: strings(item.bullets).map(claim) };
    }),
    education: (Array.isArray(raw.education) ? raw.education : []).map((education) => {
      const item = education as Record<string, unknown>;
      return { id: id(), institution: String(item.institution ?? ''), qualification: String(item.qualification ?? ''), field: optional(item.field), startDate: optional(item.startDate), endDate: optional(item.endDate), details: strings(item.details).map(claim) };
    }),
    projects: (Array.isArray(raw.projects) ? raw.projects : []).map((project) => {
      const item = project as Record<string, unknown>;
      return { id: id(), name: String(item.name ?? ''), url: optional(item.url), description: claim(String(item.description ?? '')), bullets: strings(item.bullets).map(claim) };
    }),
    skills: strings(raw.skills).map(claim),
    certifications: strings(raw.certifications).map(claim),
    languages: strings(raw.languages).map(claim),
    updatedAt: Date.now(),
  };
}

export default function OnboardingPage() {
  const { toast } = useFeedback();
  const [mode, setMode] = useState<KeyStorageMode>(KeyStorageMode.Encrypted);
  const [key, setKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [plainConfirmed, setPlainConfirmed] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selected, setSelected] = useState<Partial<Record<CallKindValue, string>>>({});
  const [file, setFile] = useState<File>();
  const [profile, setProfile] = useState<Profile>();
  const [editing, setEditing] = useState<Profile>();
  const [validating, setValidating] = useState(false);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    void (async () => {
      const [savedProfile, savedSettings] = await Promise.all([
        db.profiles.get(1),
        db.settings.get(1),
      ]);
      if (savedProfile) setProfile(savedProfile);
      if (savedSettings) {
        setMode(savedSettings.keyStorage);
        setSelected(savedSettings.models);
      }
      // Reload the live catalog when a key is already unlocked so the interview
      // can ask its first question without re-validating.
      try {
        setModels(await listModels());
      } catch {
        /* locked or missing key — user can validate again */
      }
    })();
  }, []);

  async function validateKey(event: React.FormEvent) {
    event.preventDefault();
    setValidating(true);
    try {
      stageKey(key);
      const catalog = await listModels();
      setModels(catalog);
      toast('Key validated. Select models compatible with each task.', 'success');
    } catch {
      toast('Could not validate the key. Check it and try again.', 'error');
    } finally {
      setValidating(false);
    }
  }

  async function saveModels() {
    if (Object.values(CallKind).some((kind) => !selected[kind])) {
      toast('Choose a model for every call type.', 'error');
      return;
    }
    try {
      await commitStagedKey(mode, passphrase, plainConfirmed);
      const settings = await db.settings.get(1);
      if (!settings) throw new Error();
      await db.settings.put({ ...settings, models: selected, updatedAt: Date.now() });
      setKey('');
      toast('Key and models saved. Upload your resume next.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save key settings.', 'error');
    }
  }

  async function parseFile() {
    const modelId = selected[CallKind.Parse];
    const model = models.find((candidate) => candidate.id === modelId);
    if (!file || !model) {
      toast('Choose a resume file and a compatible parse model.', 'error');
      return;
    }
    setParsing(true);
    try {
      setEditing(hydrateProfile(await parseResume(file, model)));
      toast('Review and confirm the proposed profile.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Resume parsing failed.', 'error');
    } finally {
      setParsing(false);
    }
  }

  async function saveProfile(next: Profile) {
    await db.profiles.put(next);
    setProfile(next);
    setEditing(undefined);
    const persisted = await persistStorage();
    toast(
      persisted === true
        ? 'Profile saved and browser storage protection requested.'
        : 'Profile saved.',
      'success',
    );
  }

  return (
    <AppShell>
      <section className="page stack">
        <h1>Set up Career Genie</h1>
        <p>Your original resume file is never saved. Before parsing, its content goes directly from your browser to Anthropic using your key.</p>
        <section className="card stack" aria-labelledby="key-title">
          <h2 id="key-title">1. Key storage and validation</h2>
          <form className="stack" onSubmit={validateKey}>
            <fieldset>
              <legend>Storage mode</legend>
              {Object.values(KeyStorageMode).map((value) => (
                <RadioOption
                  key={value}
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                >
                  {value}
                </RadioOption>
              ))}
            </fieldset>
            <label htmlFor="api-key">Anthropic API key</label>
            <input id="api-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} required />
            {mode === KeyStorageMode.Encrypted && <label htmlFor="passphrase">Encryption passphrase<input id="passphrase" type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} minLength={12} required /></label>}
            {mode === KeyStorageMode.Plaintext && (
              <CheckboxOption checked={plainConfirmed} onChange={setPlainConfirmed}>
                I understand this stores my key unencrypted in this browser.
              </CheckboxOption>
            )}
            <button type="submit" disabled={validating || parsing}>{validating ? 'Validating…' : 'Validate key'}</button>
          </form>
          {!!models.length && <>
            <ModelPicker models={models} selected={selected} onChange={(kind, model) => setSelected({ ...selected, [kind]: model })} />
            <button type="button" onClick={saveModels} disabled={parsing}>Save key and models</button>
          </>}
        </section>
        <section className="card stack" aria-labelledby="resume-title" aria-busy={parsing || undefined}>
          <h2 id="resume-title">2. Resume</h2>
          {parsing ? (
            <div className="loader" role="status" aria-live="polite">
              <span className="loader-spinner" aria-hidden="true" />
              <div className="loader-copy">
                <p className="loader-title">Parsing your resume</p>
                <p className="loader-hint">Sending the file to Anthropic with your key. This can take a moment.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="file-upload">
                <input
                  id="resume-file"
                  className="file-upload-input"
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => setFile(event.target.files?.[0] ?? undefined)}
                />
                <label htmlFor="resume-file" className="file-upload-target">
                  <span className="file-upload-title">
                    {file ? file.name : 'Choose resume file'}
                  </span>
                  <span className="file-upload-hint">
                    {file
                      ? `${(file.size / (1024 * 1024)).toFixed(2)} MiB · PDF or DOCX`
                      : 'PDF or DOCX · 10 MiB maximum'}
                  </span>
                </label>
              </div>
              <button type="button" onClick={parseFile} disabled={!file}>
                Parse resume
              </button>
            </>
          )}
        </section>
        {editing && <section className="card"><h2>3. Confirm your profile</h2><ProfileEditor profile={editing} onSave={saveProfile} submitLabel="Confirm and save profile" /></section>}
        {profile && <section className="card"><Interview profile={profile} model={models.find((model) => model.id === selected[CallKind.Interview])} onEdit={setEditing} onProfileSaved={setProfile} /><Link className="button-link" href="/settings">Finish for now</Link></section>}
      </section>
    </AppShell>
  );
}
