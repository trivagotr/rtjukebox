import type { Clock } from '../ports/clock.port.js';

export const systemClock: Clock = { now: () => new Date() };
