import iconv from 'iconv-lite';

const SUSPICIOUS_PATTERN = /[ÃÄÅâ├┤┬┴┼│─▒]|�/;

const TURKISH_LETTERS = /[ÇĞİÖŞÜçğıöşü]/g;

function countMatches(value: string, pattern: RegExp): number {
  const matches = value.match(pattern);
  return matches ? matches.length : 0;
}

function repairCp850ToUtf8(value: string): string {
  return Buffer.from(iconv.encode(value, 'cp850')).toString('utf8');
}

function isBetterCandidate(original: string, candidate: string): boolean {
  if (candidate === original) return false;

  const originalSuspicious = countMatches(original, SUSPICIOUS_PATTERN);
  const candidateSuspicious = countMatches(candidate, SUSPICIOUS_PATTERN);
  if (candidateSuspicious < originalSuspicious) return true;
  if (candidateSuspicious > originalSuspicious) return false;

  const originalTurkish = countMatches(original, TURKISH_LETTERS);
  const candidateTurkish = countMatches(candidate, TURKISH_LETTERS);
  if (candidateTurkish > originalTurkish) return true;
  if (candidateTurkish < originalTurkish) return false;

  return candidate.length <= original.length + 4;
}

export function looksMojibake(value: string): boolean {
  return SUSPICIOUS_PATTERN.test(value);
}

export function repairMojibake(value: string): string {
  if (!value) return value;

  const repaired = repairCp850ToUtf8(value);
  if (isBetterCandidate(value, repaired)) {
    return repaired;
  }

  return value;
}

export function normalizeText(value: string): string {
  if (!value) return value;

  const trimmed = value.trim().normalize('NFC');
  return repairMojibake(trimmed);
}

export function normalizeFilename(filename: string): string {
  const normalized = normalizeText(filename)
    .replace(/[\\/]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s._-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

export function buildSongFileUrl(filename: string): string {
  return `/uploads/songs/${normalizeFilename(filename)}`;
}
