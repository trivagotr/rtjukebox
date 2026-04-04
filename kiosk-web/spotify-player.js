(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }

    root.KioskSpotifyPlayer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';
    let sdkLoadPromise = null;

    function normalizeTrack(track) {
        if (!track) {
            return {
                track_uri: null,
                track_id: null,
                track_name: null,
                track_artists: [],
                duration_ms: null,
            };
        }

        return {
            track_uri: track.uri ?? null,
            track_id: track.id ?? null,
            track_name: track.name ?? null,
            track_artists: Array.isArray(track.artists) ? track.artists.map((artist) => artist?.name).filter(Boolean) : [],
            duration_ms: track.duration_ms ?? null,
        };
    }

    function didTrackEnd(previousState, currentState) {
        if (!previousState?.track_uri || !previousState?.duration_ms) {
            return false;
        }

        const previousNearEnd = previousState.position_ms >= Math.max(0, previousState.duration_ms - 1500);
        if (!previousNearEnd) {
            return false;
        }

        if (!currentState.track_uri) {
            return true;
        }

        return currentState.track_uri === previousState.track_uri
            && currentState.paused
            && currentState.position_ms === 0;
    }

    function mapSpotifyPlayerState(state, previousState = null) {
        const currentTrack = state?.track_window?.current_track ?? null;
        const durationMs = currentTrack?.duration_ms ?? null;
        const positionMs = typeof state?.position === 'number' ? state.position : 0;
        const mappedState = {
            paused: Boolean(state?.paused),
            position_ms: positionMs,
            duration_ms: durationMs,
            ...normalizeTrack(currentTrack),
        };

        return {
            ...mappedState,
            track_ended: didTrackEnd(previousState, mappedState),
        };
    }

    function buildSpotifyRegistrationPayload(params) {
        return {
            device_id: params.deviceId,
            spotify_device_id: params.spotifyDeviceId,
            player_name: params.playerName ? String(params.playerName).trim() : null,
            player_state: params.state ? mapSpotifyPlayerState(params.state) : null,
        };
    }

    function loadSpotifySdk(options = {}) {
        const rootScope = options.root ?? (typeof globalThis !== 'undefined' ? globalThis : this);

        if (rootScope.Spotify?.Player) {
            return Promise.resolve(rootScope.Spotify);
        }

        if (sdkLoadPromise) {
            return sdkLoadPromise;
        }

        const documentScope = rootScope.document;
        if (!documentScope) {
            return Promise.reject(new Error('Spotify SDK requires a document'));
        }

        sdkLoadPromise = new Promise((resolve, reject) => {
            const script = documentScope.createElement('script');
            script.src = options.scriptUrl || SDK_URL;
            script.async = true;
            script.defer = true;
            script.dataset.spotifyWebPlaybackSdk = 'true';
            script.onerror = () => {
                sdkLoadPromise = null;
                reject(new Error('Failed to load Spotify Web Playback SDK'));
            };

            const previousReady = rootScope.onSpotifyWebPlaybackSDKReady;
            rootScope.onSpotifyWebPlaybackSDKReady = () => {
                if (typeof previousReady === 'function') {
                    previousReady();
                }
                resolve(rootScope.Spotify);
            };

            const target = documentScope.head || documentScope.body || documentScope.documentElement;
            target.appendChild(script);
        });

        return sdkLoadPromise;
    }

    function createSpotifyPlayer(options = {}) {
        const rootScope = options.root ?? (typeof globalThis !== 'undefined' ? globalThis : this);
        const SpotifyPlayer = rootScope.Spotify?.Player;

        if (!SpotifyPlayer) {
            throw new Error('Spotify SDK has not been loaded');
        }

        let lastDeviceId = null;
        let lastMappedState = null;

        const player = new SpotifyPlayer({
            name: options.playerName || 'RadioTEDU Kiosk',
            getOAuthToken: async (callback) => {
                const token = await options.getOAuthToken();
                callback(token);
            },
            volume: typeof options.volume === 'number' ? options.volume : 1,
        });

        player.addListener('ready', (payload) => {
            lastDeviceId = payload?.device_id ?? null;
            options.onReady?.(
                buildSpotifyRegistrationPayload({
                    deviceId: options.deviceId || payload?.device_id || '',
                    spotifyDeviceId: payload?.device_id || '',
                    playerName: options.playerName || null,
                    state: null,
                })
            );
        });

        player.addListener('not_ready', (payload) => {
            options.onNotReady?.({
                device_id: payload?.device_id ?? null,
                spotify_device_id: payload?.device_id ?? null,
            });
        });

        player.addListener('player_state_changed', (state) => {
            const mappedState = mapSpotifyPlayerState(state, lastMappedState);
            lastMappedState = mappedState;
            options.onStateChange?.(mappedState);
        });

        player.addListener('autoplay_failed', (payload) => {
            options.onAutoplayFailed?.(payload);
        });

        player.addListener('initialization_error', (error) => {
            options.onError?.(error);
        });

        player.addListener('authentication_error', (error) => {
            options.onError?.(error);
        });

        player.addListener('account_error', (error) => {
            options.onError?.(error);
        });

        return {
            player,
            connect: () => player.connect(),
            activateElement: () => player.activateElement(),
            disconnect: () => player.disconnect(),
            getLastDeviceId: () => lastDeviceId,
        };
    }

    return {
        loadSpotifySdk,
        createSpotifyPlayer,
        buildSpotifyRegistrationPayload,
        mapSpotifyPlayerState,
    };
});
