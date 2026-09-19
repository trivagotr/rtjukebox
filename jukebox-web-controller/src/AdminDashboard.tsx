import { useCallback, useEffect, useRef, useState } from 'react';
import axios, { isAxiosError } from 'axios';
import {
  Activity,
  AlertTriangle,
  Check,
  Edit2,
  FolderSearch,
  ListMusic,
  LogOut,
  Monitor,
  Music,
  Plus,
  RefreshCw,
  Repeat,
  Shield,
  ShieldAlert,
  SkipForward,
  Sliders,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  buildSpotifyAppConfigPayload,
  buildSpotifyDeviceAuthDisconnectRequest,
  buildSpotifyDeviceAuthStartRequest,
  formatSpotifyDeviceAuthStatus,
  isSpotifyDeviceAuthSuccessMessage,
  maskSpotifyAppConfigForForm,
  SPOTIFY_APP_SECRET_MASK,
  type SpotifyAppConfigApiResponse,
  type SpotifyAppConfigFormState,
  type SpotifyDeviceAuthStatusApiResponse,
  type SpotifyDeviceAuthStatusView,
} from './adminSpotifyConfig';
import { resolveWebRuntimeConfig } from './runtimeConfig';

const API_URL = resolveWebRuntimeConfig({
  windowOrigin: window.location.origin,
  windowProtocol: window.location.protocol,
  windowHostname: window.location.hostname,
  isDev: import.meta.env.DEV,
  // Assets are served under the build base (/controller); the API stays under
  // its own reverse-proxy sub-path (/jukebox). Keep them decoupled.
  baseUrl: import.meta.env.DEV ? '/' : (import.meta.env.VITE_PUBLIC_BASE_PATH || '/jukebox/'),
  apiOriginOverride: import.meta.env.VITE_API_ORIGIN,
}).apiRoot;

export interface DeviceSummary {
  id: string;
  device_code: string;
  name: string;
  location: string | null;
  is_active: boolean;
  queue_count?: number;
  current_song_title?: string | null;
  current_song_artist?: string | null;
  last_heartbeat?: string | null;
  password?: string | null;
  override_enabled?: boolean;
  override_autoplay_spotify_playlist_uri?: string | null;
}

export interface PlaylistPreview {
  id: string;
  uri: string;
  name: string;
  description: string;
  cover_url: string | null;
  owner_name: string;
  total_tracks: number;
}

interface AdminSong {
  id: string;
  title: string;
  artist: string;
  duration_seconds: number;
  total_plays?: number;
}

interface NewDeviceForm {
  device_code: string;
  name: string;
  location: string;
  password: string;
}

interface ScanFolderResponse {
  added: number;
  skipped: number;
  total: number;
  synced?: number;
  syncFailed?: number;
  failedSongs?: Array<{ title: string }>;
}

