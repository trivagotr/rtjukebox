/**
 * RadioTEDU Kiosk Web Application
 * Premium Jukebox Display System
 */

class KioskApp {
    constructor() {
        this.socket = null;
        this.device = null;
        this.queueData = { now_playing: null, queue: [] };
        this.audioPlayer = document.getElementById('audioPlayer');
        this.progressInterval = null;
        this.isPlaying = false;
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.waveformCtx = this.waveformCanvas?.getContext('2d');

        // Autoplay Logic
        this.autoplayTriggered = false;

        // Debug Log
        this.logs = [];
        this.debugEl = this.createDebugOverlay();

        this.init();
    }

    log(msg, type = 'info') {
        const entry = { time: new Date().toLocaleTimeString(), msg, type };
        console.log(`[${entry.time}] [${type}] ${msg}`);
        this.logs.unshift(entry);
        this.updateDebugOverlay();
    }

    createDebugOverlay() {
        const div = document.createElement('div');
        div.id = 'debugOverlay';
        div.style = 'position:fixed; bottom:10px; left:10px; width:300px; max-height:200px; background:rgba(0,0,0,0.8); color:#0f0; font-size:10px; padding:10px; overflow-y:auto; z-index:9999; border-radius:8px; display:none; pointer-events:none;';
        document.body.appendChild(div);

        // Toggle with 'D' key
        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'd') {
                div.style.display = div.style.display === 'none' ? 'block' : 'none';
            }
        });
        return div;
    }

    updateDebugOverlay() {
        if (!this.debugEl) return;
        this.debugEl.innerHTML = '<b>Debug (Press D to Toggle)</b><br>' +
            this.logs.slice(0, 20).map(l => `<span style="color:${l.type === 'error' ? 'red' : 'inherit'}">[${l.time}] ${l.msg}</span>`).join('<br>');
    }

    // ===== Initialization =====
    async init() {
        console.log('🎵 RadioTEDU Kiosk başlatılıyor...');

        // Setup canvas size
        this.setupWaveform();

        // Generate QR Code
        this.generateQRCode();

        // Setup audio player events
        this.setupAudioPlayer();

        // Connect to server
        await this.registerDevice();
        this.connectSocket();

        // Setup fullscreen on double click
        this.setupFullscreenToggle();

        // Interaction Overlay
        this.showStartupOverlay();

        // Setup window resize handler
        window.addEventListener('resize', () => this.setupWaveform());
    }

    showStartupOverlay() {
        const div = document.createElement('div');
        div.id = 'startupOverlay';
        div.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:10000; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; backdrop-filter:blur(10px);';
        div.innerHTML = `
            <div style="font-size:80px; margin-bottom:20px; animation: pulse 2s infinite">🎵</div>
            <h2 style="color:white; margin:0">Jukebox'u Başlatmak İçın Tıklayın</h2>
            <p style="color:rgba(255,255,255,0.5); margin-top:10px;">Tarayıcı ses kısıtlamasını aşmak için gereklidir</p>
        `;
        div.onclick = () => {
            div.remove();
            this.log('🚀 Jukebox kullanıcı tarafından başlatıldı');
            this.checkAndPlayNext();
        };
        document.body.appendChild(div);
    }

    // ===== Waveform Visualization =====
    setupWaveform() {
        if (!this.waveformCanvas) return;

        const rect = this.waveformCanvas.parentElement.getBoundingClientRect();
        this.waveformCanvas.width = rect.width;
        this.waveformCanvas.height = rect.height;
        this.drawWaveform();
    }

    drawWaveform() {
        if (!this.waveformCtx) return;

        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;

        ctx.clearRect(0, 0, width, height);

        // Draw fake waveform bars
        const barCount = 80;
        const barWidth = width / barCount - 2;
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#a855f7');
        gradient.addColorStop(0.5, '#ec4899');
        gradient.addColorStop(1, '#a855f7');

        ctx.fillStyle = gradient;

        for (let i = 0; i < barCount; i++) {
            const barHeight = Math.random() * (height * 0.7) + height * 0.15;
            const x = i * (barWidth + 2);
            const y = (height - barHeight) / 2;

            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 2);
            ctx.fill();
        }
    }

    // ===== QR Code =====
    generateQRCode() {
        const qrContainer = document.getElementById('qrCode');
        const qrLink = CONFIG.QR_LINK_FORMAT.replace('{DEVICE_CODE}', CONFIG.DEVICE_CODE);

        this.log(`🔗 QR Linki: ${qrLink}`);

        // Set initial state
        qrContainer.innerHTML = '<div style="font-size:10px">QR Yükleniyor...</div>';

        // Direct Text Link (Always visible)
        const hint = document.querySelector('.qr-hint');
        if (hint) {
            hint.innerHTML = `Tarayın veya adresi girin:<br>
            <a href="${qrLink}" style="color:var(--accent-red); text-decoration:none; font-weight:bold; word-break:break-all; display:block; margin-top:5px;">${qrLink}</a>`;
        }

        if (typeof QRCode !== 'undefined') {
            QRCode.toCanvas(document.createElement('canvas'), qrLink, {
                width: 200,
                margin: 2,
                color: { dark: '#1a1a2e', light: '#ffffff' }
            }, (error, canvas) => {
                if (!error) {
                    this.log('✅ QR Code (JS) başarıyla oluşturuldu');
                    qrContainer.innerHTML = '';
                    qrContainer.appendChild(canvas);
                    canvas.style.width = '100%';
                    canvas.style.height = '100%';
                    canvas.style.borderRadius = '12px';
                    return;
                }
                this.log(`⚠️ QR JS Hatası: ${error.message}`, 'error');
                this.useQRFallback(qrLink);
            });
        } else {
            this.log('⚠️ QRCode kütüphanesi bulunamadı, API deneniyor', 'error');
            this.useQRFallback(qrLink);
        }
    }

    useQRFallback(link) {
        const qrContainer = document.getElementById('qrCode');
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(link)}`;

        const img = new Image();
        img.src = qrApiUrl;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '12px';
        img.onload = () => {
            this.log('✅ QR Code (API) başarıyla yüklendi');
            qrContainer.innerHTML = '';
            qrContainer.appendChild(img);
        };
        img.onerror = () => {
            this.log('❌ QR API de başarısız!', 'error');
            qrContainer.innerHTML = '<div style="font-size:12px; color:red">QR Yüklenemedi</div>';
        };
    }

    // ===== Device Registration =====
    async registerDevice() {
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_code: CONFIG.DEVICE_CODE })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(`Registration failed (${response.status}): ${errData.error || 'Unknown'}`);
            }

            const data = await response.json();

            // Backend sends { success: true, data: { device: ... } }
            const deviceData = data.data ? data.data.device : data.device;

            if (!deviceData) {
                throw new Error('Device data missing in response');
            }

            this.device = deviceData;

            // Update UI
            const locationEl = document.getElementById('deviceLocation');
            if (locationEl) {
                locationEl.textContent = this.device.location || this.device.name || CONFIG.DEVICE_CODE;
            }

            this.log('✅ Cihaz kayıtlı:', this.device);

        } catch (error) {
            this.log(`❌ Kayıt hatası: ${error.message}`, 'error');
            this.updateConnectionStatus('error', 'Bağlantı hatası');

            // Helpful debug for user
            const qrContainer = document.getElementById('qrCode');
            if (qrContainer && qrContainer.innerHTML.includes('Oluşturuluyor')) {
                qrContainer.innerHTML = `<div style="font-size:10px; color:gray">Backend'e ulaşılamıyor:<br>${CONFIG.API_URL}</div>`;
            }
            // Retry after delay
            setTimeout(() => this.registerDevice(), CONFIG.RECONNECT_INTERVAL);
        }
    }

    // ===== WebSocket Connection =====
    connectSocket() {
        if (typeof io === 'undefined') {
            console.warn('Socket.IO library not loaded');
            return;
        }

        this.socket = io(CONFIG.WS_URL);

        this.socket.on('connect', () => {
            this.log('🔌 Socket bağlandı');
            this.updateConnectionStatus('connected', 'Bağlı');

            if (this.device) {
                this.socket.emit('join_device', this.device.id);
                this.log(`🏠 ${this.device.id} odasına katıldı`);
                this.loadInitialQueue();
            }
        });

        this.socket.on('disconnect', () => {
            console.log('🔌 Socket bağlantısı kesildi');
            this.updateConnectionStatus('error', 'Bağlantı kesildi');
        });

        this.socket.on('queue_updated', (data) => {
            console.log('📋 Kuyruk güncellendi:', data);
            this.queueData = data;
            this.renderQueue();
            this.checkAndPlayNext();
        });

        this.socket.on('song_skipped', () => {
            console.log('⏭️ Şarkı atlandı');
            this.playNextFromQueue();
        });
    }

    // ===== Load Initial Queue =====
    async loadInitialQueue() {
        if (!this.device) return;

        try {
            const response = await fetch(`${CONFIG.API_URL}/api/v1/jukebox/queue/${this.device.id}`);
            if (!response.ok) throw new Error('Queue fetch failed');

            this.queueData = await response.json();
            this.renderQueue();
            this.checkAndPlayNext();

        } catch (error) {
            console.error('Kuyruk yüklenemedi:', error);
        }
    }

    // ===== Audio Player Setup =====
    setupAudioPlayer() {
        this.audioPlayer.addEventListener('ended', () => {
            console.log('🎵 Şarkı bitti');
            this.playNextFromQueue();
        });

        this.audioPlayer.addEventListener('error', (e) => {
            // Don't retry if we deliberately cleared the source (stopPlayback)
            if (!this.audioPlayer.src || this.audioPlayer.src.includes('://:')) return;

            console.error('Audio error:', e);
            setTimeout(() => this.playNextFromQueue(), 2000);
        });

        this.audioPlayer.addEventListener('playing', () => {
            this.isPlaying = true;
            this.startProgressUpdate();
        });

        this.audioPlayer.addEventListener('pause', () => {
            this.isPlaying = false;
            this.stopProgressUpdate();
        });

        this.audioPlayer.addEventListener('loadedmetadata', () => {
            this.updateProgress();
        });
    }

    // ===== Playback Control =====
    checkAndPlayNext() {
        if (document.getElementById('startupOverlay')) {
            this.log('⏳ Başlatma bekleniyor (Tıklayın)...');
            return;
        }

        if (!this.isPlaying && this.queueData.now_playing) {
            this.playSong(this.queueData.now_playing);
        } else if (!this.isPlaying && this.queueData.queue && this.queueData.queue.length > 0) {
            this.playSong(this.queueData.queue[0]);
        }
    }

    playNextFromQueue() {
        if (this.queueData.queue && this.queueData.queue.length > 0) {
            this.playSong(this.queueData.queue[0]);
        } else {
            this.log('🔄 Kuyruk bitti, durum güncelleniyor...');
            // Notify server we finished
            this.stopPlayback();

            // Wait for DB update then reload (which will trigger autoplay if empty)
            setTimeout(() => {
                this.loadInitialQueue();
            }, 1000);
        }
    }

    async playSong(song) {
        console.log('▶️ Çalınıyor:', song.title);
        this.isPlaying = true; // Lock immediately

        try {
            // Ensure URL is absolute
            let audioUrl = song.file_url;

            // Reset autoplay flag for new song
            this.autoplayTriggered = false;
            if (audioUrl.startsWith('/')) {
                audioUrl = CONFIG.API_URL + audioUrl;
            }

            // Prevent loop: Don't re-play if same URL is already playing
            if (this.audioPlayer.src.includes(audioUrl) && this.isPlaying) {
                console.log('⏭️ Şarkı zaten çalıyor, atlandı');
                return;
            }

            // LOCK: Set isPlaying immediately to prevent other triggers while loading
            this.isPlaying = true;
            this.audioPlayer.src = audioUrl;

            const playPromise = this.audioPlayer.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.log('✅ Çalma başladı');
                    this.showPlayingState(song);
                }).catch(error => {
                    this.isPlaying = false; // Reset on failure
                    this.log(`❌ Çalma başarısız: ${error.message}`, 'error');
                    if (error.name === 'NotAllowedError') {
                        this.log('👉 Lütfen ekrana bir kez tıklayın!');
                        this.showStartupOverlay();
                    }
                });
            }

            // Notify server
            if (this.device) {
                fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/now-playing`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        device_id: this.device.id,
                        song_id: song.song_id || (song.id.includes('autoplay') ? song.id.split('autoplay-')[1] : song.id)
                    })
                }).catch(e => this.log(`⚠️ Sunucu bildirim hatası: ${e.message}`, 'error'));
            }

        } catch (error) {
            this.log(`❌ Beklenmedik hata: ${error.message}`, 'error');
        }
    }

    stopPlayback() {
        this.audioPlayer.pause();
        this.audioPlayer.src = '';
        this.isPlaying = false;
        this.showIdleState();

        if (this.device) {
            fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/now-playing`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: this.device.id,
                    song_id: null
                })
            });
        }
    }

    // ===== Progress Bar =====
    startProgressUpdate() {
        this.stopProgressUpdate();
        this.progressInterval = setInterval(() => this.updateProgress(), CONFIG.PROGRESS_UPDATE_INTERVAL);
    }

    stopProgressUpdate() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    updateProgress() {
        const current = this.audioPlayer.currentTime;
        const total = this.audioPlayer.duration || 0;
        const percent = total > 0 ? (current / total) * 100 : 0;

        // Check for Autoplay Trigger (80% Rule)
        // If 80% played, queue is empty, and we haven't triggered yet
        if (total > 0 && percent > 80 && this.queueData.queue.length === 0 && !this.autoplayTriggered) {
            console.log('⏳ 80% Kuralı: Otomatik sonraki şarkı tetikleniyor...');
            this.autoplayTriggered = true;

            if (this.device) {
                fetch(`${CONFIG.API_URL}/api/v1/jukebox/autoplay/trigger`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ device_id: this.device.id })
                }).then(r => r.json())
                    .then(d => this.log(`🤖 Otomatik eklendi: ${d.data?.song_title || 'Şarkı'}`))
                    .catch(e => console.error(e));
            }
        }

        // Update progress overlay
        const overlay = document.getElementById('progressOverlay');
        if (overlay) {
            overlay.style.width = `${percent}%`;
        }

        // Update time display
        document.getElementById('currentTime').textContent = this.formatTime(current);
        document.getElementById('totalTime').textContent = this.formatTime(total);
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // ===== UI Updates =====
    showPlayingState(song) {
        document.getElementById('idleState').classList.add('hidden');
        document.getElementById('playingState').classList.remove('hidden');

        // Album art
        const albumArt = document.getElementById('albumArt');
        albumArt.src = song.cover_url || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%231a1a2e" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%23666" font-size="30">🎵</text></svg>';

        // Update glow color based on album (could be dynamic)
        const glow = document.getElementById('albumGlow');
        if (glow) {
            glow.style.background = `radial-gradient(circle, #a855f7 0%, transparent 70%)`;
        }

        // Song info
        document.getElementById('songTitle').textContent = song.title;
        document.getElementById('songArtist').textContent = song.artist;
        document.getElementById('songRequester').textContent = song.added_by_name || 'Anonim';

        // Show live indicator
        document.getElementById('liveIndicator').style.display = 'flex';

        // Redraw waveform
        this.drawWaveform();
    }

    showIdleState() {
        document.getElementById('idleState').classList.remove('hidden');
        document.getElementById('playingState').classList.add('hidden');

        // Hide live indicator
        document.getElementById('liveIndicator').style.display = 'none';

        // Reset progress
        const overlay = document.getElementById('progressOverlay');
        if (overlay) overlay.style.width = '0%';
        document.getElementById('currentTime').textContent = '0:00';
        document.getElementById('totalTime').textContent = '0:00';
    }

    renderQueue() {
        const queueList = document.getElementById('queueList');
        const queueCount = document.getElementById('queueCount');
        const queue = this.queueData.queue || [];

        queueCount.textContent = queue.length;

        if (queue.length === 0) {
            queueList.innerHTML = `
                <div class="empty-queue">
                    <span class="material-symbols-rounded">playlist_add</span>
                    <p>Kuyruk boş</p>
                    <span class="empty-hint">İlk şarkıyı siz ekleyin!</span>
                </div>
            `;
            return;
        }

        // Show max 6 items for better visibility
        const displayQueue = queue.slice(0, 6);

        queueList.innerHTML = displayQueue.map((song, index) => {
            const voteScore = (song.upvotes || 0) - (song.downvotes || 0);
            const voteClass = voteScore < 0 ? 'negative' : '';
            const voteIcon = voteScore >= 0 ? 'trending_up' : 'trending_down';

            return `
                <div class="queue-item">
                    <span class="queue-position">${index + 1}</span>
                    <div class="queue-song-info">
                        <div class="queue-song-title">${this.escapeHtml(song.title)}</div>
                        <div class="queue-song-artist">${this.escapeHtml(song.artist)}</div>
                    </div>
                    <div class="queue-votes ${voteClass}">
                        <span class="material-symbols-rounded">${voteIcon}</span>
                        ${voteScore > 0 ? '+' : ''}${voteScore}
                    </div>
                </div>
            `;
        }).join('');
    }

    updateConnectionStatus(status, text) {
        const badge = document.getElementById('connectionBadge');
        const icon = document.getElementById('connectionIcon');
        const textEl = document.getElementById('connectionText');

        badge.className = 'connection-badge';

        if (status === 'connected') {
            badge.classList.add('connected');
            icon.textContent = 'wifi';
        } else if (status === 'error') {
            badge.classList.add('error');
            icon.textContent = 'wifi_off';
        } else {
            icon.textContent = 'wifi_find';
        }

        textEl.textContent = text;
    }

    // ===== Fullscreen =====
    setupFullscreenToggle() {
        document.addEventListener('dblclick', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log('Fullscreen error:', err);
                });
            } else {
                document.exitFullscreen();
            }
        });

        document.addEventListener('fullscreenchange', () => {
            document.querySelector('.kiosk-app').classList.toggle('fullscreen', !!document.fullscreenElement);
        });
    }

    // ===== Utilities =====
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.kioskApp = new KioskApp();
});
