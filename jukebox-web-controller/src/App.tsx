import { useCallback, useEffect, useRef, useState } from 'react';
import axios, { isAxiosError } from 'axios';
import { io, Socket } from 'socket.io-client';
import {
  AlertCircle,
  ArrowBigDown,
  ArrowBigUp,
  CheckCircle2,
  ChevronRight,
  Disc3,
  ListMusic,
  LogOut,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trophy,
  User,
} from 'lucide-react';
import { AdminDashboard, type DeviceSummary } from './AdminDashboard';
import { buildQueueRequestPayload, getSearchResultKey, type CatalogSearchSong } from './jukeboxCatalog';
import { buildGuestQueueHeaders } from './guestFingerprint';
import { parseDeviceCodeFromSearch } from './deviceQuery';
import {
  getDisplayedSongScore,
  hasSupervoteAvailableToday,
  isSupervoteActive,
  resolveDisplayedVote,
} from './nowPlayingVotes';
import { resolveWebRuntimeConfig } from './runtimeConfig';
import { createSocketSession } from './socketSession';

const runtimeConfig = resolveWebRuntimeConfig({
  windowOrigin: window.location.origin,
  windowProtocol: window.location.protocol,
  windowHostname: window.location.hostname,
  isDev: import.meta.env.DEV,
  // The static assets are served under the build base (/controller), but the
  // backend API lives under its own reverse-proxy sub-path (/jukebox). Keep the
  // two decoupled so changing where the SPA is served does not move the API.
  baseUrl: import.meta.env.DEV ? '/' : (import.meta.env.VITE_PUBLIC_BASE_PATH || '/jukebox/'),
  apiOriginOverride: import.meta.env.VITE_API_ORIGIN,
});

const API_URL = runtimeConfig.apiRoot;
const SOCKET_URL = runtimeConfig.socketUrl;
const SOCKET_PATH = runtimeConfig.socketPath;

interface Song extends CatalogSearchSong {
  title: string;
  artist: string;
}

interface QueueSong {
  id: string;
  title: string;
  artist: string;
  cover_url: string | null;
  added_by_name?: string | null;
  duration_seconds?: number | null;
  user_vote?: number;
  upvotes?: number;
  downvotes?: number;
  super_votes?: number;
  score?: number;
  song_score?: number | null;
  priority_score?: number | null;
}

interface AppUser {
  id: string;
  display_name: string;
  is_guest: boolean;
  total_songs_added: number;
  rank_score?: number;
  monthly_rank_score?: number;
  role?: string;
  last_super_vote_at?: string;
}

interface LeaderboardUser {
  id: string;
  display_name: string;
  total_songs_added: number;
  score?: number;
  rank_score?: number;
  monthly_rank_score?: number;
}

interface QueueState {
  now_playing: QueueSong | null;
  queue: QueueSong[];
}

interface ConnectResponse {
  device: DeviceSummary;
  queue: QueueState;
}

interface ProgressState {
  currentTime: number;
  duration: number;
  percent: number;
}

interface ToastState {
  type: 'success' | 'error';
  text: string;
}

declare global {
  interface Window {
    toggleLeaderboard?: () => void;
  }
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (isAxiosError<{ error?: string; message?: string }>(error)) {
    return error.response?.data?.message || error.response?.data?.error || fallback;
  }

  if (error instanceof Error) return error.message;
  return fallback;
};

