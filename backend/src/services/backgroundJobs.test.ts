import { describe, expect, it } from 'vitest';
import { isBullMqRedisVersionSupported } from './backgroundJobs';

describe('BullMQ Redis version requirement', () => {
    it.each(['5.0.0', '6.2.14', '7.2.4'])('accepts Redis %s', (version) => {
        expect(isBullMqRedisVersionSupported(version)).toBe(true);
    });

    it.each(['3.0.504', '4.0.14', '', undefined])('rejects unsupported Redis version %s', (version) => {
        expect(isBullMqRedisVersionSupported(version)).toBe(false);
    });
});
