import { describe, expect, it } from 'vitest';
import brandingHelpers from './branding.js';

const { initializeBrandLogoFallback } = brandingHelpers;

function createClassList(initialClasses = []) {
  const classes = new Set(initialClasses);

  return {
    add: (...tokens) => {
      tokens.forEach((token) => classes.add(token));
    },
    remove: (...tokens) => {
      tokens.forEach((token) => classes.delete(token));
    },
    toggle: (token, force) => {
      if (typeof force === 'boolean') {
        if (force) {
          classes.add(token);
        } else {
          classes.delete(token);
        }
        return force;
      }

      if (classes.has(token)) {
        classes.delete(token);
        return false;
      }

      classes.add(token);
      return true;
    },
    contains: (token) => classes.has(token),
  };
}

function createEventTarget() {
  const listeners = new Map();

  return {
    addEventListener: (eventName, handler) => {
      listeners.set(eventName, handler);
    },
    dispatch: (eventName) => {
      const handler = listeners.get(eventName);
      if (handler) {
        handler();
      }
    },
  };
}

function createBrandNodes(options = {}) {
  const logoContainer = {
    dataset: {},
  };
  const logoText = {
    classList: createClassList(['is-hidden']),
  };
  const logoImage = {
    ...createEventTarget(),
    classList: createClassList(),
    complete: options.complete ?? false,
    naturalWidth: options.naturalWidth ?? 0,
  };

  return { logoContainer, logoImage, logoText };
}

describe('kiosk branding helpers', () => {
  it('keeps the fallback text hidden when the logo loads successfully', () => {
    const { logoContainer, logoImage, logoText } = createBrandNodes();
    const controller = initializeBrandLogoFallback({
      logoContainer,
      logoImage,
      logoText,
    });

    logoImage.dispatch('load');

    expect(controller.getState()).toBe('loaded');
    expect(logoContainer.dataset.logoState).toBe('loaded');
    expect(logoImage.classList.contains('is-hidden')).toBe(false);
    expect(logoText.classList.contains('is-hidden')).toBe(true);
  });

  it('shows the RadioTEDU text fallback when the logo fails to load', () => {
    const { logoContainer, logoImage, logoText } = createBrandNodes();
    const controller = initializeBrandLogoFallback({
      logoContainer,
      logoImage,
      logoText,
    });

    logoImage.dispatch('error');

    expect(controller.getState()).toBe('fallback');
    expect(logoContainer.dataset.logoState).toBe('fallback');
    expect(logoImage.classList.contains('is-hidden')).toBe(true);
    expect(logoText.classList.contains('is-hidden')).toBe(false);
  });

  it('treats already loaded images as loaded during initialization', () => {
    const { logoContainer, logoImage, logoText } = createBrandNodes({
      complete: true,
      naturalWidth: 320,
    });

    const controller = initializeBrandLogoFallback({
      logoContainer,
      logoImage,
      logoText,
    });

    expect(controller.getState()).toBe('loaded');
    expect(logoContainer.dataset.logoState).toBe('loaded');
    expect(logoImage.classList.contains('is-hidden')).toBe(false);
    expect(logoText.classList.contains('is-hidden')).toBe(true);
  });
});
