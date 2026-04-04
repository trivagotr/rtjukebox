import { describe, expect, it, vi } from 'vitest';
import playbackHelpers from './playback.js';
import spotifyHelpers from './spotify-player.js';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const { getSongPlaybackPlan, shouldSyncNowPlayingView } = playbackHelpers;

describe('kiosk playback helpers', () => {
  it('builds an absolute local audio url for local queue items', () => {
    const plan = getSongPlaybackPlan({
      id: 'queue-item-1',
      song_id: 'song-local-1',
      playback_type: 'local',
      source_type: 'local',
      file_url: '/uploads/songs/local-song.mp3',
      spotify_uri: null,
    }, 'http://127.0.0.1:3000');

    expect(plan).toEqual({
      kind: 'local',
      audioUrl: 'http://127.0.0.1:3000/uploads/songs/local-song.mp3',
      spotifyUri: null,
      songId: 'song-local-1',
    });
  });

  it('classifies spotify queue items without touching file_url', () => {
    const plan = getSongPlaybackPlan({
      id: 'queue-item-2',
      song_id: 'song-spotify-1',
      playback_type: 'spotify',
      source_type: 'spotify',
      file_url: null,
      spotify_uri: 'spotify:track:123',
    }, 'http://127.0.0.1:3000');

    expect(plan).toEqual({
      kind: 'spotify',
      audioUrl: null,
      spotifyUri: 'spotify:track:123',
      songId: 'song-spotify-1',
    });
  });

  it('syncs the playing view when remote playback is already active for the current now-playing item', () => {
    expect(shouldSyncNowPlayingView({
      nowPlaying: { song_id: 'song-spotify-1', playback_type: 'spotify' },
      isPlaying: true,
      spotifyTrackUri: 'spotify:track:123',
      startupBlocked: false,
    })).toBe(true);

    expect(shouldSyncNowPlayingView({
      nowPlaying: null,
      isPlaying: true,
      spotifyTrackUri: 'spotify:track:123',
      startupBlocked: false,
    })).toBe(false);

    expect(shouldSyncNowPlayingView({
      nowPlaying: { song_id: 'song-spotify-1', playback_type: 'spotify' },
      isPlaying: true,
      spotifyTrackUri: 'spotify:track:123',
      startupBlocked: true,
    })).toBe(false);
  });

  it('keeps spotify queue items out of unsupported-song handling in the kiosk app', async () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const fetchCalls = [];
    const audioPlayer = {
      pause: vi.fn(),
      src: '',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn(() => ({ style: {}, appendChild: vi.fn(), querySelector: vi.fn() })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return {
          classList: { add: vi.fn(), remove: vi.fn() },
          style: {},
          textContent: '',
          innerHTML: '',
        };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class {
      constructor() {
        this.style = {};
        this.onload = null;
        this.onerror = null;
      }
    };
    const spotifyController = {
      connect: vi.fn().mockResolvedValue(true),
      activateElement: vi.fn(),
      disconnect: vi.fn(),
    };
    const socketStub = {
      connected: true,
      on: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      addEventListener: vi.fn(),
      Image: imageStub,
    };
    windowStub.KioskPlayback = playbackHelpers;
    windowStub.KioskSpotifyPlayer = {
      loadSpotifySdk: vi.fn().mockResolvedValue({ Player: function Player() {} }),
      createSpotifyPlayer: vi.fn(({ onReady }) => {
        queueMicrotask(() => onReady({
          spotify_device_id: 'browser-device-1',
          player_name: 'Kiosk Browser',
          player_state: null,
        }));
        return spotifyController;
      }),
      buildSpotifyRegistrationPayload: vi.fn(({ deviceId, spotifyDeviceId, playerName, state }) => ({
        device_id: deviceId,
        spotify_device_id: spotifyDeviceId,
        player_name: playerName ? String(playerName).trim() : null,
        player_state: state,
      })),
      mapSpotifyPlayerState: vi.fn(),
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: windowStub.localStorage,
      fetch: vi.fn((url, options) => {
        fetchCalls.push([url, options]);
        const urlString = String(url);

        if (urlString.includes('/api/v1/jukebox/kiosk/register')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              data: {
                device: {
                  id: 'device-1',
                  device_code: 'KIOSK-1',
                  name: 'Kiosk Browser',
                  location: 'Kafe',
                },
              },
            }),
          });
        }

        if (urlString.includes('/api/v1/jukebox/kiosk/spotify-token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              data: {
                device_id: 'device-1',
                access_token: 'token-1',
                token_expires_at: '2026-04-03T11:00:00.000Z',
                scopes: 'streaming user-modify-playback-state user-read-playback-state',
              },
            }),
          });
        }

        if (urlString.includes('/api/v1/jukebox/kiosk/spotify-device')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              data: { device: { id: 'device-1' } },
            }),
          });
        }

        if (urlString.includes('/api/v1/jukebox/kiosk/now-playing')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });
        }

        if (urlString.includes('/api/v1/jukebox/queue/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ now_playing: null, queue: [] }),
          });
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      io: vi.fn(() => socketStub),
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: {
        loadSpotifySdk: vi.fn().mockResolvedValue({ Player: function Player() {} }),
        createSpotifyPlayer: vi.fn(({ onReady }) => {
          queueMicrotask(() => onReady({
            spotify_device_id: 'browser-device-1',
            player_name: 'Kiosk Browser',
            player_state: null,
          }));
          return spotifyController;
        }),
        buildSpotifyRegistrationPayload: vi.fn(({ deviceId, spotifyDeviceId, playerName, state }) => ({
          device_id: deviceId,
          spotify_device_id: spotifyDeviceId,
          player_name: playerName ? String(playerName).trim() : null,
          player_state: state,
        })),
        mapSpotifyPlayerState: vi.fn(),
      },
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);

    const app = new context.KioskApp();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (app.spotifyReadyPromise) {
      await app.spotifyReadyPromise;
    }
    vi.spyOn(app, 'skipUnsupportedSong').mockResolvedValue(undefined);
    vi.spyOn(app, 'showPlayingState').mockImplementation(() => {});
    vi.spyOn(app, 'showIdleState').mockImplementation(() => {});
    vi.spyOn(app, 'loadInitialQueue').mockResolvedValue(undefined);

    await app.playSong({
      id: 'queue-item-spotify',
      song_id: 'song-spotify-1',
      title: 'Spotify Song',
      artist: 'Spotify Artist',
      source_type: 'spotify',
      playback_type: 'spotify',
      spotify_uri: 'spotify:track:123',
      file_url: null,
      cover_url: null,
      added_by_name: 'Anonim',
    });

    expect(app.skipUnsupportedSong).not.toHaveBeenCalled();
    expect(fetchCalls.some(([url]) => String(url).includes('/api/v1/jukebox/kiosk/now-playing'))).toBe(true);
  });

  it('mirrors now_playing into the kiosk UI when queue updates arrive after spotify playback has already started', async () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const socketHandlers = {};
    const audioPlayer = {
      pause: vi.fn(),
      src: '',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn(() => ({ style: {}, appendChild: vi.fn(), querySelector: vi.fn() })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return {
          classList: { add: vi.fn(), remove: vi.fn() },
          style: {},
          textContent: '',
          innerHTML: '',
        };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class {
      constructor() {
        this.style = {};
      }
    };
    const spotifyController = {
      connect: vi.fn().mockResolvedValue(true),
      activateElement: vi.fn(),
      disconnect: vi.fn(),
    };
    const socketStub = {
      connected: true,
      on: vi.fn((event, handler) => {
        socketHandlers[event] = handler;
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      addEventListener: vi.fn(),
      Image: imageStub,
    };
    windowStub.KioskPlayback = playbackHelpers;
    windowStub.KioskSpotifyPlayer = {
      loadSpotifySdk: vi.fn().mockResolvedValue({ Player: function Player() {} }),
      createSpotifyPlayer: vi.fn(({ onReady }) => {
        queueMicrotask(() => onReady({
          spotify_device_id: 'browser-device-1',
          player_name: 'Kiosk Browser',
          player_state: {
            paused: false,
            position_ms: 1000,
            duration_ms: 200000,
            track_uri: 'spotify:track:123',
          },
        }));
        return spotifyController;
      }),
      buildSpotifyRegistrationPayload: vi.fn(({ deviceId, spotifyDeviceId, playerName, state }) => ({
        device_id: deviceId,
        spotify_device_id: spotifyDeviceId,
        player_name: playerName ? String(playerName).trim() : null,
        player_state: state,
      })),
      mapSpotifyPlayerState: vi.fn(),
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: windowStub.localStorage,
      fetch: vi.fn((url) => {
        const urlString = String(url);

        if (urlString.includes('/api/v1/jukebox/kiosk/register')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              data: { device: { id: 'device-1', device_code: 'KIOSK-1', name: 'Kiosk Browser', location: 'Kafe' } },
            }),
          });
        }

        if (urlString.includes('/api/v1/jukebox/kiosk/spotify-token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              data: {
                device_id: 'device-1',
                access_token: 'token-1',
                token_expires_at: '2026-04-03T11:00:00.000Z',
                scopes: 'streaming user-modify-playback-state user-read-playback-state',
              },
            }),
          });
        }

        if (urlString.includes('/api/v1/jukebox/kiosk/spotify-device')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { device: { id: 'device-1' } } }) });
        }

        if (urlString.includes('/api/v1/jukebox/queue/')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ now_playing: null, queue: [] }) });
        }

        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      io: vi.fn(() => socketStub),
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: windowStub.KioskSpotifyPlayer,
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);

    const app = new context.KioskApp();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (app.spotifyReadyPromise) {
      await app.spotifyReadyPromise;
    }

    app.isPlaying = true;
    app.spotifyPlayerState = {
      paused: false,
      position_ms: 1000,
      duration_ms: 200000,
      track_uri: 'spotify:track:123',
    };

    const showPlayingState = vi.spyOn(app, 'showPlayingState').mockImplementation(() => {});

    socketHandlers.queue_updated({
      now_playing: {
        id: 'queue-item-spotify',
        song_id: 'song-spotify-1',
        title: 'Spotify Song',
        artist: 'Spotify Artist',
        source_type: 'spotify',
        playback_type: 'spotify',
        spotify_uri: 'spotify:track:123',
        file_url: null,
        cover_url: null,
        added_by_name: 'Anonim',
      },
      queue: [],
    });

    expect(showPlayingState).toHaveBeenCalledWith(expect.objectContaining({
      song_id: 'song-spotify-1',
      title: 'Spotify Song',
      playback_type: 'spotify',
    }));
  });

  it('pauses spotify playback before starting a local file', async () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const audioPlayer = {
      pause: vi.fn(),
      src: '',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn(() => ({ style: {}, appendChild: vi.fn(), querySelector: vi.fn() })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return { classList: { add: vi.fn(), remove: vi.fn() }, style: {}, textContent: '', innerHTML: '' };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class { constructor() { this.style = {}; } };
    const socketStub = { connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      addEventListener: vi.fn(),
      Image: imageStub,
      KioskPlayback: playbackHelpers,
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: windowStub.localStorage,
      fetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      io: vi.fn(() => socketStub),
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: undefined,
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const app = new context.KioskApp();
    app.device = { id: 'device-1' };
    app.queueData = { now_playing: null, queue: [] };

    const pauseSpotifyPlayback = vi.spyOn(app, 'pauseSpotifyPlayback').mockImplementation(() => {});
    vi.spyOn(app, 'showPlayingState').mockImplementation(() => {});

    await app.playSong({
      id: 'queue-item-local',
      song_id: 'song-local-1',
      title: 'Local Song',
      artist: 'Local Artist',
      source_type: 'local',
      playback_type: 'local',
      file_url: '/uploads/songs/local-song.mp3',
      cover_url: null,
      added_by_name: 'Anonim',
    });

    expect(pauseSpotifyPlayback).toHaveBeenCalled();
  });

  it('stops local audio before handing off a spotify track', async () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const audioPlayer = {
      pause: vi.fn(),
      src: 'http://127.0.0.1:3000/uploads/songs/local-song.mp3',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn(() => ({ style: {}, appendChild: vi.fn(), querySelector: vi.fn() })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return { classList: { add: vi.fn(), remove: vi.fn() }, style: {}, textContent: '', innerHTML: '' };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class { constructor() { this.style = {}; } };
    const socketStub = { connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      addEventListener: vi.fn(),
      Image: imageStub,
      KioskPlayback: playbackHelpers,
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: windowStub.localStorage,
      fetch: vi.fn((url) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, url }) })),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      io: vi.fn(() => socketStub),
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: undefined,
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const app = new context.KioskApp();
    app.device = { id: 'device-1' };
    app.spotifyController = { player: { pause: vi.fn() } };
    vi.spyOn(app, 'ensureSpotifyPlaybackReady').mockResolvedValue(app.spotifyController);
    vi.spyOn(app, 'showPlayingState').mockImplementation(() => {});

    await app.playSpotifySong({
      id: 'queue-item-spotify',
      song_id: 'song-spotify-1',
      title: 'Spotify Song',
      artist: 'Spotify Artist',
      source_type: 'spotify',
      playback_type: 'spotify',
      spotify_uri: 'spotify:track:123',
      cover_url: null,
      added_by_name: 'Anonim',
    });

    expect(audioPlayer.pause).toHaveBeenCalled();
    expect(audioPlayer.src).toBe('');
  });

  it('polls spotify state so the 80 percent autoplay rule uses fresh playback progress', async () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const fetchCalls = [];
    const audioPlayer = {
      pause: vi.fn(),
      src: '',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn(() => ({ style: {}, appendChild: vi.fn(), querySelector: vi.fn() })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return { classList: { add: vi.fn(), remove: vi.fn() }, style: {}, textContent: '', innerHTML: '' };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class { constructor() { this.style = {}; } };
    const socketStub = { connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
    const spotifyPlayer = {
      getCurrentState: vi.fn().mockResolvedValue({
        paused: false,
        position: 170000,
        track_window: {
          current_track: {
            uri: 'spotify:track:123',
            id: '123',
            name: 'Spotify Song',
            duration_ms: 200000,
            artists: [{ name: 'Spotify Artist' }],
          },
        },
      }),
      pause: vi.fn(),
    };
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      addEventListener: vi.fn(),
      Image: imageStub,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: spotifyHelpers,
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: windowStub.localStorage,
      fetch: vi.fn((url) => {
        fetchCalls.push(String(url));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      io: vi.fn(() => socketStub),
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: spotifyHelpers,
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const app = new context.KioskApp();
    app.device = { id: 'device-1' };
    app.spotifyController = { player: spotifyPlayer };
    app.spotifyPlayerState = {
      paused: false,
      position_ms: 1000,
      duration_ms: 200000,
      track_uri: 'spotify:track:123',
    };
    app.queueData = {
      now_playing: {
        song_id: 'song-spotify-1',
        playback_type: 'spotify',
      },
      queue: [],
    };
    app.isPlaying = true;
    app.autoplayTriggered = false;

    await app.updateProgress();

    expect(spotifyPlayer.getCurrentState).toHaveBeenCalledTimes(1);
    expect(fetchCalls).toContain('http://127.0.0.1:3000/api/v1/jukebox/autoplay/trigger');
  });

  it('detects spotify track end from polled player state when the sdk does not push a final event', async () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const audioPlayer = {
      pause: vi.fn(),
      src: '',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn(() => ({ style: {}, appendChild: vi.fn(), querySelector: vi.fn() })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return { classList: { add: vi.fn(), remove: vi.fn() }, style: {}, textContent: '', innerHTML: '' };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class { constructor() { this.style = {}; } };
    const socketStub = { connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
    const spotifyPlayer = {
      getCurrentState: vi.fn().mockResolvedValue(null),
      pause: vi.fn(),
    };
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      addEventListener: vi.fn(),
      Image: imageStub,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: spotifyHelpers,
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: windowStub.localStorage,
      fetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      io: vi.fn(() => socketStub),
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: spotifyHelpers,
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const app = new context.KioskApp();
    app.device = { id: 'device-1' };
    app.spotifyController = { player: spotifyPlayer };
    app.spotifyPlayerState = {
      paused: false,
      position_ms: 199500,
      duration_ms: 200000,
      track_uri: 'spotify:track:123',
      track_id: '123',
      track_name: 'Spotify Song',
      track_artists: ['Spotify Artist'],
    };
    app.queueData = {
      now_playing: {
        song_id: 'song-spotify-1',
        playback_type: 'spotify',
      },
      queue: [],
    };
    app.isPlaying = true;

    const handleSpotifyTrackEnded = vi.spyOn(app, 'handleSpotifyTrackEnded').mockImplementation(() => {});

    await app.updateProgress();

    expect(spotifyPlayer.getCurrentState).toHaveBeenCalledTimes(1);
    expect(handleSpotifyTrackEnded).toHaveBeenCalledTimes(1);
  });

  it('starts progress polling immediately after a spotify handoff succeeds', async () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const audioPlayer = {
      pause: vi.fn(),
      src: 'http://127.0.0.1:3000/uploads/songs/local-song.mp3',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn(() => ({ style: {}, appendChild: vi.fn(), querySelector: vi.fn() })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return { classList: { add: vi.fn(), remove: vi.fn() }, style: {}, textContent: '', innerHTML: '' };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class { constructor() { this.style = {}; } };
    const socketStub = { connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      addEventListener: vi.fn(),
      Image: imageStub,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: spotifyHelpers,
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: windowStub.localStorage,
      fetch: vi.fn((url) => {
        const urlString = String(url);
        if (urlString.includes('/api/v1/jukebox/kiosk/now-playing')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { device: { id: 'device-1' } } }),
        });
      }),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      io: vi.fn(() => socketStub),
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: spotifyHelpers,
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const app = new context.KioskApp();
    app.device = { id: 'device-1' };
    app.spotifyController = { player: { pause: vi.fn() } };
    app.ensureSpotifyPlaybackReady = vi.fn().mockResolvedValue(app.spotifyController);
    vi.spyOn(app, 'showPlayingState').mockImplementation(() => {});
    const startProgressUpdate = vi.spyOn(app, 'startProgressUpdate').mockImplementation(() => {});

    await app.playSpotifySong({
      id: 'queue-item-spotify',
      song_id: 'song-spotify-1',
      title: 'Spotify Song',
      artist: 'Spotify Artist',
      source_type: 'spotify',
      playback_type: 'spotify',
      spotify_uri: 'spotify:track:123',
      file_url: null,
      cover_url: null,
      added_by_name: 'Anonim',
    });

    expect(startProgressUpdate).toHaveBeenCalledTimes(1);
  });

  it('keeps spotify progress polling alive when the sdk reports a paused state for the active spotify song', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const audioPlayer = {
      pause: vi.fn(),
      src: '',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn(() => ({ style: {}, appendChild: vi.fn(), querySelector: vi.fn() })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return { classList: { add: vi.fn(), remove: vi.fn() }, style: {}, textContent: '', innerHTML: '' };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class { constructor() { this.style = {}; } };
    const socketStub = { connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      addEventListener: vi.fn(),
      Image: imageStub,
      KioskPlayback: playbackHelpers,
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: windowStub.localStorage,
      fetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      io: vi.fn(() => socketStub),
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: spotifyHelpers,
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const app = new context.KioskApp();
    app.queueData = {
      now_playing: {
        song_id: 'song-spotify-1',
        playback_type: 'spotify',
      },
      queue: [],
    };

    const startProgressUpdate = vi.spyOn(app, 'startProgressUpdate').mockImplementation(() => {});
    const stopProgressUpdate = vi.spyOn(app, 'stopProgressUpdate').mockImplementation(() => {});

    app.handleSpotifyPlayerStateChange({
      paused: true,
      position_ms: 0,
      duration_ms: 289533,
      track_uri: 'spotify:track:4DPdJvSMB6hmrjgC5eC85d',
      track_id: '4DPdJvSMB6hmrjgC5eC85d',
      track_name: 'Iris',
      track_artists: ['The Goo Goo Dolls'],
      track_ended: false,
    });

    expect(startProgressUpdate).toHaveBeenCalledTimes(1);
    expect(stopProgressUpdate).not.toHaveBeenCalled();
  });

  it('stores a recoverable spotify auth-required state when kiosk spotify token fetch fails', async () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const audioPlayer = {
      pause: vi.fn(),
      src: '',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const localStorageCalls = [];
    const localStorageStub = {
      getItem: vi.fn((key) => {
        const entry = localStorageCalls.find(([storedKey]) => storedKey === key);
        return entry ? entry[1] : null;
      }),
      setItem: vi.fn((key, value) => {
        localStorageCalls.push([key, value]);
      }),
      removeItem: vi.fn((key) => {
        const index = localStorageCalls.findIndex(([storedKey]) => storedKey === key);
        if (index >= 0) {
          localStorageCalls.splice(index, 1);
        }
      }),
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn(() => ({ style: {}, appendChild: vi.fn(), querySelector: vi.fn() })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return { classList: { add: vi.fn(), remove: vi.fn() }, style: {}, textContent: '', innerHTML: '' };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class { constructor() { this.style = {}; } };
    const socketStub = { connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: localStorageStub,
      addEventListener: vi.fn(),
      Image: imageStub,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: {
        loadSpotifySdk: vi.fn().mockResolvedValue({ Player: function Player() {} }),
        createSpotifyPlayer: vi.fn(({ getOAuthToken }) => {
          return {
            connect: vi.fn(async () => {
              await getOAuthToken();
            }),
          };
        }),
        buildSpotifyRegistrationPayload: vi.fn(),
        mapSpotifyPlayerState: vi.fn(),
      },
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: localStorageStub,
      fetch: vi.fn((url) => {
        const urlString = String(url);

        if (urlString.includes('/api/v1/jukebox/kiosk/register')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              data: {
                device: {
                  id: 'device-1',
                  device_code: 'KIOSK-1',
                  name: 'Kiosk Browser',
                  location: 'Kafe',
                },
              },
            }),
          });
        }

        if (urlString.includes('/api/v1/jukebox/kiosk/spotify-token')) {
          return Promise.resolve({
            ok: false,
            status: 503,
            json: () => Promise.resolve({
              success: false,
              error: 'No Spotify authorization found for device',
            }),
          });
        }

        if (urlString.includes('/api/v1/jukebox/queue/')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ now_playing: null, queue: [] }),
          });
        }

        if (urlString.includes('/api/v1/jukebox/kiosk/spotify-device')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, data: { device: { id: 'device-1' } } }),
          });
        }

        if (urlString.includes('/api/v1/jukebox/kiosk/now-playing')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });
        }

        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
      }),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      io: vi.fn(() => socketStub),
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: windowStub.KioskSpotifyPlayer,
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const app = new context.KioskApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(app.spotifyDeviceAuthSetupState).toEqual(expect.objectContaining({
      deviceId: 'device-1',
      required: true,
    }));
    expect(localStorageStub.setItem).toHaveBeenCalledWith(
      'spotify_device_auth_setup_state',
      expect.stringContaining('"deviceId":"device-1"')
    );

    const playLocalSong = vi.spyOn(app, 'showPlayingState').mockImplementation(() => {});
    const audioPlay = vi.spyOn(audioPlayer, 'play');
    app.device = { id: 'device-1' };

    await app.playSong({
      id: 'queue-item-local',
      song_id: 'song-local-1',
      title: 'Local Song',
      artist: 'Local Artist',
      source_type: 'local',
      playback_type: 'local',
      file_url: '/uploads/songs/local-song.mp3',
      cover_url: null,
      added_by_name: 'Anonim',
    });

    expect(audioPlay).toHaveBeenCalled();
    expect(playLocalSong).toHaveBeenCalled();
  });

  it('boots local kiosk services even when spotify auth is missing', async () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const audioPlayer = {
      pause: vi.fn(),
      src: '',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const socketHandlers = {};
    const socketStub = {
      connected: true,
      on: vi.fn((event, handler) => {
        socketHandlers[event] = handler;
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn((tagName) => ({
        tagName,
        style: {},
        appendChild: vi.fn(),
        querySelector: vi.fn(() => null),
      })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return {
          classList: { add: vi.fn(), remove: vi.fn() },
          style: {},
          textContent: '',
          innerHTML: '',
        };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class {
      constructor() {
        this.style = {};
        this.onload = null;
        this.onerror = null;
      }
    };
    const fetch = vi.fn((url) => {
      const urlString = String(url);
      if (urlString.includes('/api/v1/jukebox/kiosk/register')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              device: {
                id: 'device-1',
                name: 'KIOSK-1',
                location: 'Lobby',
              },
            },
          }),
        });
      }

      if (urlString.includes('/api/v1/jukebox/kiosk/spotify-device-auth/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              deviceId: 'device-1',
              connected: false,
              reason: 'Spotify bağlantısı gerekli',
            },
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      });
    });
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      addEventListener: vi.fn(),
      Image: imageStub,
    };
    windowStub.KioskPlayback = playbackHelpers;
    windowStub.KioskSpotifyPlayer = {
      loadSpotifySdk: vi.fn(),
      createSpotifyPlayer: vi.fn(),
    };
    windowStub.KioskDeviceSpotifyAuth = {
      createSpotifyDeviceAuthController: vi.fn(() => ({
        refreshStatus: vi.fn().mockResolvedValue({
          deviceId: 'device-1',
          connected: false,
          reason: 'Spotify bağlantısı gerekli',
        }),
        openConnectFlow: vi.fn(),
        destroy: vi.fn(),
        getStatus: vi.fn(() => ({
          deviceId: 'device-1',
          connected: false,
          reason: 'Spotify bağlantısı gerekli',
        })),
      })),
      renderSpotifyDeviceAuthSetup: vi.fn(),
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: windowStub.localStorage,
      fetch,
      io: vi.fn(() => socketStub),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: windowStub.KioskSpotifyPlayer,
      KioskDeviceSpotifyAuth: windowStub.KioskDeviceSpotifyAuth,
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const showStartupOverlay = vi.spyOn(context.KioskApp.prototype, 'showStartupOverlay');
    const loadInitialQueue = vi.spyOn(context.KioskApp.prototype, 'loadInitialQueue').mockResolvedValue(undefined);

    new context.KioskApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(context.io).toHaveBeenCalledTimes(1);
    expect(showStartupOverlay).toHaveBeenCalled();
    expect(socketStub.on).toHaveBeenCalledWith('connect', expect.any(Function));

    await socketHandlers.connect?.();
    expect(loadInitialQueue).toHaveBeenCalled();
  });

  it('persists device setup credentials by redirecting with code and password query params', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const locationStub = {
      href: 'http://127.0.0.1:3000/kiosk/',
      protocol: 'http:',
      hostname: '127.0.0.1',
      search: '',
    };
    const localStorageStub = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const context = vm.createContext({
      window: {
        location: locationStub,
        localStorage: localStorageStub,
        addEventListener: vi.fn(),
      },
      document: {
        addEventListener: vi.fn(),
        getElementById: vi.fn(() => null),
      },
      localStorage: localStorageStub,
      console,
      URL,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const app = Object.create(context.KioskApp.prototype);
    app.log = vi.fn();

    app.persistDeviceSetupCredentials('CHILL-IN', '1234');

    expect(localStorageStub.setItem).toHaveBeenCalledWith('device_code', 'CHILL-IN');
    expect(localStorageStub.setItem).toHaveBeenCalledWith('device_pwd', '1234');
    expect(locationStub.href).toBe('http://127.0.0.1:3000/kiosk/?code=CHILL-IN&pwd=1234');
  });

  it('shows a visible spotify connect action in the startup overlay when device auth is missing', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const appended = [];
    const context = vm.createContext({
      window: {
        location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        addEventListener: vi.fn(),
      },
      document: {
        body: {
          appendChild: vi.fn((node) => {
            appended.push(node);
            return node;
          }),
        },
        addEventListener: vi.fn(),
        createElement: vi.fn((tagName) => ({
          tagName,
          id: '',
          style: '',
          innerHTML: '',
          onclick: null,
          remove: vi.fn(),
          querySelector: vi.fn(() => null),
        })),
        getElementById: vi.fn(() => null),
      },
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const app = Object.create(context.KioskApp.prototype);
    app.spotifyDeviceAuthReady = false;
    app.openSpotifyDeviceAuthSetup = vi.fn();
    app.log = vi.fn();
    app.activateSpotifyPlayback = vi.fn();
    app.checkAndPlayNext = vi.fn();

    app.showStartupOverlay();

    expect(appended).toHaveLength(1);
    expect(appended[0].innerHTML).toContain('Spotify Bağla');
  });

  it('does not fall back to the device setup overlay when spotify setup throws after successful registration', async () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, './app.js'), 'utf8');
    const audioPlayer = {
      pause: vi.fn(),
      src: '',
      addEventListener: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      currentTime: 0,
      duration: 0,
    };
    const socketStub = {
      connected: true,
      on: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    const documentStub = {
      body: { appendChild: vi.fn() },
      documentElement: {},
      fullscreenElement: null,
      addEventListener: vi.fn(),
      createElement: vi.fn((tagName) => ({
        tagName,
        style: {},
        appendChild: vi.fn(),
        querySelector: vi.fn(() => null),
      })),
      getElementById: vi.fn((id) => {
        if (id === 'audioPlayer') return audioPlayer;
        if (id === 'waveformCanvas') return null;
        if (id === 'startupOverlay') return null;
        return {
          classList: { add: vi.fn(), remove: vi.fn() },
          style: {},
          textContent: '',
          innerHTML: '',
        };
      }),
      querySelector: vi.fn(() => null),
    };
    const imageStub = class {
      constructor() {
        this.style = {};
      }
    };
    const fetch = vi.fn((url) => {
      const urlString = String(url);
      if (urlString.includes('/api/v1/jukebox/kiosk/register')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: {
              device: {
                id: 'device-1',
                name: 'KIOSK-1',
                location: 'Lobby',
              },
            },
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      });
    });
    const windowStub = {
      location: { protocol: 'http:', hostname: '127.0.0.1', search: '' },
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      addEventListener: vi.fn(),
      Image: imageStub,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: {
        loadSpotifySdk: vi.fn(),
        createSpotifyPlayer: vi.fn(),
      },
      KioskDeviceSpotifyAuth: {
        createSpotifyDeviceAuthController: vi.fn(() => {
          throw new Error('device auth helper unavailable');
        }),
        renderSpotifyDeviceAuthSetup: vi.fn(),
      },
    };

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      localStorage: windowStub.localStorage,
      fetch,
      io: vi.fn(() => socketStub),
      CONFIG: {
        DEVICE_CODE: 'KIOSK-1',
        DEVICE_PWD: 'secret',
        API_URL: 'http://127.0.0.1:3000',
        WS_URL: 'http://127.0.0.1:3000',
        QR_LINK_FORMAT: 'http://127.0.0.1:5173/?code={DEVICE_CODE}',
        RECONNECT_INTERVAL: 5000,
        UI_UPDATE_INTERVAL: 100,
        SOCKET_EMIT_INTERVAL: 5000,
      },
      QRCode: undefined,
      KioskPlayback: playbackHelpers,
      KioskSpotifyPlayer: windowStub.KioskSpotifyPlayer,
      KioskDeviceSpotifyAuth: windowStub.KioskDeviceSpotifyAuth,
      Image: imageStub,
      module: { exports: {} },
      exports: {},
      require,
    });

    vm.runInContext(appSource, context);
    const showDeviceSetupOverlay = vi.spyOn(context.KioskApp.prototype, 'showDeviceSetupOverlay');
    const showStartupOverlay = vi.spyOn(context.KioskApp.prototype, 'showStartupOverlay');

    new context.KioskApp();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(context.io).toHaveBeenCalledTimes(1);
    expect(showStartupOverlay).toHaveBeenCalled();
    expect(showDeviceSetupOverlay).not.toHaveBeenCalled();
  });
});
