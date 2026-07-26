'use client';

import { useState } from 'react';
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
  const [turns, setTurns] = useState<ChatTurn[]>(pending?.turns ?? []);
  const [proposal, setProposal] = useState<Profile | undefined>(pending?.profile);
  const [summary, setSummary] = useState<string[]>(pending?.summary ?? []);
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function persist(nextTurns: ChatTurn[], nextProposal = proposal, nextSummary = summary, complete = false) {
    await db.interview.put({
      id: 1, turns: nextTurns, pendingProfile: nextProposal, pendingSummary: nextSummary, complete, updatedAt: Date.now(),
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!model) return setStatus('Choose an interview model first.');
    if (!answer.trim()) return setStatus('Write an answer before sending.');
    setBusy(true);
    setStatus('Asking Career Genie…');
    const userTurn: ChatTurn = { id: crypto.randomUUID(), role: ChatRole.User, content: answer.trim(), createdAt: Date.now() };
    try {
      const result = await interviewProfile(model, profile, [...turns, userTurn]);
      const assistantTurn: ChatTurn = { id: crypto.randomUUID(), role: ChatRole.Assistant, content: result.reply, createdAt: Date.now() };
      const nextTurns = [...turns, userTurn, assistantTurn];
      setTurns(nextTurns);
      setAnswer('');
      setProposal(result.proposedProfile ?? undefined);
      setSummary(result.changes);
      await persist(nextTurns, result.proposedProfile ?? undefined, result.changes, result.complete);
      setStatus('Response ready.');
    } catch {
      setStatus('The interview request failed. Check your key, model, and connection, then try again.');
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!proposal) return;
    const next = { ...proposal, id: 1 as const, updatedAt: Date.now() };
    await db.profiles.put(next);
    await db.interview.put({ id: 1, turns, complete: false, updatedAt: Date.now() });
    setProposal(undefined);
    setSummary([]);
    onProfileSaved(next);
    setStatus('Profile changes approved.');
  }

  async function reject() {
    await db.interview.put({ id: 1, turns, complete: false, updatedAt: Date.now() });
    setProposal(undefined);
    setSummary([]);
    setStatus('Proposal discarded. Your profile was not changed.');
  }

  return (
    <section className="stack" aria-labelledby="interview-title">
      <h2 id="interview-title">Gap interview</h2>
      <p>Answer questions to clarify your existing experience. Suggested changes never apply until you approve them.</p>
      <div className="transcript" aria-live="polite">
        {turns.map((turn) => <p key={turn.id} className={`turn ${turn.role}`}><strong>{turn.role === ChatRole.User ? 'You' : 'Career Genie'}:</strong> {turn.content}</p>)}
      </div>
      <form className="stack" onSubmit={submit}>
        <label htmlFor="interview-answer">Your answer</label>
        <textarea id="interview-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} disabled={busy} />
        <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send answer'}</button>
      </form>
      {proposal && (
        <aside className="proposal" aria-labelledby="proposal-title">
          <h3 id="proposal-title">Proposed profile changes</h3>
          <ul>{summary.map((change) => <li key={change}>{change}</li>)}</ul>
          <div className="button-row">
            <button type="button" onClick={approve}>Approve</button>
            <button type="button" onClick={() => onEdit(proposal)}>Edit</button>
            <button type="button" className="secondary" onClick={reject}>Reject</button>
          </div>
        </aside>
      )}
      <p aria-live="polite" className="status">{status}</p>
    </section>
  );
}
