(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }

    root.KioskDeviceSpotifyAuth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const SETUP_OVERLAY_ID = 'spotifyDeviceAuthSetupOverlay';
    const SETUP_BUTTON_SELECTOR = '[data-role="spotify-connect"]';

    function buildSpotifyDeviceAuthEndpoints(baseUrl) {
        return {
            status: `${baseUrl}/api/v1/jukebox/kiosk/spotify-device-auth/status`,
            start: `${baseUrl}/api/v1/jukebox/kiosk/spotify-device-auth/start`,
        };
    }

    function buildSpotifyDeviceAuthStartUrl(baseUrl, deviceId, devicePassword, returnOrigin) {
        const url = new URL(
            `${baseUrl}/api/v1/jukebox/kiosk/spotify-device-auth/start`,
            typeof globalThis?.location?.href === 'string' ? globalThis.location.href : undefined
        );
        url.searchParams.set('device_id', deviceId);
        if (devicePassword) {
            url.searchParams.set('device_pwd', devicePassword);
        }
        if (returnOrigin) {
            url.searchParams.set('return_origin', returnOrigin);
        }
        return url.toString();
    }

    function removeSpotifyDeviceAuthSetup(documentScope) {
        const existing = documentScope?.getElementById?.(SETUP_OVERLAY_ID);
        if (!existing) {
            return;
        }

        if (typeof existing.remove === 'function') {
            existing.remove();
            return;
        }

        if (documentScope?.body?.removeChild) {
            documentScope.body.removeChild(existing);
        }
    }

    function renderSpotifyDeviceAuthSetup(documentScope, options = {}) {
        if (!documentScope?.createElement) {
            return null;
        }

        removeSpotifyDeviceAuthSetup(documentScope);

        const overlay = documentScope.createElement('div');
        overlay.id = SETUP_OVERLAY_ID;
        overlay.className = 'spotify-device-auth-setup-overlay';
        overlay.innerHTML = `
            <div class="spotify-device-auth-setup-card">
                <div class="spotify-device-auth-setup-icon">♪</div>
                <div class="spotify-device-auth-setup-copy">
                    <div class="spotify-device-auth-setup-eyebrow">Spotify connect required</div>
                    <h2 class="spotify-device-auth-setup-title">Spotify bağlantısı gerekli</h2>
                    <p class="spotify-device-auth-setup-message">${escapeHtml(options.reason || 'Bu cihazın Spotify bağlantısını tamamlayın.')}</p>
                </div>
                <button type="button" class="spotify-device-auth-setup-button" data-role="spotify-connect">Bağlan</button>
                <p class="spotify-device-auth-setup-footnote">Bağlantı tamamlanınca kiosk otomatik devam eder.</p>
            </div>
        `;

        if (typeof overlay.querySelector === 'function') {
            const button = overlay.querySelector(SETUP_BUTTON_SELECTOR);
            if (button && typeof button.addEventListener === 'function') {
                button.addEventListener('click', async () => {
                    await options.onConnect?.();
                });
            } else if (button) {
                button.onclick = async () => {
                    await options.onConnect?.();
                };
            }
        }

        if (documentScope?.body?.appendChild) {
            documentScope.body.appendChild(overlay);
        }

        return overlay;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderSpotifyDeviceAuthPopup(popup, options = {}) {
        const documentScope = popup?.document;
        if (!documentScope) {
            return;
        }

        const title = escapeHtml(options.title || 'Spotify bağlantısı');
        const message = escapeHtml(options.message || 'Lütfen bekleyin.');
        const accent = options.isError ? '#ef4444' : '#1db954';
        const html = `
            <!DOCTYPE html>
            <html lang="tr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
            </head>
            <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#111827;color:#f9fafb;font-family:Arial,sans-serif;">
                <main style="width:min(520px,calc(100% - 48px));padding:36px;border:1px solid #374151;border-radius:20px;background:#1f2937;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.45);">
                    <div style="width:54px;height:54px;margin:0 auto 20px;border-radius:50%;background:${accent};display:grid;place-items:center;font-size:28px;">♪</div>
                    <h1 style="margin:0 0 14px;font-size:24px;">${title}</h1>
                    <p style="margin:0;color:#d1d5db;line-height:1.6;">${message}</p>
                </main>
            </body>
            </html>
        `;

        try {
            if (typeof documentScope.open === 'function') {
                documentScope.open();
            }
            if (typeof documentScope.write === 'function') {
                documentScope.write(html);
            } else if (documentScope.body) {
                documentScope.body.innerHTML = html;
            }
            if (typeof documentScope.close === 'function') {
                documentScope.close();
            }
        } catch (error) {
            // The popup may already have navigated cross-origin. Navigation can continue normally.
        }
    }

    function createSpotifyDeviceAuthController(options = {}) {
        const documentScope = options.document;
        const windowScope = options.window || (typeof globalThis !== 'undefined' ? globalThis : this);
        const apiBaseUrl = options.apiBaseUrl || '';
        const deviceId = options.deviceId;
        const devicePassword = options.devicePassword || '';
        const endpoints = buildSpotifyDeviceAuthEndpoints(apiBaseUrl);

        let currentStatus = null;
        let messageListener = null;

        async function fetchJson(url, init = {}) {
            const response = await options.fetch.call(windowScope, url, {
                ...init,
                headers: {
                    'Content-Type': 'application/json',
                    ...(init.headers || {}),
                },
            });

            if (!response.ok) {
                let errorMessage = `Spotify device auth request failed (${response.status})`;
                try {
                    const errorData = await response.json();
                    if (errorData?.error) {
                        errorMessage = errorData.error;
                    }
                } catch (error) {
                    // Ignore secondary parse errors.
                }
                throw new Error(errorMessage);
            }

            return response.json();
        }

        function ensureMessageListener() {
            if (!windowScope?.addEventListener || messageListener) {
                return;
            }

            messageListener = async (event) => {
                if (!event?.data || event.data.type !== 'SPOTIFY_DEVICE_AUTH_SUCCESS') {
                    return;
                }

                if (event.data.deviceId && event.data.deviceId !== deviceId) {
                    return;
                }

                await refreshStatus();
            };

            windowScope.addEventListener('message', messageListener);
        }

        function destroy() {
            if (messageListener && windowScope?.removeEventListener) {
                windowScope.removeEventListener('message', messageListener);
            }
            messageListener = null;
        }

        function hideSetup() {
            removeSpotifyDeviceAuthSetup(documentScope);
        }

        function showSetup(reason) {
            return renderSpotifyDeviceAuthSetup(documentScope, {
                reason,
                onConnect: openConnectFlow,
            });
        }

        async function refreshStatus() {
            const payload = await fetchJson(endpoints.status, {
                method: 'POST',
                body: JSON.stringify({
                    device_id: deviceId,
                    device_pwd: devicePassword,
                }),
            });
            currentStatus = payload?.data || payload || null;

            if (currentStatus?.connected) {
                hideSetup();
                options.onConnected?.(currentStatus);
            } else {
                showSetup(currentStatus?.reason || 'Spotify bağlantısı gerekli');
                options.onMissing?.(currentStatus);
            }

            return currentStatus;
        }

        async function openConnectFlow(existingPopup = null) {
            const returnOrigin = typeof windowScope?.location?.origin === 'string'
                ? windowScope.location.origin
                : (
                    typeof windowScope?.location?.href === 'string'
                        ? new URL(windowScope.location.href).origin
                        : null
                );
            const startUrl = buildSpotifyDeviceAuthStartUrl(apiBaseUrl, deviceId, devicePassword, returnOrigin);
            const popup = existingPopup || windowScope?.open?.('', '_blank');
            if (popup) {
                renderSpotifyDeviceAuthPopup(popup, {
                    title: 'Spotify açılıyor',
                    message: 'Güvenli Spotify giriş sayfasına yönlendiriliyorsunuz…',
                });
            }

            try {
                const payload = await fetchJson(startUrl, { method: 'POST' });
                const authUrl = payload?.data?.authUrl || payload?.authUrl;
                if (!authUrl) {
                    throw new Error('Spotify authorization URL is missing');
                }

                if (popup) {
                    if (typeof popup.location?.replace === 'function') {
                        popup.location.replace(authUrl);
                    } else {
                        popup.location.href = authUrl;
                    }
                    if (typeof popup.focus === 'function') {
                        popup.focus();
                    }
                } else if (windowScope?.location) {
                    windowScope.location.href = authUrl;
                }

                return authUrl;
            } catch (error) {
                if (popup) {
                    renderSpotifyDeviceAuthPopup(popup, {
                        title: 'Spotify bağlantısı açılamadı',
                        message: error?.message || 'Spotify giriş sayfası açılamadı.',
                        isError: true,
                    });
                }
                throw error;
            }
        }

        ensureMessageListener();

        return {
            refreshStatus,
            openConnectFlow,
            showSetup,
            hideSetup,
            destroy,
            getStatus: () => currentStatus,
            isSetupVisible: () => Boolean(documentScope?.getElementById?.(SETUP_OVERLAY_ID)),
            endpoints,
        };
    }

    return {
        SETUP_OVERLAY_ID,
        buildSpotifyDeviceAuthEndpoints,
        buildSpotifyDeviceAuthStartUrl,
        createSpotifyDeviceAuthController,
        renderSpotifyDeviceAuthPopup,
        renderSpotifyDeviceAuthSetup,
        removeSpotifyDeviceAuthSetup,
    };
});
