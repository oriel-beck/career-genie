'use client';

import { useState } from 'react';
import type { Profile } from '@/lib/types';

export function ProfileEditor({
  profile,
  onSave,
  submitLabel = 'Save profile',
}: {
  profile: Profile;
  onSave: (profile: Profile) => Promise<void> | void;
  submitLabel?: string;
}) {
  const [value, setValue] = useState(() => JSON.stringify(profile, null, 2));
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const next: unknown = JSON.parse(value);
      if (!next || typeof next !== 'object' || Array.isArray(next)) throw new Error();
      const candidate = next as Profile;
      if (candidate.id !== 1 || !candidate.basics?.fullName || !candidate.basics?.email) {
        throw new Error();
      }
      setError('');
      await onSave({ ...candidate, updatedAt: Date.now() });
    } catch {
      setError('Enter a complete profile JSON object with a name and email.');
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label htmlFor="profile-json">Profile details</label>
      <p className="hint">Edit every profile field here. IDs keep your approved experience linked to future AI changes.</p>
      <textarea id="profile-json" value={value} onChange={(event) => setValue(event.target.value)} rows={18} spellCheck={false} aria-describedby="profile-error" />
      <p id="profile-error" className="field-error" aria-live="polite">{error}</p>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
