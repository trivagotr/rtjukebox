import { Lock, Play, Radio, RefreshCw, Trophy, Vote } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { VotingCandidate, VotingRound } from '../agent/types';
import { getWinnerLine } from './panelCopy';

interface ApiState {
  candidateCount: 2 | 3;
  round: VotingRound | null;
  attribution: string | null;
  playbackCommandPreview: string[] | null;
}

const emptyState: ApiState = {
  candidateCount: 3,
  round: null,
  attribution: null,
  playbackCommandPreview: null,
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function CandidateCard({
  candidate,
  round,
  onVote,
}: {
  candidate: VotingCandidate;
  round: VotingRound | null;
  onVote: (candidateId: string) => void;
}) {
  const isWinner = round?.winnerCandidateId === candidate.id;

  return (
    <article className={`candidate ${isWinner ? 'candidateWinner' : ''}`}>
      <div className="albumArt">
        {candidate.albumArtUrl ? (
          <img src={candidate.albumArtUrl} alt={`${candidate.title} album art`} />
        ) : (
          <MusicFallback />
        )}
      </div>
      <div className="candidateBody">
        <div>
          <h2>{candidate.title}</h2>
          <p>{candidate.artist}</p>
        </div>
        <div className="candidateFooter">
          <span className="voteCount">{candidate.votes}</span>
          <button type="button" onClick={() => onVote(candidate.id)} disabled={round?.status !== 'open'}>
            <Vote size={18} />
            Vote
          </button>
        </div>
      </div>
    </article>
  );
}

function MusicFallback() {
  return (
    <div className="fallbackArt">
      <Radio size={42} />
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<ApiState>(emptyState);
  const [candidateCount, setCandidateCount] = useState<2 | 3>(3);
  const [userId, setUserId] = useState('operator-demo');
  const [error, setError] = useState<string | null>(null);
  const winnerLine = useMemo(() => getWinnerLine(state.round, state.attribution), [state.attribution, state.round]);

  async function refresh() {
    setError(null);
    setState(await api<ApiState>('/api/state'));
  }

  async function startRound() {
    setError(null);
    setState(
      await api<ApiState>('/api/rounds/start', {
        method: 'POST',
        body: JSON.stringify({ candidateCount }),
      }),
    );
  }

  async function vote(candidateId: string) {
    if (!state.round) {
      return;
    }

    setError(null);
    setState(
      await api<ApiState>(`/api/rounds/${state.round.id}/votes`, {
        method: 'POST',
        body: JSON.stringify({ userId, candidateId }),
      }),
    );
  }

  async function lock() {
    if (!state.round) {
      return;
    }

    setError(null);
    setState(await api<ApiState>(`/api/rounds/${state.round.id}/lock`, { method: 'POST' }));
  }

  async function resolve() {
    if (!state.round) {
      return;
    }

    setError(null);
    setState(await api<ApiState>(`/api/rounds/${state.round.id}/resolve`, { method: 'POST' }));
  }

  useEffect(() => {
    refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Request failed'));
  }, []);

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="kicker">RadioTEDU</p>
          <h1>Voting Agent</h1>
        </div>
        <button type="button" className="iconButton" onClick={() => refresh().catch((err) => setError(err.message))}>
          <RefreshCw size={20} />
        </button>
      </section>

      <section className="controlStrip">
        <div className="segmented">
          {[2, 3].map((count) => (
            <button
              key={count}
              type="button"
              className={candidateCount === count ? 'active' : ''}
              onClick={() => setCandidateCount(count as 2 | 3)}
            >
              {count}
            </button>
          ))}
        </div>
        <input value={userId} onChange={(event) => setUserId(event.target.value)} aria-label="Voter id" />
        <button type="button" onClick={() => startRound().catch((err) => setError(err.message))}>
          <Play size={18} />
          Start
        </button>
        <button type="button" onClick={() => lock().catch((err) => setError(err.message))} disabled={!state.round}>
          <Lock size={18} />
          Lock
        </button>
        <button type="button" onClick={() => resolve().catch((err) => setError(err.message))} disabled={!state.round}>
          <Trophy size={18} />
          Resolve
        </button>
      </section>

      {error ? <div className="notice">{error}</div> : null}

      <section className="statusGrid">
        <div className="statusPanel">
          <span>State</span>
          <strong>{state.round?.status ?? 'idle'}</strong>
        </div>
        <div className="statusPanel">
          <span>Candidates</span>
          <strong>{state.round?.candidates.length ?? candidateCount}</strong>
        </div>
        <div className="statusPanel wide">
          <span>Winner</span>
          <strong>{winnerLine}</strong>
        </div>
      </section>

      <section className="candidateGrid">
        {(state.round?.candidates ?? []).map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} round={state.round} onVote={vote} />
        ))}
      </section>

      <section className="commandPanel">
        <span>FFmpeg</span>
        <code>{state.playbackCommandPreview?.join(' ') ?? 'dry-run command appears after resolve'}</code>
      </section>
    </main>
  );
}
