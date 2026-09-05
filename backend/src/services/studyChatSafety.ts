export const SUPPORTED_STUDY_CHAT_LANGUAGES = Object.freeze([
  'en', 'tr', 'ru', 'ar', 'de', 'fr',
] as const);

export type StudyChatSafetyReason =
  | 'unsafe-language'
  | 'personal-contact'
  | 'external-link'
  | 'obfuscation'
  | 'spam-pattern';

export type StudyChatSafetyResult =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; reason: StudyChatSafetyReason }>;

const HIDDEN_OR_DIRECTIONAL_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufeff\uffa0]/u;
const EXTERNAL_LINK = /(?:https?:\/\/|www\.|(?:discord|telegram|whatsapp|snapchat|instagram|tiktok)\s*(?:\.|:|dot\b)|\b[a-z0-9][a-z0-9-]{1,62}\s*(?:\.|dot\b)\s*(?:com|net|org|io|gg|me|app|dev|xyz|ru|de|fr|tr)\b)/iu;
const EMAIL_ADDRESS = /\b[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}\b/iu;
const PHONE_NUMBER = /(?:^|[^\p{L}\p{N}])\+?\d(?:[\s().-]*\d){7,14}(?:$|[^\p{L}\p{N}])/u;
const CHARACTER_FLOOD = /([\p{L}\p{N}])\1{9,}/iu;

const BUILTIN_BLOCKED_TERMS = Object.freeze([
  // English
  'fuck', 'motherfucker', 'asshole', 'bitch', 'bastard', 'whore', 'slut',
  'faggot', 'retard', 'nigger', 'nigga', 'cunt', 'dickhead',
  // Turkish
  'amk', 'orospu', 'siktir', 'sikik', 'piç', 'pic', 'ibne', 'gerizekalı',
  'gerizekali', 'aptal', 'salak', 'kahpe', 'yavşak', 'yavsak',
  // Russian
  'блядь', 'блять', 'сука', 'хуй', 'пизда', 'ебать', 'ёб', 'мудак',
  'дебил', 'идиот', 'шлюха',
  // Arabic
  'كسمك', 'شرموط', 'شرموطة', 'قحبة', 'خرا', 'نيك', 'زبالة',
  // German
  'scheiße', 'scheisse', 'arschloch', 'hurensohn', 'fotze', 'wichser',
  'schlampe', 'idiot',
  // French
  'merde', 'putain', 'connard', 'connasse', 'salope', 'enculé', 'encule',
  'nique', 'idiot',
]);

const BUILTIN_BLOCKED_PHRASES = Object.freeze([
  'kill yourself', 'go kill yourself', 'i will kill you',
  'kendini öldür', 'kendini oldur', 'seni öldüreceğim', 'seni oldurecegim',
  'убей себя', 'я тебя убью',
  'اقتل نفسك', 'سوف اقتلك',
  'bring dich um', 'ich bringe dich um',
  'tue toi', 'je vais te tuer',
  'ibn el kalb', 'ابن الكلب',
]);

const CONFUSABLES: Readonly<Record<string, string>> = Object.freeze({
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's',
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', к: 'k',
  м: 'm', т: 't', н: 'h', в: 'b', і: 'i', ј: 'j', ѕ: 's',
  α: 'a', ε: 'e', ο: 'o', ρ: 'p', χ: 'x', υ: 'u', ι: 'i', κ: 'k',
});

function fold(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}+/gu, '')
    .replace(/ـ/gu, '')
    .replace(/ß/gu, 'ss')
    .replace(/æ/gu, 'ae')
    .replace(/œ/gu, 'oe')
    .replace(/ı/gu, 'i');
}

function mapConfusables(value: string) {
  return Array.from(value, (character) => CONFUSABLES[character] ?? character).join('');
}

function collapseRuns(value: string) {
  return value.replace(/([\p{L}\p{N}])\1{1,}/gu, '$1');
}

function symmetricInnerCandidates(value: string) {
  const characters = Array.from(value);
  const wrapper = characters[0];
  if (!wrapper || characters.at(-1) !== wrapper) return [];

  let leading = 0;
  while (characters[leading] === wrapper) leading += 1;
  let trailing = 0;
  while (characters[characters.length - 1 - trailing] === wrapper) trailing += 1;

  const candidates: string[] = [];
  for (let depth = 1; depth <= Math.min(leading, trailing); depth += 1) {
    const inner = characters.slice(depth, characters.length - depth).join('');
    if (Array.from(inner).length >= 2) candidates.push(inner);
  }
  return candidates;
}

