import Link from 'next/link';
import type { Job } from '@/lib/types';

export function JobCard({ job }: { job: Job }) {
  return <article className="card job-card">
    <div>
      <p className="eyebrow">{job.status} · {job.matchScore}% match</p>
      <h2><Link href={`/jobs/${job.id}`}>{job.title || 'Untitled job'}</Link></h2>
      <p>{job.company || 'Company not set'}</p>
    </div>
    <p className="prewrap">{job.description}</p>
    <Link className="button-link" href={`/jobs/${job.id}`}>Review job</Link>
  </article>;
}
