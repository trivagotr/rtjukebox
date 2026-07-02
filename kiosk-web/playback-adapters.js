(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }

    root.KioskPlaybackAdapters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const PLAYBACK_STATES = Object.freeze({
        BOOTING: 'BOOTING',
        REGISTERING: 'REGISTERING',
        READY: 'READY',
        IDLE: 'IDLE',
        CLAIMING_NEXT: 'CLAIMING_NEXT',
        PREPARING: 'PREPARING',
        PLAYING: 'PLAYING',
        PAUSED: 'PAUSED',
        FINISHING: 'FINISHING',
        FAILED: 'FAILED',
        RECOVERING: 'RECOVERING',
        OFFLINE: 'OFFLINE',
    });

    function redactPlaybackError(message) {
        return String(message || '')
            .replace(/\b(device_pwd\s*[=:]\s*)\S+/gi, '$1[REDACTED]')
            .replace(/\b(password\s*[=:]\s*)\S+/gi, '$1[REDACTED]')
            .replace(/\b(access_token\s*[=:]\s*)\S+/gi, '$1[REDACTED]');
    }

    function createPlaybackStateMachine(initialState = PLAYBACK_STATES.BOOTING) {
        let state = initialState;
        let previousState = null;
        let error = null;

        return {
            transition(nextState, details = {}) {
                if (!Object.prototype.hasOwnProperty.call(PLAYBACK_STATES, nextState)) {
                    throw new Error(`Invalid kiosk playback state: ${nextState}`);
                }
                previousState = state;
                state = nextState;
                error = details.error ? redactPlaybackError(details.error.message || details.error) : null;
            },
            getState() {
                return { state, previousState, error };
            },
        };
    }

    function createPlaybackAdapter({ plan, spotify, htmlAudio }) {
        if (plan?.kind === 'spotify' && spotify) {
            return {
                name: 'spotify_web_playback',
                init: () => spotify.init?.(),
                isReady: () => Boolean(spotify.isReady ? spotify.isReady() : true),
                play: (track) => spotify.play(track),
                pause: () => spotify.pause?.(),
                resume: () => spotify.resume?.(),
                stop: () => spotify.stop?.(),
                getState: () => spotify.getState?.(),
                destroy: () => spotify.destroy?.(),
            };
        }

        return {
            name: 'html_audio',
            init: () => htmlAudio?.init?.(),
            isReady: () => Boolean(htmlAudio),
            play: (track) => htmlAudio?.play(track),
            pause: () => htmlAudio?.pause?.(),
            resume: () => htmlAudio?.resume?.(),
            stop: () => htmlAudio?.stop?.(),
            getState: () => htmlAudio?.getState?.(),
            destroy: () => htmlAudio?.destroy?.(),
        };
    }

    return {
        PLAYBACK_STATES,
        createPlaybackStateMachine,
        createPlaybackAdapter,
        redactPlaybackError,
    };
});
