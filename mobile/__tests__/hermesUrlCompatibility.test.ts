import {afterAll, beforeAll, describe, expect, it} from '@jest/globals';

import {
  buildJukeLocalControllerUrl,
  isAllowedJukeLocalNavigation,
  normalizeJukeLocalAppPath,
} from '../src/services/jukeLocalWebViewService';
import {
  buildSocialBootstrap,
  isAllowedSocialNavigation,
} from '../src/services/socialSessionService';
import {
  isAllowedStudyNavigation,
} from '../src/services/studyWebViewService';
import {
  classifyVotingNavigation,
  isAllowedVotingNavigation,
} from '../src/services/votingWebViewService';

describe('Hermes URL compatibility', () => {
  const globalWithUrl = globalThis as typeof globalThis & {URL?: unknown};
  const originalUrl = globalWithUrl.URL;

  beforeAll(() => {
    class HermesIncompleteUrl {
      get protocol(): never {
        throw new Error('URL.protocol is not implemented');
      }
    }

    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      value: HermesIncompleteUrl,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      value: originalUrl,
    });
  });

  it('validates every mobile WebView route without the global URL implementation', () => {
    expect(
      isAllowedVotingNavigation('https://radiotedu.com/vote/?embed=1'),
    ).toBe(true);
    expect(classifyVotingNavigation('https://www.tedu.edu.tr/')).toBe(
      'external-https',
    );
    expect(
      isAllowedStudyNavigation('https://radiotedu.com/study/?room=library'),
    ).toBe(true);
    expect(
      isAllowedJukeLocalNavigation(
        'https://radiotedu.com/juke-local/controller/?code=TEDU01',
      ),
    ).toBe(true);
    expect(
      isAllowedSocialNavigation('https://radiotedu.com/social/room', [
        'https://radiotedu.com/social/',
      ]),
    ).toBe(true);
  });

  it('builds and normalizes WebView URLs without the global URL implementation', () => {
    expect(buildJukeLocalControllerUrl(' TEDU 01 ')).toBe(
      'https://radiotedu.com/juke-local/controller/?code=TEDU+01',
    );
    expect(
      normalizeJukeLocalAppPath('juke-local/controller/?code=TEDU%2001'),
    ).toBe('jukebox/TEDU%2001');

    expect(
      buildSocialBootstrap({
        id: 'member-1',
        display_name: 'Member',
        avatar_url: 'https://radiotedu.com/avatar.png',
      }).account.avatarUrl,
    ).toBe('https://radiotedu.com/avatar.png');
  });
});
