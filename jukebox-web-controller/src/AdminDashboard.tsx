import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Shield,
    SkipForward,
    Activity,
    RefreshCw,
    Monitor,
    Plus,
    MapPin,
    Wifi,
    WifiOff,
    Music,
    Trash2,
    FolderSearch,
    Edit2,
    Check,
    X,
    LogOut
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
    type SpotifyDeviceAuthStatusView
} from './adminSpotifyConfig';

const API_URL = import.meta.env.VITE_API_URL ||
    `${window.location.protocol}//${window.location.hostname}:3000`;

interface Device {
    id: string;
    device_code: string;
    name: string;
    location: string | null;
    is_active: boolean;
    queue_count: number;
    current_song_title: string | null;
    current_song_artist: string | null;
    last_heartbeat: string | null;
    password: string | null;
}

interface AdminDashboardProps {
    token: string;
    device: any;
    onSelectDevice?: (device: any) => void;
}

export function AdminDashboard({ token, device, onSelectDevice }: AdminDashboardProps) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [devices, setDevices] = useState<Device[]>([]);
    const [showDevices, setShowDevices] = useState(false);
    const [showNewDevice, setShowNewDevice] = useState(false);
    const [newDevice, setNewDevice] = useState({ device_code: '', name: '', location: '', password: '' });
    const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState({ name: '', location: '', password: '' });
    const [spotifyAppConfig, setSpotifyAppConfig] = useState<SpotifyAppConfigFormState>({
        client_id: '',
        client_secret: '',
    });
    const [spotifyDeviceAuthStatuses, setSpotifyDeviceAuthStatuses] = useState<Record<string, SpotifyDeviceAuthStatusView>>({});

    // Song management
    const [showSongs, setShowSongs] = useState(false);
    const [songs, setSongs] = useState<any[]>([]);

    const fetchDevices = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/v1/jukebox/admin/devices`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const nextDevices = res.data.data.devices || [];
            setDevices(nextDevices);
            refreshSpotifyDeviceStatuses(nextDevices);
        } catch (err) {
            console.error('Failed to fetch devices', err);
        }
    };

    const fetchSpotifyAppConfig = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/v1/spotify/app-config`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSpotifyAppConfig(maskSpotifyAppConfigForForm(res.data.data as SpotifyAppConfigApiResponse));
        } catch (err) {
            console.error('Failed to fetch Spotify app config', err);
        }
    };

    const refreshSpotifyDeviceStatuses = async (nextDevices: Device[]) => {
        const entries = await Promise.all(
            nextDevices.map(async (nextDevice) => {
                try {
                    const res = await axios.get(`${API_URL}/api/v1/spotify/device-auth/status`, {
                        headers: { Authorization: `Bearer ${token}` },
                        params: { device_id: nextDevice.id }
                    });
                    return [nextDevice.id, formatSpotifyDeviceAuthStatus(res.data.data as SpotifyDeviceAuthStatusApiResponse)] as const;
                } catch (err) {
                    return [nextDevice.id, formatSpotifyDeviceAuthStatus(null)] as const;
                }
            })
        );

        setSpotifyDeviceAuthStatuses(Object.fromEntries(entries));
    };

    useEffect(() => {
        if (showDevices) {
            fetchDevices();
            fetchSpotifyAppConfig();
        }
    }, [showDevices]);

    useEffect(() => {
        const handleSpotifyMessage = (event: MessageEvent) => {
            if (!isSpotifyDeviceAuthSuccessMessage(event.data)) return;

            setStatus('Spotify cihaz bağlantısı güncellendi');
            fetchDevices();
        };

        window.addEventListener('message', handleSpotifyMessage);
        return () => window.removeEventListener('message', handleSpotifyMessage);
    }, []);

    const skipSong = async () => {
        if (!confirm('Şu an çalan şarkıyı geçmek istediğine emin misin?')) return;
        try {
            setLoading(true);
            await axios.post(`${API_URL}/api/v1/jukebox/admin/skip`,
                { device_id: device.id },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setStatus('Şarkı geçildi');
        } catch (err) {
            setStatus('Hata oluştu');
        } finally {
            setLoading(false);
            setTimeout(() => setStatus(''), 3000);
        }
    };

    const processSong = async () => {
        const songId = prompt("İşlenecek şarkı ID'si:");
        if (!songId) return;
        try {
            setLoading(true);
            setStatus('Ses işleniyor...');
            await axios.post(`${API_URL}/api/v1/jukebox/admin/process-song`,
                { song_id: songId },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setStatus('İşlem başarılı');
        } catch (err: any) {
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const syncMetadata = async () => {
        if (!confirm('Tüm kütüphane metadataları iTunes üzerinden senkronize edilsin mi?')) return;
        try {
            setLoading(true);
            setStatus('Senkronize ediliyor...');
            const res = await axios.post(`${API_URL}/api/v1/jukebox/admin/sync-metadata`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setStatus(`Başarılı: ${res.data.data.success}, Hata: ${res.data.data.failed}`);
        } catch (err: any) {
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
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
            await axios.post(`${API_URL}/api/v1/jukebox/admin/devices`, newDevice, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStatus('Cihaz oluşturuldu');
            setNewDevice({ device_code: '', name: '', location: '', password: '' });
            setShowNewDevice(false);
            fetchDevices();
        } catch (err: any) {
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const toggleDevice = async (deviceId: string, isActive: boolean) => {
        try {
            await axios.put(`${API_URL}/api/v1/jukebox/admin/devices/${deviceId}`,
                { is_active: !isActive },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            fetchDevices();
        } catch (err: any) {
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
        }
    };

    const updateDevice = async (deviceId: string) => {
        try {
            setLoading(true);
            await axios.put(`${API_URL}/api/v1/jukebox/admin/devices/${deviceId}`,
                editValues,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setEditingDeviceId(null);
            fetchDevices();
            setStatus('Cihaz güncellendi');
        } catch (err: any) {
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const saveSpotifyAppConfig = async () => {
        try {
            setLoading(true);
            const payload = buildSpotifyAppConfigPayload(spotifyAppConfig);
            const res = await axios.put(`${API_URL}/api/v1/spotify/app-config`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setSpotifyAppConfig(maskSpotifyAppConfigForForm(res.data.data as SpotifyAppConfigApiResponse));
            setStatus('Spotify uygulama ayarları kaydedildi');
        } catch (err: any) {
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const openSpotifyDeviceAuth = async (deviceId: string) => {
        const popup = window.open('', '_blank');
        try {
            setLoading(true);
            const request = buildSpotifyDeviceAuthStartRequest(API_URL, token, deviceId);
            const res = await axios.get(request.url, {
                headers: request.headers,
            });
            const authUrl = res.data?.data?.authUrl;

            if (!authUrl) {
                throw new Error('Spotify auth URL alınamadı');
            }

            if (popup) {
                popup.location.href = authUrl;
                popup.focus();
            } else {
                window.open(authUrl, '_blank', 'noopener,noreferrer');
            }
        } catch (err: any) {
            if (popup) popup.close();
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const disconnectSpotifyDeviceAuth = async (e: React.MouseEvent, deviceId: string) => {
        e.stopPropagation();
        try {
            setLoading(true);
            const request = buildSpotifyDeviceAuthDisconnectRequest(API_URL, token, deviceId);
            await axios.delete(request.url, {
                headers: request.headers
            });
            setStatus('Spotify cihaz bağlantısı kaldırıldı');
            refreshSpotifyDeviceStatuses(devices);
        } catch (err: any) {
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const logoutAllFromDevice = async (e: React.MouseEvent, deviceId: string) => {
        e.stopPropagation();
        if (!confirm('Tüm aktif bağlantıları sonlandırmak istediğinize emin misiniz?')) return;
        try {
            setLoading(true);
            const url = `${API_URL}/api/v1/jukebox/admin/devices/${deviceId}/logout-all`;
            console.log('🚪 [DEBUG] Method: POST, URL:', url);
            const response = await axios.post(url, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log('✅ [DEBUG] Success:', response.data);
            setStatus('Cihaz oturumları kapatıldı');
        } catch (err: any) {
            console.error('❌ [DEBUG] Error details:', err.response || err);
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const startEditing = (e: React.MouseEvent, d: Device) => {
        e.stopPropagation();
        setEditingDeviceId(d.id);
        setEditValues({ name: d.name, location: d.location || '', password: d.password || '' });
    };

    const isOnline = (lastHeartbeat: string | null) => {
        if (!lastHeartbeat) return false;
        const diff = Date.now() - new Date(lastHeartbeat).getTime();
        return diff < 60000; // Online if heartbeat within last minute
    };

    const fetchSongs = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/v1/jukebox/admin/songs`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSongs(res.data.data.songs);
        } catch (err) {
            console.error('Failed to fetch songs', err);
        }
    };

    useEffect(() => {
        if (showSongs) fetchSongs();
    }, [showSongs]);

    const scanFolder = async () => {
        try {
            setLoading(true);
            setStatus('Klasör taranıyor ve sync yapılıyor...');
            const res = await axios.post(`${API_URL}/api/v1/jukebox/admin/scan-folder`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const { added, skipped, total, synced, syncFailed, failedSongs } = res.data.data;

            let msg = `${added} yeni şarkı eklendi, ${skipped} atlandı (Toplam: ${total})`;
            if (synced > 0 || syncFailed > 0) {
                msg += ` | Sync: ${synced} Başarılı, ${syncFailed} Hata`;
            }

            if (failedSongs && failedSongs.length > 0) {
                const names = failedSongs.map((s: any) => s.title).join(', ');
                msg += ` | Bulunamayanlar: ${names}`;
            }

            setStatus(msg);
            fetchSongs();
        } catch (err: any) {
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const deleteSong = async (songId: string) => {
        if (!confirm('Bu şarkıyı silmek istediğine emin misin?')) return;
        try {
            await axios.delete(`${API_URL}/api/v1/jukebox/admin/songs/${songId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStatus('Şarkı silindi');
            fetchSongs();
        } catch (err: any) {
            setStatus('Hata: ' + (err.response?.data?.error || err.message));
        }
    };

    const uploadSong = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
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
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                });
                uploaded++;
            } catch (err: any) {
                console.error(`Failed to upload ${file.name}:`, err);
                failed++;
            }
        }

        setStatus(`${uploaded} şarkı yüklendi${failed > 0 ? `, ${failed} başarısız` : ''}`);
        setLoading(false);
        fetchSongs();
        e.target.value = ''; // Reset input
    };

    return (
        <div
            className="mb-6 overflow-hidden rounded-2xl"
            style={{
                border: '1px solid rgba(243,106,7,0.25)',
                background: 'rgba(19,19,24,0.9)',
                backdropFilter: 'blur(20px)'
            }}
        >
            <div
                style={{
                    height: '2px',
                    background: 'linear-gradient(90deg, var(--orange), #E31E26 50%, transparent)',
                    opacity: 0.8
                }}
            ></div>
            <div className="p-5">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: 'var(--orange-dim)', border: '1px solid rgba(243,106,7,0.25)' }}
                        >
                            <Shield size={13} style={{ color: 'var(--orange)' }} />
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--orange)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                            Admin Paneli
                        </span>
                    </div>
                    {status && (
                        <div
                            className="px-3 py-1 rounded-full text-[10px] font-bold animate-pulse"
                            style={{ background: 'rgba(243,106,7,0.15)', color: 'var(--orange)', border: '1px solid rgba(243,106,7,0.25)' }}
                        >
                            {status}
                        </div>
                    )}
                </div>

            {/* Quick Actions */}
            <div className="mb-5 grid grid-cols-5 gap-1.5">
                <button
                    onClick={skipSong}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
                >
                    <SkipForward size={16} className="mb-1" style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Atla</span>
                </button>

                <button
                    onClick={processSong}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
                >
                    <Activity size={16} className="mb-1" style={{ color: '#3B5BFF' }} />
                    <span style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Düzelt</span>
                </button>

                <button
                    onClick={syncMetadata}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
                >
                    <RefreshCw size={16} className={`mb-1 ${loading ? 'animate-spin' : ''}`} style={{ color: '#10B981' }} />
                    <span style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Sync</span>
                </button>

                <button
                    onClick={() => setShowDevices(!showDevices)}
                    className="flex flex-col items-center justify-center p-2 rounded-xl transition-all active:scale-95"
                    style={{
                        background: showDevices ? 'rgba(227,30,38,0.12)' : 'rgba(255,255,255,0.04)',
                        border: showDevices ? '1px solid rgba(227,30,38,0.30)' : '1px solid var(--border)'
                    }}
                >
                    <Monitor size={16} className="mb-1" style={{ color: showDevices ? 'var(--primary)' : '#A78BFA' }} />
                    <span style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Cihazlar</span>
                </button>

                <button
                    onClick={() => setShowSongs(!showSongs)}
                    className="flex flex-col items-center justify-center p-2 rounded-xl transition-all active:scale-95"
                    style={{
                        background: showSongs ? 'rgba(243,106,7,0.12)' : 'rgba(255,255,255,0.04)',
                        border: showSongs ? '1px solid rgba(243,106,7,0.30)' : '1px solid var(--border)'
                    }}
                >
                    <Music size={16} className="mb-1" style={{ color: 'var(--orange)' }} />
                    <span style={{ fontSize: '8px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Şarkılar</span>
                </button>
            </div>

            {/* Device Management Section */}
            {showDevices && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <div className="flex items-center justify-between mb-3">
                        <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#A78BFA' }}>
                            Kayıtlı Cihazlar ({devices.length})
                        </span>
                        <button
                            onClick={() => setShowNewDevice(!showNewDevice)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors"
                            style={{ background: 'rgba(167,139,250,0.12)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.20)' }}
                        >
                            <Plus size={12} /> Yeni
                        </button>
                    </div>

                    {/* New Device Form */}
                    {showNewDevice && (
                        <div
                            className="mb-3 space-y-2 rounded-2xl p-4"
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid var(--border)'
                            }}
                        >
                            <input
                                type="text"
                                placeholder="Cihaz Kodu (örn: CAFE-01)"
                                value={newDevice.device_code}
                                onChange={(e) => setNewDevice({ ...newDevice, device_code: e.target.value.toUpperCase() })}
                                className="input-field !rounded-xl !px-3 !py-2.5 !text-sm"
                            />
                            <input
                                type="text"
                                placeholder="Cihaz Adı (örn: Ana Salon)"
                                value={newDevice.name}
                                onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                                className="input-field !rounded-xl !px-3 !py-2.5 !text-sm"
                            />
                            <input
                                type="text"
                                placeholder="Konum (opsiyonel)"
                                value={newDevice.location}
                                onChange={(e) => setNewDevice({ ...newDevice, location: e.target.value })}
                                className="input-field !rounded-xl !px-3 !py-2.5 !text-sm"
                            />
                            <input
                                type="password"
                                placeholder="Giriş Şifresi (opsiyonel)"
                                value={newDevice.password}
                                onChange={(e) => setNewDevice({ ...newDevice, password: e.target.value })}
                                className="input-field !rounded-xl !px-3 !py-2.5 !text-sm"
                            />
                            <button
                                onClick={createDevice}
                                disabled={loading}
                                className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition-all disabled:opacity-50"
                                style={{
                                    background: 'linear-gradient(135deg, #E31E26, #F36A07)',
                                    boxShadow: '0 12px 24px rgba(227,30,38,0.18)'
                                }}
                            >
                                Cihaz Oluştur
                            </button>
                        </div>
                    )}

                    <div
                        className="mb-3 rounded-2xl p-4"
                        style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(243,106,7,0.18)'
                        }}
                    >
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest text-cyan-400">
                                    Spotify App Credentials
                                </div>
                                <div className="text-[10px] text-text-muted mt-1">
                                    Global client bilgileri backend tarafında saklanır. Secret kaydedildikten sonra masked kalır.
                                </div>
                            </div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                                {SPOTIFY_APP_SECRET_MASK} = masked
                            </div>
                        </div>
                        <div className="space-y-2">
                            <input
                                type="text"
                                placeholder="Spotify Client ID"
                                value={spotifyAppConfig.client_id}
                                onChange={(e) => setSpotifyAppConfig({ ...spotifyAppConfig, client_id: e.target.value })}
                                className="input-field !rounded-xl !px-3 !py-2.5 !text-sm"
                            />
                            <input
                                type="password"
                                placeholder="Spotify Client Secret"
                                value={spotifyAppConfig.client_secret}
                                onFocus={() => {
                                    if (spotifyAppConfig.client_secret === SPOTIFY_APP_SECRET_MASK) {
                                        setSpotifyAppConfig({ ...spotifyAppConfig, client_secret: '' });
                                    }
                                }}
                                onChange={(e) => setSpotifyAppConfig({ ...spotifyAppConfig, client_secret: e.target.value })}
                                className="input-field !rounded-xl !px-3 !py-2.5 !text-sm"
                            />
                            <button
                                onClick={saveSpotifyAppConfig}
                                disabled={loading}
                                className="w-full rounded-xl py-2.5 text-sm font-bold text-white transition-all disabled:opacity-50"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(227,30,38,0.95), rgba(243,106,7,0.95))',
                                    boxShadow: '0 12px 24px rgba(227,30,38,0.18)'
                                }}
                            >
                                Spotify Ayarlarını Kaydet
                            </button>
                        </div>
                    </div>

                    {/* Device List */}
                    <div className="custom-scrollbar max-h-60 space-y-2 overflow-y-auto">
                        {devices.map((d) => {
                            const spotifyStatus = spotifyDeviceAuthStatuses[d.id];

                            return (
                            <div
                                key={d.id}
                                onClick={() => onSelectDevice?.(d)}
                                className="rounded-xl p-3 cursor-pointer transition-all mb-2"
                                style={{
                                    background: d.id === device?.id ? 'rgba(227,30,38,0.08)' : 'rgba(255,255,255,0.025)',
                                    border: d.id === device?.id ? '1px solid rgba(227,30,38,0.30)' : '1px solid var(--border)'
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {isOnline(d.last_heartbeat) ? (
                                            <Wifi size={14} className="text-green-400" />
                                        ) : (
                                            <WifiOff size={14} className="text-red-400" />
                                        )}
                                        <div>
                                            {editingDeviceId === d.id ? (
                                                <div className="space-y-1 mt-1" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs w-full text-white"
                                                        value={editValues.name}
                                                        onChange={e => setEditValues({ ...editValues, name: e.target.value })}
                                                        autoFocus
                                                    />
                                                    <input
                                                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs w-full text-white"
                                                        placeholder="Konum"
                                                        value={editValues.location}
                                                        onChange={e => setEditValues({ ...editValues, location: e.target.value })}
                                                    />
                                                    <input
                                                        type="password"
                                                        className="bg-black/40 border border-white/10 rounded px-2 py-1 text-xs w-full text-white"
                                                        placeholder="Yeni Şifre"
                                                        value={editValues.password}
                                                        onChange={e => setEditValues({ ...editValues, password: e.target.value })}
                                                    />
                                                    <div className="flex gap-1 pt-1">
                                                        <button
                                                            onClick={() => updateDevice(d.id)}
                                                            className="bg-emerald-500/20 text-emerald-400 p-1 rounded hover:bg-emerald-500/30"
                                                        >
                                                            <Check size={12} />
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingDeviceId(null)}
                                                            className="bg-white/10 text-white p-1 rounded hover:bg-white/20"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="font-bold text-sm flex items-center gap-1">
                                                        {d.name}
                                                        <button
                                                            onClick={(e) => startEditing(e, d)}
                                                            className="p-1 hover:bg-white/10 rounded transition-all text-text-muted"
                                                            title="Düzenle"
                                                        >
                                                            <Edit2 size={10} />
                                                        </button>
                                                    </div>
                                                    <div className="text-[10px] text-text-muted flex items-center gap-1">
                                                        <span className="bg-white/10 px-1.5 py-0.5 rounded">{d.device_code}</span>
                                                        {d.location && (
                                                            <span className="flex items-center gap-0.5">
                                                                <MapPin size={10} /> {d.location}
                                                            </span>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-text-muted">
                                            Kuyruk: {d.queue_count}
                                        </div>
                                        <div className="flex items-center justify-end gap-2 mt-1">
                                            <button
                                                onClick={(e) => logoutAllFromDevice(e, d.id)}
                                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20"
                                                title="Tüm Girişleri Kapat"
                                            >
                                                <LogOut size={12} />
                                            </button>
                                            <button
                                                onClick={() => toggleDevice(d.id, d.is_active)}
                                                className={`text-[9px] px-2 py-1 rounded-full font-bold ${d.is_active
                                                    ? 'bg-green-500/20 text-green-400'
                                                    : 'bg-red-500/20 text-red-400'
                                                    }`}
                                            >
                                                {d.is_active ? 'AKTİF' : 'PASİF'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className={`text-[9px] px-2 py-1 rounded-full font-bold border ${spotifyStatus?.tone === 'success'
                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
                                        : 'bg-white/10 text-text-muted border-white/10'
                                        }`}>
                                        Spotify: {spotifyStatus?.label || 'Kontrol ediliyor'}
                                    </span>
                                    <span className="text-[9px] text-text-muted">
                                        {spotifyStatus?.detail || 'Spotify bağlantısı sorgulanıyor'}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void openSpotifyDeviceAuth(d.id);
                                        }}
                                        className="text-[9px] px-2 py-1 rounded-full font-bold bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                                    >
                                        {spotifyStatus?.actionLabel || 'Bağla'}
                                    </button>
                                    {spotifyStatus?.isConnected && (
                                        <button
                                            onClick={(e) => disconnectSpotifyDeviceAuth(e, d.id)}
                                            className="text-[9px] px-2 py-1 rounded-full font-bold bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors"
                                        >
                                            Ayır
                                        </button>
                                    )}
                                </div>
                                {d.current_song_title && (
                                    <div className="mt-2 text-[10px] text-text-muted truncate">
                                        🎵 {d.current_song_title} - {d.current_song_artist}
                                    </div>
                                )}
                            </div>
                            );
                        })}
                        {devices.length === 0 && (
                            <div className="text-center text-text-muted text-sm py-4">
                                Henüz cihaz yok
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Songs Management Section */}
            {showSongs && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <div className="flex items-center justify-between mb-3">
                        <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--orange)' }}>
                            Şarkı Kütüphanesi ({songs.length})
                        </span>
                        <div className="flex gap-2">
                            <label className="flex items-center gap-1 px-2 py-1 bg-green-500/20 rounded-lg text-[10px] font-bold text-green-400 hover:bg-green-500/30 cursor-pointer">
                                <Plus size={12} /> Yükle
                                <input
                                    type="file"
                                    accept=".mp3,.m4a,.wav,audio/*"
                                    multiple
                                    onChange={uploadSong}
                                    className="hidden"
                                />
                            </label>
                            <button
                                onClick={scanFolder}
                                disabled={loading}
                                className="flex items-center gap-1 px-2 py-1 bg-orange-500/20 rounded-lg text-[10px] font-bold text-orange-400 hover:bg-orange-500/30 disabled:opacity-50"
                            >
                                <FolderSearch size={12} /> Tara
                            </button>
                        </div>
                    </div>

                    <div className="text-[10px] text-text-muted mb-3 bg-black/20 rounded-lg p-2">
                        📤 <strong>Yükle:</strong> Doğrudan MP3/M4A/WAV dosyaları yükleyin. Dosya adı formatı: <code className="text-orange-400">Sanatçı - Şarkı Adı.mp3</code>
                    </div>

                    {/* Song List */}
                    <div className="custom-scrollbar max-h-60 space-y-2 overflow-y-auto">
                        {songs.map((s) => (
                            <div
                                key={s.id}
                                className="rounded-xl p-3 flex items-center justify-between"
                                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <Music size={16} className="text-orange-400 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <div className="font-bold text-sm truncate">{s.title}</div>
                                        <div className="text-[10px] text-text-muted truncate">{s.artist}</div>
                                        <div className="text-[8px] text-text-muted/50 font-mono truncate select-all cursor-pointer" title="Tıkla ve kopyala">
                                            ID: {s.id}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className="text-[9px] text-text-muted">
                                        {Math.floor(s.duration_seconds / 60)}:{(s.duration_seconds % 60).toString().padStart(2, '0')}
                                    </span>
                                    <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded">
                                        {s.total_plays || 0} çalma
                                    </span>
                                    <button
                                        onClick={() => deleteSong(s.id)}
                                        className="p-1 hover:bg-red-500/20 rounded text-red-400"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {songs.length === 0 && (
                            <div className="text-center text-text-muted text-sm py-4">
                                Henüz şarkı yok. Klasör tarayarak ekleyin.
                            </div>
                        )}
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
