import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('Android Auto car bridge source contract', () => {
  const source = () => fs.readFileSync(path.join(__dirname, '../src/services/carBridge.ts'), 'utf8');
  const nativeSource = () =>
    fs.readFileSync(
      path.join(__dirname, '../android/app/src/main/java/com/radiotedumobile/car/RadioTeduCarService.kt'),
      'utf8',
    );

  it('connects car browse surfaces to backend leaderboard and jukebox endpoints', () => {
    const carBridgeSource = source();

    expect(carBridgeSource).toContain("api.get('/users/leaderboard'");
    expect(carBridgeSource).toContain("api.get('/jukebox/devices'");
    expect(carBridgeSource).toContain("api.post('/jukebox/connect'");
    expect(carBridgeSource).toContain('Promise.all');
  });

  it('keeps phone-only Study, avatar, and gamification surfaces out of the car browse tree', () => {
    const carBridgeSource = source();
    const browseTreeStart = carBridgeSource.indexOf('const categories = [');
    const browseTreeEnd = carBridgeSource.indexOf('CarBridge!.setCatalog', browseTreeStart);
    const browseTree = carBridgeSource.slice(browseTreeStart, browseTreeEnd);

    expect(browseTree).toContain('cat_radio');
    expect(browseTree).toContain('cat_podcasts');
    expect(browseTree).toContain('cat_jukebox');
    expect(browseTree).not.toMatch(/Study|Çim|avatar|clothes|gamification|AvatarCloset|StudyRoom/);
  });

  it('supports Google Maps and Assistant playback through MediaSession search, not a map-specific SDK claim', () => {
    const serviceSource = nativeSource();

    expect(serviceSource).toContain('MediaBrowserServiceCompat');
    expect(serviceSource).toContain('MediaSessionCompat');
    expect(serviceSource).toContain('onPlayFromSearch');
    expect(serviceSource).toContain('onPlayFromMediaId');
    expect(serviceSource).not.toContain('GoogleMap');
    expect(serviceSource).not.toContain('Maps SDK');
  });
});
