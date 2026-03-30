import iconv from 'iconv-lite';

const SUSPICIOUS_PATTERN = /[\u00C2\u00C3\u00C4\u00C5\u00E2\u251C\u2524\u252C\u2534\u253C\u2502\u2500\u2592]|\uFFFD/;
const TURKISH_LETTERS = /[ÇĞİÖŞÜçğıöşü]/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F-\u009F]/g;

function countMatches(value: string, pattern: RegExp): number {
  const matches = value.match(pattern);
  return matches ? matches.length : 0;
}

function scoreCandidate(value: string): number {
  const suspicious = countMatches(value, SUSPICIOUS_PATTERN);
  const turkish = countMatches(value, TURKISH_LETTERS);
  const controlChars = countMatches(value, CONTROL_CHAR_PATTERN);
  const replacement = value.includes('�') ? 1 : 0;

  return suspicious * 10 + controlChars * 25 + replacement * 20 - turkish * 2;
}

function repairCp850ToUtf8(value: string): string {
  return Buffer.from(iconv.encode(value, 'cp850')).toString('utf8');
}

function repairLatin1ToUtf8(value: string): string {
  return Buffer.from(value, 'latin1').toString('utf8');
}

function chooseBestCandidate(original: string, candidates: string[]): string {
  const originalScore = scoreCandidate(original);
  let bestCandidate = original;
  let bestScore = originalScore;

  for (const candidate of candidates) {
    if (!candidate || candidate === original) continue;
    if (candidate.length > original.length + 2) continue;

    const candidateScore = scoreCandidate(candidate);
    if (candidateScore < bestScore) {
      bestCandidate = candidate;
      bestScore = candidateScore;
    }
  }

  return bestCandidate;
}

export function looksMojibake(value: string): boolean {
  return SUSPICIOUS_PATTERN.test(value);
}

export function repairMojibake(value: string): string {
  if (!value) return value;
  if (!looksMojibake(value)) return value;

  return chooseBestCandidate(value, [
    repairLatin1ToUtf8(value),
    repairCp850ToUtf8(value),
  ]);
}

export function normalizeText(value: string): string {
  if (!value) return value;

  const trimmed = value.trim().normalize('NFC');
  return repairMojibake(trimmed);
}

export function normalizeFilename(filename: string): string {
  const normalized = normalizeText(filename)
    .replace(/[\\/]+/g, ' ')
    .replace(/^\.\.?\s*/, '')
    .replace(/[^\p{L}\p{N}\s._-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

export function buildSongFileUrl(filename: string): string {
  return `/uploads/songs/${normalizeFilename(filename)}`;
}
