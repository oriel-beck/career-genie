'use client';

import { Select } from '@/components/select';
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
  return (
    <div className="filters">
      <label htmlFor="job-search">
        Search jobs
        <input
          id="job-search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Title or company"
        />
      </label>
      <label htmlFor="job-status-filter">
        Status
        <Select
          id="job-status-filter"
          value={status}
          onChange={(value) => onStatus(value as '' | JobStatusValue)}
          options={[
            { value: '', label: 'All statuses' },
            ...Object.values(JobStatus).map((value) => ({ value, label: value })),
          ]}
        />
      </label>
    </div>
  );
}
