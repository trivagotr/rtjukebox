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

  it('defaults to the /controller build base for builds and preview', () => {
    expect(resolveBase({ command: 'build', mode: 'production' })).toBe('/controller/');
    expect(resolveBase({ command: 'serve', mode: 'production', isPreview: true })).toBe('/controller/');
  });

  it('allows deployments to override the production base path', () => {
    process.env.VITE_APP_BASE_PATH = '/custom-controller/';

    expect(resolveBase({ command: 'build', mode: 'production' })).toBe('/custom-controller/');
    expect(resolveBase({ command: 'serve', mode: 'production', isPreview: true })).toBe('/custom-controller/');
  });
});
