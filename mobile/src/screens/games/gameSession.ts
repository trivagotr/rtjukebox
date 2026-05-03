import {Alert} from 'react-native';
import {ArcadeGame, submitGameScore} from '../../services/gamificationService';

export function createClientRoundId(game: ArcadeGame) {
  return `${game.slug || game.id}-${Date.now()}`;
}

export async function submitMobileGameScore(params: {
  game: ArcadeGame;
  score: number;
  clientRoundId: string;
  startedAt: number;
}) {
  const result: any = await submitGameScore(params.game.id, {
    score: Math.max(0, Math.floor(params.score)),
    client_round_id: params.clientRoundId,
    play_duration_ms: Math.max(0, Date.now() - params.startedAt),
    submission_source: 'mobile_game',
  });

  Alert.alert(
    'Skor gönderildi',
    `${Math.max(0, Math.floor(params.score))} skor · +${result?.points_awarded ?? 0} puan`,
  );

  return result;
}
