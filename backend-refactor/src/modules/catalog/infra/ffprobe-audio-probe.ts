import { spawn } from 'node:child_process';
import type { AudioProbe } from '../ports/audio-probe.port.js';

const MAX_OUTPUT_BYTES = 1024 * 1024;
const TIMEOUT_MS = 15_000;

export class FfprobeAudioProbe implements AudioProbe {
  constructor(private readonly executable = 'ffprobe') {}

  inspect(content: Uint8Array) {
    return new Promise<{ durationSeconds: number; hasAudioStream: boolean }>((resolve, reject) => {
      const child = spawn(this.executable, [
        '-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', 'pipe:0',
      ], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (error?: Error, value?: { durationSeconds: number; hasAudioStream: boolean }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value!);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error('Audio inspection timed out'));
      }, TIMEOUT_MS);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout) > MAX_OUTPUT_BYTES) {
          child.kill();
          finish(new Error('Audio inspection output exceeded the limit'));
        }
      });
      child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-8_192); });
      child.once('error', (error) => finish(new Error('Audio inspection tool is unavailable', { cause: error })));
      child.once('close', (code) => {
        if (settled) return;
        if (code !== 0) return finish(new Error(`Audio inspection failed: ${stderr.slice(0, 500) || 'invalid media'}`));
        try {
          const result = JSON.parse(stdout) as { format?: { duration?: string | number }; streams?: Array<{ codec_type?: string }> };
          const durationSeconds = Number(result.format?.duration);
          const hasAudioStream = result.streams?.some((stream) => stream.codec_type === 'audio') ?? false;
          if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !hasAudioStream) {
            return finish(new Error('File does not contain a valid audio stream'));
          }
          finish(undefined, { durationSeconds, hasAudioStream });
        } catch (error) { finish(new Error('Audio inspection returned invalid metadata', { cause: error })); }
      });
      child.stdin.once('error', (error) => finish(new Error('Audio inspection input failed', { cause: error })));
      child.stdin.end(Buffer.from(content));
    });
  }
}
