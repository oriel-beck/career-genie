'use client';

import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | Job['status']>('');
  const [draft, setDraft] = useState<Job>();
  const [url, setUrl] = useState('');
  const [paste, setPaste] = useState('');
  const [message, setMessage] = useState('');
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  async function refresh() {
    setJobs((await db.jobs.toArray()).sort((a, b) => b.createdAt - a.createdAt));
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function importUrl() {
    if (!url.trim()) return;
    setMessage('Fetching job posting…');
    try {
      const response = await fetch('/api/fetch-job', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== 'object' || !('body' in data) || !('contentType' in data)) throw new Error();
      const body = typeof data.body === 'string' ? data.body : '';
      const contentType = typeof data.contentType === 'string' ? data.contentType : '';
      const text = extractJobText(body, contentType);
      if (!text) throw new Error();
      setPaste(text);
      setDraft(blankJob(text, url));
      setMessage('Review the draft before saving.');
    } catch {
      setMessage('Could not import that URL. Paste the job text below instead.');
      pasteRef.current?.focus();
    }
  }

  async function analyze() {
    const text = paste.trim();
    if (!text) return setMessage('Paste a job description first.');
    const [profile, settings] = await Promise.all([db.profiles.get(1), db.settings.get(1)]);
    if (!profile || !settings?.models.analyze) return setMessage('Save a profile and choose an analysis model first.');
    try {
      setMessage('Analyzing job…');
      const models = await listModels();
      const model = models.find((item) => item.id === settings.models.analyze);
      if (!model?.capabilities.structured_outputs?.supported) throw new Error();
      const result = await analyzeJob(model, profile as Profile, text);
      setDraft({
        ...blankJob(text, url || undefined),
        title: result.title, company: result.company, requirements: result.requirements,
        keywords: result.keywords, matchScore: Math.max(0, Math.min(100, Math.round(result.matchScore))), gaps: result.gaps,
      });
      setMessage('Review the draft before saving.');
    } catch {
      setMessage('Analysis failed. You can still create and edit a job manually.');
      setDraft(blankJob(text, url || undefined));
    }
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const matchScore = Number.isInteger(draft.matchScore) && draft.matchScore >= 0 && draft.matchScore <= 100 ? draft.matchScore : 0;
    await db.jobs.put({ ...draft, matchScore, updatedAt: Date.now() });
    setDraft(undefined); setPaste(''); setUrl(''); setMessage('Job saved.'); await refresh();
  }

  const visible = jobs.filter((job) => (!status || job.status === status) &&
    `${job.title} ${job.company}`.toLowerCase().includes(query.toLowerCase()));

  return <AppShell><section className="page stack">
    <h1>Jobs</h1>
    <Stats jobs={jobs} />
    <section className="card stack">
      <h2>Add a job</h2>
      <label htmlFor="job-url">Job URL (optional)<input id="job-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
      <button type="button" className="secondary" onClick={() => void importUrl()}>Import URL</button>
      <label htmlFor="job-paste">Paste job description<textarea id="job-paste" ref={pasteRef} value={paste} onChange={(event) => setPaste(event.target.value)} rows={8} /></label>
      <button type="button" onClick={() => void analyze()}>Analyze and create draft</button>
      <button type="button" className="secondary" onClick={() => { if (paste.trim()) setDraft(blankJob(paste, url || undefined)); }}>Create without analysis</button>
      <p className="status" aria-live="polite">{message}</p>
    </section>
    {draft && <form className="card stack" onSubmit={saveDraft}>
      <h2>Review job draft</h2>
      <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
      <label>Company<input value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} required /></label>
      <label>Description<textarea value={draft.description} rows={8} onChange={(event) => setDraft({ ...draft, description: event.target.value })} required /></label>
      <label>Requirements (one per line)<textarea value={draft.requirements.join('\n')} onChange={(event) => setDraft({ ...draft, requirements: event.target.value.split('\n').filter(Boolean) })} /></label>
      <label>Notes<textarea value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      <label>Match score (0–100)<input type="number" min="0" max="100" step="1" value={draft.matchScore} onChange={(event) => setDraft({ ...draft, matchScore: Number(event.target.value) })} /></label>
      <button>Save job</button>
    </form>}
    <Filters query={query} status={status} onQuery={setQuery} onStatus={setStatus} />
    {visible.length ? <div className="job-list">{visible.map((job) => <JobCard key={job.id} job={job} />)}</div> :
      <p className="card">No jobs match. Add a job above to get started.</p>}
  </section></AppShell>;
}
