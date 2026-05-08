import {ArcadeGame, submitGameScore} from '../../services/gamificationService';

export function createClientRoundId(game: ArcadeGame) {
  return `${game.slug || game.id}-${Date.now()}`;
}

export function buildGameScorePayload(params: {
  score: number;
  clientRoundId: string;
  startedAt: number;
  now?: number;
}) {
  return {
    score: Math.max(0, Math.floor(params.score)),
    client_round_id: params.clientRoundId,
    play_duration_ms: Math.max(0, (params.now ?? Date.now()) - params.startedAt),
    submission_source: 'mobile_game' as const,
  };
}

export function getGameResultMessage(score: number, awardedXp: number) {
  return `${Math.max(0, Math.floor(score))} skor · +${Math.max(0, Math.floor(awardedXp))} XP`;
}

export async function submitMobileGameScore(params: {
  game: ArcadeGame;
  score: number;
  clientRoundId: string;
  startedAt: number;
}) {
  const payload = buildGameScorePayload(params);
  return submitGameScore(params.game.id, payload);
}
