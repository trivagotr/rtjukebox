import { beforeAll, describe, expect, it, vi } from 'vitest';

let radioProfilesModule: typeof import('./radioProfiles');

type MockDbClient = {
  query: ReturnType<typeof vi.fn>;
};

function createMockDbClient(): MockDbClient {
  return {
    query: vi.fn(),
  };
}

beforeAll(async () => {
  radioProfilesModule = await import('./radioProfiles');
});

describe('radio profile admin helpers', () => {
  it('normalizes radio profile payloads for create and update flows', () => {
    expect(
      radioProfilesModule.normalizeRadioProfilePayload('create', {
        name: '  Morning Rotation  ',
        autoplay_spotify_playlist_uri: ' spotify:playlist:abc ',
        jingle_every_n_songs: 4,
        ad_break_interval_minutes: 30,
        is_active: true,
      }),
    ).toEqual({
      name: 'Morning Rotation',
      autoplaySpotifyPlaylistUri: 'spotify:playlist:abc',
      jingleEveryNSongs: 4,
      adBreakIntervalMinutes: 30,
      isActive: true,
    });

    expect(
      radioProfilesModule.normalizeRadioProfilePayload('update', {
        autoplay_spotify_playlist_uri: null,
        jingle_every_n_songs: null,
      }),
    ).toEqual({
      autoplaySpotifyPlaylistUri: null,
      jingleEveryNSongs: null,
    });
  });

  it('rejects invalid radio profile payload combinations', () => {
    expect(() =>
      radioProfilesModule.normalizeRadioProfilePayload('create', {
        name: '   ',
      }),
    ).toThrow('Profile name required');

    expect(() =>
      radioProfilesModule.normalizeRadioProfilePayload('create', {
        name: 'Drive Time',
        jingle_every_n_songs: 0,
      }),
    ).toThrow('jingle_every_n_songs must be a positive integer');

    expect(() =>
      radioProfilesModule.normalizeRadioProfilePayload('update', {
        ad_break_interval_minutes: -5,
      }),
    ).toThrow('ad_break_interval_minutes must be a positive integer');
  });

  it('attaches only hidden local assets whose role matches the requested slot', async () => {
    const dbClient = createMockDbClient();
    dbClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'song-1',
            source_type: 'local',
            visibility: 'hidden',
            asset_role: 'jingle',
            is_active: true,
            is_blocked: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'link-1', radio_profile_id: 'profile-1', song_id: 'song-1', slot_type: 'jingle' }] });

    const result = await radioProfilesModule.attachRadioProfileAsset(dbClient as any, {
      radioProfileId: 'profile-1',
      songId: 'song-1',
      slotType: 'jingle',
    });

    expect(result).toMatchObject({
      id: 'link-1',
      radio_profile_id: 'profile-1',
      song_id: 'song-1',
      slot_type: 'jingle',
    });
  });

  it('creates a radio profile with normalized settings', async () => {
    const dbClient = createMockDbClient();
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'profile-1',
          name: 'Morning Rotation',
          autoplay_spotify_playlist_uri: 'spotify:playlist:abc',
          jingle_every_n_songs: 4,
          ad_break_interval_minutes: 30,
          is_active: true,
        },
      ],
    });

    const result = await radioProfilesModule.createRadioProfile(
      dbClient as any,
      radioProfilesModule.normalizeRadioProfilePayload('create', {
        name: 'Morning Rotation',
        autoplay_spotify_playlist_uri: 'spotify:playlist:abc',
        jingle_every_n_songs: 4,
        ad_break_interval_minutes: 30,
        is_active: true,
      }),
    );

    expect(result).toMatchObject({
      id: 'profile-1',
      name: 'Morning Rotation',
      autoplay_spotify_playlist_uri: 'spotify:playlist:abc',
      jingle_every_n_songs: 4,
      ad_break_interval_minutes: 30,
      is_active: true,
    });
  });

  it('updates an existing radio profile', async () => {
    const dbClient = createMockDbClient();
    dbClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'profile-1',
            name: 'Drive Time',
            autoplay_spotify_playlist_uri: 'spotify:playlist:drive-time',
            jingle_every_n_songs: 5,
            ad_break_interval_minutes: 20,
            is_active: false,
          },
        ],
      });

    const result = await radioProfilesModule.updateRadioProfile(dbClient as any, {
      radioProfileId: 'profile-1',
      payload: radioProfilesModule.normalizeRadioProfilePayload('update', {
        name: 'Drive Time',
        autoplay_spotify_playlist_uri: 'spotify:playlist:drive-time',
        jingle_every_n_songs: 5,
        ad_break_interval_minutes: 20,
        is_active: false,
      }),
    });

    expect(result).toMatchObject({
      id: 'profile-1',
      name: 'Drive Time',
      autoplay_spotify_playlist_uri: 'spotify:playlist:drive-time',
      jingle_every_n_songs: 5,
      ad_break_interval_minutes: 20,
      is_active: false,
    });
  });

  it('deletes an existing radio profile', async () => {
    const dbClient = createMockDbClient();
    dbClient.query.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] });

    const result = await radioProfilesModule.deleteRadioProfile(dbClient as any, 'profile-1');

    expect(result).toEqual({ id: 'profile-1' });
  });

  it('rejects asset attachment when the song is not a hidden local asset for that slot', async () => {
    const dbClient = createMockDbClient();
    dbClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'song-1',
            source_type: 'spotify',
            visibility: 'public',
            asset_role: 'music',
            is_active: true,
            is_blocked: false,
          },
        ],
      });

    await expect(
      radioProfilesModule.attachRadioProfileAsset(dbClient as any, {
        radioProfileId: 'profile-1',
        songId: 'song-1',
        slotType: 'ad',
      }),
    ).rejects.toThrow('Only hidden local songs with matching asset_role can be attached');
  });

  it('detaches an attached radio profile asset', async () => {
    const dbClient = createMockDbClient();
    dbClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'link-1',
          radio_profile_id: 'profile-1',
          song_id: 'song-1',
          slot_type: 'ad',
        },
      ],
    });

    const result = await radioProfilesModule.detachRadioProfileAsset(dbClient as any, {
      radioProfileId: 'profile-1',
      songId: 'song-1',
      slotType: 'ad',
    });

    expect(result).toMatchObject({
      id: 'link-1',
      radio_profile_id: 'profile-1',
      song_id: 'song-1',
      slot_type: 'ad',
    });
  });

  it('assigns a device to a radio profile', async () => {
    const dbClient = createMockDbClient();
    dbClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'device-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'device-1', radio_profile_id: 'profile-1' }] });

    const result = await radioProfilesModule.assignDeviceToRadioProfile(dbClient as any, {
      deviceId: 'device-1',
      radioProfileId: 'profile-1',
    });

    expect(result).toEqual({ id: 'device-1', radio_profile_id: 'profile-1' });
  });

  it('normalizes device override payloads and updates override values', async () => {
    const dbClient = createMockDbClient();
    dbClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'device-1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'device-1',
            override_enabled: true,
            override_autoplay_spotify_playlist_uri: 'spotify:playlist:override',
            override_jingle_every_n_songs: 2,
            override_ad_break_interval_minutes: 45,
          },
        ],
      });

    const payload = radioProfilesModule.normalizeDeviceOverridePayload({
      override_enabled: true,
      autoplay_spotify_playlist_uri: ' spotify:playlist:override ',
      jingle_every_n_songs: 2,
      ad_break_interval_minutes: 45,
    });

    expect(payload).toEqual({
      overrideEnabled: true,
      autoplaySpotifyPlaylistUri: 'spotify:playlist:override',
      jingleEveryNSongs: 2,
      adBreakIntervalMinutes: 45,
    });

    const result = await radioProfilesModule.updateDeviceRadioProfileOverride(dbClient as any, {
      deviceId: 'device-1',
      overrideEnabled: payload.overrideEnabled,
      autoplaySpotifyPlaylistUri: payload.autoplaySpotifyPlaylistUri,
      jingleEveryNSongs: payload.jingleEveryNSongs,
      adBreakIntervalMinutes: payload.adBreakIntervalMinutes,
    });

    expect(result).toMatchObject({
      id: 'device-1',
      override_enabled: true,
      override_autoplay_spotify_playlist_uri: 'spotify:playlist:override',
      override_jingle_every_n_songs: 2,
      override_ad_break_interval_minutes: 45,
    });
  });
});
