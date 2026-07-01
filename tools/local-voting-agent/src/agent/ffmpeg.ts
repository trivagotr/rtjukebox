export interface ParsedFfprobeMetadata {
  title?: string;
  artist?: string;
  durationSeconds?: number;
}

interface FfprobeFormat {
  duration?: unknown;
  tags?: Record<string, unknown>;
}

interface FfprobePayload {
  format?: FfprobeFormat;
}

export function buildFfprobeMetadataArgs(filePath: string): string[] {
  return ['-v', 'quiet', '-print_format', 'json', '-show_format', filePath];
}

export function parseFfprobeMetadata(stdout: string): ParsedFfprobeMetadata {
  try {
    const payload = JSON.parse(stdout) as FfprobePayload;
    const tags = payload.format?.tags ?? {};
    const duration = Number(payload.format?.duration);

    return {
      ...(typeof tags.title === 'string' ? { title: tags.title } : {}),
      ...(typeof tags.artist === 'string' ? { artist: tags.artist } : {}),
      ...(Number.isFinite(duration) ? { durationSeconds: Math.floor(duration) } : {}),
    };
  } catch {
    return {};
  }
}

export function buildAlbumArtExtractionArgs(inputPath: string, outputPath: string): string[] {
  return ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-an', '-vcodec', 'copy', outputPath];
}

export function buildPlaybackArgs(filePath: string): string[] {
  return ['-hide_banner', '-nostdin', '-re', '-i', filePath, '-f', 'null', '-'];
}
