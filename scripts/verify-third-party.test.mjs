import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  collectThirdPartyErrors,
  verifyThirdPartyManifest,
  verifyThirdPartyManifestFile,
} from './verify-third-party.mjs';

function manifestText(entries) {
  return `entries:\n${entries.map((entry) => `  - ${entry.replace(/\n/g, '\n    ')}`).join('\n')}\n`;
}

function expectThrowMessage(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected function to throw');
}

test('a complete entry passes', async () => {
  const manifest = {
    entries: [
      {
        name: 'Example Library',
        origin: 'https://github.com/example/example-library',
        exact_commit: '0123456789abcdef0123456789abcdef01234567',
        license: 'MIT',
        copied_files: [
          {
            path: 'study-game/vendor/example/index.js',
            notice_requirements: 'Retain MIT notice in the distribution',
            modifications: 'None',
          },
        ],
      },
    ],
  };

  assert.deepEqual(collectThirdPartyErrors(manifest), []);
  assert.equal(verifyThirdPartyManifest(manifest), true);
});

test('missing origin or repository URL fails', () => {
  const manifest = {
    entries: [
      {
        name: 'Broken Library',
        exact_commit: '0123456789abcdef0123456789abcdef01234567',
        license: 'MIT',
      },
    ],
  };

  const error = expectThrowMessage(() => verifyThirdPartyManifest(manifest));
  assert.match(error.message, /missing origin\/repository URL/);
  assert.match(error.message, /Broken Library/);
});

test('missing exact commit fails', () => {
  const manifest = {
    entries: [
      {
        name: 'Broken Library',
        origin: 'https://github.com/example/example-library',
        license: 'MIT',
      },
    ],
  };

  const error = expectThrowMessage(() => verifyThirdPartyManifest(manifest));
  assert.match(error.message, /missing exact commit/);
  assert.match(error.message, /Broken Library/);
});

test('a static archive passes with an exact SHA-256 instead of a git commit', () => {
  const manifest = {
    entries: [
      {
        name: 'Example Archive',
        source_type: 'archive',
        origin: 'https://example.com/example.zip',
        archive_sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        license: 'CC0-1.0',
      },
    ],
  };

  assert.deepEqual(collectThirdPartyErrors(manifest), []);
});

test('missing license fails', () => {
  const manifest = {
    entries: [
      {
        name: 'Broken Library',
        origin: 'https://github.com/example/example-library',
        exact_commit: '0123456789abcdef0123456789abcdef01234567',
      },
    ],
  };

  const error = expectThrowMessage(() => verifyThirdPartyManifest(manifest));
  assert.match(error.message, /missing license/);
  assert.match(error.message, /Broken Library/);
});

test('shipped or copied files without notice requirements or modifications fail', () => {
  const manifest = {
    entries: [
      {
        name: 'Broken File Record',
        origin: 'https://github.com/example/example-library',
        exact_commit: '0123456789abcdef0123456789abcdef01234567',
        license: 'MIT',
        copied_files: [
          {
            path: 'study-game/vendor/example/index.js',
            notice_requirements: 'Retain MIT notice in the distribution',
          },
        ],
      },
    ],
  };

  const error = expectThrowMessage(() => verifyThirdPartyManifest(manifest));
  assert.match(error.message, /missing modifications/);
  assert.match(error.message, /Broken File Record/);
});

test('any imported production file without a manifest entry fails', () => {
  const manifest = {
    entries: [
      {
        name: 'Covered File',
        origin: 'https://github.com/example/example-library',
        exact_commit: '0123456789abcdef0123456789abcdef01234567',
        license: 'MIT',
        copied_files: [
          {
            path: 'study-game/vendor/example/index.js',
            notice_requirements: 'Retain MIT notice in the distribution',
            modifications: 'None',
          },
        ],
      },
    ],
  };

  const error = expectThrowMessage(() =>
    verifyThirdPartyManifest(manifest, {
      importedFiles: [
        'study-game/vendor/example/index.js',
        'study-game/vendor/example/extra.js',
      ],
    }),
  );

  assert.match(error.message, /production file study-game\/vendor\/example\/extra\.js is not covered/);
});

test('the real manifest file can be parsed from disk', async () => {
  const rootDir = path.join(tmpdir(), `rtjukebox-third-party-${Date.now()}`);
  const manifestDir = path.join(rootDir, 'study-game');
  await mkdir(manifestDir, { recursive: true });
  await writeFile(path.join(manifestDir, 'THIRD_PARTY.yml'), manifestText([
    [
      'name: Example Library',
      'origin: https://github.com/example/example-library',
      'exact_commit: 0123456789abcdef0123456789abcdef01234567',
      'license: MIT',
      'copied_files:',
      '  - path: study-game/vendor/example/index.js',
      '    notice_requirements: Retain MIT notice in the distribution',
      '    modifications: None',
    ].join('\n'),
  ]), 'utf8');

  try {
    await verifyThirdPartyManifestFile({
      manifestPath: path.join(manifestDir, 'THIRD_PARTY.yml'),
      importedFiles: ['study-game/vendor/example/index.js'],
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
