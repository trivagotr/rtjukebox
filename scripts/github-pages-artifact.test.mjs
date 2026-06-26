import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareGithubPagesArtifact } from './github-pages-artifact.mjs';

test('prepares a GitHub Pages artifact with kiosk and jukebox pages', async () => {
  const rootDir = path.join(tmpdir(), `rtjukebox-pages-${Date.now()}`);
  const outputDir = path.join(rootDir, 'dist', 'github-pages');

  await mkdir(path.join(rootDir, 'kiosk-web', 'assets'), { recursive: true });
  await mkdir(path.join(rootDir, 'jukebox-web-controller', 'dist', 'assets'), { recursive: true });
  await writeFile(path.join(rootDir, 'kiosk-web', 'index.html'), '<script src="runtime-config.js"></script>');
  await writeFile(path.join(rootDir, 'kiosk-web', 'config.js'), 'const CONFIG = {};');
  await writeFile(path.join(rootDir, 'kiosk-web', 'config.test.js'), 'should not publish tests');
  await writeFile(path.join(rootDir, 'kiosk-web', 'package.json'), '{}');
  await writeFile(path.join(rootDir, 'kiosk-web', 'assets', 'logo.png'), 'logo');
  await writeFile(path.join(rootDir, 'jukebox-web-controller', 'dist', 'index.html'), '<div id="root"></div>');
  await writeFile(path.join(rootDir, 'jukebox-web-controller', 'dist', 'assets', 'app.js'), 'console.log("ok")');

  try {
    await prepareGithubPagesArtifact({
      rootDir,
      outputDir,
      apiOrigin: 'https://api.example.com',
      apiPublicBasePath: '/jukebox',
    });

    const rootIndex = await readFile(path.join(outputDir, 'index.html'), 'utf8');
    const kioskIndex = await readFile(path.join(outputDir, 'kiosk', 'index.html'), 'utf8');
    const runtimeConfig = await readFile(path.join(outputDir, 'kiosk', 'runtime-config.js'), 'utf8');
    const controllerIndex = await readFile(path.join(outputDir, 'jukebox', 'index.html'), 'utf8');

    assert.match(rootIndex, /url=kiosk\//);
    assert.equal(kioskIndex, '<script src="runtime-config.js"></script>');
    assert.match(runtimeConfig, /https:\/\/api\.example\.com\/jukebox/);
    assert.equal(controllerIndex, '<div id="root"></div>');
    await assert.rejects(readFile(path.join(outputDir, 'kiosk', 'config.test.js'), 'utf8'));
    await assert.rejects(readFile(path.join(outputDir, 'kiosk', 'package.json'), 'utf8'));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
