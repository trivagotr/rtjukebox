import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('consent gate startup fallback', () => {
  it('does not leave users on a blank screen while consent storage is loading', () => {
    const appSource = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
    const consentSource = fs.readFileSync(path.join(__dirname, '../src/privacy/ConsentContext.tsx'), 'utf8');

    expect(appSource).toContain('const [showSplash, setShowSplash] = React.useState(false);');
    for (const requiredImport of [
      'ActivityIndicator',
      'AppState',
      'InteractionManager',
      'StatusBar',
      'View',
    ]) {
      expect(appSource).toContain(requiredImport);
    }
    expect(appSource).toContain('<ActivityIndicator color="#E31E24" size="large" />');
    expect(consentSource).toContain('const CONSENT_READY_TIMEOUT_MS = 2000;');
    expect(consentSource).toContain('setTimeout(() => setReady(true), CONSENT_READY_TIMEOUT_MS)');
  });
});
