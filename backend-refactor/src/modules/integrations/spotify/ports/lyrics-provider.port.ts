export interface LyricsLine { time: number; text: string }
export interface LyricsResult { synced: boolean; lines: LyricsLine[]; plainLyrics: string | null; title: string; artist: string }
export interface LyricsProvider { getLyrics(input: { title: string; artist: string }): Promise<LyricsResult | null> }
