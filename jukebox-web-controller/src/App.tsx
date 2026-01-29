import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import {
  Music,
  Search,
  Plus,
  User,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Disc,
  ListMusic,
  RefreshCw,
  ArrowBigUp,
  ArrowBigDown,
  Trophy,
  LogOut,
  ChevronRight,
  Star
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
  last_super_vote_at?: string;
}

// --- Utils ---
const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- Components ---

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
  logout
}: any) => (
  <div className="flex flex-col items-center justify-center min-h-screen p-6 max-w-sm mx-auto">
    <div className="w-full text-center space-y-6">
      <div className="relative inline-block">
        <div className="absolute inset-0 bg-primary blur-2xl opacity-20 rounded-full"></div>
        <div className="relative w-24 h-24 bg-primary rounded-[32px] flex items-center justify-center mx-auto mb-2 shadow-2xl shadow-primary/40 rotate-12">
          <Music size={40} color="white" />
        </div>
      </div>

      <div>
        <h1 className="text-4xl font-black mb-2 tracking-tight">Jukebox<span className="text-primary">.</span></h1>
        <p className="text-text-muted font-medium">TEDU kampüsünde müziği sen yönet.</p>
      </div>

      {user ? (
        <div className="card w-full border-primary/20 bg-primary/5 p-6 animate-fade">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center font-black text-xl shadow-lg">
              {user.display_name.substring(0, 1).toUpperCase()}
            </div>
            <div className="text-left flex-1">
              <div className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Hoş Geldin</div>
              <div className="font-black text-xl">{user.display_name}</div>
            </div>
          </div>

          {!deviceCode ? (
            <div className="space-y-3">
              <input
                className="input-field py-4 text-center font-bold tracking-[4px] text-lg uppercase"
                placeholder="CIHAZ KODU"
                value={deviceCodeInput}
                maxLength={10}
                onChange={e => setDeviceCodeInput(e.target.value.toUpperCase())}
              />
              <button
                onClick={() => connectToDevice(deviceCodeInput)}
                className="btn-primary w-full py-4 text-sm"
                disabled={loading || !deviceCodeInput}
              >
                Cihaza Bağlan
              </button>
            </div>
          ) : (
            <button
              onClick={() => connectToDevice(deviceCode)}
              className="btn-primary w-full py-4"
              disabled={loading}
            >
              {loading ? 'Bağlanıyor...' : 'Müzik Kutusuna Gir'}
            </button>
          )}

          <button onClick={logout} className="mt-4 text-xs font-bold text-text-muted hover:text-rose-500 tracking-widest uppercase">Farklı Hesapla Giriş</button>
        </div>
      ) : (
        <div className="space-y-6 w-full">
          <div className="card space-y-4">
            <input
              className="input-field py-4"
              placeholder="Adın nedir?"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
            <button onClick={handleGuestLogin} className="btn-primary w-full py-4" disabled={loading}>
              {loading ? 'Bağlanıyor...' : 'Hızlı Başla'} <ChevronRight size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-white/5"></div>
            <span className="text-[10px] font-black text-text-muted tracking-widest uppercase">Veya</span>
            <div className="flex-1 h-px bg-white/5"></div>
          </div>

          <button
            onClick={() => setShowLoginModal(true)}
            className="w-full flex items-center justify-center gap-2 text-white/50 hover:text-white font-bold py-2 text-xs tracking-widest uppercase transition-colors"
          >
            <User size={14} /> Üye Girişi
          </button>
        </div>
      )}
    </div>

    {/* Login Modal */}
    {showLoginModal && (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fade">
        <div className="bg-surface w-full max-w-sm p-8 rounded-[32px] border border-white/5 shadow-2xl relative">
          <button
            onClick={() => setShowLoginModal(false)}
            className="absolute top-6 right-6 text-text-muted hover:text-white transition-colors"
          >✕</button>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-black mb-2">Üye Girişi</h2>
            <p className="text-xs text-text-muted font-bold tracking-widest uppercase">RadioTEDU Premium</p>
          </div>

          <div className="flex flex-col gap-5">
            <div className="space-y-2">
              <label className="text-[10px] text-text-muted uppercase font-black tracking-widest ml-1">Kullanıcı Adı / Email</label>
              <input
                className="input-field"
                placeholder="admin@radiotedu.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-text-muted uppercase font-black tracking-widest ml-1">Şifre</label>
              <input
                type="password"
                className="input-field"
                placeholder="••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <button
              onClick={handleLogin}
              className="btn-primary py-4 mt-2"
              disabled={loading}
            >
              {loading ? 'Giriş Yapılıyor...' : 'GİRİŞ YAP'}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);

const LeaderboardView = ({ leaderboard, onClose }: any) => (
  <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 backdrop-blur-2xl bg-black/80 animate-fade">
    <div className="card w-full max-w-lg border-primary/20 bg-primary/5 p-8 relative overflow-hidden flex flex-col max-h-[80vh]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center border border-primary/30 text-primary">
            <Trophy size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight">Sıralama</h2>
            <p className="text-xs text-text-muted font-bold uppercase tracking-widest">En Çok Katkı Sağlayanlar</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
        {leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20 text-center">
            <Trophy size={48} className="mb-4" />
            <p className="font-bold uppercase tracking-widest">Henüz kimse yok</p>
          </div>
        ) : (
          leaderboard.map((u: any, idx: number) => (
            <div key={u.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${idx === 0 ? 'bg-primary/20 border-primary/30' : 'bg-white/[0.03] border-white/5'}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${idx === 0 ? 'bg-primary text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-600/50 text-white' : 'bg-white/10 text-text-muted'}`}>
                {idx + 1}
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center font-black text-primary border border-white/10">
                {u.display_name.substring(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black truncate text-sm">{u.display_name}</div>
                <div className="text-[10px] text-text-muted font-bold uppercase tracking-widest">{u.total_songs_added} Şarkı</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black text-primary">{u.rank_score}</div>
                <div className="text-[10px] text-primary/50 font-bold uppercase tracking-widest leading-none">Puan</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
);

const MemoizedQueueItem = ({ item, idx, myVotes, handleVote, user }: any) => {
  const currentVote = myVotes[item.id] !== undefined ? myVotes[item.id] : item.user_vote;

  return (
    <div className="group relative flex items-center gap-4 p-3 glass hover:bg-white/5 border border-white/5 rounded-2xl transition-all animate-fade">
      <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-primary rounded-lg flex items-center justify-center text-[10px] font-black shadow-lg shadow-primary/20 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        {idx + 1}
      </div>
      <img src={item.cover_url} className="w-12 h-12 rounded-xl object-cover shadow-md" alt="" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-xs truncate mb-0.5">{item.title}</div>
        <div className="text-[10px] text-text-muted truncate font-semibold uppercase tracking-tight">{item.artist}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-full border border-primary/20">
          <TrendingUp size={10} className="text-primary" />
          <span className="text-[10px] text-primary font-black">{item.priority_score}</span>
        </div>
        {/* Voting Controls */}
        <div className="flex items-center gap-1 mt-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleVote(item.id, 1); }}
            className={`p-1 rounded-md transition-colors ${currentVote === 1 ? 'bg-emerald-500/20 text-emerald-500' : 'text-text-muted hover:bg-emerald-500/20 hover:text-emerald-500'}`}
            title="Upvote"
          >
            <ArrowBigUp size={16} fill={currentVote === 1 ? "currentColor" : "none"} />
          </button>
          <span className="text-[10px] font-bold text-text-muted min-w-[12px] text-center">{item.upvotes - item.downvotes}</span>
          <button
            onClick={(e) => { e.stopPropagation(); handleVote(item.id, -1); }}
            className={`p-1 rounded-md transition-colors ${currentVote === -1 ? 'bg-rose-500/20 text-rose-500' : 'text-text-muted hover:bg-rose-500/20 hover:text-rose-500'}`}
            title="Downvote"
          >
            <ArrowBigDown size={16} fill={currentVote === -1 ? "currentColor" : "none"} />
          </button>

          {/* Super Upvote Button */}
          {!user?.is_guest && (
            <button
              onClick={(e) => { e.stopPropagation(); handleVote(item.id, 1, true); }}
              disabled={user?.last_super_vote_at?.split('T')[0] === new Date().toISOString().split('T')[0]}
              className={`p-1 rounded-md transition-all ${currentVote === 4 ? 'bg-amber-500/30 text-amber-500 scale-110' : 'text-text-muted hover:bg-amber-500/20 hover:text-amber-500 opacity-60 hover:opacity-100'}`}
              title={user?.last_super_vote_at?.split('T')[0] === new Date().toISOString().split('T')[0] ? "Bugün süper oy hakkın bitti" : "Süper Upvote (+4)"}
            >
              <Star size={14} fill={currentVote === 4 ? "currentColor" : "none"} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

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
  myVotes
}: any) => (
  <div className="flex flex-col min-h-screen lg:flex-row w-full max-w-full">
    {/* Global Desktop Sidebar (Mobile Top) */}
    <div className="lg:w-80 glass border-b lg:border-r border-white/5 p-6 flex flex-col z-20 sticky top-0 lg:h-screen lg:shrink-0">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
          <Music size={20} color="white" />
        </div>
        <div>
          <h1 className="font-black text-xl tracking-tighter">Jukebox<span className="text-primary">.</span></h1>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{device?.name}</span>
          </div>
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
        <input
          className="input-field pl-11 h-12 text-sm font-medium"
          placeholder="Şarkı veya Sanatçı Ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && searchSongs()}
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
        {results.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-2 mt-4 ml-1">
              <h2 className="text-[10px] font-black text-text-muted uppercase tracking-[2px]">Arama Sonuçları</h2>
              <div className="flex gap-4">
                <button onClick={() => setSearch('')} className="text-[10px] font-bold text-primary">Temizle</button>
              </div>
            </div>
            {results.map((song: any) => (
              <div
                key={song.id}
                className="group flex items-center gap-3 p-2 bg-white/[0.03] hover:bg-primary/10 border border-white/5 hover:border-primary/30 rounded-2xl transition-all cursor-pointer animate-fade"
                onClick={() => addToQueue(song.id)}
              >
                <img src={song.cover_url} className="w-10 h-10 rounded-lg object-cover shadow-sm group-hover:scale-105 transition-transform" alt="" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-xs truncate group-hover:text-primary transition-colors">{song.title}</div>
                  <div className="text-[10px] text-text-muted truncate font-medium">{song.artist}</div>
                </div>
                <div className="w-8 h-8 rounded-full flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                  <Plus size={16} />
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="hidden lg:flex flex-col items-center justify-center h-48 text-center px-4">
            <Trophy size={48} className="text-primary/20 mb-4 cursor-pointer hover:scale-110 transition-transform" onClick={onShowLeaderboard} />
            <p className="text-xs text-text-muted font-medium mb-4">TEDU kütüphanesinden dilediğin şarkıyı ara.</p>
            <button
              onClick={onShowLeaderboard}
              className="px-4 py-2 glass border-primary/30 rounded-xl text-[10px] font-black text-primary uppercase tracking-widest hover:bg-primary/10 transition-colors"
            >
              Sıralamayı Gör
            </button>
          </div>
        )}
      </div>

      {/* User Info Card */}
      <div className="mt-6 pt-6 border-t border-white/5 space-y-4">
        {user?.role === 'admin' && (
          <AdminDashboard
            token={localStorage.getItem('token') || ''}
            device={device}
            onSelectDevice={setDevice}
          />
        )}

        <div className="flex items-center justify-between p-3 glass rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center font-black text-primary shadow-inner relative">
              {user?.display_name.substring(0, 1).toUpperCase()}
              {!user?.is_guest && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-background">
                  <Trophy size={8} className="text-white" />
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-black">{user?.display_name}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-text-muted uppercase font-bold tracking-widest">{user?.role === 'admin' ? 'Yönetici' : user?.is_guest ? 'Misafir' : 'Dinleyici'}</span>
                {!user?.is_guest && user?.rank_score !== undefined && (
                  <span className="text-[10px] font-black text-emerald-500 flex items-center gap-0.5">
                    • {user.rank_score} <span className="text-[8px] opacity-70">Puan</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={logout} className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors" title="Çıkış">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>

    {/* Main Player & Queue Area */}
    <div className="flex-1 flex flex-col h-full lg:h-screen lg:overflow-hidden bg-decor-dots">
      <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden">

        {/* Now Playing Section */}
        <div className="flex-1 p-8 flex flex-col items-center justify-center relative overflow-hidden">
          {nowPlaying ? (
            <div className="max-w-md w-full text-center space-y-8 animate-fade">
              <div className="relative inline-block group">
                <div className="absolute inset-0 bg-primary blur-[60px] opacity-30 group-hover:opacity-50 transition-opacity"></div>
                <div className="relative">
                  <img
                    src={nowPlaying.cover_url}
                    className="w-56 h-56 lg:w-80 lg:h-80 rounded-[40px] shadow-2xl object-cover ring-1 ring-white/10"
                    alt=""
                  />
                  <div className="absolute inset-x-0 -bottom-4 flex justify-center gap-2">
                    <div className="px-6 py-2 glass rounded-full flex items-center gap-3 shadow-xl border-primary/20">
                      <Disc className="text-primary" size={16} />
                      <span className="text-[10px] font-black tracking-widest uppercase">Şu An Çalıyor</span>
                    </div>
                    <button
                      onClick={() => device && fetchCurrentQueue(device.id)}
                      className="w-10 h-10 glass rounded-full flex items-center justify-center text-primary/50 hover:text-primary transition-colors shadow-lg border border-primary/20"
                      title="Senkronize Et"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h1 className="text-2xl lg:text-5xl font-black tracking-tighter leading-tight">{nowPlaying.title}</h1>
                <p className="text-lg lg:text-2xl text-primary font-bold">{nowPlaying.artist}</p>

                <div className="w-full max-w-xs mx-auto space-y-2 py-4 relative">
                  {/* Kiosk Sync Status */}
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] bg-emerald-500/20 p-1 px-3 rounded-full border border-emerald-500/30 text-emerald-400 font-black tracking-tighter flex items-center gap-1.5 opacity-60">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div>
                    KIOSK CANLI
                  </div>

                  <div className="flex justify-between text-[10px] font-black tracking-widest text-text-muted uppercase">
                    <span>{formatTime(interpolatedProgress)}</span>
                    <span>{formatTime(progress?.duration || nowPlaying.duration_seconds || 0)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary-hover shadow-[0_0_10px_rgba(227,30,38,0.5)] transition-all duration-1000 ease-linear"
                      style={{
                        width: `${Math.min(100, (interpolatedProgress / (progress?.duration || nowPlaying.duration_seconds || 1)) * 100)}%`
                      }}
                    ></div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <div className="flex -space-x-2">
                    <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center"><User size={10} className="text-primary" /></div>
                  </div>
                  <span className="text-xs text-text-muted font-bold tracking-tight">İsteyen: <span className="text-white">{nowPlaying.added_by_name}</span></span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 glass rounded-full flex items-center justify-center mx-auto opacity-20">
                <Disc size={40} className="text-white" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-black">Müzik Sırası Boş</h2>
                <p className="text-sm text-text-muted font-medium">Hemen bir şarkı ara ve kampüste yankılansın!</p>
              </div>
            </div>
          )}
        </div>

        {/* Queue Column (Desktop Right) */}
        <div className="lg:w-96 flex flex-col p-6 lg:h-full lg:overflow-hidden bg-white/[0.02] lg:border-l border-white/5">
          <div className="flex items-center justify-between mb-6 px-1">
            <div className="flex items-center gap-2">
              <ListMusic size={18} className="text-primary" />
              <h2 className="text-sm font-black tracking-widest uppercase">SIRADAKİLER</h2>
            </div>
            <div className="px-3 py-1 glass rounded-full text-[10px] font-black text-primary border-primary/20">
              {queue.length} PARÇA
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 px-1">
            {queue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                <TrendingUp size={48} className="mb-4" />
                <p className="text-xs font-bold uppercase tracking-widest">Kuyruk Bekleniyor</p>
              </div>
            ) : (
              queue.map((item: any, idx: number) => (
                <MemoizedQueueItem
                  key={item.id}
                  item={item}
                  idx={idx}
                  myVotes={myVotes}
                  handleVote={handleVote}
                  user={user}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Guest Toast / Info Bar (Mobile Bottom) */}
      {user?.is_guest && (
        <div className="lg:hidden fixed bottom-6 left-6 right-6 p-4 glass border-primary/30 rounded-3xl shadow-2xl flex items-center justify-between z-50 animate-fade">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
              <User size={20} className="text-primary" />
            </div>
            <div>
              <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-0.5">Misafir Modu</div>
              <div className="text-sm font-black">{user.total_songs_added >= 1 ? 'Hakkın Doldu' : '1 şarkı hakkın var'}</div>
            </div>
          </div>
          {user.total_songs_added >= 1 ? (
            <button onClick={logout} className="px-5 py-2.5 bg-primary rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20">Üye Ol</button>
          ) : (
            <div className="px-3 py-1 bg-emerald-500/20 text-emerald-500 text-[10px] rounded-full font-black uppercase tracking-widest border border-emerald-500/30">Aktif</div>
          )}
        </div>
      )}
    </div>
  </div>
);

function App() {
  const [deviceCode, setDeviceCode] = useState('');
  const [deviceCodeInput, setDeviceCodeInput] = useState('');
  const [device, setDevice] = useState<any>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [guestName, setGuestName] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [nowPlaying, setNowPlaying] = useState<any>(null);
  const [progress, setProgress] = useState<{ currentTime: number, duration: number, percent: number } | null>(null);
  const [interpolatedProgress, setInterpolatedProgress] = useState<number>(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});

  // Use a ref for the interceptor to avoid stale closures
  const deviceRef = useRef<any>(null);
  useEffect(() => {
    deviceRef.current = device;
  }, [device]);


  // Login States
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Initialize from URL
  useEffect(() => {
    if (msg) {
      const timer = setTimeout(() => setMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [msg]);

  // Smooth progress interpolation
  useEffect(() => {
    let timer: any;
    if (progress) {
      // Set initial value from kiosk
      setInterpolatedProgress(progress.currentTime);

      // Increment locally every second
      timer = setInterval(() => {
        setInterpolatedProgress(prev => {
          if (prev < progress.duration) return prev + 1;
          return prev;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [progress]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setDeviceCode(code);
    }

    // Check localStorage for user
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined' && savedUser !== 'null') {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        // If we have a code and a user, try to connect automatically
        if (code) connectToDevice(code);
      } catch (e) {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
  }, []);

  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Expose toggle to sub-components via window for simplicity (not ideal but works here)
  useEffect(() => {
    (window as any).toggleLeaderboard = () => {
      fetchLeaderboard();
      setShowLeaderboard(true);
    };
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/v1/users/leaderboard`);
      setLeaderboard(res.data.data.leaderboard || []);
    } catch (err) {
      console.error('Leaderboard fetch failed:', err);
    }
  };

  // Axios Interceptor for 401 errors
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.warn('Session expired or invalid token');
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          setUser(null);
          setMsg({ type: 'error', text: 'Oturum süreniz doldu. Lütfen tekrar giriş yapın.' });
        }

        // Handle Session Requirement for Devices
        if (error.response?.data?.code === 'SESSION_REQUIRED') {
          console.warn('🔒 [SECURITY] Session required or invalidated by admin');

          // Use ref to get the current device even in this stale closure
          const currentDevice = deviceRef.current;

          // SILENT RE-CONNECT: If we have a current device we try to re-connect automatically once to restore the session.
          if (currentDevice?.device_code) {
            console.log('🔄 Attempting silent re-connect to restore session for', currentDevice.device_code);
            connectToDevice(currentDevice.device_code);
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    );

    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  // Socket Connection Management
  useEffect(() => {
    if (!device) return;

    if (!socket) {
      console.log('🚀 Initializing socket connection to:', API_URL);
      const newSocket = io(API_URL, {
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        transports: ['websocket', 'polling']
      });
      setSocket(newSocket);

      return () => {
        console.log('🔌 Cleaning up socket...');
        newSocket.disconnect();
        setSocket(null);
      };
    }
  }, [device?.id]); // Only re-run if the device changes

  // Socket Events & Room Management
  useEffect(() => {
    if (socket && device) {
      const handleConnect = () => {
        console.log('✅ Socket connected, joining room:', device.id);
        socket.emit('join_device', device.id);
        fetchCurrentQueue(device.id);
      };

      if (socket.connected) {
        handleConnect();
      }

      socket.on('connect', handleConnect);

      // DEBUG: Log ALL incoming events
      socket.onAny((eventName, ...args) => {
        console.log(`🔍 [SOCKET EVENT] ${eventName}:`, args);
      });

      socket.on('queue_updated', (data: any) => {
        console.log('📋 Queue update:', data);
        setQueue(data.queue);
        setNowPlaying(data.now_playing);
        setProgress(null);

        // Sync myVotes from incoming data ONLY if it contains user_vote info
        // General broadcasts from server will omit user_vote to prevent resetting local state
        const newVotes: Record<string, number> = {};

        if (data.now_playing && data.now_playing.user_vote !== undefined) {
          newVotes[data.now_playing.id] = data.now_playing.user_vote;
        }

        data.queue.forEach((item: any) => {
          if (item.user_vote !== undefined) {
            newVotes[item.id] = item.user_vote;
          }
        });

        if (Object.keys(newVotes).length > 0) {
          console.log('🗳️ Syncing votes from server:', newVotes);
          setMyVotes(prev => ({ ...prev, ...newVotes }));
        }
      });

      socket.on('force_logout', () => {
        console.warn('⚠️ Force logout received from server');

        // Don't affect admins at all
        if (user?.role === 'admin') {
          console.log('🛡️ Admin detected, ignoring force_logout signal completely');
          return;
        }

        // For regular users, kick them out
        setDevice(null);
        setMsg({ type: 'error', text: 'Cihaz oturumunuz admin tarafından sonlandırıldı.' });
      });

      socket.on('playback_progress', (data: any) => {
        console.info('⏱️ Progress data received:', data.currentTime);
        setProgress(data);
      });

      socket.on('song_skipped', () => {
        console.log('⏭️ Song skipped, refreshing...');
        fetchCurrentQueue(device.id);
      });

      return () => {
        socket.off('connect', handleConnect);
        socket.off('queue_updated');
        socket.off('playback_progress');
        socket.off('song_skipped');
        if (device) socket.emit('leave_device', device.id);
      };
    }
  }, [socket, device?.id]);

  // Fetch queue when device changes
  useEffect(() => {
    if (device?.id) {
      fetchCurrentQueue(device.id);
    }
  }, [device?.id]);

  const fetchCurrentQueue = async (deviceId: string) => {
    try {
      const res = await axios.get(`${API_URL}/api/v1/jukebox/queue/${deviceId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      // The API returns { now_playing: ..., queue: [...] }
      setQueue(res.data.queue || []);
      setNowPlaying(res.data.now_playing || null);

      // Sync myVotes also on manual refresh/fetch
      const refreshedVotes: Record<string, number> = {};
      if (res.data.now_playing?.user_vote !== undefined) refreshedVotes[res.data.now_playing.id] = res.data.now_playing.user_vote;
      res.data.queue.forEach((item: any) => {
        if (item.user_vote !== undefined) refreshedVotes[item.id] = item.user_vote;
      });
      setMyVotes(prev => ({ ...prev, ...refreshedVotes }));
    } catch (err) {
      console.error('Failed to sync queue:', err);
    }
  };

  const connectToDevice = async (code: string) => {
    if (!code) return;
    try {
      setLoading(true);
      const res = await axios.post(`${API_URL}/api/v1/jukebox/connect`, {
        device_code: code
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      const responseData = res.data.data;

      setDevice(responseData.device);
      setQueue(responseData.queue.queue);
      setNowPlaying(responseData.queue.now_playing);
      setMsg({ type: 'success', text: `${responseData.device.name} cihazına bağlanıldı!` });
      setDeviceCode(code);

      // Sync myVotes from initial fetch
      const initialVotes: Record<string, number> = {};
      if (responseData.queue.now_playing?.user_vote !== undefined) initialVotes[responseData.queue.now_playing.id] = responseData.queue.now_playing.user_vote;
      responseData.queue.queue.forEach((item: any) => {
        if (item.user_vote !== undefined) initialVotes[item.id] = item.user_vote;
      });
      setMyVotes(initialVotes);
    } catch (err: any) {
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

      // If we already have a deviceCode in state, connect automatically
      if (deviceCode) {
        connectToDevice(deviceCode);
      }
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
      setUser(res.data.data.user);
      localStorage.setItem('token', res.data.data.access_token);
      localStorage.setItem('user', JSON.stringify(res.data.data.user));
      setGuestName('');
      setShowLoginModal(false);

      // Auto-connect after login if we have a code
      const currentCode = deviceCode || deviceCodeInput;
      if (currentCode) {
        connectToDevice(currentCode);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Giriş yapılamadı.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (queueItemId: string, voteType: number, isSuper: boolean = false) => {
    if (!device) return;
    try {
      const response = await axios.post(`${API_URL}/api/v1/jukebox/vote`, {
        queue_item_id: queueItemId,
        vote: voteType,
        device_id: device.id,
        is_super: isSuper
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (isSuper && user) {
        setUser({ ...user, last_super_vote_at: new Date().toISOString() });
      }

      const serverUserVote = response.data.data.user_vote;

      // Update local myVotes with server confirmation
      setMyVotes(prev => {
        if (serverUserVote === 0) {
          const newState = { ...prev };
          delete newState[queueItemId];
          return newState;
        }
        return { ...prev, [queueItemId]: serverUserVote };
      });
    } catch (err: any) {
      console.error('Vote failed:', err);
      setMsg({ type: 'error', text: err.response?.data?.message || 'Oy verme başarısız oldu.' });
    }
  };

  const logout = async () => {
    // Store device code before clearing
    const savedDeviceCode = device?.device_code || deviceCode;

    // Call backend to delete session (requires password on reconnect)
    if (device?.id) {
      try {
        await axios.post(`${API_URL}/api/v1/jukebox/disconnect`,
          { device_id: device.id },
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        );
        console.log('🔐 Session deleted from server');
      } catch (err) {
        console.warn('Failed to delete session:', err);
      }

      // Clear cached password for this device
      localStorage.removeItem(`device_pwd_${device.device_code}`);

      // Emit leave signal
      if (socket) {
        socket.emit('leave_device', device.id);
        console.log('📤 Sent leave_device for', device.id);
      }
    }

    // Clear state but keep device code for re-entry
    setUser(null);
    setDevice(null);
    setQueue([]);
    setNowPlaying(null);

    // Clear auth data
    localStorage.removeItem('user');
    localStorage.removeItem('token');

    // Clear state but keep device code for re-entry
    if (savedDeviceCode) {
      setDeviceCode(savedDeviceCode);
      setDeviceCodeInput(savedDeviceCode);
    }
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

      if (user.is_guest) {
        setUser({ ...user, total_songs_added: user.total_songs_added + 1 });
      }
    } catch (err: any) {
      const resp = err.response?.data;
      if (resp?.code === 'GUEST_LIMIT_REACHED') {
        setMsg({ type: 'error', text: 'Misafir limitin doldu! Daha fazla şarkı için giriş yapmalısın.' });
        setShowLoginModal(true);
      } else {
        setMsg({ type: 'error', text: resp?.message || 'Şarkı eklenemedi.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-black min-h-screen text-white font-sans overflow-x-hidden relative flex flex-col items-center">
      <div className="bg-decor">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      <div className="app-container w-full">
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
              fetchLeaderboard();
              setShowLeaderboard(true);
            }}
            myVotes={myVotes}
          />
        )}

        {/* Leaderboard Modal */}
        {showLeaderboard && (
          <LeaderboardView
            leaderboard={leaderboard}
            onClose={() => setShowLeaderboard(false)}
          />
        )}


        {/* Toast Notification */}
        {msg && (
          <div className={`fixed bottom-24 lg:bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-sm p-5 rounded-3xl shadow-2xl flex items-center gap-4 z-[100] backdrop-blur-2xl border transition-all animate-fade ${msg.type === 'success' ? 'bg-emerald-500/80 border-emerald-400/30' : 'bg-rose-500/80 border-rose-400/30'}`}>
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              {msg.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">{msg.type === 'success' ? 'Başarılı' : 'Hata'}</div>
              <div className="text-sm font-black leading-tight">{msg.text}</div>
            </div>
            <button onClick={() => setMsg(null)} className="p-2 opacity-50 hover:opacity-100 transition-opacity">✕</button>
          </div>
        )}
      </div>

      <style>{`
        .bg-decor-dots {
          background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 30px 30px;
        }
      `}</style>
    </div>
  );
}

export default App;
