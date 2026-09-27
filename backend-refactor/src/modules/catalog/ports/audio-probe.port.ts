export interface AudioProbe {
  inspect(content: Uint8Array): Promise<{ durationSeconds: number; hasAudioStream: boolean }>;
}
