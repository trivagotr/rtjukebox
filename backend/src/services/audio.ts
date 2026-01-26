import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export class AudioService {

    /**
     * Analyzes an audio file for silence and trims it.
     * Returns the path to the processed file.
     */
    static async processTrack(inputPath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const outputPath = inputPath.replace(/(\.[\w\d]+)$/, '_trimmed$1');

            // 1. Detect Silence
            // We'll use a 2-pass approach or a complex filter. 
            // For simplicity and robustness, specific silence removal filters:
            // silenceremove=start_periods=1:start_duration=1:start_threshold=-50dB:detection=peak, \
            // areverse,silenceremove=start_periods=1:start_duration=1:start_threshold=-50dB:detection=peak,areverse

            console.log(`[AudioService] Processing: ${inputPath}`);

            ffmpeg(inputPath)
                .audioFilters([
                    // Remove silence from start (start_periods=1)
                    // duration > 0.1s, threshold -30dB (more aggressive)
                    'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-30dB:detection=peak',

                    // Reverse the audio stream
                    'areverse',

                    // Remove silence from "start" (which is effectively the end now)
                    'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-30dB:detection=peak',

                    // Reverse back to normal
                    'areverse'
                ])
                .on('end', () => {
                    console.log(`[AudioService] trimming complete: ${outputPath}`);
                    // Replace original with trimmed or return new path
                    // For now, let's keep original safe and return new
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('[AudioService] FFmpeg error:', err);
                    reject(err);
                })
                .save(outputPath);
        });
    }

    /**
     * Get duration of a file in seconds
     */
    static async getDuration(filePath: string): Promise<number> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
                if (err) return reject(err);
                resolve(metadata.format.duration || 0);
            });
        });
    }
}
