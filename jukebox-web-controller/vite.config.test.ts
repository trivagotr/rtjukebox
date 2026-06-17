import { afterEach, describe, expect, it } from 'vitest';
import viteConfig from './vite.config';

type ConfigEnv = {
  command: 'serve' | 'build';
  mode: string;
  isPreview?: boolean;
};

const resolveBase = (env: ConfigEnv) => {
  const config = typeof viteConfig === 'function' ? viteConfig(env) : viteConfig;
  if (config instanceof Promise) {
    throw new Error('Expected synchronous Vite config');
  }
  return config.base;
};

describe('vite base path', () => {
  afterEach(() => {
    delete process.env.VITE_APP_BASE_PATH;
  });

  it('uses root base only for the development server', () => {
    expect(resolveBase({ command: 'serve', mode: 'development', isPreview: false })).toBe('/');
  });

  it('keeps the jukebox production base path during preview', () => {
    expect(resolveBase({ command: 'serve', mode: 'production', isPreview: true })).toBe('/jukebox/');
  });

  it('allows deployments to override the production base path', () => {
    process.env.VITE_APP_BASE_PATH = '/custom-jukebox/';

    expect(resolveBase({ command: 'build', mode: 'production' })).toBe('/custom-jukebox/');
    expect(resolveBase({ command: 'serve', mode: 'production', isPreview: true })).toBe('/custom-jukebox/');
  });
});
