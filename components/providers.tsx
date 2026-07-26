'use client';

import type { ReactNode } from 'react';
import { FeedbackProvider } from './feedback';

export function Providers({ children }: { children: ReactNode }) {
  return <FeedbackProvider>{children}</FeedbackProvider>;
}
