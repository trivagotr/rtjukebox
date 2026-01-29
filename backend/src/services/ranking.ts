// Priority Score Calculation Service
// priority_score = (queue_time_weight * T) + (vote_weight * V) + (user_rank_weight * R)

const QUEUE_TIME_WEIGHT = 1.0;
const VOTE_WEIGHT = 1.5;
const USER_RANK_WEIGHT = 0.5;
const MAX_USER_RANK_BONUS = 50;

export function calculatePriorityScore(
    netVotes: number,
    addedAt: Date | number,
    userRankScore: number
): number {
    // T: Time factor - songs gain score the longer they wait (FIFO bias)
    const minutesWaiting = typeof addedAt === 'number'
        ? 0
        : (Date.now() - new Date(addedAt).getTime()) / 60000;
    const timeFactor = minutesWaiting * 2; // Increases over time

    // V: Vote factor
    const voteFactor = netVotes * 10;

    // R: User rank factor (capped)
    const rankFactor = Math.min(userRankScore / 100, MAX_USER_RANK_BONUS);

    return (QUEUE_TIME_WEIGHT * timeFactor) +
        (VOTE_WEIGHT * voteFactor) +
        (USER_RANK_WEIGHT * rankFactor);
}
