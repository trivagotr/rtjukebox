import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateStudyChatText,
  SUPPORTED_STUDY_CHAT_LANGUAGES,
} from './studyChatSafety';

describe('Study chat safety', () => {
  afterEach(() => {
    delete process.env.STUDY_CHAT_BLOCKED_TERMS;
  });

  it('declares every supported Social language', () => {
    expect(SUPPORTED_STUDY_CHAT_LANGUAGES).toEqual(['en', 'tr', 'ru', 'ar', 'de', 'fr']);
  });

  it.each([
    'Would anyone like to join a 25 minute focus session?',
    'Kütüphanede birlikte çalışmak isteyen var mı?',
    'Кто хочет вместе готовиться к экзамену?',
    'هل نبدأ جلسة دراسة لمدة خمس وعشرين دقيقة؟',
    'Möchte jemand gemeinsam für die Prüfung lernen?',
    'Qui veut réviser ensemble pendant vingt-cinq minutes ?',
  ])('allows ordinary multilingual room conversation: %s', (message) => {
    expect(evaluateStudyChatText(message)).toEqual({ allowed: true });
  });

  it.each([
    ['f.u.c.k', 'unsafe-language'],
    ['f u c k', 'unsafe-language'],
    ['fuuuuuck', 'unsafe-language'],
    ['fυck', 'unsafe-language'],
    ['nigger', 'unsafe-language'],
    ['nigga', 'unsafe-language'],
    ['n.i.g.g.e.r', 'unsafe-language'],
    ['n i g g e r', 'unsafe-language'],
    ['n1gg3r', 'unsafe-language'],
    ['nigggger', 'unsafe-language'],
    ['xxniggerxx', 'unsafe-language'],
    ['s1kt1r', 'unsafe-language'],
    ['orospuya', 'unsafe-language'],
    ['бляяяядь', 'unsafe-language'],
    ['كسمك', 'unsafe-language'],
    ['scheiße', 'unsafe-language'],
    ['enculé', 'unsafe-language'],
    ['k\u200bill yourself', 'obfuscation'],
    ['https://example.com/profile', 'external-link'],
    ['name@example.com', 'personal-contact'],
    ['+90 (555) 123 45 67', 'personal-contact'],
    ['aaaaaaaaaaa', 'spam-pattern'],
  ])('blocks unsafe or privacy-risk content without storing it: %s', (message, reason) => {
    expect(evaluateStudyChatText(message)).toEqual({ allowed: false, reason });
  });

  it.each([
    'Night study session starts at eight.',
    'Niger is a country in West Africa.',
    'The character sniggered in the novel.',
    'We are finishing the assignment together.',
  ])('does not block benign words that only share a partial spelling: %s', (message) => {
    expect(evaluateStudyChatText(message)).toEqual({ allowed: true });
  });

  it('supports a deploy-time supplemental block list without changing the API', () => {
    process.env.STUDY_CHAT_BLOCKED_TERMS = 'campus-secret-phrase';
    expect(evaluateStudyChatText('campus secret phrase')).toEqual({
      allowed: false,
      reason: 'unsafe-language',
    });
  });
});
