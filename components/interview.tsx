'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { interviewProfile } from '@/lib/claude';
import { db } from '@/lib/db';
import { ChatRole, type ChatTurn, type ModelInfo, type Profile } from '@/lib/types';

export function Interview({
  profile,
  model,
  pending,
  onEdit,
  onProfileSaved,
}: {
  profile: Profile;
  model?: ModelInfo;
  pending?: { profile?: Profile; summary?: string[]; turns: ChatTurn[]; complete: boolean };
  onEdit: (profile: Profile) => void;
  onProfileSaved: (profile: Profile) => void;
}) {
  const { toast, confirm } = useFeedback();
  const [turns, setTurns] = useState<ChatTurn[]>(pending?.turns ?? []);
  const [proposal, setProposal] = useState<Profile | undefined>(pending?.profile);
  const [summary, setSummary] = useState<string[]>(pending?.summary ?? []);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(!pending?.turns.length);
  const [ready, setReady] = useState(Boolean(pending?.turns.length));
  const profileRef = useRef(profile);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  function makeAssistantTurn(reply: string, questions: string[]): ChatTurn {
    return {
      id: crypto.randomUUID(),
      role: ChatRole.Assistant,
      content: reply,
      questions: questions.length ? questions : undefined,
      createdAt: Date.now(),
    };
  }

  async function persist(
    nextTurns: ChatTurn[],
    nextProposal = proposal,
    nextSummary = summary,
    complete = false,
  ) {
    await db.interview.put({
      id: 1,
      turns: nextTurns,
      pendingProfile: nextProposal,
      pendingSummary: nextSummary,
      complete,
      updatedAt: Date.now(),
    });
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function boot() {
      setBooting(true);
      try {
        const saved = await db.interview.get(1);
        if (cancelled) return;
        if (saved?.turns.length) {
          setTurns(saved.turns);
          setProposal(saved.pendingProfile);
          setSummary(saved.pendingSummary ?? []);
          setReady(true);
          return;
        }
        if (pending?.turns.length) {
          setReady(true);
          return;
        }
        if (!model) {
          setReady(false);
          return;
        }

        const result = await interviewProfile(model, profileRef.current, [], controller.signal);
        if (cancelled) return;
        const nextTurns = [makeAssistantTurn(result.reply, result.questions)];
        setTurns(nextTurns);
        setProposal(result.proposedProfile ?? undefined);
        setSummary(result.changes);
        await persist(
          nextTurns,
          result.proposedProfile ?? undefined,
          result.changes,
          result.complete,
        );
        setReady(true);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        toast(
          error instanceof Error
            ? error.message
            : 'Could not start the gap interview. Check your key and interview model.',
          'error',
        );
        setReady(false);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [model?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!model) {
      toast('Choose an interview model first.', 'error');
      return;
    }
    const text = answer.trim();
    if (!text) {
      toast('Write an answer before sending.', 'error');
      return;
    }

    const previousTurns = turns;
    const userTurn: ChatTurn = {
      id: crypto.randomUUID(),
      role: ChatRole.User,
      content: text,
      createdAt: Date.now(),
    };
    const pendingTurns = [...previousTurns, userTurn];

    setTurns(pendingTurns);
    setAnswer('');
    setBusy(true);

    try {
      const result = await interviewProfile(model, profile, pendingTurns);
      const assistantTurn = makeAssistantTurn(result.reply, result.questions);
      const nextTurns = [...pendingTurns, assistantTurn];
      setTurns(nextTurns);
      setProposal(result.proposedProfile ?? undefined);
      setSummary(result.changes);
      await persist(
        nextTurns,
        result.proposedProfile ?? undefined,
        result.changes,
        result.complete,
      );
      toast('Response ready.', 'success');
    } catch (error) {
      setTurns(previousTurns);
      setAnswer(text);
      toast(
        error instanceof Error
          ? error.message
          : 'The interview request failed. Check your key, model, and connection, then try again.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!proposal) return;
    const ok = await confirm({
      title: 'Approve profile changes?',
      message: 'Approved changes replace your saved profile. You can still edit later.',
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    const next = { ...proposal, id: 1 as const, updatedAt: Date.now() };
    await db.profiles.put(next);
    await db.interview.put({ id: 1, turns, complete: false, updatedAt: Date.now() });
    setProposal(undefined);
    setSummary([]);
    onProfileSaved(next);
    toast('Profile changes approved.', 'success');
  }

  async function reject() {
    const ok = await confirm({
      title: 'Discard proposal?',
      message: 'The suggested profile changes will be discarded. Your saved profile stays as-is.',
      confirmLabel: 'Discard',
      danger: true,
    });
    if (!ok) return;
    await db.interview.put({ id: 1, turns, complete: false, updatedAt: Date.now() });
    setProposal(undefined);
    setSummary([]);
    toast('Proposal discarded. Your profile was not changed.', 'info');
  }

  async function retryStart() {
    if (!model) {
      toast('Unlock your key and choose an interview model first.', 'error');
      return;
    }
    setBooting(true);
    try {
      const result = await interviewProfile(model, profile, []);
      const nextTurns = [makeAssistantTurn(result.reply, result.questions)];
      setTurns(nextTurns);
      setProposal(result.proposedProfile ?? undefined);
      setSummary(result.changes);
      await persist(
        nextTurns,
        result.proposedProfile ?? undefined,
        result.changes,
        result.complete,
      );
      setReady(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not start the gap interview.', 'error');
    } finally {
      setBooting(false);
    }
  }

  return (
    <section
      className="stack"
      aria-labelledby="interview-title"
      aria-busy={booting || busy || undefined}
    >
      <h2 id="interview-title">Gap interview</h2>
      <p>
        Answer questions to clarify your existing experience. Suggested changes never apply until
        you approve them.
      </p>
      {booting ? (
        <div className="loader" role="status" aria-live="polite">
          <span className="loader-spinner" aria-hidden="true" />
          <div className="loader-copy">
            <p className="loader-title">Preparing your first question</p>
            <p className="loader-hint">Career Genie is reviewing your profile for gaps.</p>
          </div>
        </div>
      ) : !ready || !turns.length ? (
        <div className="stack">
          <p className="hint">
            {model
              ? 'The first interview question is not ready yet.'
              : 'Unlock your key and choose an interview model to start the gap interview.'}
          </p>
          <button type="button" onClick={() => void retryStart()} disabled={!model}>
            Start interview
          </button>
        </div>
      ) : (
        <>
          <div className="transcript" aria-live="polite">
            {turns.map((turn) => (
              <div key={turn.id} className={`turn ${turn.role}`}>
                <p className="turn-intro">
                  <strong>{turn.role === ChatRole.User ? 'You' : 'Career Genie'}:</strong>{' '}
                  {turn.content}
                </p>
                {turn.role === ChatRole.Assistant &&
                  turn.questions &&
                  turn.questions.length > 0 && (
                    <ol className="interview-questions">
                      {turn.questions.map((question) => (
                        <li key={question}>{question}</li>
                      ))}
                    </ol>
                  )}
              </div>
            ))}
            {busy && (
              <div className="loader transcript-thinking" role="status" aria-live="polite">
                <span className="loader-spinner" aria-hidden="true" />
                <div className="loader-copy">
                  <p className="loader-title">Thinking about your answer</p>
                  <p className="loader-hint">The next question will appear when ready.</p>
                </div>
              </div>
            )}
          </div>
          <form className="stack" onSubmit={submit}>
            <label htmlFor="interview-answer">Your answer</label>
            <textarea
              id="interview-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={3}
              disabled={busy}
            />
            <div className="button-row">
              <button type="submit" disabled={busy}>
                Send answer
              </button>
              <Link className="button-link secondary" href="/dashboard">
                Finish for now
              </Link>
            </div>
          </form>
        </>
      )}
      {proposal && !booting && (
        <aside className="proposal" aria-labelledby="proposal-title">
          <h3 id="proposal-title">Proposed profile changes</h3>
          <ul>
            {summary.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <div className="button-row">
            <button type="button" onClick={() => void approve()}>
              Approve
            </button>
            <button type="button" onClick={() => onEdit(proposal)}>
              Edit
            </button>
            <button type="button" className="secondary" onClick={() => void reject()}>
              Reject
            </button>
          </div>
        </aside>
      )}
    </section>
  );
}
