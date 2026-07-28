'use client';

import Link from 'next/link';
import { useFeedback } from '@/components/feedback';
import { MatchScore } from '@/components/match-score';
import { db } from '@/lib/db';
import type { Job } from '@/lib/types';

export function JobCard({ job, onDeleted }: { job: Job; onDeleted?: () => void }) {
  const { toast, confirm } = useFeedback();

  async function removeJob() {
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
    onDeleted?.();
  }

  return (
    <div className="card job-card">
      <details className="job-card-details">
        <summary className="job-card-summary">
          <span className="job-card-title">{job.title || 'Untitled job'}</span>
          <span className="job-card-company">{job.company || 'Company not set'}</span>
          <span className="eyebrow">{job.status} · <MatchScore score={job.matchScore} gaps={job.gaps} /></span>
        </summary>
        <div className="job-card-body">
          <p className="prewrap">{job.description}</p>
        </div>
      </details>
      <div className="job-card-actions">
        <Link className="button-link" href={`/jobs/${job.id}`}>
          Review job
        </Link>
        <button type="button" className="secondary danger" onClick={() => void removeJob()}>
          Delete
        </button>
      </div>
    </div>
  );
}
