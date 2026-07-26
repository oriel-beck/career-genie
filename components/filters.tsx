'use client';

import { JobStatus, type JobStatus as JobStatusValue } from '@/lib/types';

export function Filters({
  query,
  status,
  onQuery,
  onStatus,
}: {
  query: string;
  status: '' | JobStatusValue;
  onQuery: (value: string) => void;
  onStatus: (value: '' | JobStatusValue) => void;
}) {
  return <div className="filters">
    <label htmlFor="job-search">Search jobs
      <input id="job-search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Title or company" />
    </label>
    <label htmlFor="job-status-filter">Status
      <select id="job-status-filter" value={status} onChange={(event) => onStatus(event.target.value as '' | JobStatusValue)}>
        <option value="">All statuses</option>
        {Object.values(JobStatus).map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
  </div>;
}
