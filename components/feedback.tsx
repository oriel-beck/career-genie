'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { UnlockKeyForm } from './unlock-key-form';
import { isLockedKeyMessage } from '@/lib/keys';

export type ToastTone = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type FeedbackApi = {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback requires FeedbackProvider');
  return value;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pending, setPending] = useState<
    (ConfirmOptions & { resolve: (value: boolean) => void }) | null
  >(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    if (tone === 'error' && isLockedKeyMessage(message)) {
      setUnlockOpen(true);
      return;
    }
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 8_000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    confirmButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, close]);

  useEffect(() => {
    if (!unlockOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUnlockOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [unlockOpen]);

  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions">
        {toasts.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`} role="status">
            <p>{item.message}</p>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() =>
                setToasts((current) => current.filter((entry) => entry.id !== item.id))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {pending ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => close(false)}
        >
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="confirm-title">{pending.title}</h2>
            <p id="confirm-message">{pending.message}</p>
            <div className="button-row dialog-actions">
              <button type="button" className="secondary" onClick={() => close(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className={pending.danger ? 'danger' : undefined}
                onClick={() => close(true)}
              >
                {pending.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {unlockOpen ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={() => setUnlockOpen(false)}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unlock-title"
            aria-describedby="unlock-message"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="unlock-title">Unlock API key</h2>
            <p id="unlock-message">Your encrypted key is locked. Enter your passphrase to continue.</p>
            <UnlockKeyForm
              id="dialog-unlock-passphrase"
              onUnlocked={() => {
                setUnlockOpen(false);
                toast('Key unlocked.', 'success');
              }}
              onCancel={() => setUnlockOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  );
}
