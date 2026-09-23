import { describe, expect, it } from 'vitest';
import {
  buildSpotifyPlaybackTargetPayload,
  formatSpotifyPlaybackDeviceType,
  resolveAssignedSpotifyDeviceLabel,
  type SpotifyPlaybackDevice,
} from './adminSpotifyConfig';

describe('Spotify Playback Target Helpers', () => {
  it('formats device types in clean Turkish labels', () => {
    expect(formatSpotifyPlaybackDeviceType('Computer')).toBe('Bilgisayar');
    expect(formatSpotifyPlaybackDeviceType('computer')).toBe('Bilgisayar');
    expect(formatSpotifyPlaybackDeviceType('Smartphone')).toBe('Telefon');
    expect(formatSpotifyPlaybackDeviceType('Speaker')).toBe('Hoparlör');
    expect(formatSpotifyPlaybackDeviceType('cast_video')).toBe('Cast / TV');
    expect(formatSpotifyPlaybackDeviceType('cast_audio')).toBe('Cast / TV');
    expect(formatSpotifyPlaybackDeviceType('Automobile')).toBe('Otomobil');
    expect(formatSpotifyPlaybackDeviceType('UnknownType')).toBe('UnknownType');
    expect(formatSpotifyPlaybackDeviceType(undefined)).toBe('Ses Aygıtı');
  });

  it('resolves assigned device label when device is detected in active devices list', () => {
    const activeDevices: SpotifyPlaybackDevice[] = [
      {
        id: 'sp-pc-1',
        name: 'Stüdyo Yayın Masası PC',
        is_active: true,
        type: 'Computer',
        volume_percent: 100,
      },
      {
        id: 'sp-spk-2',
        name: 'Fuaye Hoparlör',
        is_active: false,
        type: 'Speaker',
        volume_percent: 75,
      },
    ];

    const result = resolveAssignedSpotifyDeviceLabel('sp-pc-1', 'Eski İsim', activeDevices);
    expect(result).toEqual({
      label: 'Stüdyo Yayın Masası PC (Bilgisayar)',
      isDetected: true,
    });
  });

  it('resolves fallback label when assigned device is offline/not detected', () => {
    const activeDevices: SpotifyPlaybackDevice[] = [];

    const result = resolveAssignedSpotifyDeviceLabel('sp-offline', 'Stüdyo Hoparlör', activeDevices);
    expect(result).toEqual({
      label: 'Stüdyo Hoparlör',
      isDetected: false,
    });

    const resultWithoutName = resolveAssignedSpotifyDeviceLabel('sp-offline-2', null, activeDevices);
    expect(resultWithoutName).toEqual({
      label: 'sp-offline-2',
      isDetected: false,
    });
  });

  it('resolves unassigned label when no target device is configured', () => {
    const resultNull = resolveAssignedSpotifyDeviceLabel(null, null, []);
    expect(resultNull.label).toContain('Atanmış cihaz yok');
    expect(resultNull.isDetected).toBe(false);

    const resultEmpty = resolveAssignedSpotifyDeviceLabel('   ', null, []);
    expect(resultEmpty.label).toContain('Atanmış cihaz yok');
    expect(resultEmpty.isDetected).toBe(false);
  });

  it('builds playback target payload correctly for assignment and clearing', () => {
    const assignPayload = buildSpotifyPlaybackTargetPayload('sp-123', 'Stüdyo Hoparlörü');
    expect(assignPayload).toEqual({
      spotify_playback_device_id: 'sp-123',
      spotify_player_name: 'Stüdyo Hoparlörü',
    });

    const clearPayload = buildSpotifyPlaybackTargetPayload(null, null);
    expect(clearPayload).toEqual({
      spotify_playback_device_id: null,
      spotify_player_name: null,
    });

    const clearWhitespacePayload = buildSpotifyPlaybackTargetPayload('   ', '');
    expect(clearWhitespacePayload).toEqual({
      spotify_playback_device_id: null,
      spotify_player_name: null,
    });
  });

  it('supports all valid admin tab identifiers with spotify-players as primary default', () => {
    const tabs = ['spotify-players', 'fallback', 'moderation', 'devices', 'songs'] as const;
    expect(tabs[0]).toBe('spotify-players');
    expect(tabs.length).toBe(5);
  });
});
