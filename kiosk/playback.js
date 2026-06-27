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

        if (typeof song?.id === 'string' && song.id.startsWith('current-')) {
            return song.id.slice('current-'.length);
        }

        return song?.id ?? null;
    }

    function getSongPlaybackPlan(song, apiBaseUrl) {
        const sourceType = song?.playback_type || song?.source_type || 'local';
        const songId = extractSongId(song);

        if (sourceType === 'spotify' && song?.spotify_uri) {
            return {
                kind: 'spotify',
                audioUrl: null,
                spotifyUri: song.spotify_uri,
                songId,
            };
        }

        if (typeof song?.file_url === 'string' && song.file_url.length > 0) {
            return {
                kind: 'local',
                audioUrl: song.file_url.startsWith('/') ? apiBaseUrl + song.file_url : song.file_url,
                spotifyUri: null,
                songId,
            };
        }

        return {
            kind: 'unsupported',
            audioUrl: null,
            spotifyUri: song?.spotify_uri ?? null,
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

    return {
        getSongPlaybackPlan,
        shouldSyncNowPlayingView,
    };
});
