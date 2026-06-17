import { useCallback, useEffect, useState } from 'react';
import axios, { isAxiosError } from 'axios';
import {
  Activity,
  Check,
  Edit2,
  FolderSearch,
  LogOut,
  Monitor,
  Music,
  Plus,
  RefreshCw,
  Shield,
  SkipForward,
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
  baseUrl: import.meta.env.BASE_URL,
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
    if (!showDevices) return;
    void fetchDevices();
    void fetchSpotifyAppConfig();
  }, [fetchDevices, fetchSpotifyAppConfig, showDevices]);

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
        <button className={showDevices ? 'active' : ''} onClick={() => setShowDevices((value) => !value)}>
          <Monitor size={16} /> Cihazlar
        </button>
        <button className={showSongs ? 'active' : ''} onClick={() => setShowSongs((value) => !value)}>
          <Music size={16} /> Şarkılar
        </button>
      </div>

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
