export function getIstanbulDayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function hasSupervoteAvailableToday(lastSuperVoteAt?: string) {
  return !lastSuperVoteAt || getIstanbulDayKey(lastSuperVoteAt) !== getIstanbulDayKey(new Date());
}

export function getDisplayedSongScore(item: { song_score?: number | null; priority_score?: number | null }) {
  return item.song_score ?? item.priority_score ?? 0;
}

export function isSupervoteActive(vote: number | undefined) {
  return vote === 3 || vote === 4;
}

export function resolveDisplayedVote(
  item: { id: string; user_vote?: number },
  myVotes: Record<string, number>,
) {
  return myVotes[item.id] !== undefined ? myVotes[item.id] : item.user_vote;
}
