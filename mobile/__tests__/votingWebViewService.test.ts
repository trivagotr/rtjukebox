import {describe, expect, it} from '@jest/globals';

import {
  VOTING_WEBVIEW_URL,
  buildVotingAuthInjection,
  classifyVotingNavigation,
  isAllowedVotingNavigation,
  parseVotingWebViewMessage,
} from '../src/services/votingWebViewService';

describe('Voting WebView security contract', () => {
  it('uses the exact production embed URL', () => {
    expect(VOTING_WEBVIEW_URL).toBe('https://radiotedu.com/vote/?embed=1');
  });

  it('allows only the production HTTPS /vote page inside the WebView', () => {
    expect(isAllowedVotingNavigation(VOTING_WEBVIEW_URL)).toBe(true);
    expect(isAllowedVotingNavigation('https://radiotedu.com/vote')).toBe(true);
    expect(isAllowedVotingNavigation('https://radiotedu.com/vote/?round=1')).toBe(true);

    expect(isAllowedVotingNavigation('http://radiotedu.com/vote/')).toBe(false);
    expect(isAllowedVotingNavigation('https://radiotedu.com/jukebox/')).toBe(false);
    expect(isAllowedVotingNavigation('https://radiotedu.com.evil.test/vote/')).toBe(false);
    expect(isAllowedVotingNavigation('file:///vote/index.html')).toBe(false);
    expect(isAllowedVotingNavigation('data:text/html,hello')).toBe(false);
    // eslint-disable-next-line no-script-url
    expect(isAllowedVotingNavigation('javascript:alert(1)')).toBe(false);
  });

  it('opens external HTTPS links outside the WebView and blocks unsafe schemes', () => {
    expect(classifyVotingNavigation('https://www.tedu.edu.tr/')).toBe('external-https');
    expect(classifyVotingNavigation('https://radiotedu.com/podcasts/')).toBe('external-https');
    expect(classifyVotingNavigation('https://evil.test/')).toBe('blocked');
    expect(classifyVotingNavigation('https://radiotedu.com/vote/')).toBe('allowed');
    expect(classifyVotingNavigation('mailto:test@tedu.edu.tr')).toBe('blocked');
    // eslint-disable-next-line no-script-url
    expect(classifyVotingNavigation('javascript:alert(1)')).toBe('blocked');
  });

  it('parses only known, well-formed native bridge messages', () => {
    expect(parseVotingWebViewMessage('{"type":"radiotedu.voting.ready"}')).toEqual({
      type: 'radiotedu.voting.ready',
    });
    expect(
      parseVotingWebViewMessage(
        '{"type":"radiotedu.voting.vote-recorded","roundId":"round-1","candidateId":"candidate-2"}',
      ),
    ).toEqual({
      type: 'radiotedu.voting.vote-recorded',
      roundId: 'round-1',
      candidateId: 'candidate-2',
    });
    expect(parseVotingWebViewMessage('{"type":"unknown"}')).toBeNull();
    expect(parseVotingWebViewMessage('{not-json')).toBeNull();
    expect(
      parseVotingWebViewMessage(
        '{"type":"radiotedu.voting.vote-recorded","roundId":1,"candidateId":"candidate-2"}',
      ),
    ).toBeNull();
  });

  it('serializes authenticated state into runtime-only injection code', () => {
    const script = buildVotingAuthInjection({
      accessToken: 'secret-token</script>',
      user: {id: 'user-1', display_name: 'Ada'},
    });

    expect(script).toContain('window.__RADIOTEDU_SET_AUTH__');
    expect(script).toContain('"accessToken":"secret-token\\u003c/script>"');
    expect(script.trim().endsWith('true;')).toBe(true);
    expect(script).not.toContain('localStorage');
    expect(script).not.toContain('console.');
    expect(script).not.toContain('?access_token=');
  });

  it('builds a null auth payload for logout', () => {
    const script = buildVotingAuthInjection({accessToken: null, user: null});

    expect(script).toContain('"accessToken":null');
    expect(script).toContain('"user":null');
    expect(script.trim().endsWith('true;')).toBe(true);
  });
});
