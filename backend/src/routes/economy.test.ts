import { describe, expect, it } from 'vitest';
import { classifyHeartbeat, isValidListeningChannel, sessionUserAgentMatches } from './economy';

describe('verified activity heartbeat policy', () => {
    it('rejects rapid replay heartbeats without credit', () => {
        expect(classifyHeartbeat(7)).toEqual({ accepted: false, expired: false, creditedSeconds: 0 });
    });

    it('credits only server elapsed time and caps a single heartbeat', () => {
        expect(classifyHeartbeat(32)).toEqual({ accepted: true, expired: false, creditedSeconds: 32 });
        expect(classifyHeartbeat(70)).toEqual({ accepted: true, expired: false, creditedSeconds: 45 });
    });

    it('expires a session after an implausibly long heartbeat gap', () => {
        expect(classifyHeartbeat(76)).toEqual({ accepted: false, expired: true, creditedSeconds: 0 });
    });

    it('accepts every public RadioTEDU stream without trusting arbitrary ids', () => {
        for (const channel of [
            'radio', 'classic', 'classical', 'jazz', 'lofi', 'energize', 'rock', 'spark',
            'en', 'fr', 'it', 'ru', 'ar', 'de', 'tr', 'jp',
        ]) {
            expect(isValidListeningChannel(channel)).toBe(true);
        }
        expect(isValidListeningChannel('external-radio')).toBe(false);
        expect(isValidListeningChannel('rock; DROP TABLE users')).toBe(false);
    });

    it('binds reward progress to the client that started the session', () => {
        expect(sessionUserAgentMatches('RadioTEDU/1.2.5 Android', 'RadioTEDU/1.2.5 Android')).toBe(true);
        expect(sessionUserAgentMatches('RadioTEDU/1.2.5 Android', 'curl/8.0')).toBe(false);
        expect(sessionUserAgentMatches('', '')).toBe(false);
    });
});
