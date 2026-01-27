import ffmpeg from 'fluent-ffmpeg';
import path from 'path';

const testFile = 'e:/rtmusicbox/backend/uploads/songs/blok3.mp3';

ffmpeg.ffprobe(testFile, (err, metadata) => {
    if (err) {
        console.error('Error:', err);
        return;
    }
    console.log('Metadata:', JSON.stringify(metadata, null, 2));

    // Check tags
    const tags = metadata.format.tags;
    if (tags) {
        console.log('Title:', tags.title || tags.TITLE);
        console.log('Artist:', tags.artist || tags.ARTIST);
        console.log('Album:', tags.album || tags.ALBUM);
    }

    // Check streams for image
    const imageStream = metadata.streams.find(s => s.codec_type === 'video');
    if (imageStream) {
        console.log('Found embedded cover art!');
    }
});
