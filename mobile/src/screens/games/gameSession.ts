import {useCallback, useEffect, useRef, useState} from 'react';
import {ArcadeGame, startGamePlaySession, submitGameScore} from '../../services/gamificationService';

export function useServerGameSession(gameId: string) {
  const sessionIdRef = useRef<string | null>(null);
  const sessionPromiseRef = useRef<Promise<string | null>>(Promise.resolve(null));
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const beginNewRound = useCallback(() => {
    setReady(false);
    setFailed(false);
    sessionIdRef.current = null;
    const pendingSession = startGamePlaySession(gameId)
      .then((session) => {
        sessionIdRef.current = session.id;
        setReady(true);
        return session.id;
      })
      .catch(() => {
        setFailed(true);
        return null;
      });
    sessionPromiseRef.current = pendingSession;
    return pendingSession;
  }, [gameId]);

  useEffect(() => {
    void beginNewRound();
  }, [beginNewRound]);

  const waitForSession = useCallback(() => sessionPromiseRef.current, []);
  return {sessionIdRef, ready, failed, beginNewRound, waitForSession};
}

export function getGameResultMessage(score: number, awardedXp: number) {
  return `${Math.max(0, Math.floor(score))} skor · +${Math.max(0, Math.floor(awardedXp))} XP`;
}

export async function submitMobileGameScore(params: {
  game: ArcadeGame;
  score: number;
  sessionId: string;
}) {
  return submitGameScore(params.game.id, {
    score: Math.max(0, Math.floor(params.score)),
    session_id: params.sessionId,
  });
}