function matchesStretchedTerm(candidate: string, term: string) {
  const candidateCharacters = Array.from(candidate);
  const termCharacters = Array.from(term);
  let candidateIndex = 0;
  let termIndex = 0;

  while (termIndex < termCharacters.length) {
    const expected = termCharacters[termIndex];
    let requiredRun = 1;
    while (termCharacters[termIndex + requiredRun] === expected) requiredRun += 1;

    let candidateRun = 0;
    while (candidateCharacters[candidateIndex + candidateRun] === expected) candidateRun += 1;
    if (candidateRun < requiredRun) return false;

    candidateIndex += candidateRun;
    termIndex += requiredRun;
  }

  return termCharacters.length >= 4 || candidateIndex === candidateCharacters.length;
}

function tokenize(value: string) {
  const punctuationCollapsed = fold(value)
    .replace(/[^\p{L}\p{N}\s@$]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const plain = punctuationCollapsed.match(/[\p{L}\p{N}@$]+/gu) ?? [];
  const candidates = new Set<string>();
  for (const token of plain) {
    candidates.add(token);
    candidates.add(collapseRuns(token));
    const confusable = mapConfusables(token);
    candidates.add(confusable);
    candidates.add(collapseRuns(confusable));
  }
  for (let index = 0; index < plain.length;) {
    if (Array.from(plain[index] ?? '').length !== 1) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < plain.length && Array.from(plain[end] ?? '').length === 1) end += 1;
    if (end - index >= 3) {
      const joined = mapConfusables(plain.slice(index, end).join(''));
      candidates.add(joined);
      candidates.add(collapseRuns(joined));
    }
    index = end;
  }
  for (const candidate of Array.from(candidates)) {
    for (const inner of symmetricInnerCandidates(candidate)) {
      candidates.add(inner);
      candidates.add(collapseRuns(inner));
    }
  }
  return { plain, candidates };
}

function configuredBlockedTerms() {
  return String(process.env.STUDY_CHAT_BLOCKED_TERMS ?? '')
    .split(/[\r\n,;]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && term.length <= 80);
}

function unsafeLanguage(value: string) {
  const { plain, candidates } = tokenize(value);
  const terms = new Set(
    [...BUILTIN_BLOCKED_TERMS, ...configuredBlockedTerms()]
      .map((term) => fold(term).replace(/[^\p{L}\p{N}@$]+/gu, ''))
      .filter(Boolean)
      .flatMap((term) => [term, mapConfusables(term)]),
  );
  for (const candidate of candidates) {
    if (Array.from(terms).some((term) => matchesStretchedTerm(candidate, term))) {
      return true;
    }
  }

  const foldedWords = plain.map((token) => collapseRuns(mapConfusables(token)));
  const foldedPhrase = foldedWords.join(' ');
  return [...BUILTIN_BLOCKED_PHRASES, ...configuredBlockedTerms()]
    .map((phrase) => fold(phrase).replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/gu, ' ').trim())
    .filter((phrase) => phrase.includes(' '))
    .some((phrase) => ` ${foldedPhrase} `.includes(` ${phrase} `));
}

export function evaluateStudyChatText(value: string): StudyChatSafetyResult {
  if (HIDDEN_OR_DIRECTIONAL_CONTROLS.test(value)) {
    return Object.freeze({ allowed: false, reason: 'obfuscation' });
  }
  if (EMAIL_ADDRESS.test(value) || PHONE_NUMBER.test(value)) {
    return Object.freeze({ allowed: false, reason: 'personal-contact' });
  }
  if (EXTERNAL_LINK.test(value)) {
    return Object.freeze({ allowed: false, reason: 'external-link' });
  }
  if (CHARACTER_FLOOD.test(value)) {
    return Object.freeze({ allowed: false, reason: 'spam-pattern' });
  }
  if (unsafeLanguage(value)) {
    return Object.freeze({ allowed: false, reason: 'unsafe-language' });
  }
  return Object.freeze({ allowed: true });
}
