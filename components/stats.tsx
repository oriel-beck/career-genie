import { JobStatus, type Job } from '@/lib/types';

export function Stats({ jobs }: { jobs: Job[] }) {
  return <section className="stats" aria-label="Job statistics">
    <div><strong>{jobs.length}</strong><span>Total jobs</span></div>
    {Object.values(JobStatus).map((status) => (
      <div key={status}><strong>{jobs.filter((job) => job.status === status).length}</strong><span>{status}</span></div>
    ))}
  </section>;
}
