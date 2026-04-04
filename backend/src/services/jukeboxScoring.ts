export type JukeboxVoteKind = 'none' | 'upvote' | 'downvote' | 'supervote';

const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';

const SONG_SCORE_BY_VOTE: Record<JukeboxVoteKind, number> = {
    none: 0,
    upvote: 1,
    downvote: -1,
    supervote: 3,
};

const REQUESTER_RANK_BY_VOTE: Record<JukeboxVoteKind, number> = {
    none: 0,
    upvote: 1,
    downvote: -1,
    supervote: 2,
};

function formatDateParts(input: Date | number | string) {
    const date = input instanceof Date ? input : new Date(input);
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: ISTANBUL_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    return {
        year: parts.find((part) => part.type === 'year')?.value ?? '0000',
        month: parts.find((part) => part.type === 'month')?.value ?? '01',
        day: parts.find((part) => part.type === 'day')?.value ?? '01',
    };
}

export function normalizeVoteKind(value: unknown): JukeboxVoteKind {
    if (value === 1 || value === 'upvote') {
        return 'upvote';
    }

    if (value === -1 || value === 'downvote') {
        return 'downvote';
    }

    if (value === 3 || value === 4 || value === 'supervote') {
        return 'supervote';
    }

    return 'none';
}

export function getInitialSongScore() {
    return 0;
}

export function getSongScoreDelta(previousVote: unknown, nextVote: unknown) {
    return SONG_SCORE_BY_VOTE[normalizeVoteKind(nextVote)] - SONG_SCORE_BY_VOTE[normalizeVoteKind(previousVote)];
}

export function getRequesterRankDelta(previousVote: unknown, nextVote: unknown) {
    return REQUESTER_RANK_BY_VOTE[normalizeVoteKind(nextVote)] - REQUESTER_RANK_BY_VOTE[normalizeVoteKind(previousVote)];
}

export function getIstanbulDayKey(input: Date | number | string = new Date()) {
    const { year, month, day } = formatDateParts(input);
    return `${year}-${month}-${day}`;
}

export function getIstanbulYearMonth(input: Date | number | string = new Date()) {
    const { year, month } = formatDateParts(input);
    return `${year}-${month}`;
}