const formatTime = (seconds: number) => {
  if (!seconds || Number.isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getInitial = (name?: string | null) => (name?.trim().substring(0, 1) || '?').toUpperCase();

interface LoginViewProps {
  deviceCode: string;
  deviceCodeInput: string;
  setDeviceCodeInput: (value: string) => void;
  connectToDevice: (code: string) => void;
  user: AppUser | null;
  guestName: string;
  setGuestName: (value: string) => void;
  handleGuestLogin: () => void;
  loading: boolean;
  showLoginModal: boolean;
  setShowLoginModal: (value: boolean) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  handleLogin: () => void;
  logout: () => void;
}

const LoginView = ({
  deviceCode,
  deviceCodeInput,
  setDeviceCodeInput,
  connectToDevice,
  user,
  guestName,
  setGuestName,
  handleGuestLogin,
  loading,
  showLoginModal,
  setShowLoginModal,
  email,
  setEmail,
  password,
  setPassword,
  handleLogin,
  logout,
}: LoginViewProps) => (
  <main className="arcade-login">
    <section className="arcade-login-panel" aria-label="RadioTEDU Jukebox giriş">
      <div className="brand-marquee">
        <div className="brand-mark">
          <Radio size={32} />
        </div>
        <div>
          <p className="eyebrow">RadioTEDU</p>
          <h1>Arcade Jukebox</h1>
        </div>
      </div>

      <div className="login-copy">
        <p>Kampüs ritmini seç, sıraya gir, oylamayla akışı değiştir.</p>
      </div>

      {user ? (
        <div className="panel-stack">
          <div className="user-ticket">
            <div className="avatar-chip">{getInitial(user.display_name)}</div>
            <div>
              <span>Hoş geldin</span>
              <strong>{user.display_name}</strong>
            </div>
          </div>

          {!deviceCode ? (
            <div className="form-grid">
              <input
                className="arcade-input code-input"
                placeholder="CIHAZ KODU"
                value={deviceCodeInput}
                maxLength={10}
                onChange={(event) => setDeviceCodeInput(event.target.value.toUpperCase())}
              />
              <button
                className="arcade-button primary"
                onClick={() => connectToDevice(deviceCodeInput)}
                disabled={loading || !deviceCodeInput}
              >
                Cihaza bağlan
              </button>
            </div>
          ) : (
            <button className="arcade-button primary" onClick={() => connectToDevice(deviceCode)} disabled={loading}>
              {loading ? 'Bağlanıyor...' : 'Müzik kutusuna gir'}
            </button>
          )}

          <button className="text-button" onClick={logout}>
            Farklı hesapla giriş
          </button>
        </div>
      ) : (
        <div className="panel-stack">
          <div className="login-card">
            <p className="eyebrow amber">Hızlı başla</p>
            <input
              className="arcade-input"
              placeholder="Adın nedir?"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
            />
            <button className="arcade-button primary icon-button" onClick={handleGuestLogin} disabled={loading}>
              {loading ? 'Bağlanıyor...' : 'Hızlı başla'} <ChevronRight size={18} />
            </button>
          </div>

          <div className="divider-label">veya</div>

          <button className="arcade-button secondary icon-button" onClick={() => setShowLoginModal(true)}>
            <User size={16} /> Üye girişi
          </button>
        </div>
      )}
    </section>

    {showLoginModal && (
      <div className="modal-screen" role="dialog" aria-modal="true" aria-label="Üye girişi">
        <section className="modal-card compact">
          <button className="modal-close" onClick={() => setShowLoginModal(false)} aria-label="Kapat">
            x
          </button>
          <p className="eyebrow amber">RadioTEDU hesabı</p>
          <h2>Üye girişi</h2>
          <div className="form-grid">
            <label>
              Kullanıcı adı / email
              <input
                className="arcade-input"
                placeholder="admin@radiotedu.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Şifre
              <input
                className="arcade-input"
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="arcade-button primary" onClick={handleLogin} disabled={loading}>
              {loading ? 'Giriş yapılıyor...' : 'Giriş yap'}
            </button>
          </div>
        </section>
      </div>
    )}
  </main>
);

interface LeaderboardViewProps {
  leaderboard: LeaderboardUser[];
  period: 'total' | 'monthly';
  onPeriodChange: (period: 'total' | 'monthly') => void;
  onClose: () => void;
}

const LeaderboardView = ({ leaderboard, period, onPeriodChange, onClose }: LeaderboardViewProps) => (
  <div className="modal-screen" role="dialog" aria-modal="true" aria-label="Jukebox sıralaması">
    <section className="modal-card leaderboard-modal">
      <div className="modal-heading">
        <div className="icon-tile amber">
          <Trophy size={24} />
        </div>
        <div>
          <p className="eyebrow amber">Skor tablosu</p>
          <h2>Sıralama</h2>
          <p>{period === 'monthly' ? 'Bu ay en çok katkı sağlayanlar' : 'Tüm zamanlar en çok katkı sağlayanlar'}</p>
        </div>
        <button className="modal-close inline" onClick={onClose} aria-label="Sıralamayı kapat">
          x
        </button>
      </div>

      <div className="segmented-control" role="tablist" aria-label="Sıralama dönemi">
        <button className={period === 'total' ? 'active' : ''} onClick={() => onPeriodChange('total')}>
          Total
        </button>
        <button className={period === 'monthly' ? 'active' : ''} onClick={() => onPeriodChange('monthly')}>
          Aylık
        </button>
      </div>

      <div className="leaderboard-list custom-scrollbar">
        {leaderboard.length === 0 ? (
          <div className="empty-panel">
            <Trophy size={34} />
            <strong>Henüz kimse yok</strong>
            <span>İlk sıraya geçmek için ilk şarkıyı ekle.</span>
          </div>
        ) : (
          leaderboard.map((entry, index) => (
            <article className={`leaderboard-row ${index === 0 ? 'is-winner' : ''}`} key={entry.id}>
              <div className="rank-badge">{index + 1}</div>
              <div className="avatar-chip small">{getInitial(entry.display_name)}</div>
              <div className="row-main">
                <strong>{entry.display_name}</strong>
                <span>{entry.total_songs_added} şarkı</span>
              </div>
              <div className="score-readout">
                <strong>{entry.score ?? entry.monthly_rank_score ?? entry.rank_score ?? 0}</strong>
                <span>puan</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  </div>
);

interface QueueItemProps {
  item: QueueSong;
  idx: number;
  myVotes: Record<string, number>;
  handleVote: (queueItemId: string, voteType: number, isSuper?: boolean) => void;
  user: AppUser;
}

const QueueItem = ({ item, idx, myVotes, handleVote, user }: QueueItemProps) => {
  const currentVote = resolveDisplayedVote(item, myVotes);
  const supervoteAvailable = hasSupervoteAvailableToday(user.last_super_vote_at);

  return (
    <article className="queue-item">
      <div className="queue-index">{idx + 1}</div>
      <img src={item.cover_url ?? ''} className="song-thumb" alt="" />
      <div className="row-main">
        <strong>{item.title}</strong>
        <span>{item.artist}</span>
      </div>
      <div className="vote-stack">
        <div className="score-pill">
          <Sparkles size={11} />
          {getDisplayedSongScore(item)}
        </div>
        <div className="vote-controls" aria-label={`${item.title} oyları`}>
          <button
            className={currentVote === 1 ? 'vote active-up' : 'vote'}
            onClick={() => handleVote(item.id, 1)}
            title="Upvote"
          >
            <ArrowBigUp size={17} fill={currentVote === 1 ? 'currentColor' : 'none'} />
          </button>
          <button
            className={currentVote === -1 ? 'vote active-down' : 'vote'}
            onClick={() => handleVote(item.id, -1)}
            title="Downvote"
          >
            <ArrowBigDown size={17} fill={currentVote === -1 ? 'currentColor' : 'none'} />
          </button>
          {!user.is_guest && (
            <button
              className={isSupervoteActive(currentVote) ? 'vote active-super' : 'vote'}
              onClick={() => handleVote(item.id, 1, true)}
              disabled={!supervoteAvailable}
              title={!supervoteAvailable ? 'Bugün süper oy hakkın bitti' : 'Süper Oy (+3 şarkı / +2 rank)'}
            >
              <Star size={15} fill={isSupervoteActive(currentVote) ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

interface JukeboxViewProps {
  user: AppUser;
  device: DeviceSummary;
  logout: () => void;
  search: string;
  setSearch: (value: string) => void;
  searchSongs: () => void;
  results: Song[];
  addToQueue: (song: Song) => void;
  nowPlaying: QueueSong | null;
  queue: QueueSong[];
  fetchCurrentQueue: (deviceId: string) => void;
  progress: ProgressState | null;
  setDevice: (device: DeviceSummary) => void;
  interpolatedProgress: number;
  handleVote: (queueItemId: string, voteType: number, isSuper?: boolean) => void;
  onShowLeaderboard: () => void;
  myVotes: Record<string, number>;
}

const JukeboxView = ({
  user,
  device,
  logout,
  search,
  setSearch,
  searchSongs,
  results,
  addToQueue,
  nowPlaying,
  queue,
  fetchCurrentQueue,
  progress,
  setDevice,
  interpolatedProgress,
  handleVote,
  onShowLeaderboard,
  myVotes,
}: JukeboxViewProps) => {
  const nowPlayingCurrentVote = nowPlaying ? resolveDisplayedVote(nowPlaying, myVotes) : undefined;
  const nowPlayingSongScore = nowPlaying ? getDisplayedSongScore(nowPlaying) : 0;
  const duration = progress?.duration || nowPlaying?.duration_seconds || 0;
  const progressPercent = duration ? Math.min(100, (interpolatedProgress / duration) * 100) : 0;
  const supervoteAvailable = hasSupervoteAvailableToday(user.last_super_vote_at);

  return (
    <div className="jukebox-console">
      <aside className="control-rail">
        <div className="rail-brand">
          <div className="brand-mark small">
            <Radio size={20} />
          </div>
          <div>
            <p className="eyebrow">RadioTEDU</p>
            <h1>Jukebox</h1>
          </div>
        </div>

        <div className="device-card">
          <span className="status-light online"></span>
          <div>
            <p>Bağlı cihaz</p>
            <strong>{device.name}</strong>
            <span>{device.device_code}</span>
          </div>
        </div>

        <label className="search-panel">
          <Search size={16} />
          <input
            className="arcade-input"
            placeholder="Şarkı veya sanatçı ara..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyUp={(event) => event.key === 'Enter' && searchSongs()}
          />
        </label>

        <div className="search-results custom-scrollbar">
          {results.length > 0 ? (
            <>
              <div className="section-heading">
                <span>Arama sonuçları</span>
                <button onClick={() => setSearch('')}>Temizle</button>
              </div>
              {results.map((song, index) => (
                <button className="search-result" key={getSearchResultKey(song, index)} onClick={() => addToQueue(song)}>
                  <img src={song.cover_url ?? ''} alt="" />
                  <span>
                    <strong>{song.title}</strong>
                    <small>{song.artist}</small>
                  </span>
                  <Plus size={16} />
                </button>
              ))}
            </>
          ) : (
            <div className="empty-rail">
              <Trophy size={36} />
              <span>TEDU kataloğundan şarkı ara.</span>
              <button className="arcade-button secondary mini" onClick={onShowLeaderboard}>
                Sıralama
              </button>
            </div>
          )}
        </div>

        <div className="rail-footer">
          {user.role === 'admin' && <AdminDashboard token={localStorage.getItem('token') || ''} device={device} onSelectDevice={setDevice} />}

          <div className="user-console-card">
            <div className="avatar-chip">{getInitial(user.display_name)}</div>
            <div className="row-main">
              <strong>{user.display_name}</strong>
              <span>{user.role === 'admin' ? 'Yönetici' : user.is_guest ? 'Misafir' : 'Dinleyici'}</span>
            </div>
            <button className="icon-only danger" onClick={logout} title="Çıkış">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="player-stage">
        <section className="now-playing-panel">
          {nowPlaying ? (
            <div className="record-display">
              <div className="record-art">
                <img src={nowPlaying.cover_url ?? ''} alt="" />
                <span className="record-ring"></span>
              </div>
              <div className="track-copy">
                <p className="eyebrow amber">Şu an çalıyor</p>
                <h2>{nowPlaying.title}</h2>
                <p className="artist-name">{nowPlaying.artist}</p>
                <div className="request-line">
                  <User size={14} /> İsteyen: <strong>{nowPlaying.added_by_name || 'RadioTEDU'}</strong>
                </div>
              </div>

              <div className="progress-module">
                <div className="module-topline">
                  <span>{formatTime(interpolatedProgress)}</span>
                  <button className="sync-button" onClick={() => fetchCurrentQueue(device.id)} title="Senkronize et">
                    <RefreshCw size={13} />
                  </button>
                  <span>{formatTime(duration)}</span>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${progressPercent}%` }}></span>
                </div>
                <div className="status-chip live">
                  <span className="status-light online"></span> Kiosk canlı
                </div>
              </div>

              <div className="now-vote-panel">
                <div className="score-pill large">
                  <Sparkles size={13} /> {nowPlayingSongScore} puan
                </div>
                <div className="vote-controls large">
                  <button
                    className={nowPlayingCurrentVote === 1 ? 'vote active-up' : 'vote'}
                    onClick={() => handleVote(nowPlaying.id, 1)}
                    title="Upvote"
                  >
                    <ArrowBigUp size={22} fill={nowPlayingCurrentVote === 1 ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className={nowPlayingCurrentVote === -1 ? 'vote active-down' : 'vote'}
                    onClick={() => handleVote(nowPlaying.id, -1)}
                    title="Downvote"
                  >
                    <ArrowBigDown size={22} fill={nowPlayingCurrentVote === -1 ? 'currentColor' : 'none'} />
                  </button>
                  {!user.is_guest && (
                    <button
                      className={isSupervoteActive(nowPlayingCurrentVote) ? 'vote active-super' : 'vote'}
                      onClick={() => handleVote(nowPlaying.id, 1, true)}
                      disabled={!supervoteAvailable}
                      title={!supervoteAvailable ? 'Bugün süper oy hakkın bitti' : 'Süper Oy (+3 şarkı / +2 rank)'}
                    >
                      <Star size={20} fill={isSupervoteActive(nowPlayingCurrentVote) ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-stage">
              <Disc3 size={56} />
              <h2>Müzik sırası boş</h2>
              <p>Bir şarkı ara ve kampüs hoparlörlerine gönder.</p>
            </div>
          )}
        </section>

        <aside className="queue-column">
          <div className="queue-heading">
            <div>
              <p className="eyebrow">Sıradakiler</p>
              <h2>Queue</h2>
            </div>
            <div className="count-pill">
              <ListMusic size={15} /> {queue.length}
            </div>
          </div>

          <div className="queue-list custom-scrollbar">
            {queue.length === 0 ? (
              <div className="empty-panel slim">
                <ListMusic size={34} />
                <strong>Kuyruk bekleniyor</strong>
              </div>
            ) : (
              queue.map((item, index) => (
                <QueueItem key={item.id} item={item} idx={index} myVotes={myVotes} handleVote={handleVote} user={user} />
              ))
            )}
          </div>
        </aside>
      </main>

      {user.is_guest && (
        <div className="guest-status">
          <User size={18} />
          <span>{user.total_songs_added >= 1 ? 'Misafir hakkın doldu' : 'Misafir modu: 1 şarkı hakkın var'}</span>
          {user.total_songs_added >= 1 ? <button onClick={logout}>Üye ol</button> : <strong>Aktif</strong>}
        </div>
      )}
    </div>
  );
};

function App() {
  const [deviceCode, setDeviceCode] = useState('');
  const [deviceCodeInput, setDeviceCodeInput] = useState('');
  const [device, setDevice] = useState<DeviceSummary | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [guestName, setGuestName] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [queue, setQueue] = useState<QueueSong[]>([]);
  const [nowPlaying, setNowPlaying] = useState<QueueSong | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [interpolatedProgress, setInterpolatedProgress] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<ToastState | null>(null);
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'total' | 'monthly'>('total');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const deviceRef = useRef<DeviceSummary | null>(null);
  const leaderboardRequestSeqRef = useRef(0);
  const leaderboardPeriodRef = useRef<'total' | 'monthly'>('total');
  const socketDeviceId = device?.id ?? null;

  const syncVotesFromQueue = useCallback((nextNowPlaying: QueueSong | null, nextQueue: QueueSong[]) => {
    const nextVotes: Record<string, number> = {};
    if (nextNowPlaying?.user_vote !== undefined) nextVotes[nextNowPlaying.id] = nextNowPlaying.user_vote;
    nextQueue.forEach((item) => {
      if (item.user_vote !== undefined) nextVotes[item.id] = item.user_vote;
    });
    if (Object.keys(nextVotes).length > 0) setMyVotes((prev) => ({ ...prev, ...nextVotes }));
  }, []);

  const fetchCurrentQueue = useCallback(
    async (deviceId: string) => {
      try {
        const res = await axios.get<QueueState>(`${API_URL}/api/v1/jukebox/queue/${deviceId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const nextQueue = res.data.queue || [];
        const nextNowPlaying = res.data.now_playing || null;
        setQueue(nextQueue);
        setNowPlaying(nextNowPlaying);
        syncVotesFromQueue(nextNowPlaying, nextQueue);
      } catch (error) {
        console.error('Failed to sync queue:', error);
      }
    },
    [syncVotesFromQueue],
  );

  const connectToDevice = useCallback(
    async (code: string) => {
      if (!code) return;
      try {
        setLoading(true);
        const res = await axios.post<{ data: ConnectResponse }>(
          `${API_URL}/api/v1/jukebox/connect`,
          { device_code: code },
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
        );

        const responseData = res.data.data;
        setDevice(responseData.device);
        setQueue(responseData.queue.queue);
        setNowPlaying(responseData.queue.now_playing);
        syncVotesFromQueue(responseData.queue.now_playing, responseData.queue.queue);
        setMsg({ type: 'success', text: `${responseData.device.name} cihazına bağlanıldı!` });
        setDeviceCode(code);
      } catch {
        setMsg({ type: 'error', text: 'Cihaza bağlanılamadı. Kod hatalı olabilir.' });
      } finally {
        setLoading(false);
      }
    },
    [syncVotesFromQueue],
  );

  const fetchLeaderboard = useCallback(async (period: 'total' | 'monthly' = leaderboardPeriodRef.current) => {
    const requestSeq = leaderboardRequestSeqRef.current + 1;
    leaderboardRequestSeqRef.current = requestSeq;
    setLeaderboardPeriod(period);

    try {
      const res = await axios.get<{ data: { leaderboard?: LeaderboardUser[] } }>(`${API_URL}/api/v1/users/leaderboard`, {
        params: { period },
      });
      if (leaderboardRequestSeqRef.current !== requestSeq) return;
      setLeaderboard(res.data.data.leaderboard || []);
    } catch (error) {
      if (leaderboardRequestSeqRef.current !== requestSeq) return;
      console.error('Leaderboard fetch failed:', error);
    }
  }, []);

  useEffect(() => {
    deviceRef.current = device;
  }, [device]);

  useEffect(() => {
    leaderboardPeriodRef.current = leaderboardPeriod;
  }, [leaderboardPeriod]);

  useEffect(() => {
    if (!msg) return undefined;
    const timer = window.setTimeout(() => setMsg(null), 4000);
    return () => window.clearTimeout(timer);
  }, [msg]);

  useEffect(() => {
    if (!progress) return undefined;
    setInterpolatedProgress(progress.currentTime);
    const timer = window.setInterval(() => {
      setInterpolatedProgress((prev) => (prev < progress.duration ? prev + 1 : prev));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [progress]);

  useEffect(() => {
    const code = parseDeviceCodeFromSearch(window.location.search);
    if (code) setDeviceCode(code);

    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined' && savedUser !== 'null') {
      try {
        const parsed = JSON.parse(savedUser) as AppUser;
        setUser(parsed);
        if (code) void connectToDevice(code);
      } catch {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
  }, [connectToDevice]);

  useEffect(() => {
    window.toggleLeaderboard = () => {
      void fetchLeaderboard(leaderboardPeriodRef.current);
      setShowLeaderboard(true);
    };
    return () => {
      delete window.toggleLeaderboard;
    };
  }, [fetchLeaderboard]);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          setUser(null);
          setMsg({ type: 'error', text: 'Oturum süreniz doldu. Lütfen tekrar giriş yapın.' });
        }

        if (error.response?.data?.code === 'SESSION_REQUIRED') {
          const currentDevice = deviceRef.current;
          if (currentDevice?.device_code) {
            void connectToDevice(currentDevice.device_code);
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      },
    );

    return () => axios.interceptors.response.eject(interceptor);
  }, [connectToDevice]);

  useEffect(() => {
    if (!socketDeviceId) {
      setSocket(null);
      return undefined;
    }

    const session = createSocketSession(() => io(SOCKET_URL, {
      path: SOCKET_PATH,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      transports: ['websocket', 'polling'],
    }));
    setSocket(session.socket);

    return () => {
      session.dispose();
      setSocket((current) => current === session.socket ? null : current);
    };
  }, [socketDeviceId]);

  useEffect(() => {
    if (!socket || !device) return undefined;

    const handleConnect = () => {
      socket.emit('join_device', device.id);
      void fetchCurrentQueue(device.id);
    };

    const handleQueueUpdated = (data: QueueState) => {
      const nextQueue = data.queue || [];
      const nextNowPlaying = data.now_playing || null;
      setQueue(nextQueue);
      setNowPlaying(nextNowPlaying);
      setProgress(null);
      syncVotesFromQueue(nextNowPlaying, nextQueue);
    };

    const handleForceLogout = () => {
      if (user?.role === 'admin') return;
      setDevice(null);
      setMsg({ type: 'error', text: 'Cihaz oturumunuz admin tarafından sonlandırıldı.' });
    };

    const handlePlaybackProgress = (data: ProgressState) => setProgress(data);
    const handleSongSkipped = () => void fetchCurrentQueue(device.id);

    if (socket.connected) handleConnect();
    socket.on('connect', handleConnect);
    socket.on('queue_updated', handleQueueUpdated);
    socket.on('force_logout', handleForceLogout);
    socket.on('playback_progress', handlePlaybackProgress);
    socket.on('song_skipped', handleSongSkipped);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('queue_updated', handleQueueUpdated);
      socket.off('force_logout', handleForceLogout);
      socket.off('playback_progress', handlePlaybackProgress);
      socket.off('song_skipped', handleSongSkipped);
      socket.emit('leave_device', device.id);
    };
  }, [device, fetchCurrentQueue, socket, syncVotesFromQueue, user?.role]);

  useEffect(() => {
    if (device?.id) void fetchCurrentQueue(device.id);
  }, [device?.id, fetchCurrentQueue]);

  const handleGuestLogin = async () => {
    if (!guestName) return;
    try {
      setLoading(true);
      const res = await axios.post<{ data: { user: AppUser; access_token: string } }>(`${API_URL}/api/v1/auth/guest`, {
        display_name: guestName,
      });
      const userData = res.data.data.user;
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('token', res.data.data.access_token);
      if (deviceCode) void connectToDevice(deviceCode);
    } catch {
      setMsg({ type: 'error', text: 'Giriş yapılamadı.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    try {
      setLoading(true);
      const res = await axios.post<{ data: { user: AppUser; access_token: string } }>(`${API_URL}/api/v1/auth/login`, {
        email,
        password,
      });
      setUser(res.data.data.user);
      localStorage.setItem('token', res.data.data.access_token);
      localStorage.setItem('user', JSON.stringify(res.data.data.user));
      setGuestName('');
      setShowLoginModal(false);

      const currentCode = deviceCode || deviceCodeInput;
      if (currentCode) void connectToDevice(currentCode);
    } catch (error) {
      setMsg({ type: 'error', text: getErrorMessage(error, 'Giriş yapılamadı.') });
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (queueItemId: string, voteType: number, isSuper = false) => {
    if (!device) return;
    try {
      const response = await axios.post<{ data: { user_vote: number } }>(
        `${API_URL}/api/v1/jukebox/vote`,
        {
          queue_item_id: queueItemId,
          vote: voteType,
          device_id: device.id,
          is_super: isSuper,
        },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
      );

      if (isSuper && user) {
        setUser({ ...user, last_super_vote_at: new Date().toISOString() });
      }

      const serverUserVote = response.data.data.user_vote;
      setMyVotes((prev) => {
        if (serverUserVote === 0) {
          const newState = { ...prev };
          delete newState[queueItemId];
          return newState;
        }
        return { ...prev, [queueItemId]: serverUserVote };
      });
    } catch (error) {
      setMsg({ type: 'error', text: getErrorMessage(error, 'Oy verme başarısız oldu.') });
    }
  };

  const logout = async () => {
    const savedDeviceCode = device?.device_code || deviceCode;

    if (device?.id) {
      try {
        await axios.post(
          `${API_URL}/api/v1/jukebox/disconnect`,
          { device_id: device.id },
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } },
        );
      } catch (error) {
        console.warn('Failed to delete session:', error);
      }

      localStorage.removeItem(`device_pwd_${device.device_code}`);
      socket?.emit('leave_device', device.id);
    }

    setUser(null);
    setDevice(null);
    setQueue([]);
    setNowPlaying(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');

    if (savedDeviceCode) {
      setDeviceCode(savedDeviceCode);
      setDeviceCodeInput(savedDeviceCode);
    }
  };

  const searchSongs = async () => {
    if (!search) return;
    try {
      const res = await axios.get<{ data: { items: Song[] } }>(`${API_URL}/api/v1/jukebox/songs`, {
        params: { search },
      });
      setResults(res.data.data.items || []);
    } catch (error) {
      console.error('Song search failed:', error);
    }
  };

  const addToQueue = async (song: Song) => {
    if (!user || !device) return;
    try {
      setLoading(true);
      await axios.post(`${API_URL}/api/v1/jukebox/queue`, buildQueueRequestPayload(device.id, song), {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          ...buildGuestQueueHeaders(Boolean(user.is_guest)),
        },
      });
      setMsg({ type: 'success', text: 'Şarkı kuyruğa eklendi!' });
      setSearch('');
      setResults([]);

      if (user.is_guest) {
        setUser({ ...user, total_songs_added: user.total_songs_added + 1 });
      }
    } catch (error) {
      if (isAxiosError<{ code?: string; message?: string }>(error) && error.response?.data?.code === 'GUEST_LIMIT_REACHED') {
        setMsg({ type: 'error', text: 'Misafir limitin doldu. Giriş yap veya üye ol; sınırsız şarkı ekleyebilirsin.' });
        setShowLoginModal(true);
      } else {
        setMsg({ type: 'error', text: getErrorMessage(error, 'Şarkı eklenemedi.') });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="arcade-app-shell">
      {!user || !device ? (
        <LoginView
          deviceCode={deviceCode}
          deviceCodeInput={deviceCodeInput}
          setDeviceCodeInput={setDeviceCodeInput}
          connectToDevice={connectToDevice}
          user={user}
          guestName={guestName}
          setGuestName={setGuestName}
          handleGuestLogin={handleGuestLogin}
          loading={loading}
          showLoginModal={showLoginModal}
          setShowLoginModal={setShowLoginModal}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          handleLogin={handleLogin}
          logout={logout}
        />
      ) : (
        <JukeboxView
          user={user}
          device={device}
          logout={logout}
          search={search}
          setSearch={setSearch}
          searchSongs={searchSongs}
          results={results}
          addToQueue={addToQueue}
          nowPlaying={nowPlaying}
          queue={queue}
          fetchCurrentQueue={fetchCurrentQueue}
          progress={progress}
          setDevice={setDevice}
          interpolatedProgress={interpolatedProgress}
          handleVote={handleVote}
          onShowLeaderboard={() => {
            void fetchLeaderboard();
            setShowLeaderboard(true);
          }}
          myVotes={myVotes}
        />
      )}

      {showLeaderboard && (
        <LeaderboardView
          leaderboard={leaderboard}
          period={leaderboardPeriod}
          onPeriodChange={(period) => void fetchLeaderboard(period)}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {msg && (
        <div className={`toast ${msg.type}`} role="status">
          {msg.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
          <div>
            <span>{msg.type === 'success' ? 'Başarılı' : 'Hata'}</span>
            <strong>{msg.text}</strong>
          </div>
          <button onClick={() => setMsg(null)} aria-label="Bildirimi kapat">
            x
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
