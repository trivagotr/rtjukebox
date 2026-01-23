export const fetchAlbumArtwork = async (term: string): Promise<string | null> => {
    try {
        const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=1`);
        const data = await response.json();

        if (data.resultCount > 0 && data.results[0].artworkUrl100) {
            // Get higher resolution image (600x600)
            return data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
        }
        return null;
    } catch (error) {
        console.warn('Error fetching artwork:', error);
        return null;
    }
};

// Check if a stream URL is available/reachable
export const checkStreamAvailability = async (streamUrl: string): Promise<boolean> => {
    try {
        console.log(`Checking stream: ${streamUrl}`);
        const controller = new AbortController();
        // Shortened timeout to 5s. If it hangs for 5s, it's likely streaming/buffering.
        // Explicit errors (404) usually return instantly (<1s).
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // Use GET with immediate abort to validate connection & status
        const response = await fetch(streamUrl, {
            method: 'GET',
            headers: { 'Cache-Control': 'no-cache' },
            cache: 'no-store', // Don't use cached responses
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Check status code
        const isStatusValid = response.status === 200 || response.status === 206;

        // Check Content-Type to avoid treating HTML pages (200 OK) as audio streams
        const contentType = response.headers.get('content-type');
        const isAudio = contentType ? (
            contentType.includes('audio/') ||
            contentType.includes('application/ogg') ||
            contentType.includes('application/x-mpegURL') ||
            contentType.includes('application/vnd.apple.mpegurl')
        ) : false;

        // Strict check: Must be 200/206 AND be an audio/playlist type
        const isValid = isStatusValid && isAudio;

        console.log(`Stream Check Results:
        - URL: ${streamUrl}
        - Status: ${response.status}
        - Content-Type: ${contentType}
        - isStatusValid: ${isStatusValid}
        - isAudio: ${isAudio}
        - FINAL DECISION: ${isValid}`);

        return isValid;

    } catch (error: any) {
        // CRITICAL FIX:
        // Offline streams (404/500) fail nicely in the 'try' block.
        // Active streams usually hang (buffering) and trigger AbortError/Timeout.
        // Therefore: Timeout/Abort = LIKELY ACTIVE.

        // Check for AbortError (timeout)
        if (error.name === 'AbortError' || error.message.includes('Aborted')) {
            console.log(`Stream Check Timeout (Assumed Active): ${streamUrl}`);
            return true;
        }

        console.log(`Stream Check Error for ${streamUrl}:`, error);
        return false;
    }
};
