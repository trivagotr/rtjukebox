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
    Settings,
    LogOut
} from 'lucide-react';

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

    // Song management
    const [showSongs, setShowSongs] = useState(false);
    const [songs, setSongs] = useState<any[]>([]);

    const fetchDevices = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/v1/jukebox/admin/devices`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDevices(res.data.data.devices);
        } catch (err) {
            console.error('Failed to fetch devices', err);
        }
    };

    useEffect(() => {
        if (showDevices) fetchDevices();
    }, [showDevices]);

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
        <div className="card border-primary/20 bg-primary/5 mb-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-xs">
                    <Shield size={14} /> Admin Paneli
                </div>
                {status && (
                    <div className="px-3 py-1 bg-primary/20 rounded-full text-[10px] font-bold text-primary animate-pulse">
                        {status}
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-5 gap-2 mb-4">
                <button
                    onClick={skipSong}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-2 glass hover:bg-white/10 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                >
                    <SkipForward size={18} className="mb-1 text-primary" />
                    <span className="text-[9px] font-bold opacity-80 uppercase">Atla</span>
                </button>

                <button
                    onClick={processSong}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-2 glass hover:bg-white/10 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                >
                    <Activity size={18} className="mb-1 text-blue-400" />
                    <span className="text-[9px] font-bold opacity-80 uppercase">Düzelt</span>
                </button>

                <button
                    onClick={syncMetadata}
                    disabled={loading}
                    className="flex flex-col items-center justify-center p-2 glass hover:bg-white/10 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw size={18} className={`mb-1 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
                    <span className="text-[9px] font-bold opacity-80 uppercase">Sync</span>
                </button>

                <button
                    onClick={() => setShowDevices(!showDevices)}
                    className="flex flex-col items-center justify-center p-2 glass hover:bg-white/10 rounded-xl transition-all active:scale-95"
                >
                    <Monitor size={18} className="mb-1 text-purple-400" />
                    <span className="text-[9px] font-bold opacity-80 uppercase">Cihazlar</span>
                </button>

                <button
                    onClick={() => setShowSongs(!showSongs)}
                    className="flex flex-col items-center justify-center p-2 glass hover:bg-white/10 rounded-xl transition-all active:scale-95"
                >
                    <Music size={18} className="mb-1 text-orange-400" />
                    <span className="text-[9px] font-bold opacity-80 uppercase">Şarkılar</span>
                </button>
            </div>

            {/* Device Management Section */}
            {showDevices && (
                <div className="border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-widest text-purple-400">
                            Kayıtlı Cihazlar ({devices.length})
                        </span>
                        <button
                            onClick={() => setShowNewDevice(!showNewDevice)}
                            className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 rounded-lg text-[10px] font-bold text-purple-400 hover:bg-purple-500/30"
                        >
                            <Plus size={12} /> Yeni
                        </button>
                    </div>

                    {/* New Device Form */}
                    {showNewDevice && (
                        <div className="glass rounded-xl p-3 mb-3 space-y-2">
                            <input
                                type="text"
                                placeholder="Cihaz Kodu (örn: CAFE-01)"
                                value={newDevice.device_code}
                                onChange={(e) => setNewDevice({ ...newDevice, device_code: e.target.value.toUpperCase() })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                            />
                            <input
                                type="text"
                                placeholder="Cihaz Adı (örn: Ana Salon)"
                                value={newDevice.name}
                                onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                            />
                            <input
                                type="text"
                                placeholder="Konum (opsiyonel)"
                                value={newDevice.location}
                                onChange={(e) => setNewDevice({ ...newDevice, location: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                            />
                            <input
                                type="password"
                                placeholder="Giriş Şifresi (opsiyonel)"
                                value={newDevice.password}
                                onChange={(e) => setNewDevice({ ...newDevice, password: e.target.value })}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                            />
                            <button
                                onClick={createDevice}
                                disabled={loading}
                                className="w-full py-2 bg-purple-500 hover:bg-purple-600 rounded-lg text-sm font-bold transition-colors"
                            >
                                Cihaz Oluştur
                            </button>
                        </div>
                    )}

                    {/* Device List */}
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {devices.map((d) => (
                            <div
                                key={d.id}
                                onClick={() => onSelectDevice?.(d)}
                                className={`glass rounded-xl p-3 cursor-pointer transition-all hover:bg-white/5 ${d.id === device?.id ? 'ring-2 ring-primary bg-primary/10' : ''}`}
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
                                {d.current_song_title && (
                                    <div className="mt-2 text-[10px] text-text-muted truncate">
                                        🎵 {d.current_song_title} - {d.current_song_artist}
                                    </div>
                                )}
                            </div>
                        ))}
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
                <div className="border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-widest text-orange-400">
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
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {songs.map((s) => (
                            <div key={s.id} className="glass rounded-xl p-3 flex items-center justify-between">
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
    );
}
