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
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`;

interface Song {
  id: string;
  title: string;
  artist: string;
  cover_url: string;
  file_url: string;
}

interface User {
  id: string;
  display_name: string;
  is_guest: boolean;
  total_songs_added: number;
}

function App() {
  const [deviceCode, setDeviceCode] = useState('');
  const [device, setDevice] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [guestName, setGuestName] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [nowPlaying, setNowPlaying] = useState<any>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Initialize from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setDeviceCode(code);
      connectToDevice(code);

      // Attempt to open mobile app
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        const deepLink = `radiotedu://jukebox/${code}`;

        // Simple redirection attempt
        // If the app is installed, this will prompt the user or open automatically
        // If not, the timeout will prevent weird browser behavior in some cases, 
        // or the user will just stay on the web page.
        window.location.href = deepLink;
      }
    }

    // Check localStorage for user
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('token');
    if (savedUser && savedToken) {
      setUser(JSON.parse(savedUser));
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
      const res = await axios.post(`${API_URL}/jukebox/connect`, { device_code: code }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setDevice(res.data.device);
      setQueue(res.data.queue.queue);
      setNowPlaying(res.data.queue.now_playing);
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
      const res = await axios.post(`${API_URL}/auth/guest`, { display_name: guestName });
      setUser(res.data.user);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      localStorage.setItem('token', res.data.access_token);
      setMsg({ type: 'success', text: `Hoş geldin ${guestName}! 1 şarkı ekleme hakkın var.` });
    } catch (err) {
      setMsg({ type: 'error', text: 'Giriş yapılamadı.' });
    } finally {
      setLoading(false);
    }
  };

  const searchSongs = async () => {
    if (!search) return;
    try {
      const res = await axios.get(`${API_URL}/jukebox/songs?search=${search}`);
      setResults(res.data.items);
    } catch (err) {
      console.error(err);
    }
  };

  const addToQueue = async (songId: string) => {
    if (!user) return;
    try {
      setLoading(true);
      await axios.post(`${API_URL}/jukebox/queue`,
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

  // --- Views ---

  const LoginView = () => (
    <div className="flex flex-col gap-6 p-8 animate-fade">
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

      <button className="flex items-center justify-center gap-2 text-primary font-semibold py-2">
        Hesabınla Giriş Yap <User size={18} />
      </button>
    </div>
  );

  const JukeboxView = () => (
    <div className="flex flex-col h-full animate-fade">
      {/* Search Header */}
      <div className="p-4 glass sticky top-0 z-10 border-b border-border">
        <div className="relative">
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
            {results.map(song => (
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
                queue.map((item, idx) => (
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
            <button className="text-xs bg-primary px-3 py-1.5 rounded-lg font-bold">Giriş Yap</button>
          ) : (
            <span className="bg-primary/20 text-primary text-[10px] px-2 py-1 rounded-full font-black uppercase">Aktif</span>
          )}
        </div>
      )}
    </div>
  );

  if (!device) return <LoginView />;
  if (!user) return <LoginView />;

  return (
    <div className="app-container">
      <AnimatePresence mode="wait">
        <JukeboxView />
      </AnimatePresence>

      {/* Message Overlay */}
      <AnimatePresence>
        {msg && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 w-[90%] p-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 ${msg.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}
          >
            {msg.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
            <span className="font-medium">{msg.text}</span>
            <button onClick={() => setMsg(null)} className="ml-auto opacity-50">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .rotate-disc {
          animation: spin 8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
