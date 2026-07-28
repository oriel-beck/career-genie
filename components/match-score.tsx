'use client';

import { useId } from 'react';

export function MatchScore({ score, gaps }: { score: number; gaps: string[] }) {
  const tooltipId = useId();

  if (!gaps.length) {
    return <>{score}%</>;
  }

  return (
    <span
      className="hover-tooltip match-score-tooltip"
      tabIndex={0}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      aria-describedby={tooltipId}
    >
      {score}%
      <span className="hover-tooltip-panel" id={tooltipId} role="tooltip">
        <span className="match-score-tooltip-title">Gaps vs your profile</span>
        <ul className="match-score-tooltip-list">
          {gaps.map((gap) => <li key={gap}>{gap}</li>)}
        </ul>
      </span>
    </span>
  );
}
