import axios from 'axios';
import { db } from '../db';

export class MetadataService {
    /**
     * Fetches metadata for a song from iTunes API and updates the database.
     */
    static async syncSongMetadata(songId: string): Promise<any> {
        try {
            // Get current song info
            const songRes = await db.query('SELECT title, artist FROM songs WHERE id = $1', [songId]);
            if (songRes.rows.length === 0) return null;

            const { title, artist } = songRes.rows[0];
            const cleanTitle = title
                .replace(/[\(\[].*?[\)\]]/g, '') // Remove (Official Video), [Lyrics] etc.
                .replace(/\s+(official|music|video|audio|lyrics|lyric|hq|hd|4k|remastered|version|original|mix|edit|clip|full|hd)\b/gi, '') // Remove bare suffixes
                .replace(/[_]/g, ' ') // Replace underscores with spaces
                .replace(/\s+[\-\:]\s*$/, '') // Remove trailing dashes or colons
                .replace(/\s+/g, ' ') // Collapse multiple spaces
                .trim();

            const labels = ['manifest', 'netd müzik', 'netd', 'poll production', 'dmc', 'dokuz sekiz', 'avrupa müzik'];
            let searchTerm = `${artist} ${cleanTitle}`.trim();

            if (artist === 'Unknown') {
                searchTerm = cleanTitle.trim();
            } else if (labels.some(l => artist.toLowerCase().includes(l))) {
                // If artist is a known label, prioritize the title and just append the label as a secondary hint
                searchTerm = `${cleanTitle} ${artist}`.trim();
            }

            console.log(`[MetadataService] Syncing: ${searchTerm}`);

            const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&entity=song&limit=1`;
            let response = await axios.get(itunesUrl);

            // If no results and we had an artist, try searching just for title
            if (response.data.resultCount === 0 && artist !== 'Unknown') {
                console.log(`[MetadataService] Fallback search for: ${cleanTitle}`);
                const fallbackUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&media=music&entity=song&limit=1`;
                response = await axios.get(fallbackUrl);
            }

            if (response.data.resultCount > 0) {
                const result = response.data.results[0];
                const newTitle = result.trackName || title;
                const newArtist = result.artistName || artist;
                const album = result.collectionName || null;
                const durationMs = result.trackTimeMillis || null;
                const artworkUrl = result.artworkUrl100 ? result.artworkUrl100.replace('100x100bb', '600x600bb') : null;

                const updateQuery = `
                    UPDATE songs 
                    SET title = $1, 
                        artist = $2, 
                        album = $3, 
                        cover_url = COALESCE($4, cover_url),
                        duration_seconds = COALESCE($5, duration_seconds)
                    WHERE id = $6
                    RETURNING *
                `;

                const finalDuration = durationMs ? Math.round(durationMs / 1000) : null;
                const updated = await db.query(updateQuery, [
                    newTitle,
                    newArtist,
                    album,
                    artworkUrl,
                    finalDuration,
                    songId
                ]);

                return updated.rows[0];
            }

            return null;
        } catch (error) {
            console.error(`[MetadataService] Error syncing song ${songId}:`, error);
            throw error;
        }
    }

    /**
     * Syncs all active songs
     */
    static async syncAllSongs(): Promise<{ success: number; failed: number; failedSongs: any[] }> {
        const songs = await db.query('SELECT id, title, artist FROM songs WHERE is_active = true');
        let success = 0;
        let failed = 0;
        const failedSongs = [];

        for (const song of songs.rows) {
            try {
                const result = await this.syncSongMetadata(song.id);
                if (result) {
                    success++;
                } else {
                    failed++;
                    failedSongs.push({ id: song.id, title: song.title, artist: song.artist });
                }
            } catch (err) {
                failed++;
                failedSongs.push({ id: song.id, title: song.title, artist: song.artist, error: true });
            }
        }

        return { success, failed, failedSongs };
    }
}
