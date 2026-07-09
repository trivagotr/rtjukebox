(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }

    root.KioskPlayback = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function extractSongId(song) {
        if (song?.song_id) {
            return song.song_id;
        }

        if (song?.songId) {
            return song.songId;
        }

        if (typeof song?.id === 'string' && song.id.startsWith('current-')) {
            return song.id.slice('current-'.length);
        }

        return song?.id ?? null;
    }

    function getSongPlaybackPlan(song, apiBaseUrl) {
        const sourceType = song?.playback_type || song?.source_type || song?.source || 'local';
        const spotifyUri = song?.spotify_uri || song?.spotifyUri || null;
        const fileUrl = song?.file_url || song?.fileUrl || null;
        const songId = extractSongId(song);

        if (sourceType === 'spotify' || spotifyUri) {
            if (!spotifyUri) {
                return {
                    kind: 'unsupported',
                    audioUrl: null,
                    spotifyUri: null,
                    songId,
                };
            }

            return {
                kind: 'spotify',
                audioUrl: null,
                spotifyUri,
                songId,
            };
        }

        if (typeof fileUrl === 'string' && fileUrl.length > 0) {
            return {
                kind: 'local',
                audioUrl: fileUrl.startsWith('/') ? apiBaseUrl + fileUrl : fileUrl,
                spotifyUri: null,
                songId,
            };
        }

        return {
            kind: 'unsupported',
            audioUrl: null,
            spotifyUri,
            songId,
        };
    }

    function shouldSyncNowPlayingView(params) {
        if (params?.startupBlocked) {
            return false;
        }

        if (!params?.nowPlaying) {
            return false;
        }

        return Boolean(params.isPlaying || params.spotifyTrackUri);
    }

    function createPlaybackStartCoordinator() {
        let activeKey = null;
        let startPromise = null;

        return {
            start(key, startFn) {
                if (!key) return Promise.resolve().then(startFn);
                if (activeKey === key) return startPromise || Promise.resolve(false);

                activeKey = key;
                startPromise = Promise.resolve()
                    .then(startFn)
                    .catch((error) => {
                        if (activeKey === key) activeKey = null;
                        throw error;
                    })
                    .finally(() => {
                        startPromise = null;
                    });
                return startPromise;
            },
            complete(key) {
                if (!key || activeKey === key) activeKey = null;
            },
            reset() {
                activeKey = null;
                startPromise = null;
            },
        };
    }

    return {
        createPlaybackStartCoordinator,
        getSongPlaybackPlan,
        shouldSyncNowPlayingView,
    };
});
