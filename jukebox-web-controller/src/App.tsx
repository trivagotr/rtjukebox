import { useState, useEffect } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import {
  Music,
  Search,
  Plus,
  User,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Disc
} from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';

const API_URL = import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`;

interface Song {
  id: string;
  title: string;
  artist: string;
  cover_url: string;
  file_url: string;
}

interface AppUser {
  id: string;
  display_name: string;
  is_guest: boolean;
  total_songs_added: number;
  role?: string;
}

// --- Components ---

const LoginView = ({
  deviceCode,
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
  handleLogin
}: any) => (
  <div className="flex flex-col gap-6 p-8">
    <div className="text-center">
      <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
        <Music size={32} color="white" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Jukebox'a Katıl</h1>
      {deviceCode && (
        <div className="inline-block bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold mb-4">
          📍 {deviceCode}
        </div>
      )}
      <p className="text-text-muted">Sevdiğin müzikleri paylaşmaya başla.</p>
    </div>

    <div className="card flex flex-col gap-4">
      <label className="text-sm font-semibold text-text-muted uppercase tracking-wider">Hızlı Katılım</label>
      <input
        className="input-field"
        placeholder="İsim girin..."
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
      />
      <button onClick={handleGuestLogin} className="btn-primary" disabled={loading}>
        {loading ? 'Bağlanıyor...' : 'İsimle Katıl'} <ArrowRight size={18} />
      </button>
    </div>

    <div className="relative py-4">
      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
      <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-text-muted">Veya</span></div>
    </div>

    <button
      onClick={() => setShowLoginModal(true)}
      className="flex items-center justify-center gap-2 text-primary font-semibold py-4 text-sm hover:underline"
    >
      Hesabınla Giriş Yap <User size={16} />
    </button>

    {/* Login Modal */}
    {showLoginModal && (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-surface w-full max-w-sm p-6 rounded-2xl border border-border shadow-2xl relative">
          <button
            onClick={() => setShowLoginModal(false)}
            className="absolute top-4 right-4 text-text-muted hover:text-white"
          >✕</button>
          <h2 className="text-xl font-bold mb-6 text-center">Giriş Yap</h2>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-text-muted uppercase font-bold ml-1">Email</label>
              <input
                className="input-field w-full mt-1"
                placeholder="admin@radiotedu.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted uppercase font-bold ml-1">Şifre</label>
              <input
                type="password"
                className="input-field w-full mt-1"
                placeholder="••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <button
              onClick={handleLogin}
              className="btn-primary mt-2"
              disabled={loading}
            >
              {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);

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
  queue
}: any) => (
  <div className="flex flex-col h-full w-full relative">
    {/* Search Header */}
    <div className="p-4 glass sticky top-0 z-10 border-b border-border">
      {user?.role === 'admin' && (
        <AdminDashboard token={localStorage.getItem('token') || ''} device={device} />
      )}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-blue-500 flex items-center justify-center font-bold text-xs ring-2 ring-background">
            {user?.display_name.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold">{user?.display_name}</span>
            {user?.role === 'admin' && <span className="text-[10px] text-rose-500 font-bold uppercase tracking-widest">Admin</span>}
          </div>
        </div>

        <button onClick={logout} className="text-xs text-text-muted hover:text-white px-2 py-1 rounded bg-surface border border-border">
          Çıkış
        </button>
      </div>

      <div className="relative mt-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
        <input
          className="input-field pl-10 h-10"
          placeholder="Şarkı, sanatçı ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && searchSongs()}
        />
      </div>
    </div>

    {/* Main Content */}
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 pb-32">
      {results.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-text-muted uppercase tracking-wider">Arama Sonuçları</h2>
          {results.map((song: any) => (
            <div key={song.id} className="card flex items-center gap-4 hover:bg-surface-hover transition-colors cursor-pointer" onClick={() => addToQueue(song.id)}>
              <img src={song.cover_url} className="w-12 h-12 rounded-lg object-cover" alt="" />
              <div className="flex-1 overflow-hidden">
                <div className="font-bold truncate">{song.title}</div>
                <div className="text-sm text-text-muted truncate">{song.artist}</div>
              </div>
              <Plus size={20} className="text-primary" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Now Playing */}
          {nowPlaying && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                <Disc className="animate-spin" size={16} /> ŞU AN ÇALIYOR
              </h2>
              <div className="card bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20 p-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <img src={nowPlaying.cover_url} className="w-16 h-16 rounded-xl shadow-lg rotate-disc" alt="" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="text-lg font-bold truncate">{nowPlaying.title}</div>
                    <div className="text-primary font-medium truncate">{nowPlaying.artist}</div>
                    <div className="text-xs text-text-muted mt-1 flex items-center gap-1">
                      <User size={10} /> {nowPlaying.added_by_name} ekledi
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Queue List */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-bold text-text-muted uppercase tracking-wider">SIRADAKİLER ({queue.length})</h2>
            {queue.length === 0 ? (
              <div className="text-center py-12 text-text-muted italic">Kuyruk boş. İlk şarkıyı sen ekle!</div>
            ) : (
              queue.map((item: any, idx: number) => (
                <div key={item.id} className="card flex items-center gap-4">
                  <div className="w-6 text-primary font-black text-center">{idx + 1}</div>
                  <img src={item.cover_url} className="w-10 h-10 rounded shadow-md" alt="" />
                  <div className="flex-1 overflow-hidden">
                    <div className="font-bold truncate text-sm">{item.title}</div>
                    <div className="text-xs text-text-muted truncate">{item.artist}</div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-primary font-bold">
                    <TrendingUp size={12} /> {item.priority_score}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>

    {/* Guest Toast / Info */}
    {user?.is_guest && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] glass border-primary/20 p-3 rounded-2xl shadow-xl flex items-center justify-between z-20">
        <div className="flex flex-col">
          <span className="text-xs text-text-muted">Misafir Modu</span>
          <span className="text-sm font-bold">{user.total_songs_added >= 1 ? 'Limit Doldu' : '1 şarkı hakkın var'}</span>
        </div>
        {user.total_songs_added >= 1 ? (
          <button onClick={logout} className="text-xs bg-primary px-3 py-1.5 rounded-lg font-bold">Giriş Yap</button>
        ) : (
          <span className="bg-primary/20 text-primary text-[10px] px-2 py-1 rounded-full font-black uppercase">Aktif</span>
        )}
      </div>
    )}
  </div>
);


function App() {
  const [deviceCode, setDeviceCode] = useState('');
  const [device, setDevice] = useState<any>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [guestName, setGuestName] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [nowPlaying, setNowPlaying] = useState<any>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Login States
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Initialize from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setDeviceCode(code);
      connectToDevice(code);
    }

    // Check localStorage for user
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined' && savedUser !== 'null') {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("User parse error", e);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
  }, []);

  // Socket Connection
  useEffect(() => {
    if (device && !socket) {
      const newSocket = io(API_URL);
      newSocket.emit('join_device', device.id);

      newSocket.on('queue_updated', (data) => {
        setQueue(data.queue);
        setNowPlaying(data.now_playing);
      });

      setSocket(newSocket);
      return () => { newSocket.disconnect(); };
    }
  }, [device]);

  const connectToDevice = async (code: string) => {
    try {
      setLoading(true);
      const res = await axios.post(`${API_URL}/api/v1/jukebox/connect`, { device_code: code }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const responseData = res.data.data;
      setDevice(responseData.device);
      setQueue(responseData.queue.queue);
      setNowPlaying(responseData.queue.now_playing);
    } catch (err) {
      setMsg({ type: 'error', text: 'Cihaza bağlanılamadı. Kod hatalı olabilir.' });
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    if (!guestName) return;
    try {
      setLoading(true);
      const res = await axios.post(`${API_URL}/api/v1/auth/guest`, { display_name: guestName });
      const userData = res.data.data.user;
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('token', res.data.data.access_token);
      setMsg({ type: 'success', text: `Hoş geldin ${guestName}! 1 şarkı ekleme hakkın var.` });
    } catch (err) {
      setMsg({ type: 'error', text: 'Giriş yapılamadı.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    try {
      setLoading(true);
      const res = await axios.post(`${API_URL}/api/v1/auth/login`, { email, password });
      const userData = res.data.data.user;
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('token', res.data.data.access_token);
      setMsg({ type: 'success', text: `Hoş geldin ${userData.display_name}!` });
      setShowLoginModal(false);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Giriş yapılamadı.' });
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  const searchSongs = async () => {
    if (!search) return;
    try {
      const res = await axios.get(`${API_URL}/api/v1/jukebox/songs?search=${search}`);
      setResults(res.data.data.items);
    } catch (err) {
      console.error(err);
    }
  };

  const addToQueue = async (songId: string) => {
    if (!user) return;
    try {
      setLoading(true);
      await axios.post(`${API_URL}/api/v1/jukebox/queue`,
        { device_id: device.id, song_id: songId },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      setMsg({ type: 'success', text: 'Şarkı kuyruğa eklendi!' });
      setSearch('');
      setResults([]);

      // Update local user state if guest
      if (user.is_guest) {
        setUser({ ...user, total_songs_added: user.total_songs_added + 1 });
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error === 'Guest limit reached'
        ? 'Misafir limitin doldu. Daha fazlası için giriş yapmalısın!'
        : 'Şarkı eklenemedi.';
      setMsg({ type: 'error', text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  // Render logic
  let content;
  if (!device) {
    content = <LoginView
      deviceCode={deviceCode}
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
    />;
  } else if (!user) {
    content = <LoginView
      deviceCode={deviceCode}
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
    />;
  } else {
    content = <JukeboxView
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
    />;
  }

  return (
    <div className="bg-black min-h-screen text-white font-sans">
      <div className="max-w-md mx-auto bg-background min-h-screen shadow-2xl overflow-hidden relative flex flex-col">
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {content}
        </div>

        {/* Message Overlay */}
        {msg && (
          <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-sm p-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50 backdrop-blur-md border ${msg.type === 'success' ? 'bg-emerald-500/90 border-emerald-400/50' : 'bg-rose-500/90 border-rose-400/50'}`}>
            {msg.type === 'success' ? <CheckCircle2 size={24} className="text-white" /> : <AlertCircle size={24} className="text-white" />}
            <span className="font-bold text-sm text-white">{msg.text}</span>
            <button onClick={() => setMsg(null)} className="ml-auto opacity-70 hover:opacity-100"><span className="sr-only">Close</span>✕</button>
          </div>
        )}
      </div>

      <style>{`
        .rotate-disc {
          animation: spin 8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        ::-webkit-scrollbar { display: none; }
        html { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

export default App;
