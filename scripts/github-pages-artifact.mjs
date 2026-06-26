import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUTPUT_DIR = path.join('dist', 'github-pages');
const KIOSK_EXCLUDED_FILES = new Set([
  'package.json',
  'package-lock.json',
]);
const KIOSK_EXCLUDED_DIRS = new Set([
  'coverage',
  'node_modules',
]);

const trimSlashes = (value) => String(value || '').trim().replace(/^\/+|\/+$/g, '');

export function normalizePathBase(value) {
  const trimmed = trimSlashes(value);
  return trimmed ? `/${trimmed}` : '';
}

export function joinUrl(origin, pathBase) {
  const cleanOrigin = String(origin || '').trim().replace(/\/+$/, '');
  if (!cleanOrigin) {
    return '';
  }
  const cleanPath = normalizePathBase(pathBase);
  return `${cleanOrigin}${cleanPath}`;
}

export function buildKioskRuntimeConfig({ apiBaseUrl, apiOrigin, apiPublicBasePath } = {}) {
  const resolvedApiBaseUrl = String(apiBaseUrl || '').trim()
    || joinUrl(apiOrigin, apiPublicBasePath || '/jukebox');
  const config = resolvedApiBaseUrl ? { API_BASE_URL: resolvedApiBaseUrl } : {};
  return `window.RADIOTEDU_KIOSK_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
}

async function copyDirectory(sourceDir, destinationDir, shouldCopy = () => true) {
  await mkdir(destinationDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (!shouldCopy(entry, sourcePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath, shouldCopy);
      continue;
    }

    if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

function shouldCopyKioskEntry(entry) {
  if (entry.isDirectory()) {
    return !KIOSK_EXCLUDED_DIRS.has(entry.name);
  }
  if (KIOSK_EXCLUDED_FILES.has(entry.name)) {
    return false;
  }
  return !entry.name.endsWith('.test.js');
}

async function assertDirectoryExists(directoryPath, label) {
  const info = await stat(directoryPath);
  if (!info.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directoryPath}`);
  }
}

export async function prepareGithubPagesArtifact({
  rootDir = process.cwd(),
  outputDir = path.join(process.cwd(), DEFAULT_OUTPUT_DIR),
  apiBaseUrl = process.env.JUKEBOX_API_BASE_URL,
  apiOrigin = process.env.JUKEBOX_API_ORIGIN,
  apiPublicBasePath = process.env.JUKEBOX_PUBLIC_BASE_PATH || '/jukebox',
} = {}) {
  const kioskSourceDir = path.join(rootDir, 'kiosk-web');
  const controllerDistDir = path.join(rootDir, 'jukebox-web-controller', 'dist');
  const kioskOutputDir = path.join(outputDir, 'kiosk');
  const controllerOutputDir = path.join(outputDir, 'jukebox');

  await assertDirectoryExists(kioskSourceDir, 'kiosk-web source');
  await assertDirectoryExists(controllerDistDir, 'jukebox-web-controller dist');
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  await copyDirectory(kioskSourceDir, kioskOutputDir, shouldCopyKioskEntry);
  await copyDirectory(controllerDistDir, controllerOutputDir);
  await writeFile(path.join(kioskOutputDir, 'runtime-config.js'), buildKioskRuntimeConfig({
    apiBaseUrl,
    apiOrigin,
    apiPublicBasePath,
  }));
  await writeFile(path.join(outputDir, '.nojekyll'), '');
  await writeFile(path.join(outputDir, 'index.html'), `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=kiosk/">
    <title>RadioTEDU Jukebox</title>
  </head>
  <body>
    <p><a href="kiosk/">Kiosk ekranini ac</a></p>
    <p><a href="jukebox/">Telefon jukebox sayfasini ac</a></p>
  </body>
</html>
`);

  return {
    outputDir,
    kioskOutputDir,
    controllerOutputDir,
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  prepareGithubPagesArtifact()
    .then(({ outputDir }) => {
      console.log(`GitHub Pages artifact prepared at ${outputDir}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
