import Link from 'next/link';
import type { Job } from '@/lib/types';

export function JobCard({ job }: { job: Job }) {
  return (
    <details className="card job-card">
      <summary className="job-card-summary">
        <span className="job-card-title">{job.title || 'Untitled job'}</span>
        <span className="job-card-company">{job.company || 'Company not set'}</span>
        <span className="eyebrow">{job.status} · {job.matchScore}%</span>
      </summary>
      <div className="job-card-body">
        <p className="prewrap">{job.description}</p>
        <Link className="button-link" href={`/jobs/${job.id}`}>Review job</Link>
      </div>
    </details>
  );
}
