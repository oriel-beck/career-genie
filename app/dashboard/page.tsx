'use client';

import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { useFeedback } from '@/components/feedback';
import { Filters } from '@/components/filters';
import { JobCard } from '@/components/job-card';
import { Stats } from '@/components/stats';
import { analyzeJob } from '@/lib/claude';
import { db } from '@/lib/db';
import { extractJobText } from '@/lib/job-text';
import { listModels } from '@/lib/models';
import { JobStatus, type Job, type Profile } from '@/lib/types';

function blankJob(description = '', url?: string): Job {
  const now = Date.now();
  return {
    id: crypto.randomUUID(), title: '', company: '', url, description, requirements: [], keywords: [],
    status: JobStatus.Saved, matchScore: 0, gaps: [], createdAt: now, updatedAt: now,
  };
}

export default function DashboardPage() {
  const { toast } = useFeedback();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | Job['status']>('');
  const [draft, setDraft] = useState<Job>();
  const [url, setUrl] = useState('');
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState<'fetch' | 'analyze' | null>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  async function refresh() {
    setJobs((await db.jobs.toArray()).sort((a, b) => b.createdAt - a.createdAt));
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function buildAnalyzedDraft(rawText: string, sourceUrl?: string) {
    const [profile, settings] = await Promise.all([db.profiles.get(1), db.settings.get(1)]);
    if (!profile || !settings?.models.analyze) {
      throw new Error('Save a profile and choose an analysis model first.');
    }
    const models = await listModels();
    const model = models.find((item) => item.id === settings.models.analyze);
    if (!model?.capabilities.structured_outputs?.supported) {
      throw new Error('Choose a valid analysis model in Settings.');
    }
    const result = await analyzeJob(model, profile as Profile, rawText);
    const description = result.description.trim() || rawText;
    setPaste(description);
    setDraft({
      ...blankJob(description, sourceUrl),
      title: result.title.trim(),
      company: result.company.trim(),
      requirements: result.requirements,
      keywords: result.keywords,
      matchScore: Math.max(0, Math.min(100, Math.round(result.matchScore))),
      gaps: result.gaps,
    });
  }

  async function importUrl() {
    if (!url.trim()) return;
    setBusy('fetch');
    try {
      const response = await fetch('/api/fetch-job', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== 'object' || !('body' in data) || !('contentType' in data)) {
        throw new Error('fetch');
      }
      const body = typeof data.body === 'string' ? data.body : '';
      const contentType = typeof data.contentType === 'string' ? data.contentType : '';
      const text = extractJobText(body, contentType);
      if (!text) throw new Error('fetch');
      setPaste(text);
      setBusy('analyze');
      try {
        await buildAnalyzedDraft(text, url);
        toast('Job extracted. Review the draft before saving.', 'success');
      } catch (error) {
        setDraft(blankJob(text, url));
        toast(
          error instanceof Error && error.message !== 'fetch'
            ? `${error.message} Raw page text was kept for editing.`
            : 'Could not analyze that posting. Raw page text was kept for editing.',
          'error',
        );
      }
    } catch {
      toast('Could not import that URL. Paste the job text below instead.', 'error');
      pasteRef.current?.focus();
    } finally {
      setBusy(null);
    }
  }

  async function analyze() {
    const text = paste.trim();
    if (!text) {
      toast('Paste a job description first.', 'error');
      return;
    }
    setBusy('analyze');
    try {
      await buildAnalyzedDraft(text, url || undefined);
      toast('Job extracted. Review the draft before saving.', 'success');
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Analysis failed. You can still create and edit a job manually.',
        'error',
      );
      setDraft(blankJob(text, url || undefined));
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const matchScore = Number.isInteger(draft.matchScore) && draft.matchScore >= 0 && draft.matchScore <= 100 ? draft.matchScore : 0;
    await db.jobs.put({ ...draft, matchScore, updatedAt: Date.now() });
    setDraft(undefined); setPaste(''); setUrl(''); toast('Job saved.', 'success'); await refresh();
  }

  const visible = jobs.filter((job) => (!status || job.status === status) &&
    `${job.title} ${job.company}`.toLowerCase().includes(query.toLowerCase()));
  const loading = busy !== null;

  return <AppShell><section className="page stack">
    <h1>Jobs</h1>
    <Stats jobs={jobs} />
    <section className="card stack" aria-busy={loading || undefined}>
      <h2>Add a job</h2>
      {loading ? (
        <div className="loader" role="status" aria-live="polite">
          <span className="loader-spinner" aria-hidden="true" />
          <div className="loader-copy">
            <p className="loader-title">
              {busy === 'fetch' ? 'Fetching job posting' : 'Extracting job details'}
            </p>
            <p className="loader-hint">
              {busy === 'fetch'
                ? "Downloading the page through Career Genie's safe fetch route."
                : 'Filtering page junk and filling title, company, description, and requirements.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <label htmlFor="job-url">Job URL (optional)<input id="job-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
          <button type="button" className="secondary" onClick={() => void importUrl()}>Import URL</button>
          <label htmlFor="job-paste">Paste job description<textarea id="job-paste" ref={pasteRef} value={paste} onChange={(event) => setPaste(event.target.value)} rows={8} /></label>
          <div className="button-row">
            <button type="button" onClick={() => void analyze()}>Analyze and create draft</button>
            <button type="button" className="secondary" onClick={() => { if (paste.trim()) setDraft(blankJob(paste, url || undefined)); }}>Create without analysis</button>
          </div>
        </>
      )}
    </section>
    {draft && !loading && <form className="card stack" onSubmit={saveDraft}>
      <h2>Review job draft</h2>
      <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
      <label>Company<input value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} required /></label>
      <label>Description<textarea value={draft.description} rows={8} onChange={(event) => setDraft({ ...draft, description: event.target.value })} required /></label>
      <label>Requirements (one per line)<textarea value={draft.requirements.join('\n')} onChange={(event) => setDraft({ ...draft, requirements: event.target.value.split('\n').filter(Boolean) })} /></label>
      <label>Notes<textarea value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      <label>Match score (0–100)<input type="number" min="0" max="100" step="1" value={draft.matchScore} onChange={(event) => setDraft({ ...draft, matchScore: Number(event.target.value) })} /></label>
      {draft.gaps.length > 0 && (
        <>
          <h3>Gaps vs your profile</h3>
          <ul>{draft.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </>
      )}
      <button>Save job</button>
    </form>}
    <Filters query={query} status={status} onQuery={setQuery} onStatus={setStatus} />
    {visible.length ? <div className="job-list">{visible.map((job) => <JobCard key={job.id} job={job} onDeleted={() => void refresh()} />)}</div> :
      <p className="card">No jobs match. Add a job above to get started.</p>}
  </section></AppShell>;
}
