import type { LyricsProvider, LyricsResult } from '../ports/lyrics-provider.port.js';

const cache = new Map<string, { expiresAt: number; value: LyricsResult | null }>();
function parseLrc(value: string) {
  const rows: Array<{ time: number; text: string }> = [];
  for (const line of value.split('\n')) {
    const match = /^\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)$/.exec(line.trim());
    if (!match) continue;
    const text = match[3]!.trim();
    if (text) rows.push({ time: Math.round((Number(match[1]) * 60 + Number(match[2])) * 100) / 100, text });
  }
  return rows.sort((a, b) => a.time - b.time);
}

export class LrclibLyricsAdapter implements LyricsProvider {
  async getLyrics(input: { title: string; artist: string }) {
    const title = input.title.trim(); const artist = input.artist.trim();
    const key = `${artist.normalize('NFKC')} - ${title.normalize('NFKC')}`.toLocaleLowerCase('en-US');
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const cleanTitle = title.replace(/\s*-\s*Remastered.*/i, '').replace(/\s*\(feat\..*?\)/i, '').replace(/\s*\(with.*?\)/i, '').trim();
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 4_000); timer.unref?.();
    try {
      const direct = await fetch(`https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(artist)}`, { signal: controller.signal, headers: { Accept: 'application/json' } }).catch(() => null);
      let candidate: Record<string, unknown> | null = direct?.ok ? await direct.json() as Record<string, unknown> : null;
      if (!candidate?.syncedLyrics && !candidate?.plainLyrics) {
        const search = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${cleanTitle}`)}`, { signal: controller.signal, headers: { Accept: 'application/json' } }).catch(() => null);
        if (search?.ok) {
          const matches = await search.json() as Array<Record<string, unknown>>;
          candidate = matches.find((item) => item.syncedLyrics) ?? matches[0] ?? null;
        }
      }
      if (!candidate) { cache.set(key, { value: null, expiresAt: Date.now() + 300_000 }); return null; }
      const syncedLyrics = typeof candidate.syncedLyrics === 'string' ? candidate.syncedLyrics : '';
      const lines = parseLrc(syncedLyrics);
      const result: LyricsResult = { synced: lines.length > 0, lines, plainLyrics: typeof candidate.plainLyrics === 'string' ? candidate.plainLyrics : null, title: typeof candidate.trackName === 'string' ? candidate.trackName : title, artist: typeof candidate.artistName === 'string' ? candidate.artistName : artist };
      cache.set(key, { value: result, expiresAt: Date.now() + 3_600_000 });
      while (cache.size > 1000) cache.delete(cache.keys().next().value!);
      return result;
    } finally { clearTimeout(timer); }
  }
}
