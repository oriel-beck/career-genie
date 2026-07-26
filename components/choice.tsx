'use client';

import type { ReactNode } from 'react';

type RadioProps = {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
};

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
};

export function RadioOption({ name, value, checked, onChange, children }: RadioProps) {
  return (
    <label className="choice">
      <input
        type="radio"
        className="choice-input"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
      />
      <span className="choice-mark choice-mark-radio" aria-hidden="true" />
      <span className="choice-text">{children}</span>
    </label>
  );
}

export function CheckboxOption({ checked, onChange, children }: CheckboxProps) {
  return (
    <label className="choice">
      <input
        type="checkbox"
        className="choice-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="choice-mark choice-mark-check" aria-hidden="true" />
      <span className="choice-text">{children}</span>
    </label>
  );
}
