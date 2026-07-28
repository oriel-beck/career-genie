'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { useFeedback } from '@/components/feedback';
import { GenerationEditor } from '@/components/generation-editor';
import { Select } from '@/components/select';
import { db } from '@/lib/db';
import { assertAiGrounding } from '@/lib/grounding';
import { listModels } from '@/lib/models';
import { tailorResume } from '@/lib/claude';
import { GenerationOrigin, JobStatus, type Generation, type Job, type Profile } from '@/lib/types';

function generationFrom(
  job: Job,
  value: Pick<Generation, 'resume' | 'coverLetter' | 'changeSummary'>,
  version: number,
  origin: Generation['origin'],
  parentId: string | undefined,
  modelUsed: string,
  extraContext?: string,
): Generation {
  return {
    id: crypto.randomUUID(),
    jobId: job.id,
    version,
    templateVersion: 1,
    origin,
    parentId,
    ...value,
    extraContext,
    modelUsed,
    createdAt: Date.now(),
  };
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, confirm } = useFeedback();
  const [job, setJob] = useState<Job>();
  const [profile, setProfile] = useState<Profile>();
  const [versions, setVersions] = useState<Generation[]>([]);
  const [active, setActive] = useState<Generation>();
  const [extraContext, setExtraContext] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [savedJob, savedProfile, savedVersions] = await Promise.all([
      db.jobs.get(id),
      db.profiles.get(1),
      db.generations.where('jobId').equals(id).toArray(),
    ]);
    savedVersions.sort((a, b) => b.version - a.version);
    setJob(savedJob);
    setProfile(savedProfile);
    setVersions(savedVersions);
    if (!active && savedVersions[0]) setActive(savedVersions[0]);
  }
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(value: Job['status']) {
    if (!job) return;
    const next = { ...job, status: value, updatedAt: Date.now() };
    await db.jobs.put(next);
    setJob(next);
    toast('Status saved.', 'success');
  }
  async function removeJob() {
    if (!job) return;
    const ok = await confirm({
      title: 'Delete this job?',
      message: 'This deletes the job and all of its generations. This cannot be undone.',
      confirmLabel: 'Delete job',
      danger: true,
    });
    if (!ok) return;
    await db.transaction('rw', db.jobs, db.generations, async () => {
      await db.generations.where('jobId').equals(job.id).delete();
      await db.jobs.delete(job.id);
    });
    toast('Job deleted.', 'info');
    router.push('/dashboard');
  }
  function selectVersion(version: Generation) {
    setActive(version);
  }
  async function saveVersion(
    origin: Generation['origin'],
    value: Pick<Generation, 'resume' | 'coverLetter' | 'changeSummary'>,
    modelUsed: string,
    parentId?: string,
    context?: string,
  ) {
    if (!job) return;
    let saved!: Generation;
    await db.transaction('rw', db.generations, async () => {
      const prior = await db.generations.where('jobId').equals(job.id).toArray();
      saved = generationFrom(
        job,
        value,
        Math.max(0, ...prior.map((item) => item.version)) + 1,
        origin,
        parentId,
        modelUsed,
        context,
      );
      await db.generations.add(saved);
    });
    setVersions((prior) => [saved, ...prior]);
    setActive(saved);
    return saved;
  }
  async function generate() {
    if (!job || !profile) {
      toast('Save a profile and job before generating.', 'error');
      return;
    }
    setBusy(true);
    try {
      const settings = await db.settings.get(1);
      if (!settings?.models.tailor) throw new Error('Choose a tailoring model in Settings.');
      const model = (await listModels()).find((item) => item.id === settings.models.tailor);
      if (!model?.capabilities.structured_outputs?.supported)
        throw new Error('Choose a valid tailoring model in Settings.');
      const result = await tailorResume(model, profile, job, extraContext || undefined);
      assertAiGrounding(profile, result.resume, result.coverLetter, GenerationOrigin.Ai);
      await saveVersion(
        GenerationOrigin.Ai,
        result,
        model.id,
        active?.id,
        extraContext || undefined,
      );
      toast('New AI version saved.', 'success');
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Generation failed. No version was saved.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!job)
    return (
      <AppShell>
        <section className="page stack">
          <h1>Job not found</h1>
          <Link href="/dashboard">Return to jobs</Link>
        </section>
      </AppShell>
    );
  return (
    <AppShell>
      <section className="page stack">
        <div className="button-row">
          <Link href="/dashboard">← Jobs</Link>
          <button type="button" className="secondary danger" onClick={() => void removeJob()}>
            Delete job
          </button>
        </div>
        <section className="card stack" aria-busy={busy || undefined}>
          <h1>{job.title}</h1>
          <p>{job.company}</p>
          <label htmlFor="job-status">
            Application status
            <Select
              id="job-status"
              value={job.status}
              onChange={(value) => void updateStatus(value as Job['status'])}
              options={Object.values(JobStatus).map((item) => ({ value: item, label: item }))}
              disabled={busy}
            />
          </label>
          <p className="prewrap">{job.description}</p>
          {job.requirements.length > 0 && (
            <>
              <h2>Requirements</h2>
              <ul>
                {job.requirements.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {busy ? (
            <div className="loader" role="status" aria-live="polite">
              <span className="loader-spinner" aria-hidden="true" />
              <div className="loader-copy">
                <p className="loader-title">Generating tailored documents</p>
                <p className="loader-hint">
                  Claude is rewriting your resume and cover letter for this role. This can take a
                  minute.
                </p>
              </div>
            </div>
          ) : (
            <>
              <label htmlFor="extra-context">
                Extra context (optional; treated as untrusted)
                <textarea
                  id="extra-context"
                  value={extraContext}
                  onChange={(event) => setExtraContext(event.target.value)}
                  rows={3}
                />
              </label>
              <button type="button" onClick={() => void generate()}>
                {active ? 'Regenerate' : 'Generate'}
              </button>
            </>
          )}
        </section>
        {versions.length > 0 && (
          <section className="card stack">
            <h2>Versions</h2>
            <div className="button-row">
              {versions.map((item) => (
                <button
                  className="secondary"
                  type="button"
                  key={item.id}
                  onClick={() => selectVersion(item)}
                  aria-pressed={active?.id === item.id}
                >
                  v{item.version} · {item.origin}
                </button>
              ))}
            </div>
          </section>
        )}
        {active && <GenerationEditor generation={active} />}
      </section>
    </AppShell>
  );
}
