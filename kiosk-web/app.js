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

        this.init();
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

        // Setup window resize handler
        window.addEventListener('resize', () => this.setupWaveform());
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

        if (typeof QRCode === 'undefined') {
            console.warn('QRCode library not loaded');
            return;
        }

        QRCode.toCanvas(document.createElement('canvas'), qrLink, {
            width: 160,
            margin: 0,
            color: {
                dark: '#1a1a2e',
                light: '#ffffff'
            }
        }, (error, canvas) => {
            if (error) {
                console.error('QR Code error:', error);
                return;
            }
            qrContainer.innerHTML = '';
            qrContainer.appendChild(canvas);
        });
    }

    // ===== Device Registration =====
    async registerDevice() {
        try {
            const response = await fetch(`${CONFIG.API_URL}/jukebox/kiosk/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_code: CONFIG.DEVICE_CODE })
            });

            if (!response.ok) throw new Error('Registration failed');

            const data = await response.json();
            this.device = data.device;

            // Update UI
            document.getElementById('deviceLocation').textContent =
                this.device.location || this.device.name || CONFIG.DEVICE_CODE;

            console.log('✅ Cihaz kayıtlı:', this.device);

        } catch (error) {
            console.error('❌ Kayıt hatası:', error);
            this.updateConnectionStatus('error', 'Bağlantı hatası');

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
            console.log('🔌 Socket bağlandı');
            this.updateConnectionStatus('connected', 'Bağlı');

            if (this.device) {
                this.socket.emit('join_device', this.device.id);
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
            const response = await fetch(`${CONFIG.API_URL}/jukebox/queue/${this.device.id}`);
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
        if (!this.isPlaying && !this.queueData.now_playing && this.queueData.queue.length > 0) {
            this.playSong(this.queueData.queue[0]);
        }
    }

    playNextFromQueue() {
        if (this.queueData.queue.length > 0) {
            this.playSong(this.queueData.queue[0]);
        } else {
            this.stopPlayback();
        }
    }

    async playSong(song) {
        console.log('▶️ Çalınıyor:', song.title);

        try {
            this.audioPlayer.src = song.file_url;
            await this.audioPlayer.play();

            this.showPlayingState(song);

            // Notify server
            if (this.device) {
                await fetch(`${CONFIG.API_URL}/jukebox/kiosk/now-playing`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        device_id: this.device.id,
                        song_id: song.song_id
                    })
                });
            }

        } catch (error) {
            console.error('Playback error:', error);
        }
    }

    stopPlayback() {
        this.audioPlayer.pause();
        this.audioPlayer.src = '';
        this.isPlaying = false;
        this.showIdleState();

        if (this.device) {
            fetch(`${CONFIG.API_URL}/jukebox/kiosk/now-playing`, {
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
