import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('NextSongVote production WebView surface', () => {
  const screenSource = fs.readFileSync(
    path.join(__dirname, '../src/screens/next-song-vote/NextSongVoteScreen.tsx'),
    'utf8',
  );

  it('mounts the production Voting WebView instead of the native voting client', () => {
    expect(screenSource).toContain('VOTING_WEBVIEW_URL');
    expect(screenSource).toContain('source={{uri: VOTING_WEBVIEW_URL}}');
    expect(screenSource).not.toContain('NextSongVotePanel');
    expect(screenSource).not.toContain('socket.io-client');
    expect(screenSource).not.toContain('nextSongVote');
    expect(screenSource).not.toContain('setInterval(');
    expect(screenSource).not.toContain('submitNextSongVote');
  });

  it('waits for the ready bridge message before injecting auth', () => {
    expect(screenSource).toContain("message.type !== 'radiotedu.voting.ready'");
    expect(screenSource).toContain('webViewReadyRef.current = true');
    expect(screenSource).toContain('webViewRef.current?.injectJavaScript(');
    expect(screenSource).toContain('buildVotingAuthInjection(authStateRef.current)');
    expect(screenSource).not.toContain('injectedJavaScriptBeforeContentLoaded');
  });

  it('locks down navigation, cookies, mixed content, files, windows, and debugging', () => {
    expect(screenSource).toContain('onShouldStartLoadWithRequest={handleNavigationRequest}');
    expect(screenSource).toContain('mixedContentMode="never"');
    expect(screenSource).toContain('thirdPartyCookiesEnabled={false}');
    expect(screenSource).toContain('sharedCookiesEnabled={false}');
    expect(screenSource).toContain('allowFileAccess={false}');
    expect(screenSource).toContain('allowUniversalAccessFromFileURLs={false}');
    expect(screenSource).toContain('setSupportMultipleWindows={false}');
    expect(screenSource).toContain('webviewDebuggingEnabled={false}');
  });

  it('implements retry, renderer failure, foreground auth refresh, and Android back handling', () => {
    expect(screenSource).toContain('Voting’e bağlanılamadı');
    expect(screenSource).toContain('Tekrar dene');
    expect(screenSource).toContain('onRenderProcessGone');
    expect(screenSource).toContain('onContentProcessDidTerminate');
    expect(screenSource).toContain('AppState.addEventListener(');
    expect(screenSource).toContain("'change'");
    expect(screenSource).toContain('BackHandler.addEventListener(');
    expect(screenSource).toContain("'hardwareBackPress'");
    expect(screenSource).toContain('webViewRef.current?.goBack()');
  });

  it('re-injects auth when the shared native session token changes', () => {
    const apiSource = fs.readFileSync(
      path.join(__dirname, '../src/services/api.ts'),
      'utf8',
    );
    const authSource = fs.readFileSync(
      path.join(__dirname, '../src/context/AuthContext.tsx'),
      'utf8',
    );

    expect(screenSource).toContain('subscribeAuthSessionChanges(readAndInjectAuth)');
    expect(apiSource).toContain('notifyAuthSessionChanged()');
    expect(authSource).toContain('notifyAuthSessionChanged()');
  });
});
