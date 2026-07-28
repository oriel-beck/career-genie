'use client';

import { useState } from 'react';
import { unlock } from '@/lib/keys';

type UnlockKeyFormProps = {
  id: string;
  onUnlocked?: () => void;
  onCancel?: () => void;
};

export function UnlockKeyForm({ id, onUnlocked, onCancel }: UnlockKeyFormProps) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await unlock(passphrase);
      setPassphrase('');
      onUnlocked?.();
    } catch {
      setError('Wrong passphrase or damaged key data.');
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <label htmlFor={id}>
        Unlock passphrase
        <input
          id={id}
          type="password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          required
          autoFocus={Boolean(onCancel)}
        />
      </label>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {onCancel ? (
        <div className="button-row dialog-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button>Unlock</button>
        </div>
      ) : (
        <button>Unlock</button>
      )}
    </form>
  );
}
