// Profanity and Explicit Content Filter Engine
import { db } from '../db';

export function normalizeText(text: string): string {
  if (!text) return '';

  let normalized = text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Â|â/g, 'a')
    .replace(/Î|î/g, 'i')
    .replace(/Û|û/g, 'u')
    .toLowerCase();

  // Normalize Unicode combining characters (e.g. leftover accents)
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Replace leetspeak numbers/symbols
  normalized = normalized
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i');

  // Remove non-alphanumeric except space
  normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');

  // Collapse consecutive duplicate letters (3 or more -> 1, e.g. siiiik -> sik, amkkk -> amk)
  normalized = normalized.replace(/(.)\1{2,}/g, '$1');

  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

// Built-in Turkish & English profanity / explicit regex patterns
const BUILTIN_PROFANITY_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  // Turkish Swears & Slurs
  { regex: /\b(amk|amq|aq)\b/i, label: 'amk' },
  { regex: /\b(oc|o\.c|o\s*c)\b/i, label: 'oc' },
  { regex: /\borospu\w*/i, label: 'orospu' },
  { regex: /\bamc[ıi]k\w*/i, label: 'amcik' },
  { regex: /\bamcuk\w*/i, label: 'amcuk' },
  { regex: /\bamin[a|e]\w*/i, label: 'amina' },
  { regex: /\banan[ıi]s\w*/i, label: 'ananis' },
  { regex: /\b(yarr?ak|yarr?agi|yarr?aga)\w*/i, label: 'yarrak' },
  { regex: /\bdalyarr?ak\w*/i, label: 'dalyarrak' },
  { regex: /\btas+ak\w*/i, label: 'tasak' },
  { regex: /\bsiktir\w*/i, label: 'siktir' },
  { regex: /\bsikeyim\w*/i, label: 'sikeyim' },
  { regex: /\bsiktim\w*/i, label: 'siktim' },
  { regex: /\bsik[ie]ce[kğ]\w*/i, label: 'sikecek' },
  { regex: /\bsiki[sş]\w*/i, label: 'sikis' },
  { regex: /\bsikik\w*/i, label: 'sikik' },
  { regex: /\bsokuk\w*/i, label: 'sokuk' },
  { regex: /\byav[sş]ak\w*/i, label: 'yavsak' },
  { regex: /\bpic(?!nik|ap|asso|anto|up)\w*/i, label: 'pic' },
  { regex: /\bpez?even[kg]\w*/i, label: 'pezevenk' },
  { regex: /\b[kg]avat\w*/i, label: 'gavat' },
  { regex: /\bibne\w*/i, label: 'ibne' },
  { regex: /\bpu[sş]t\w*/i, label: 'pust' },
  { regex: /\bkahpe\w*/i, label: 'kahpe' },
  { regex: /\bfahi[sş]e\w*/i, label: 'fahise' },
  { regex: /\bgotveren\w*/i, label: 'gotveren' },
  { regex: /\bgotlek\w*/i, label: 'gotlek' },

  // English Swears & Slurs
  { regex: /\bf+u+c+k\w*/i, label: 'fuck' },
  { regex: /\bmotherfuck\w*/i, label: 'motherfucker' },
  { regex: /\bsh+i+t\w*/i, label: 'shit' },
  { regex: /\bb+i+t+c+h\w*/i, label: 'bitch' },
  { regex: /\bc+u+n+t\w*/i, label: 'cunt' },
  { regex: /\bwhore\w*/i, label: 'whore' },
  { regex: /\bslut\w*/i, label: 'slut' },
  { regex: /\basshole\w*/i, label: 'asshole' },
  { regex: /\bdick(?!ens|inson)\b/i, label: 'dick' },
  { regex: /\bpussy\b/i, label: 'pussy' },
  { regex: /\bnigg(a|er)\w*/i, label: 'nigger' },
  { regex: /\bfaggot\w*/i, label: 'faggot' },
];

export interface ProfanityCheckResult {
  isProfane: boolean;
  matchedWord?: string;
}

export function checkProfanityText(rawText: string, customBlacklist: string[] = []): ProfanityCheckResult {
  if (!rawText || !rawText.trim()) {
    return { isProfane: false };
  }

  const normalized = normalizeText(rawText);

  // 1. Check custom blacklist first (exact word or boundary matches)
  for (const customWord of customBlacklist) {
    const cleanCustom = normalizeText(customWord);
    if (!cleanCustom) continue;

    const customRegex = new RegExp(`\\b${cleanCustom}\\b`, 'i');
    if (customRegex.test(normalized)) {
      return { isProfane: true, matchedWord: customWord };
    }
  }

  // 2. Check built-in profanity patterns
  for (const pattern of BUILTIN_PROFANITY_PATTERNS) {
    if (pattern.regex.test(normalized)) {
      return { isProfane: true, matchedWord: pattern.label };
    }
  }

  // 3. Check standalone vulgar "sik" in original text (where it's spelled with 'i', not clean 'sık' / 'sıkı')
  const originalLower = rawText.toLowerCase();
  if (/\b(sik|siki|sike|sikler|sikecem|sikerim)\b/i.test(originalLower)) {
    return { isProfane: true, matchedWord: 'sik' };
  }

  return { isProfane: false };
}

// In-memory cache for dynamic DB blocked keywords
let cachedDbKeywords: { keywords: string[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export async function getDbBlockedKeywords(): Promise<string[]> {
  const now = Date.now();
  if (cachedDbKeywords && (now - cachedDbKeywords.fetchedAt < CACHE_TTL_MS)) {
    return cachedDbKeywords.keywords;
  }

  try {
    const res = await db.query('SELECT word FROM blocked_keywords ORDER BY word ASC');
    const keywords = res.rows.map((row: any) => row.word);
    cachedDbKeywords = { keywords, fetchedAt: now };
    return keywords;
  } catch {
    return [];
  }
}

export function invalidateBlockedKeywordsCache(): void {
  cachedDbKeywords = null;
}

export interface ContentFilterSettings {
  lyrics_filter_enabled: boolean;
  block_unverified_obscure_tracks: boolean;
  min_popularity_without_lyrics: number;
}

const DEFAULT_SETTINGS: ContentFilterSettings = {
  lyrics_filter_enabled: true,
  block_unverified_obscure_tracks: true,
  min_popularity_without_lyrics: 15,
};

let cachedSettings: { settings: ContentFilterSettings; fetchedAt: number } | null = null;

export async function getContentFilterSettings(): Promise<ContentFilterSettings> {
  const now = Date.now();
  if (cachedSettings && (now - cachedSettings.fetchedAt < CACHE_TTL_MS)) {
    return cachedSettings.settings;
  }

  try {
    const res = await db.query('SELECT lyrics_filter_enabled, block_unverified_obscure_tracks, min_popularity_without_lyrics FROM content_filter_settings WHERE id = 1');
    if (res.rows.length > 0) {
      const row = res.rows[0];
      const settings: ContentFilterSettings = {
        lyrics_filter_enabled: row.lyrics_filter_enabled ?? true,
        block_unverified_obscure_tracks: row.block_unverified_obscure_tracks ?? true,
        min_popularity_without_lyrics: typeof row.min_popularity_without_lyrics === 'number' ? row.min_popularity_without_lyrics : 15,
      };
      cachedSettings = { settings, fetchedAt: now };
      return settings;
    }
  } catch {
    // If table doesn't exist yet, fallback to default
  }

  return DEFAULT_SETTINGS;
}

export function invalidateContentFilterSettingsCache(): void {
  cachedSettings = null;
}
