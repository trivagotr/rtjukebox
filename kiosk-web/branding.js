(function (root, factory) {
    const api = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }

    root.KioskBranding = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function setBrandLogoState(params, state) {
        const logoContainer = params?.logoContainer ?? null;
        const logoImage = params?.logoImage ?? null;
        const logoText = params?.logoText ?? null;

        if (logoContainer?.dataset) {
            logoContainer.dataset.logoState = state;
        }

        logoImage?.classList?.toggle('is-hidden', state !== 'loaded');
        logoText?.classList?.toggle('is-hidden', state === 'loaded');

        return state;
    }

    function initializeBrandLogoFallback(options = {}) {
        const rootScope = options.root ?? (typeof document !== 'undefined' ? document : null);
        const logoContainer = options.logoContainer ?? rootScope?.getElementById?.('brandLogo') ?? null;
        const logoImage = options.logoImage ?? rootScope?.getElementById?.('brandLogoImage') ?? null;
        const logoText = options.logoText ?? rootScope?.getElementById?.('brandLogoText') ?? null;

        const elements = { logoContainer, logoImage, logoText };
        let currentState = setBrandLogoState(elements, 'loaded');

        const markLoaded = () => {
            currentState = setBrandLogoState(elements, 'loaded');
        };

        const markFallback = () => {
            currentState = setBrandLogoState(elements, 'fallback');
        };

        logoImage?.addEventListener?.('load', markLoaded);
        logoImage?.addEventListener?.('error', markFallback);

        if (logoImage?.complete) {
            if (logoImage.naturalWidth > 0) {
                markLoaded();
            } else {
                markFallback();
            }
        }

        return {
            getState: () => currentState,
            markLoaded,
            markFallback,
        };
    }

    return {
        initializeBrandLogoFallback,
        setBrandLogoState,
    };
});
