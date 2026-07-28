'use client';

import { useId, type KeyboardEvent, type MouseEvent } from 'react';

export function HoverTooltip({ label, className }: { label: string; className?: string }) {
  const tooltipId = useId();

  function stopToggle(event: MouseEvent | KeyboardEvent) {
    event.stopPropagation();
  }

  return (
    <span
      className={['hover-tooltip', className].filter(Boolean).join(' ')}
      tabIndex={0}
      title={label}
      aria-describedby={tooltipId}
      onClick={stopToggle}
      onKeyDown={stopToggle}
    >
      <span className="hover-tooltip-text">{label}</span>
      <span className="hover-tooltip-panel" id={tooltipId} role="tooltip">
        {label}
      </span>
    </span>
  );
}
