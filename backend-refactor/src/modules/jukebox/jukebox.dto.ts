import type { QueueItemRecord, QueueSongFallback } from './ports/jukebox.repository.js';

function playbackItem<T extends QueueItemRecord | QueueSongFallback>(item: T) {
  const sourceType = item.source_type === 'spotify' ? 'spotify' : 'local';
  return {
    ...item,
    source_type: sourceType,
    playback_type: sourceType,
    spotify_uri: sourceType === 'spotify' ? item.spotify_uri : null,
    file_url: sourceType === 'local' ? item.file_url : null,
    asset_role: item.asset_role === 'jingle' || item.asset_role === 'ad' ? item.asset_role : 'music',
  };
}

export function toQueueStateDto(rows: QueueItemRecord[], currentSong: QueueSongFallback | null) {
  const decorated = rows.map(playbackItem);
  const nowPlaying = decorated.find((item) => item.status === 'playing')
    ?? (currentSong ? playbackItem({
      ...currentSong,
      id: `current-${currentSong.id}`,
      status: 'playing',
      added_by_name: 'Radio TEDU (Otomatik)',
      is_autoplay: true,
    }) : null);
  return {
    now_playing: nowPlaying,
    queue: decorated.filter((item) => item.status === 'pending' && item.queue_reason !== 'jingle' && item.queue_reason !== 'ad'),
  };
}
