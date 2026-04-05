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
        this.spotifyController = null;
        this.spotifyDeviceId = null;
        this.spotifyReadyPromise = null;
        this.spotifyReadyResolve = null;
        this.spotifyPlayerState = null;
        this.spotifyDeviceAuthController = null;
        this.spotifyDeviceAuthStatus = null;
        this.spotifyDeviceAuthReady = false;
        this.spotifyDeviceAuthSetupState = this.loadSpotifyDeviceAuthSetupState();
        this.spotifyTrackEnding = false;
        this.progressInterval = null;
        this.isPlaying = false;
        this.waveformCanvas = document.getElementById('waveformCanvas');
        this.waveformCtx = this.waveformCanvas?.getContext('2d');

        // Autoplay Logic
        this.autoplayTriggered = false;
        this.lastEmitTime = 0;

        // Debug Log
        this.logs = [];
        this.debugEl = this.createDebugOverlay();
        this.brandingController = window.KioskBranding?.initializeBrandLogoFallback?.() ?? null;

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

    getSpotifyDeviceAuthSetupStateStorageKey() {
        return 'spotify_device_auth_setup_state';
    }

    loadSpotifyDeviceAuthSetupState() {
        try {
            const raw = localStorage.getItem(this.getSpotifyDeviceAuthSetupStateStorageKey());
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }

            return parsed;
        } catch (error) {
            console.warn('⚠️ Spotify auth setup state yüklenemedi:', error?.message || error);
            return null;
        }
    }

    saveSpotifyDeviceAuthSetupState(reason) {
        const state = {
            required: true,
            deviceId: this.device?.id || null,
            reason: reason || 'Spotify authorization required for this device',
            updatedAt: new Date().toISOString(),
        };

        this.spotifyDeviceAuthSetupState = state;

        try {
            localStorage.setItem(this.getSpotifyDeviceAuthSetupStateStorageKey(), JSON.stringify(state));
        } catch (error) {
            this.log(`⚠️ Spotify auth setup state kaydedilemedi: ${error.message}`, 'error');
        }

        return state;
    }

    clearSpotifyDeviceAuthSetupState() {
        this.spotifyDeviceAuthSetupState = null;

        try {
            localStorage.removeItem(this.getSpotifyDeviceAuthSetupStateStorageKey());
        } catch (error) {
            this.log(`⚠️ Spotify auth setup state silinemedi: ${error.message}`, 'error');
        }
    }

    hideSpotifyDeviceAuthSetupOverlay() {
        const overlay = document.getElementById('spotifyDeviceAuthSetupOverlay');
        if (overlay) {
            overlay.remove?.();
        }
    }

    showSpotifyDeviceAuthSetupOverlay(reason) {
        if (!window.KioskDeviceSpotifyAuth?.renderSpotifyDeviceAuthSetup) {
            return;
        }

        window.KioskDeviceSpotifyAuth.renderSpotifyDeviceAuthSetup(document, {
            reason: reason || 'Spotify bağlantısı gerekli',
            onConnect: () => this.openSpotifyDeviceAuthSetup(),
        });
    }

    isSpotifyDeviceAuthConnected() {
        if (!this.spotifyDeviceAuthController) {
            return true;
        }

        if (this.spotifyDeviceAuthStatus?.connected === false) {
            return false;
        }

        if (this.spotifyDeviceAuthSetupState?.required) {
            return false;
        }

        return true;
    }

    async setupSpotifyDeviceAuthFlow() {
        if (!window.KioskDeviceSpotifyAuth?.createSpotifyDeviceAuthController) {
            this.spotifyDeviceAuthReady = true;
            return { connected: true };
        }

        this.spotifyDeviceAuthController = window.KioskDeviceSpotifyAuth.createSpotifyDeviceAuthController({
            apiBaseUrl: CONFIG.API_URL,
            deviceId: this.device?.id,
            devicePassword: localStorage.getItem('device_pwd') || CONFIG.DEVICE_PWD || '',
            document,
            fetch,
            window,
            onMissing: (status) => {
                this.spotifyDeviceAuthStatus = status;
                this.spotifyDeviceAuthReady = false;
                this.saveSpotifyDeviceAuthSetupState(status?.reason || 'Spotify bağlantısı gerekli');
                this.showSpotifyDeviceAuthSetupOverlay(status?.reason || 'Spotify bağlantısı gerekli');
            },
            onConnected: async (status) => {
                this.spotifyDeviceAuthStatus = status;
                this.spotifyDeviceAuthReady = true;
                this.clearSpotifyDeviceAuthSetupState();
                this.hideSpotifyDeviceAuthSetupOverlay();
                await this.resumeAfterSpotifyDeviceAuth();
            },
        });

        const status = await this.spotifyDeviceAuthController.refreshStatus();
        this.spotifyDeviceAuthStatus = status;
        this.spotifyDeviceAuthReady = Boolean(status?.connected);

        if (!status?.connected) {
            this.saveSpotifyDeviceAuthSetupState(status?.reason || 'Spotify bağlantısı gerekli');
            this.showSpotifyDeviceAuthSetupOverlay(status?.reason || 'Spotify bağlantısı gerekli');
        } else {
            this.clearSpotifyDeviceAuthSetupState();
        }

        return status;
    }

    async resumeAfterSpotifyDeviceAuth() {
        if (this.spotifyDeviceAuthController && !this.spotifyDeviceAuthReady) {
            return;
        }

        if (!this.spotifyController) {
            await this.initializeSpotifyPlayback();
        }

        if (!this.socket) {
            this.connectSocket();
        }

        if (!document.getElementById('startupOverlay')) {
            this.showStartupOverlay();
        }
    }

    async openSpotifyDeviceAuthSetup() {
        if (!this.spotifyDeviceAuthController) {
            await this.setupSpotifyDeviceAuthFlow();
        }

        if (!this.spotifyDeviceAuthController) {
            this.log('⚠️ Spotify device auth flow not available', 'error');
            return;
        }

        try {
            await this.spotifyDeviceAuthController.openConnectFlow();
        } catch (error) {
            this.log(`⚠️ Spotify bağlantı akışı açılamadı: ${error.message}`, 'error');
        }
    }

    isSpotifyDeviceAuthRequiredError(error) {
        const message = error?.message || String(error || '');
        return message.includes('No Spotify authorization found');
    }

    // ===== Initialization =====
    async init() {
        console.log('🎵 RadioTEDU Kiosk başlatılıyor...');

        // Check if device code exists
        if (!CONFIG.DEVICE_CODE) {
            this.showDeviceSetupOverlay();
            return;
        }

        // Setup canvas size
        this.setupWaveform();

        // Generate QR Code
        this.generateQRCode();

        // Setup audio player events
        this.setupAudioPlayer();

        try {
            await this.registerDevice();
        } catch (err) {
            this.log(`❌ Başlatma hatası: ${err.message}`, 'error');
            this.showDeviceSetupOverlay();
            return;
        }

        try {
            await this.setupSpotifyDeviceAuthFlow();
            if (this.spotifyDeviceAuthReady) {
                await this.resumeAfterSpotifyDeviceAuth();
            } else {
                this.connectSocket();
                if (!document.getElementById('startupOverlay')) {
                    this.showStartupOverlay();
                }
            }
        } catch (err) {
            this.log(`⚠️ Spotify kurulum akışı sınırlı başlatıldı: ${err.message}`, 'error');
            this.spotifyDeviceAuthReady = false;
            this.connectSocket();
            if (!document.getElementById('startupOverlay')) {
                this.showStartupOverlay();
            }
        }

        // Setup fullscreen on double click
        this.setupFullscreenToggle();

        // Setup logout button
        this.setupLogoutButton();

        // Interaction Overlay once Spotify auth is ready
        if (this.spotifyDeviceAuthReady && !document.getElementById('startupOverlay')) {
            this.showStartupOverlay();
        }

        // Setup window resize handler
        window.addEventListener('resize', () => this.setupWaveform());
    }

    showDeviceSetupOverlay() {
        const div = document.createElement('div');
        div.id = 'deviceSetupOverlay';
        div.style = 'position:fixed; inset:0; background:#1a1a2e; z-index:20000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; text-align:center;';
        div.innerHTML = `
            <div style="font-size:60px; margin-bottom:20px;">⚙️</div>
            <h2 style="color:white; margin-bottom:10px;">Cihaz Kurulumu</h2>
            <p style="color:rgba(255,255,255,0.6); margin-bottom:30px; max-width:400px;">Bu ekranın hangi Jukebox'u temsil ettiğini belirlemek için sistem panelindeki Cihaz Kodunu ve Şifresini girin.</p>
            <div style="display:flex; flex-direction:column; gap:15px; width:100%; max-width:400px;">
                <input type="text" id="setupDeviceCode" placeholder="Cihaz Kodu (Örn: KAFE-01)" style="width:100%; padding:15px; border-radius:12px; border:2px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.3); color:white; font-weight:bold; text-transform:uppercase;">
                <input type="password" id="setupDevicePassword" placeholder="Cihaz Şifresi" style="width:100%; padding:15px; border-radius:12px; border:2px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.3); color:white; font-weight:bold;">
                <button id="saveDeviceCode" style="padding:15px; border-radius:12px; background:var(--accent-red, #dc2626); color:white; font-weight:bold; border:none; cursor:pointer;">Kaydet ve Başlat</button>
            </div>
            <p style="color:rgba(255,255,255,0.4); margin-top:20px; font-size:12px;">Veya URL'ye <b>?code=KOD&pwd=SIFRE</b> ekleyerek açın.</p>
        `;
        document.body.appendChild(div);

        const input = div.querySelector('#setupDeviceCode');
        const pwdInput = div.querySelector('#setupDevicePassword');
        const button = div.querySelector('#saveDeviceCode');

        // Pre-fill if exists
        input.value = localStorage.getItem('device_code') || '';
        pwdInput.value = localStorage.getItem('device_pwd') || '';

        const save = () => {
            const code = input.value.trim().toUpperCase();
            const pwd = pwdInput.value.trim();
            if (code) {
                this.persistDeviceSetupCredentials(code, pwd);
            }
        };

        button.onclick = save;
        input.onkeydown = (e) => { if (e.key === 'Enter') pwdInput.focus(); };
        pwdInput.onkeydown = (e) => { if (e.key === 'Enter') save(); };
    }

    persistDeviceSetupCredentials(code, password) {
        try {
            localStorage.setItem('device_code', code);
            localStorage.setItem('device_pwd', password);
        } catch (error) {
            this.log(`⚠️ Cihaz bilgileri localStorage'a yazılamadı: ${error.message}`, 'error');
        }

        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('code', code);
        if (password) {
            nextUrl.searchParams.set('pwd', password);
        } else {
            nextUrl.searchParams.delete('pwd');
        }

        window.location.href = nextUrl.toString();
    }

    // ===== Logout Button =====
    setupLogoutButton() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.onclick = () => this.logout();
        }
    }

    logout() {
        this.log('🚪 Çıkış yapılıyor...');

        // Stop audio
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.src = '';
        }

        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        if (this.spotifyController) {
            this.reportSpotifyPlaybackDeviceState(false);
            this.spotifyController.disconnect();
            this.spotifyController = null;
        }
        if (this.spotifyDeviceAuthController?.destroy) {
            this.spotifyDeviceAuthController.destroy();
        }
        this.spotifyDeviceAuthController = null;
        this.spotifyDeviceAuthStatus = null;
        this.spotifyDeviceAuthReady = false;
        this.hideSpotifyDeviceAuthSetupOverlay();
        this.spotifyDeviceId = null;
        this.spotifyReadyPromise = null;
        this.spotifyReadyResolve = null;
        this.spotifyPlayerState = null;

        // Clear device data
        this.device = null;
        this.queueData = { now_playing: null, queue: [] };

        // Clear stored credentials
        localStorage.removeItem('device_code');
        localStorage.removeItem('device_pwd');

        // Show setup overlay again
        this.showDeviceSetupOverlay();
    }

    showStartupOverlay() {
        const div = document.createElement('div');
        div.id = 'startupOverlay';
        div.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.9); z-index:10000; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; backdrop-filter:blur(10px);';
        const showSpotifyConnectCta = !this.spotifyDeviceAuthReady || !this.isSpotifyDeviceAuthConnected();
        div.innerHTML = `
            <div style="font-size:80px; margin-bottom:20px; animation: pulse 2s infinite">🎵</div>
            <h2 style="color:white; margin:0">Jukebox'u Başlatmak İçın Tıklayın</h2>
            <p style="color:rgba(255,255,255,0.5); margin-top:10px;">Tarayıcı ses kısıtlamasını aşmak için gereklidir</p>
        `;
        if (showSpotifyConnectCta) {
            div.innerHTML += `
            <button id="startupSpotifyConnectButton" type="button" style="margin-top:18px; padding:14px 22px; border:none; border-radius:16px; font-weight:700; color:#fff; background:linear-gradient(135deg, #e31e26, #ff6b72); cursor:pointer; box-shadow:0 12px 30px rgba(227,30,38,0.35);">Spotify Bağla</button>
            <p style="color:rgba(255,255,255,0.42); margin-top:10px; max-width:360px; text-align:center;">Bu kiosk kendi Spotify hesabıyla bağlanmadan Spotify şarkıları çalamaz.</p>
            `;
        }
        div.onclick = (event) => {
            if (event?.target?.id === 'startupSpotifyConnectButton') {
                return;
            }
            div.remove();
            this.log('🚀 Jukebox kullanıcı tarafından başlatıldı');
            this.activateSpotifyPlayback();
            this.checkAndPlayNext();
        };
        document.body.appendChild(div);
        const spotifyConnectButton = typeof div.querySelector === 'function'
            ? div.querySelector('#startupSpotifyConnectButton')
            : null;
        if (spotifyConnectButton) {
            spotifyConnectButton.onclick = async (event) => {
                event?.stopPropagation?.();
                await this.openSpotifyDeviceAuthSetup();
            };
        }
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

    async initializeSpotifyPlayback() {
        if (!this.device || !window.KioskSpotifyPlayer) {
            return null;
        }

        if (!this.isSpotifyDeviceAuthConnected()) {
            return null;
        }

        if (this.spotifyController) {
            return this.spotifyController;
        }

        if (!this.spotifyReadyPromise) {
            this.spotifyReadyPromise = new Promise((resolve) => {
                this.spotifyReadyResolve = resolve;
            });
        }

        try {
            await window.KioskSpotifyPlayer.loadSpotifySdk({ root: window });

            this.spotifyController = window.KioskSpotifyPlayer.createSpotifyPlayer({
                root: window,
                deviceId: this.device.id,
                playerName: this.device.name || `RadioTEDU ${this.device.device_code || ''}`.trim(),
                getOAuthToken: async () => {
                    const response = await fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/spotify-token?device_id=${this.device.id}`);
                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.error || `Spotify token request failed (${response.status})`);
                    }

                    const payload = await response.json();
                    return payload.data.access_token;
                },
                onReady: async (payload) => {
                    this.spotifyDeviceId = payload.spotify_device_id || null;
                    this.spotifyPlayerState = payload.player_state || this.spotifyPlayerState;

                    try {
                        await this.registerSpotifyPlaybackDevice(payload);
                    } catch (error) {
                        this.log(`❌ Spotify cihaz kaydı başarısız: ${error.message}`, 'error');
                    } finally {
                        if (this.spotifyReadyResolve) {
                            this.spotifyReadyResolve(payload);
                            this.spotifyReadyResolve = null;
                        }
                    }
                },
                onNotReady: (payload) => {
                    const offlineDeviceId = payload?.spotify_device_id || payload?.device_id || this.spotifyDeviceId;
                    this.reportSpotifyPlaybackDeviceState(false, offlineDeviceId);
                    if (payload?.spotify_device_id && payload.spotify_device_id === this.spotifyDeviceId) {
                        this.spotifyDeviceId = null;
                    }
                    this.spotifyPlayerState = null;
                    this.isPlaying = false;
                    this.stopProgressUpdate();
                    this.showIdleState();
                },
                onStateChange: (state) => this.handleSpotifyPlayerStateChange(state),
                onAutoplayFailed: () => this.log('⚠️ Spotify autoplay başarısız oldu', 'error'),
                onError: (error) => this.log(`❌ Spotify player hatası: ${error.message || error}`, 'error'),
            });

            await this.spotifyController.connect();
            this.clearSpotifyDeviceAuthSetupState();
            return this.spotifyController;
        } catch (error) {
            if (this.isSpotifyDeviceAuthRequiredError(error)) {
                this.saveSpotifyDeviceAuthSetupState(error.message);
                this.spotifyDeviceAuthReady = false;
                this.showSpotifyDeviceAuthSetupOverlay(error.message);
            }
            this.log(`⚠️ Spotify başlatılamadı: ${error.message}`, 'error');
            this.spotifyController = null;
            this.spotifyReadyPromise = null;
            this.spotifyReadyResolve = null;
            return null;
        }
    }

    async ensureSpotifyPlaybackReady() {
        if (!this.spotifyController) {
            await this.initializeSpotifyPlayback();
        }

        if (this.spotifyReadyPromise) {
            await Promise.race([
                this.spotifyReadyPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Spotify player readiness timeout')), 10000)),
            ]);
        }

        return this.spotifyController;
    }

    reportSpotifyPlaybackDeviceState(isActive, spotifyDeviceId = this.spotifyDeviceId) {
        if (!this.device) {
            return Promise.resolve();
        }

        return fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/spotify-device`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
                device_id: this.device.id,
                spotify_device_id: spotifyDeviceId || null,
                player_name: this.device.name || null,
                is_active: isActive,
            }),
        }).catch((error) => {
            this.log(`âš ï¸ Spotify cihaz durumu bildirilemedi: ${error.message}`, 'error');
        });
    }

    async registerSpotifyPlaybackDevice(payload) {
        const response = await fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/spotify-device`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
                window.KioskSpotifyPlayer.buildSpotifyRegistrationPayload({
                    deviceId: this.device.id,
                    spotifyDeviceId: payload.spotify_device_id,
                    playerName: payload.player_name || this.device.name || null,
                    state: payload.player_state || null,
                })
            ),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Spotify device registration failed (${response.status})`);
        }

        return response.json();
    }

    activateSpotifyPlayback() {
        if (this.spotifyController?.activateElement) {
            try {
                this.spotifyController.activateElement();
            } catch (error) {
                this.log(`⚠️ Spotify activateElement hatası: ${error.message}`, 'error');
            }
        }
    }

    handleSpotifyPlayerStateChange(state) {
        const previousState = this.spotifyPlayerState;
        this.spotifyPlayerState = state;
        const activeSpotifyQueueItem = this.queueData?.now_playing?.playback_type === 'spotify';

        const trackEnded = Boolean(state?.track_ended)
            || Boolean(
                previousState?.track_uri
                && !state?.track_uri
                && previousState.duration_ms
                && previousState.position_ms >= Math.max(0, previousState.duration_ms - 1500)
            );

        if (trackEnded) {
            this.handleSpotifyTrackEnded();
            return;
        }

        this.isPlaying = !state?.paused;

        if (this.isPlaying) {
            this.startProgressUpdate();
            this.syncNowPlayingUi();
        } else if (state?.track_uri || activeSpotifyQueueItem) {
            this.startProgressUpdate();
        } else {
            this.stopProgressUpdate();
        }
    }

    syncNowPlayingUi() {
        if (!window.KioskPlayback?.shouldSyncNowPlayingView) {
            return;
        }

        const shouldSync = window.KioskPlayback.shouldSyncNowPlayingView({
            nowPlaying: this.queueData.now_playing,
            isPlaying: this.isPlaying,
            spotifyTrackUri: this.spotifyPlayerState?.track_uri || null,
            startupBlocked: Boolean(document.getElementById('startupOverlay')),
        });

        if (shouldSync) {
            this.showPlayingState(this.queueData.now_playing);
        }
    }

    handleSpotifyTrackEnded() {
        if (this.spotifyTrackEnding) {
            return;
        }

        this.spotifyTrackEnding = true;
        this.stopPlayback();
        setTimeout(() => {
            this.spotifyTrackEnding = false;
        }, 0);
    }

    pauseSpotifyPlayback() {
        const player = this.spotifyController?.player;
        if (!player || typeof player.pause !== 'function') {
            return;
        }

        if (this.spotifyPlayerState?.paused) {
            return;
        }

        Promise.resolve(player.pause()).catch((error) => {
            this.log(`âš ï¸ Spotify durdurma hatasÄ±: ${error.message}`, 'error');
        });
    }

    async refreshSpotifyPlaybackStateFromSdk() {
        const player = this.spotifyController?.player;
        const mapSpotifyPlayerState = window.KioskSpotifyPlayer?.mapSpotifyPlayerState;
        const shouldPollSpotify = Boolean(
            this.queueData?.now_playing?.playback_type === 'spotify'
            || this.spotifyPlayerState?.track_uri
        );

        if (!shouldPollSpotify || !player || typeof player.getCurrentState !== 'function' || typeof mapSpotifyPlayerState !== 'function') {
            return this.spotifyPlayerState;
        }

        try {
            const previousState = this.spotifyPlayerState;
            const sdkState = await player.getCurrentState();
            const mappedState = mapSpotifyPlayerState(sdkState, previousState);
            if (!mappedState) {
                return this.spotifyPlayerState;
            }

            this.spotifyPlayerState = mappedState;

            if (mappedState.track_ended) {
                this.handleSpotifyTrackEnded();
                return this.spotifyPlayerState;
            }

            if (mappedState.track_uri) {
                this.isPlaying = !mappedState.paused;
                if (this.isPlaying) {
                    this.syncNowPlayingUi();
                }
            } else if (sdkState === null) {
                this.isPlaying = false;
            }

            return this.spotifyPlayerState;
        } catch (error) {
            this.log(`âš ï¸ Spotify state yenileme hatasÄ±: ${error.message}`, 'error');
            return this.spotifyPlayerState;
        }
    }

    // ===== Device Registration =====
    async registerDevice() {
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_code: CONFIG.DEVICE_CODE,
                    password: CONFIG.DEVICE_PWD
                })
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

            // Ensure we join the room if socket is already connected
            if (this.socket && this.socket.connected) {
                this.socket.emit('join_device', this.device.id);
                this.log(`🏠 ${this.device.id} odasına katıldı (kayıt sonrası)`);
            }

            // Update UI
            const locationEl = document.getElementById('deviceLocation');
            if (locationEl) {
                locationEl.textContent = this.device.location || this.device.name || CONFIG.DEVICE_CODE;
            }

            this.log('✅ Cihaz kayıtlı:', this.device);

        } catch (error) {
            this.log(`❌ Kayıt hatası: ${error.message}`, 'error');
            this.updateConnectionStatus('error', 'Bağlantı hatası');

            if (error.message.includes('404')) {
                // Invalid code - reset and show setup
                const qrContainer = document.getElementById('qrCode');
                if (qrContainer) {
                    qrContainer.innerHTML = `
                        <div style="font-size:12px; color:#ff4444; padding:10px;">
                            <b>GEÇERSİZ KOD: ${CONFIG.DEVICE_CODE}</b><br><br>
                            Bu kod sistemde kayıtlı değil.
                            <button onclick="localStorage.removeItem('device_code'); location.reload();" 
                                style="margin-top:10px; padding:5px 10px; background:#dc2626; color:white; border:none; border-radius:4px; font-size:10px; cursor:pointer;">
                                Kodu Sıfırla
                            </button>
                        </div>`;
                }
            }

            // Helpful debug for user
            const qrContainer = document.getElementById('qrCode');
            if (qrContainer && qrContainer.innerHTML.includes('Oluşturuluyor')) {
                qrContainer.innerHTML = `<div style="font-size:10px; color:gray">Backend'e ulaşılamıyor:<br>${CONFIG.API_URL}</div>`;
            }
            // Retry after delay (only if not 404)
            if (!error.message.includes('404')) {
                setTimeout(() => this.registerDevice(), CONFIG.RECONNECT_INTERVAL);
            }
        }
    }

    // ===== WebSocket Connection =====
    connectSocket() {
        if (typeof io === 'undefined') {
            console.warn('Socket.IO library not loaded');
            return;
        }

        this.socket = io(CONFIG.WS_URL, {
            path: CONFIG.SOCKET_PATH || '/socket.io',
        });

        this.socket.on('connect', () => {
            this.log('🔌 Socket bağlandı');
            this.updateConnectionStatus('connected', 'Bağlı');

            if (this.device) {
                this.socket.emit('join_device', this.device.id);
                this.log(`🏠 ${this.device.id} odasına katıldı`);
                this.loadInitialQueue();

                // Heartbeat to test connectivity
                if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = setInterval(() => {
                    if (this.socket && this.socket.connected) {
                        this.socket.emit('kiosk_heartbeat', { device_id: this.device.id, timestamp: Date.now() });
                    }
                }, 5000);
            } else {
                this.log('⚠️ Cihaz kaydı henüz tamamlanmadı, oda katılımı bekleniyor');
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
            this.syncNowPlayingUi();
            this.checkAndPlayNext();
        });

        this.socket.on('song_skipped', () => {
            console.log('⏭️ Şarkı atlandı');
            this.pauseSpotifyPlayback();
            this.playNextFromQueue();
        });

        this.socket.on('song_rejected', () => {
            console.log('🚫 Şarkı reddedildi (DJ Scratch)');
            this.handleSongRejected();
        });
    }

    async handleSongRejected() {
        const albumContainer = document.querySelector('.album-container');
        if (albumContainer) {
            albumContainer.classList.add('dj-scratch-active');

            // Wait for animation to finish (1.5s in CSS)
            await new Promise(resolve => setTimeout(resolve, 1500));

            albumContainer.classList.remove('dj-scratch-active');
        }
        this.playNextFromQueue();
    }

    // ===== Load Initial Queue =====
    async loadInitialQueue() {
        if (!this.device) return;

        try {
            const response = await fetch(`${CONFIG.API_URL}/api/v1/jukebox/queue/${this.device.id}`);
            if (!response.ok) throw new Error('Queue fetch failed');

            this.queueData = await response.json();
            this.renderQueue();
            this.syncNowPlayingUi();
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
            // Also avoid infinite loop if no src
            if (!this.audioPlayer.src || this.audioPlayer.src === window.location.href || this.audioPlayer.src.includes('://:')) {
                this.isPlaying = false;
                return;
            }

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
        } else if (!this.isPlaying && !this.queueData.now_playing) {
            // Trigger autoplay if nothing is playing and no now_playing exists
            this.triggerAutoplay();
        }
    }

    playNextFromQueue() {
        if (this.queueData.queue && this.queueData.queue.length > 0) {
            this.playSong(this.queueData.queue[0]);
        } else {
            this.log('🔄 Kuyruk bitti, otomatik şarkı isteniyor...');
            // Notify server we finished
            this.stopPlayback();

            // Trigger autoplay immediately instead of waiting for 80% rule
            this.triggerAutoplay();
        }
    }

    triggerAutoplay() {
        if (!this.device || this.autoplayTriggered) return;

        this.autoplayTriggered = true;
        this.log('🤖 Autoplay tetikleniyor...');

        fetch(`${CONFIG.API_URL}/api/v1/jukebox/autoplay/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: this.device.id })
        }).then(r => r.json())
            .then(d => {
                this.log(`🤖 Otomatik eklendi: ${d.data?.song_title || 'Şarkı'}`);
                // Resulting queue_updated broadcast will trigger playNext/checkNext
            })
            .catch(e => {
                console.error(e);
                this.autoplayTriggered = false; // Allow retry on failure
            });
    }

    async skipUnsupportedSong(song, reason) {
        this.log(`⚠️ ${reason}: ${song.title}`, 'error');
        this.isPlaying = false;
        this.showIdleState();

        if (!this.device) {
            return;
        }

        const songId = song.song_id || song.id;
        if (!songId) {
            return;
        }

        try {
            await fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/now-playing`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: this.device.id,
                    song_id: songId
                })
            });

            await fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/now-playing`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: this.device.id,
                    song_id: null
                })
            });

            await this.loadInitialQueue();
        } catch (error) {
            this.log(`❌ Desteklenmeyen şarkı atlama hatası: ${error.message}`, 'error');
        }
    }

    async playSong(song) {
        console.log('▶️ Çalınıyor:', song.title);

        try {
            const playbackPlan = window.KioskPlayback.getSongPlaybackPlan(song, CONFIG.API_URL);

            // Reset autoplay flag for new song
            this.autoplayTriggered = false;

            if (playbackPlan.kind === 'spotify') {
                if (!this.isSpotifyDeviceAuthConnected()) {
                    this.showSpotifyDeviceAuthSetupOverlay(this.spotifyDeviceAuthSetupState?.reason || 'Spotify bağlantısı gerekli');
                    return;
                }
                await this.playSpotifySong(song);
                return;
            }

            if (playbackPlan.kind !== 'local' || !playbackPlan.audioUrl) {
                await this.skipUnsupportedSong(song, 'Geçerli bir local audio kaynağı bulunamadı');
                return;
            }

            const audioUrl = playbackPlan.audioUrl;

            // Prevent loop: Don't re-play if same URL is already playing
            if (this.audioPlayer.src.includes(audioUrl) && this.isPlaying) {
                console.log('⏭️ Şarkı zaten çalıyor, atlandı');
                return;
            }

            this.pauseSpotifyPlayback();
            this.spotifyPlayerState = null;
            // LOCK: Set isPlaying immediately to prevent other triggers while loading
            this.isPlaying = true;
            this.audioPlayer.src = audioUrl;

            const playPromise = this.audioPlayer.play();
            if (playPromise !== undefined) {
                await playPromise;
            }
            this.log('✅ Çalma başladı');
            this.showPlayingState(song);

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
            this.isPlaying = false;
            this.log(`❌ Beklenmedik hata: ${error.message}`, 'error');
        }
    }

    async playSpotifySong(song) {
        this.isPlaying = true;
        await this.ensureSpotifyPlaybackReady();

        if (!this.spotifyController) {
            this.isPlaying = false;
            throw new Error('Spotify player is not ready');
        }

        const songId = song.song_id || song.id;
        if (!songId) {
            this.isPlaying = false;
            throw new Error('Spotify song id missing');
        }

        this.audioPlayer.pause();
        this.audioPlayer.src = '';
        const response = await fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/now-playing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_id: this.device.id,
                song_id: songId
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            this.isPlaying = false;
            throw new Error(errorData.error || `Spotify playback handoff failed (${response.status})`);
        }

        this.isPlaying = true;
        this.startProgressUpdate();
        this.showPlayingState(song);
    }

    stopPlayback() {
        this.pauseSpotifyPlayback();
        this.audioPlayer.pause();
        this.audioPlayer.src = '';
        this.isPlaying = false;
        this.queueData.now_playing = null; // Clear local state immediately to prevent loop
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
        this.updateProgress(); // Initial call
        this.progressInterval = setInterval(() => this.updateProgress(), CONFIG.UI_UPDATE_INTERVAL);
    }

    stopProgressUpdate() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    async updateProgress() {
        await this.refreshSpotifyPlaybackStateFromSdk();

        const useSpotifyProgress = Boolean(this.spotifyPlayerState?.track_uri)
            && (!this.audioPlayer.src || this.audioPlayer.src === window.location.href);
        const current = useSpotifyProgress
            ? (this.spotifyPlayerState?.position_ms || 0) / 1000
            : this.audioPlayer.currentTime;
        const total = useSpotifyProgress
            ? (this.spotifyPlayerState?.duration_ms || 0) / 1000
            : (this.audioPlayer.duration || 0);
        const percent = total > 0 ? (current / total) * 100 : 0;

        // Emit progress via socket only at larger intervals
        const now = Date.now();
        if (this.socket && this.device && (now - this.lastEmitTime >= CONFIG.SOCKET_EMIT_INTERVAL)) {
            this.socket.emit('playback_progress', {
                device_id: this.device.id,
                currentTime: current,
                duration: total,
                percent: percent
            });
            console.info('📡 [SOCKET] Progress emitted (Throttled):', Math.floor(current));
            this.lastEmitTime = now;
        } else if (!this.socket && now - this.lastEmitTime > 10000) {
            console.warn('⚠️ [SOCKET] Not connected yet');
            this.lastEmitTime = now; // Prevent spam
        }

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

/* Obsolete prototype override kept commented out while the class method remains canonical.
KioskApp.prototype.playSong = async function (song) {
    console.log('â–¶ï¸ Ã‡alÄ±nÄ±yor:', song.title);
    this.isPlaying = true;

    try {
        const playbackPlan = window.KioskPlayback.getSongPlaybackPlan(song, CONFIG.API_URL);
        this.autoplayTriggered = false;

        if (playbackPlan.kind === 'spotify') {
            await this.playSpotifySong(song);
            return;
        }

        if (playbackPlan.kind !== 'local' || !playbackPlan.audioUrl) {
            await this.skipUnsupportedSong(song, 'GeÃ§erli bir local audio kaynaÄŸÄ± bulunamadÄ±');
            return;
        }

        const audioUrl = playbackPlan.audioUrl;
        if (this.audioPlayer.src.includes(audioUrl) && this.isPlaying) {
            console.log('â­ï¸ ÅarkÄ± zaten Ã§alÄ±yor, atlandÄ±');
            return;
        }

        this.isPlaying = true;
        this.audioPlayer.src = audioUrl;

        const playPromise = this.audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                this.log('âœ… Ã‡alma baÅŸladÄ±');
                this.showPlayingState(song);
            }).catch((error) => {
                this.isPlaying = false;
                this.log(`âŒ Ã‡alma baÅŸarÄ±sÄ±z: ${error.message}`, 'error');
                if (error.name === 'NotAllowedError') {
                    this.log('ğŸ‘‰ LÃ¼tfen ekrana bir kez tÄ±klayÄ±n!');
                    this.showStartupOverlay();
                }
            });
        }

        if (this.device) {
            fetch(`${CONFIG.API_URL}/api/v1/jukebox/kiosk/now-playing`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: this.device.id,
                    song_id: song.song_id || (song.id.includes('autoplay') ? song.id.split('autoplay-')[1] : song.id)
                })
            }).catch((error) => this.log(`âš ï¸ Sunucu bildirim hatasÄ±: ${error.message}`, 'error'));
        }
    } catch (error) {
        this.isPlaying = false;
            this.isPlaying = false;
            this.isPlaying = false;
            this.log(`âŒ Beklenmedik hata: ${error.message}`, 'error');
    }
};
*/

const kioskRoot = typeof globalThis !== 'undefined' ? globalThis : window;
kioskRoot.KioskApp = KioskApp;
if (typeof window !== 'undefined') {
    window.KioskApp = KioskApp;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.kioskApp = new KioskApp();
});