interface AdminDashboardProps {
  token: string;
  device: DeviceSummary;
  onSelectDevice?: (device: DeviceSummary) => void;
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

const errorMessage = (error: unknown, fallback = 'Hata oluştu') => {
  if (isAxiosError<{ error?: string; message?: string }>(error)) {
    return error.response?.data?.error || error.response?.data?.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

const isOnline = (lastHeartbeat?: string | null) => {
  if (!lastHeartbeat) return false;
  return Date.now() - new Date(lastHeartbeat).getTime() < 60000;
};

export function AdminDashboard({ token, device, onSelectDevice }: AdminDashboardProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [showDevices, setShowDevices] = useState(false);
  const [showNewDevice, setShowNewDevice] = useState(false);
  const [newDevice, setNewDevice] = useState<NewDeviceForm>({ device_code: '', name: '', location: '', password: '' });
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ name: '', location: '', password: '' });
  const [spotifyAppConfig, setSpotifyAppConfig] = useState<SpotifyAppConfigFormState>({ client_id: '', client_secret: '' });
  const [spotifyDeviceAuthStatuses, setSpotifyDeviceAuthStatuses] = useState<Record<string, SpotifyDeviceAuthStatusView>>({});
  const [showSongs, setShowSongs] = useState(false);
  const [songs, setSongs] = useState<AdminSong[]>([]);

  // Moderation & Content Filtering State
  const [showModeration, setShowModeration] = useState(false);
  const [moderationSettings, setModerationSettings] = useState({
    lyrics_filter_enabled: true,
    block_unverified_obscure_tracks: true,
    min_popularity_without_lyrics: 15,
  });
  const [blockedKeywords, setBlockedKeywords] = useState<Array<{ id: string; word: string; category: string; created_at: string }>>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [testForm, setTestForm] = useState({ title: '', artist: '', text: '' });
  const [testResult, setTestResult] = useState<{ foundLyrics?: boolean; isProfane: boolean; matchedWord?: string; testedTextSnippet?: string; message?: string } | null>(null);
  const [testingProfanity, setTestingProfanity] = useState(false);

  const fetchModerationSettings = useCallback(async () => {
    try {
      const res = await axios.get<{ data: typeof moderationSettings }>(`${API_URL}/api/v1/jukebox/admin/moderation/settings`, {
        headers: authHeaders(token),
      });
      if (res.data?.data) {
        setModerationSettings(res.data.data);
      }
    } catch (error) {
      console.warn('Failed to fetch moderation settings:', error);
    }
  }, [token]);

  const fetchBlockedKeywords = useCallback(async () => {
    try {
      const res = await axios.get<{ data: typeof blockedKeywords }>(`${API_URL}/api/v1/jukebox/admin/moderation/keywords`, {
        headers: authHeaders(token),
      });
      if (Array.isArray(res.data?.data)) {
        setBlockedKeywords(res.data.data);
      }
    } catch (error) {
      console.warn('Failed to fetch blocked keywords:', error);
    }
  }, [token]);

  const saveModerationSettings = async () => {
    try {
      setLoading(true);
      await axios.put(`${API_URL}/api/v1/jukebox/admin/moderation/settings`, moderationSettings, {
        headers: authHeaders(token),
      });
      setStatus('İçerik filtreleme ayarları kaydedildi');
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const addBlockedKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    try {
      setLoading(true);
      await axios.post(`${API_URL}/api/v1/jukebox/admin/moderation/keywords`, { word: newKeyword.trim() }, {
        headers: authHeaders(token),
      });
      setNewKeyword('');
      setStatus('Yasaklı kelime eklendi');
      void fetchBlockedKeywords();
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteBlockedKeyword = async (id: string) => {
    try {
      setLoading(true);
      await axios.delete(`${API_URL}/api/v1/jukebox/admin/moderation/keywords/${id}`, {
        headers: authHeaders(token),
      });
      setStatus('Yasaklı kelime silindi');
      void fetchBlockedKeywords();
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const runModerationTest = async () => {
    try {
      setTestingProfanity(true);
      setTestResult(null);
      const res = await axios.post<{ data: any }>(`${API_URL}/api/v1/jukebox/admin/moderation/test`, {
        title: testForm.title.trim(),
        artist: testForm.artist.trim(),
        text: testForm.text.trim(),
      }, {
        headers: authHeaders(token),
      });
      setTestResult(res.data?.data);
    } catch (error) {
      setStatus(`Test hatası: ${errorMessage(error)}`);
    } finally {
      setTestingProfanity(false);
    }
  };

  // Fallback Playlist (Yedek Çalma Listesi) State
  const [showFallbackPlaylist, setShowFallbackPlaylist] = useState(false);
  const [selectedPlaylistDeviceId, setSelectedPlaylistDeviceId] = useState<string>(device.id);
  const [fallbackPlaylistUrl, setFallbackPlaylistUrl] = useState<string>('');
  const [fallbackAutoplayEnabled, setFallbackAutoplayEnabled] = useState<boolean>(true);
  const [playlistPreview, setPlaylistPreview] = useState<PlaylistPreview | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState<boolean>(false);

  const fetchPlaylistPreview = useCallback(async (url: string) => {
    if (!url.trim()) {
      setPlaylistPreview(null);
      return;
    }
    try {
      setFetchingPreview(true);
      const res = await axios.get<{ data: PlaylistPreview }>(`${API_URL}/api/v1/jukebox/admin/playlist-preview`, {
        headers: authHeaders(token),
        params: { url: url.trim() },
      });
      setPlaylistPreview(res.data.data);
    } catch (error) {
      console.warn('Playlist preview fetch error:', error);
      setPlaylistPreview(null);
    } finally {
      setFetchingPreview(false);
    }
  }, [token]);

  const saveFallbackPlaylistConfig = async () => {
    try {
      setLoading(true);
      const targetDeviceId = selectedPlaylistDeviceId || device.id;
      await axios.put(
        `${API_URL}/api/v1/jukebox/admin/devices/${targetDeviceId}`,
        {
          override_autoplay_spotify_playlist_uri: fallbackPlaylistUrl,
          override_enabled: fallbackAutoplayEnabled,
        },
        { headers: authHeaders(token) }
      );
      setStatus('Yedek Çalma Listesi kaydedildi');
      void fetchDevices();
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const clearFallbackPlaylistConfig = async () => {
    if (!window.confirm('Yedek çalma listesini kaldırmak istediğinize emin misiniz?')) return;
    try {
      setLoading(true);
      const targetDeviceId = selectedPlaylistDeviceId || device.id;
      await axios.put(
        `${API_URL}/api/v1/jukebox/admin/devices/${targetDeviceId}`,
        {
          override_autoplay_spotify_playlist_uri: '',
          override_enabled: false,
        },
        { headers: authHeaders(token) }
      );
      setFallbackPlaylistUrl('');
      setPlaylistPreview(null);
      setFallbackAutoplayEnabled(false);
      setStatus('Yedek çalma listesi kaldırıldı');
      void fetchDevices();
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const lastLoadedDeviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!showFallbackPlaylist) {
      lastLoadedDeviceIdRef.current = null;
      return;
    }
    const target = devices.find((d) => d.id === selectedPlaylistDeviceId) || (device.id === selectedPlaylistDeviceId ? device : null);
    if (target && lastLoadedDeviceIdRef.current !== target.id) {
      lastLoadedDeviceIdRef.current = target.id;
      const uri = target.override_autoplay_spotify_playlist_uri || '';
      setFallbackPlaylistUrl(uri);
      setFallbackAutoplayEnabled(target.override_enabled ?? Boolean(uri));
      if (uri) {
        void fetchPlaylistPreview(uri);
      } else {
        setPlaylistPreview(null);
      }
    }
  }, [showFallbackPlaylist, selectedPlaylistDeviceId, devices, device, fetchPlaylistPreview]);

  useEffect(() => {
    if (showModeration) {
      void fetchModerationSettings();
      void fetchBlockedKeywords();
    }
  }, [showModeration, fetchModerationSettings, fetchBlockedKeywords]);

  const refreshSpotifyDeviceStatuses = useCallback(
    async (nextDevices: DeviceSummary[]) => {
      const entries = await Promise.all(
        nextDevices.map(async (nextDevice) => {
          try {
            const res = await axios.get<{ data: SpotifyDeviceAuthStatusApiResponse }>(`${API_URL}/api/v1/spotify/device-auth/status`, {
              headers: authHeaders(token),
              params: { device_id: nextDevice.id },
            });
            return [nextDevice.id, formatSpotifyDeviceAuthStatus(res.data.data)] as const;
          } catch {
            return [nextDevice.id, formatSpotifyDeviceAuthStatus(null)] as const;
          }
        }),
      );

      setSpotifyDeviceAuthStatuses(Object.fromEntries(entries));
    },
    [token],
  );

  const fetchDevices = useCallback(async () => {
    try {
      const res = await axios.get<{ data: { devices?: DeviceSummary[] } }>(`${API_URL}/api/v1/jukebox/admin/devices`, {
        headers: authHeaders(token),
      });
      const nextDevices = res.data.data.devices || [];
      setDevices(nextDevices);
      void refreshSpotifyDeviceStatuses(nextDevices);
    } catch (error) {
      console.error('Failed to fetch devices', error);
    }
  }, [refreshSpotifyDeviceStatuses, token]);

  const fetchSpotifyAppConfig = useCallback(async () => {
    try {
      const res = await axios.get<{ data: SpotifyAppConfigApiResponse }>(`${API_URL}/api/v1/spotify/app-config`, {
        headers: authHeaders(token),
      });
      setSpotifyAppConfig(maskSpotifyAppConfigForForm(res.data.data));
    } catch (error) {
      console.error('Failed to fetch Spotify app config', error);
    }
  }, [token]);

  const fetchSongs = useCallback(async () => {
    try {
      const res = await axios.get<{ data: { songs?: AdminSong[] } }>(`${API_URL}/api/v1/jukebox/admin/songs`, {
        headers: authHeaders(token),
      });
      setSongs(res.data.data.songs || []);
    } catch (error) {
      console.error('Failed to fetch songs', error);
    }
  }, [token]);

  useEffect(() => {
    if (!showDevices && !showFallbackPlaylist) return;
    void fetchDevices();
    if (showDevices) {
      void fetchSpotifyAppConfig();
    }
  }, [fetchDevices, fetchSpotifyAppConfig, showDevices, showFallbackPlaylist]);

  useEffect(() => {
    const handleSpotifyMessage = (event: MessageEvent) => {
      if (!isSpotifyDeviceAuthSuccessMessage(event.data)) return;
      setStatus('Spotify cihaz bağlantısı güncellendi');
      void fetchDevices();
    };

    window.addEventListener('message', handleSpotifyMessage);
    return () => window.removeEventListener('message', handleSpotifyMessage);
  }, [fetchDevices]);

  useEffect(() => {
    if (showSongs) void fetchSongs();
  }, [fetchSongs, showSongs]);

  const skipSong = async () => {
    if (!window.confirm('Şu an çalan şarkıyı geçmek istediğine emin misin?')) return;
    try {
      setLoading(true);
      await axios.post(`${API_URL}/api/v1/jukebox/admin/skip`, { device_id: device.id }, { headers: authHeaders(token) });
      setStatus('Şarkı geçildi');
    } catch {
      setStatus('Hata oluştu');
    } finally {
      setLoading(false);
      window.setTimeout(() => setStatus(''), 3000);
    }
  };

  const processSong = async () => {
    const songId = window.prompt("İşlenecek şarkı ID'si:");
    if (!songId) return;
    try {
      setLoading(true);
      setStatus('Ses işleniyor...');
      await axios.post(`${API_URL}/api/v1/jukebox/admin/process-song`, { song_id: songId }, { headers: authHeaders(token) });
      setStatus('İşlem başarılı');
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const syncMetadata = async () => {
    if (!window.confirm('Tüm kütüphane metadataları iTunes üzerinden senkronize edilsin mi?')) return;
    try {
      setLoading(true);
      setStatus('Senkronize ediliyor...');
      const res = await axios.post<{ data: { success: number; failed: number } }>(
        `${API_URL}/api/v1/jukebox/admin/sync-metadata`,
        {},
        { headers: authHeaders(token) },
      );
      setStatus(`Başarılı: ${res.data.data.success}, Hata: ${res.data.data.failed}`);
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const createDevice = async () => {
    if (!newDevice.device_code || !newDevice.name) {
      setStatus('Kod ve isim gerekli');
      return;
    }

    try {
      setLoading(true);
      await axios.post(`${API_URL}/api/v1/jukebox/admin/devices`, newDevice, { headers: authHeaders(token) });
      setStatus('Cihaz oluşturuldu');
      setNewDevice({ device_code: '', name: '', location: '', password: '' });
      setShowNewDevice(false);
      void fetchDevices();
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleDevice = async (deviceId: string, isActive: boolean) => {
    try {
      await axios.put(`${API_URL}/api/v1/jukebox/admin/devices/${deviceId}`, { is_active: !isActive }, { headers: authHeaders(token) });
      void fetchDevices();
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    }
  };

  const updateDevice = async (deviceId: string) => {
    try {
      setLoading(true);
      await axios.put(`${API_URL}/api/v1/jukebox/admin/devices/${deviceId}`, editValues, { headers: authHeaders(token) });
      setEditingDeviceId(null);
      setStatus('Cihaz güncellendi');
      void fetchDevices();
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const saveSpotifyAppConfig = async () => {
    try {
      setLoading(true);
      const payload = buildSpotifyAppConfigPayload(spotifyAppConfig);
      const res = await axios.put<{ data: SpotifyAppConfigApiResponse }>(`${API_URL}/api/v1/spotify/app-config`, payload, {
        headers: authHeaders(token),
      });
      setSpotifyAppConfig(maskSpotifyAppConfigForForm(res.data.data));
      setStatus('Spotify uygulama ayarları kaydedildi');
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const openSpotifyDeviceAuth = async (deviceId: string) => {
    const popup = window.open('', '_blank');
    try {
      setLoading(true);
      const request = buildSpotifyDeviceAuthStartRequest(API_URL, token, deviceId, window.location.origin);
      const res = await axios.get<{ data?: { authUrl?: string } }>(request.url, { headers: request.headers });
      const authUrl = res.data?.data?.authUrl;
      if (!authUrl) throw new Error('Spotify auth URL alınamadı');

      if (popup) {
        popup.location.href = authUrl;
        popup.focus();
      } else {
        window.open(authUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      if (popup) popup.close();
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const disconnectSpotifyDeviceAuth = async (event: React.MouseEvent, deviceId: string) => {
    event.stopPropagation();
    try {
      setLoading(true);
      const request = buildSpotifyDeviceAuthDisconnectRequest(API_URL, token, deviceId);
      await axios.delete(request.url, { headers: request.headers });
      setStatus('Spotify cihaz bağlantısı kaldırıldı');
      void refreshSpotifyDeviceStatuses(devices);
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const logoutAllFromDevice = async (event: React.MouseEvent, deviceId: string) => {
    event.stopPropagation();
    if (!window.confirm('Tüm aktif bağlantıları sonlandırmak istediğinize emin misiniz?')) return;
    try {
      setLoading(true);
      await axios.post(`${API_URL}/api/v1/jukebox/admin/devices/${deviceId}/logout-all`, {}, { headers: authHeaders(token) });
      setStatus('Cihaz oturumları kapatıldı');
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (event: React.MouseEvent, nextDevice: DeviceSummary) => {
    event.stopPropagation();
    setEditingDeviceId(nextDevice.id);
    setEditValues({ name: nextDevice.name, location: nextDevice.location || '', password: nextDevice.password || '' });
  };

  const scanFolder = async () => {
    try {
      setLoading(true);
      setStatus('Klasör taranıyor ve sync yapılıyor...');
      const res = await axios.post<{ data: ScanFolderResponse }>(`${API_URL}/api/v1/jukebox/admin/scan-folder`, {}, {
        headers: authHeaders(token),
      });
      const { added, skipped, total, synced = 0, syncFailed = 0, failedSongs = [] } = res.data.data;
      let message = `${added} yeni şarkı eklendi, ${skipped} atlandı (Toplam: ${total})`;
      if (synced > 0 || syncFailed > 0) message += ` | Sync: ${synced} Başarılı, ${syncFailed} Hata`;
      if (failedSongs.length > 0) message += ` | Bulunamayanlar: ${failedSongs.map((song) => song.title).join(', ')}`;
      setStatus(message);
      void fetchSongs();
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteSong = async (songId: string) => {
    if (!window.confirm('Bu şarkıyı silmek istediğine emin misin?')) return;
    try {
      await axios.delete(`${API_URL}/api/v1/jukebox/admin/songs/${songId}`, { headers: authHeaders(token) });
      setStatus('Şarkı silindi');
      void fetchSongs();
    } catch (error) {
      setStatus(`Hata: ${errorMessage(error)}`);
    }
  };

  const uploadSong = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    let uploaded = 0;
    let failed = 0;

    for (const file of Array.from(files)) {
      try {
        setStatus(`Yükleniyor: ${file.name}...`);
        const formData = new FormData();
        formData.append('song', file);
        await axios.post(`${API_URL}/api/v1/jukebox/admin/upload-song`, formData, {
          headers: { ...authHeaders(token), 'Content-Type': 'multipart/form-data' },
        });
        uploaded += 1;
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        failed += 1;
      }
    }

    setStatus(`${uploaded} şarkı yüklendi${failed > 0 ? `, ${failed} başarısız` : ''}`);
    setLoading(false);
    void fetchSongs();
    event.target.value = '';
  };

  return (
    <section className="admin-console">
      <header className="admin-head">
        <div>
          <p className="eyebrow amber">Admin deck</p>
          <h2>
            <Shield size={16} /> Jukebox kontrol
          </h2>
        </div>
        <div className="admin-head-meta">
          <span className="admin-brand">RadioTEDU</span>
          {status && <span className="admin-status">{status}</span>}
        </div>
      </header>

      <div className="admin-actions">
        <button onClick={skipSong} disabled={loading}>
          <SkipForward size={16} /> Atla
        </button>
        <button onClick={processSong} disabled={loading}>
          <Activity size={16} /> Düzelt
        </button>
        <button onClick={syncMetadata} disabled={loading}>
          <RefreshCw size={16} /> Sync
        </button>
        <button
          className={showFallbackPlaylist ? 'active' : ''}
          onClick={() => {
            setShowFallbackPlaylist((value) => !value);
            if (!showFallbackPlaylist) {
              setShowDevices(false);
              setShowSongs(false);
              setShowModeration(false);
            }
          }}
        >
          <ListMusic size={16} /> Yedek Liste
        </button>
        <button
          className={showModeration ? 'active' : ''}
          onClick={() => {
            setShowModeration((value) => !value);
            if (!showModeration) {
              setShowFallbackPlaylist(false);
              setShowDevices(false);
              setShowSongs(false);
            }
          }}
        >
          <ShieldAlert size={16} /> Filtre & Kara Liste
        </button>
        <button
          className={showDevices ? 'active' : ''}
          onClick={() => {
            setShowDevices((value) => !value);
            if (!showDevices) {
              setShowFallbackPlaylist(false);
              setShowSongs(false);
              setShowModeration(false);
            }
          }}
        >
          <Monitor size={16} /> Cihazlar
        </button>
        <button
          className={showSongs ? 'active' : ''}
          onClick={() => {
            setShowSongs((value) => !value);
            if (!showSongs) {
              setShowFallbackPlaylist(false);
              setShowDevices(false);
              setShowModeration(false);
            }
          }}
        >
          <Music size={16} /> Şarkılar
        </button>
      </div>

      {showFallbackPlaylist && (
        <div className="admin-section fallback-playlist-section">
          <div className="section-heading">
            <span>
              <Repeat size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Yedek Çalma Listesi (Fallback Autoplay)
            </span>
          </div>

          <p className="hint-strip">
            Kuyrukta şarkı bittiğinde sistem sessiz kalmaz; burada belirleyeceğiniz Spotify çalma listesini{' '}
            <strong>sırayla (loop olarak)</strong> çalar. Bir kullanıcı şarkı eklediğinde anında kullanıcının şarkısı öncelik kazanır ve araya girer.
          </p>

          <div className="admin-form">
            {devices.length > 1 && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', display: 'block', marginBottom: 4 }}>
                  Hedef Cihaz:
                </label>
                <select
                  className="arcade-input"
                  value={selectedPlaylistDeviceId}
                  onChange={(e) => setSelectedPlaylistDeviceId(e.target.value)}
                  style={{ background: 'var(--bg-card)', color: '#fff' }}
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.device_code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#fff', display: 'block', marginBottom: 4 }}>
                Spotify Playlist Bağlantısı veya URI:
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="arcade-input"
                  style={{ flex: 1 }}
                  placeholder="https://open.spotify.com/playlist/... veya spotify:playlist:..."
                  value={fallbackPlaylistUrl}
                  onChange={(e) => setFallbackPlaylistUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void fetchPlaylistPreview(fallbackPlaylistUrl);
                    }
                  }}
                />
                <button
                  type="button"
                  className="arcade-button"
                  onClick={() => void fetchPlaylistPreview(fallbackPlaylistUrl)}
                  disabled={fetchingPreview || !fallbackPlaylistUrl.trim()}
                >
                  {fetchingPreview ? 'Getiriliyor...' : 'Önizle'}
                </button>
              </div>
            </div>

            {playlistPreview && (
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: 12,
                  borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 178, 56, 0.25)',
                  alignItems: 'center',
                }}
              >
                {playlistPreview.cover_url ? (
                  <img
                    src={playlistPreview.cover_url}
                    alt={playlistPreview.name}
                    style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 8,
                      background: 'rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Music size={24} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{playlistPreview.name}</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 999,
                        background: 'rgba(227, 30, 38, 0.2)',
                        color: 'var(--accent-red)',
                        fontWeight: 800,
                      }}
                    >
                      <Repeat size={10} style={{ display: 'inline', marginRight: 3 }} /> Loop Aktif
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    Oluşturan: {playlistPreview.owner_name} · <strong>{playlistPreview.total_tracks} parça</strong>
                  </div>
                  {playlistPreview.description && (
                    <div
                      style={{
                        fontSize: 10,
                        color: 'rgba(255, 255, 255, 0.5)',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {playlistPreview.description}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
              <input
                type="checkbox"
                id="autoplayToggle"
                checked={fallbackAutoplayEnabled}
                onChange={(e) => setFallbackAutoplayEnabled(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent-red)', cursor: 'pointer' }}
              />
              <label htmlFor="autoplayToggle" style={{ fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                Kuyruk bittiğinde otomatik çalmayı etkinleştir (Loop Autoplay)
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                className="arcade-button primary"
                style={{ flex: 1 }}
                onClick={saveFallbackPlaylistConfig}
                disabled={loading || !fallbackPlaylistUrl.trim()}
              >
                <Check size={14} style={{ display: 'inline', marginRight: 4 }} /> Ayarları Kaydet
              </button>
              {fallbackPlaylistUrl && (
                <button
                  className="arcade-button danger ghost"
                  onClick={clearFallbackPlaylistConfig}
                  disabled={loading}
                >
                  <Trash2 size={14} style={{ display: 'inline', marginRight: 4 }} /> Kaldır
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showModeration && (
        <div className="admin-section moderation-section">
          <div className="section-heading">
            <span>
              <ShieldAlert size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              İçerik Filtreleme & Kara Liste Yönetimi
            </span>
          </div>

          <p className="hint-strip" style={{ marginBottom: 16 }}>
            Kullanıcıların eklediği şarkıları küfür/argo sözlükleri ve popülarite eşikleriyle otomatik denetleyin.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Moderation Settings */}
            <div className="device-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 16, borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={14} style={{ color: 'var(--accent-red)' }} /> Otomatik Güvenlik & Moderasyon Kuralları
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: 2 }}
                    checked={moderationSettings.lyrics_filter_enabled}
                    onChange={(e) => setModerationSettings({ ...moderationSettings, lyrics_filter_enabled: e.target.checked })}
                  />
                  <div>
                    <strong style={{ color: '#fff' }}>Şarkı Sözü Küfür & Argo Filtresi</strong>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      Spotify'da explicit etiketi olmasa dahi şarkının sözleri otomatik taranır ve küfür/uygunsuz kelimeler içeren şarkılar engellenir.
                    </div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    style={{ marginTop: 2 }}
                    checked={moderationSettings.block_unverified_obscure_tracks}
                    onChange={(e) => setModerationSettings({ ...moderationSettings, block_unverified_obscure_tracks: e.target.checked })}
                  />
                  <div>
                    <strong style={{ color: '#fff' }}>Sözsüz & Düşük Dinlenmeli Şarkı Koruması (~10k altı)</strong>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      İnternette sözü bulunamayan ve Spotify popülaritesi eşiğin altında olan bilinmeyen/şüpheli şarkıların eklenmesini engeller.
                    </div>
                  </div>
                </label>

                {moderationSettings.block_unverified_obscure_tracks && (
                  <div style={{ marginLeft: 26, padding: '10px 14px', background: 'rgba(0, 0, 0, 0.25)', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                      <span style={{ color: 'var(--muted)' }}>Minimum Popülarite / Dinlenme Eşiği:</span>
                      <strong style={{ color: '#f59e0b', fontSize: 13 }}>%{moderationSettings.min_popularity_without_lyrics} (Spotify Skoru)</strong>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={moderationSettings.min_popularity_without_lyrics}
                      onChange={(e) => setModerationSettings({ ...moderationSettings, min_popularity_without_lyrics: Number(e.target.value) })}
                      style={{ width: '100%', accentColor: '#f59e0b' }}
                    />
                    <div style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.4)', marginTop: 4 }}>
                      * Spotify skoru {moderationSettings.min_popularity_without_lyrics}'in altında olan ve sözü bulunamayan şarkılar reddedilir.
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 4 }}>
                  <button
                    className="arcade-button primary"
                    onClick={saveModerationSettings}
                    disabled={loading}
                    style={{ width: '100%' }}
                  >
                    <Check size={14} style={{ display: 'inline', marginRight: 4 }} /> Ayarları Kaydet
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Custom Blocked Keywords */}
            <div className="device-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 16, borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} style={{ color: '#ef4444' }} /> Özel Yasaklı Kelimeler & Kara Liste ({blockedKeywords.length})
              </h4>
              <p style={{ color: 'var(--muted)', fontSize: 11, margin: '0 0 12px' }}>
                Yerleşik küfür ve argo sözlüğüne ek olarak engellemek istediğiniz özel kelime veya ifadeleri ekleyin.
              </p>

              <form onSubmit={addBlockedKeyword} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  className="arcade-input"
                  placeholder="Yasaklanacak kelime veya ifade..."
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="arcade-button" disabled={loading || !newKeyword.trim()}>
                  <Plus size={13} style={{ display: 'inline', marginRight: 2 }} /> Ekle
                </button>
              </form>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                {blockedKeywords.map((kw) => (
                  <span
                    key={kw.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#fca5a5',
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                    }}
                  >
                    {kw.word}
                    <button
                      type="button"
                      onClick={() => void deleteBlockedKeyword(kw.id)}
                      style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', padding: 0, display: 'flex' }}
                      title="Sil"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {blockedKeywords.length === 0 && (
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>Özel kelime eklenmedi. (Yerleşik Türkçe/İngilizce filtre devrede)</span>
                )}
              </div>
            </div>

            {/* 3. Live Lyrics & Moderation Tester */}
            <div className="device-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 16, borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderSearch size={14} style={{ color: '#38bdf8' }} /> Canlı Şarkı Sözü & Küfür Filtresi Test Aracı
              </h4>
              <p style={{ color: 'var(--muted)', fontSize: 11, margin: '0 0 12px' }}>
                Bir şarkının internetteki sözlerini çekerek veya özel bir metin girerek filtre motorunun nasıl tepki verdiğini anında test edin.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="arcade-input"
                    placeholder="Şarkı Adı (örn: Mor Yazma)"
                    value={testForm.title}
                    onChange={(e) => setTestForm({ ...testForm, title: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="text"
                    className="arcade-input"
                    placeholder="Sanatçı Adı"
                    value={testForm.artist}
                    onChange={(e) => setTestForm({ ...testForm, artist: e.target.value })}
                    style={{ flex: 1 }}
                  />
                </div>
                <button
                  type="button"
                  className="arcade-button"
                  onClick={runModerationTest}
                  disabled={testingProfanity || (!testForm.title.trim() && !testForm.text.trim())}
                >
                  {testingProfanity ? 'Test Ediliyor...' : 'Şarkı Sözünü Çek ve Test Et'}
                </button>

                {testResult && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 12,
                      borderRadius: 8,
                      background: testResult.isProfane ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                      border: `1px solid ${testResult.isProfane ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {testResult.isProfane ? (
                        <span style={{ color: '#ef4444' }}>
                          🚫 REDDEDİLİR - Uygunsuz İçerik / Küfür Tespit Edildi! {testResult.matchedWord ? `(Kelime: "${testResult.matchedWord}")` : ''}
                        </span>
                      ) : (
                        <span style={{ color: '#22c55e' }}>
                          ✅ ONAYLANIR - Şarkı Sözleri Temiz!
                        </span>
                      )}
                    </div>
                    {testResult.message && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{testResult.message}</div>}
                    {testResult.testedTextSnippet && (
                      <pre
                        style={{
                          margin: '8px 0 0',
                          padding: 8,
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: 4,
                          fontSize: 10,
                          color: '#e5e7eb',
                          maxHeight: 90,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'monospace',
                        }}
                      >
                        {testResult.testedTextSnippet}...
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showDevices && (
        <div className="admin-section">
          <div className="section-heading">
            <span>Cihaz yönetimi</span>
            <button onClick={() => setShowNewDevice((value) => !value)}>
              <Plus size={13} /> Yeni
            </button>
          </div>

          {showNewDevice && (
            <div className="admin-form">
              <input
                className="arcade-input"
                placeholder="Cihaz Kodu (örn: CAFE-01)"
                value={newDevice.device_code}
                onChange={(event) => setNewDevice({ ...newDevice, device_code: event.target.value.toUpperCase() })}
              />
              <input
                className="arcade-input"
                placeholder="Cihaz Adı (örn: Ana Salon)"
                value={newDevice.name}
                onChange={(event) => setNewDevice({ ...newDevice, name: event.target.value })}
              />
              <input
                className="arcade-input"
                placeholder="Konum (opsiyonel)"
                value={newDevice.location}
                onChange={(event) => setNewDevice({ ...newDevice, location: event.target.value })}
              />
              <input
                className="arcade-input"
                type="password"
                placeholder="Giriş Şifresi (opsiyonel)"
                value={newDevice.password}
                onChange={(event) => setNewDevice({ ...newDevice, password: event.target.value })}
              />
              <button className="arcade-button primary" onClick={createDevice} disabled={loading}>
                Cihaz oluştur
              </button>
            </div>
          )}

          <div className="spotify-config">
            <div>
              <strong>Spotify App Credentials</strong>
              <span>Secret kaydedildikten sonra masked kalır. `{SPOTIFY_APP_SECRET_MASK}` = masked.</span>
            </div>
            <input
              className="arcade-input"
              placeholder="Spotify Client ID"
              value={spotifyAppConfig.client_id}
              onChange={(event) => setSpotifyAppConfig({ ...spotifyAppConfig, client_id: event.target.value })}
            />
            <input
              className="arcade-input"
              type="password"
              placeholder="Spotify Client Secret"
              value={spotifyAppConfig.client_secret}
              onFocus={() => {
                if (spotifyAppConfig.client_secret === SPOTIFY_APP_SECRET_MASK) {
                  setSpotifyAppConfig({ ...spotifyAppConfig, client_secret: '' });
                }
              }}
              onChange={(event) => setSpotifyAppConfig({ ...spotifyAppConfig, client_secret: event.target.value })}
            />
            <button className="arcade-button primary" onClick={saveSpotifyAppConfig} disabled={loading}>
              Spotify ayarlarını kaydet
            </button>
          </div>

          <div className="admin-list custom-scrollbar">
            {devices.map((nextDevice) => {
              const spotifyStatus = spotifyDeviceAuthStatuses[nextDevice.id];
              const activeDevice = nextDevice.id === device.id;
              const online = isOnline(nextDevice.last_heartbeat);

              return (
                <article className={activeDevice ? 'device-row active' : 'device-row'} key={nextDevice.id} onClick={() => onSelectDevice?.(nextDevice)}>
                  <div className="row-main">
                    <div className="device-title-line">
                      {online ? <Wifi size={14} /> : <WifiOff size={14} />}
                      {editingDeviceId === nextDevice.id ? (
                        <div className="inline-edit" onClick={(event) => event.stopPropagation()}>
                          <input className="arcade-input" value={editValues.name} onChange={(event) => setEditValues({ ...editValues, name: event.target.value })} autoFocus />
                          <input
                            className="arcade-input"
                            placeholder="Konum"
                            value={editValues.location}
                            onChange={(event) => setEditValues({ ...editValues, location: event.target.value })}
                          />
                          <input
                            className="arcade-input"
                            type="password"
                            placeholder="Yeni Şifre"
                            value={editValues.password}
                            onChange={(event) => setEditValues({ ...editValues, password: event.target.value })}
                          />
                          <div className="inline-actions">
                            <button onClick={() => void updateDevice(nextDevice.id)}>
                              <Check size={13} />
                            </button>
                            <button onClick={() => setEditingDeviceId(null)}>
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <strong>
                            {nextDevice.name}
                            <button className="tiny-icon" onClick={(event) => startEditing(event, nextDevice)} title="Düzenle">
                              <Edit2 size={11} />
                            </button>
                          </strong>
                          <span>
                            {nextDevice.device_code}
                            {nextDevice.location ? ` · ${nextDevice.location}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                    {nextDevice.current_song_title && (
                      <small>
                        ♪ {nextDevice.current_song_title} - {nextDevice.current_song_artist}
                      </small>
                    )}
                  </div>

                  <div className="device-actions">
                    <span>Kuyruk: {nextDevice.queue_count ?? 0}</span>
                    <div>
                      <button className="danger ghost" onClick={(event) => void logoutAllFromDevice(event, nextDevice.id)} title="Tüm girişleri kapat">
                        <LogOut size={13} />
                      </button>
                      <button className={nextDevice.is_active ? 'state-pill online' : 'state-pill offline'} onClick={() => void toggleDevice(nextDevice.id, nextDevice.is_active)}>
                        {nextDevice.is_active ? 'Aktif' : 'Pasif'}
                      </button>
                    </div>
                    <div className="spotify-row">
                      <span className={spotifyStatus?.tone === 'success' ? 'spotify-pill ok' : 'spotify-pill'}>
                        Spotify: {spotifyStatus?.label || 'Kontrol ediliyor'}
                      </span>
                      <button onClick={(event) => { event.stopPropagation(); void openSpotifyDeviceAuth(nextDevice.id); }}>
                        {spotifyStatus?.actionLabel || 'Bağla'}
                      </button>
                      {spotifyStatus?.isConnected && (
                        <button className="danger ghost" onClick={(event) => void disconnectSpotifyDeviceAuth(event, nextDevice.id)}>
                          Ayır
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            {devices.length === 0 && <div className="empty-panel slim">Henüz cihaz yok</div>}
          </div>
        </div>
      )}

      {showSongs && (
        <div className="admin-section">
          <div className="section-heading">
            <span>Şarkı kütüphanesi ({songs.length})</span>
            <div className="button-row">
              <label className="file-button">
                <Plus size={13} /> Yükle
                <input type="file" accept=".mp3,.m4a,.wav,audio/*" multiple onChange={uploadSong} />
              </label>
              <button onClick={scanFolder} disabled={loading}>
                <FolderSearch size={13} /> Tara
              </button>
            </div>
          </div>

          <p className="hint-strip">
            Dosya adı formatı: <code>Sanatçı - Şarkı Adı.mp3</code>
          </p>

          <div className="admin-list custom-scrollbar">
            {songs.map((song) => (
              <article className="song-row" key={song.id}>
                <Music size={16} />
                <div className="row-main">
                  <strong>{song.title}</strong>
                  <span>{song.artist}</span>
                  <small>ID: {song.id}</small>
                </div>
                <div className="song-meta">
                  <span>
                    {Math.floor(song.duration_seconds / 60)}:{(song.duration_seconds % 60).toString().padStart(2, '0')}
                  </span>
                  <span>{song.total_plays || 0} çalma</span>
                  <button className="danger ghost" onClick={() => void deleteSong(song.id)} title="Sil">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
            {songs.length === 0 && <div className="empty-panel slim">Henüz şarkı yok. Klasör tarayarak ekleyin.</div>}
          </div>
        </div>
      )}
    </section>
  );
}
