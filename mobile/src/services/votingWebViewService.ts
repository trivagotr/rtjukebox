import {parseHttpUrl} from './safeHttpUrlService';

export const VOTING_WEBVIEW_URL = 'https://radiotedu.com/vote/?embed=1';

export interface VotingWebViewAuthState {
  accessToken: string | null;
  user: unknown | null;
}

export type VotingWebViewMessage =
  | {type: 'radiotedu.voting.ready'}
  | {
      type: 'radiotedu.voting.vote-recorded';
      roundId: string;
      candidateId: string;
    };

export type VotingNavigationDecision =
  | 'allowed'
  | 'external-https'
  | 'blocked';

function isTrustedExternalHost(hostname: string) {
  return (
    hostname === 'radiotedu.com' ||
    hostname === 'tedu.edu.tr' ||
    hostname.endsWith('.tedu.edu.tr')
  );
}

export function isAllowedVotingNavigation(url: string) {
  const candidate = parseHttpUrl(url);
  if (!candidate) {
    return false;
  }

  return (
    candidate.protocol === 'https:' &&
    candidate.hostname === 'radiotedu.com' &&
    candidate.port === '' &&
    !candidate.hasCredentials &&
    (candidate.pathname === '/vote' || candidate.pathname === '/vote/')
  );
}

export function classifyVotingNavigation(
  url: string,
): VotingNavigationDecision {
  if (isAllowedVotingNavigation(url)) {
    return 'allowed';
  }

  const candidate = parseHttpUrl(url);
  if (
    candidate?.protocol === 'https:' &&
    isTrustedExternalHost(candidate.hostname) &&
    !candidate.hasCredentials
  ) {
    return 'external-https';
  }

  return 'blocked';
}

export function parseVotingWebViewMessage(
  rawMessage: string,
): VotingWebViewMessage | null {
  try {
    const message = JSON.parse(rawMessage) as Record<string, unknown>;
    if (message.type === 'radiotedu.voting.ready') {
      return {type: 'radiotedu.voting.ready'};
    }

    if (
      message.type === 'radiotedu.voting.vote-recorded' &&
      typeof message.roundId === 'string' &&
      typeof message.candidateId === 'string'
    ) {
      return {
        type: 'radiotedu.voting.vote-recorded',
        roundId: message.roundId,
        candidateId: message.candidateId,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function serializeForInjection(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildVotingAuthInjection(authState: VotingWebViewAuthState) {
  return `
    (function () {
      if (typeof window.__RADIOTEDU_SET_AUTH__ === 'function') {
        window.__RADIOTEDU_SET_AUTH__(${serializeForInjection(authState)});
      }
      true;
    })();
    true;
  `;
}
