import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MANIFEST_PATH = path.resolve(MODULE_DIR, '..', 'study-game', 'THIRD_PARTY.yml');

const EXACT_COMMIT_PATTERN = /(?:^|[^0-9a-f])([0-9a-f]{40})(?:$|[^0-9a-f])/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const KNOWN_NOTICE_FIELDS = ['notice_requirements', 'noticeRequirement', 'notice', 'attribution', 'source_policy'];
const KNOWN_MODIFICATION_FIELDS = ['modifications', 'modification', 'modification_status', 'modificationStatus'];

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizePathValue(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function getEntryOrigin(entry) {
  const origin = entry?.origin || entry?.repository_url || entry?.repositoryUrl || entry?.repo?.homepage || entry?.['repo/homepage'];
  return nonEmptyString(origin) ? origin.trim() : '';
}

function getEntryLicense(entry) {
  const license = entry?.license;
  return nonEmptyString(license) ? license.trim() : '';
}

function getEntryExactCommit(entry) {
  const candidates = [
    entry?.exact_commit,
    entry?.exactCommit,
    entry?.commit,
    entry?.commit_sha,
    entry?.commitSha,
  ];

  for (const candidate of candidates) {
    if (!nonEmptyString(candidate)) {
      continue;
    }
    const match = String(candidate).match(EXACT_COMMIT_PATTERN);
    if (match) {
      return match[1];
    }
  }

  const pinned = entry?.pinned_version_or_commit ?? entry?.pinnedVersionOrCommit;
  if (nonEmptyString(pinned)) {
    const match = String(pinned).match(EXACT_COMMIT_PATTERN);
    if (match) {
      return match[1];
    }
  }

  return '';
}

function hasExactArchiveHash(entry) {
  const sourceType = String(entry?.source_type || entry?.sourceType || '').trim().toLowerCase();
  const archiveHash = String(entry?.archive_sha256 || entry?.archiveSha256 || '').trim();
  return sourceType === 'archive' && SHA256_PATTERN.test(archiveHash);
}

function getEntryCopies(entry) {
  const copies = entry?.copied_files ?? entry?.copiedFiles ?? entry?.files ?? entry?.imports ?? [];
  return asArray(copies).map((item) => {
    if (typeof item === 'string') {
      return { path: item };
    }
    return item && typeof item === 'object' ? item : {};
  });
}

function getFilePath(fileRecord) {
  return normalizePathValue(fileRecord?.path || fileRecord?.file || fileRecord?.copied_path || fileRecord?.copiedPath);
}

function getValueByFields(record, fields) {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      return record[field];
    }
  }
  return undefined;
}

function hasNoticeRequirements(record) {
  const value = getValueByFields(record, KNOWN_NOTICE_FIELDS);
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.some(nonEmptyString);
  }
  return nonEmptyString(value);
}

function hasModifications(record) {
  const value = getValueByFields(record, KNOWN_MODIFICATION_FIELDS);
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.some(nonEmptyString);
  }
  return nonEmptyString(value);
}

function normalizeImportedFiles(importedFiles) {
  return asArray(importedFiles).map((item) => {
    if (typeof item === 'string') {
      return { path: normalizePathValue(item), production: true };
    }
    const normalized = item && typeof item === 'object' ? item : {};
    return {
      ...normalized,
      path: normalizePathValue(normalized.path || normalized.file || normalized.copied_path || normalized.copiedPath),
      production: normalized.production !== false,
    };
  }).filter((item) => item.path);
}

export function parseThirdPartyManifest(source) {
  if (typeof source === 'string') {
    return parse(source) || {};
  }
  return source && typeof source === 'object' ? source : {};
}

export function collectThirdPartyErrors(manifestInput, { importedFiles = [] } = {}) {
  const manifest = parseThirdPartyManifest(manifestInput);
  const entries = asArray(manifest.entries);
  const normalizedImportedFiles = normalizeImportedFiles(importedFiles);
  const coverage = new Map();
  const errors = [];

  for (const entry of entries) {
    const entryName = nonEmptyString(entry?.name) ? entry.name.trim() : '<unnamed entry>';
    const origin = getEntryOrigin(entry);
    const exactCommit = getEntryExactCommit(entry);
    const license = getEntryLicense(entry);
    const copies = getEntryCopies(entry);

    if (!origin) {
      errors.push(`${entryName}: missing origin/repository URL`);
    }
    if (!exactCommit && !hasExactArchiveHash(entry)) {
      errors.push(`${entryName}: missing exact commit`);
    }
    if (!license) {
      errors.push(`${entryName}: missing license`);
    }

    for (const copy of copies) {
      const filePath = getFilePath(copy);
      if (!filePath) {
        errors.push(`${entryName}: copied file record missing path`);
        continue;
      }

      if (!hasNoticeRequirements(copy)) {
        errors.push(`${entryName}: copied file ${filePath} missing notice requirements`);
      }
      if (!hasModifications(copy)) {
        errors.push(`${entryName}: copied file ${filePath} missing modifications`);
      }

      coverage.set(filePath, entryName);
    }
  }

  for (const importedFile of normalizedImportedFiles) {
    if (!importedFile.production) {
      continue;
    }
    if (!coverage.has(importedFile.path)) {
      errors.push(`production file ${importedFile.path} is not covered by any manifest entry`);
    }
  }

  return errors;
}

export function verifyThirdPartyManifest(manifestInput, options = {}) {
  const errors = collectThirdPartyErrors(manifestInput, options);
  if (errors.length > 0) {
    const error = new Error(`Third-party manifest verification failed:\n${errors.map((item) => `- ${item}`).join('\n')}`);
    error.errors = errors;
    throw error;
  }
  return true;
}

export async function loadThirdPartyManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
  const manifestText = await readFile(manifestPath, 'utf8');
  return parseThirdPartyManifest(manifestText);
}

export async function verifyThirdPartyManifestFile({
  manifestPath = DEFAULT_MANIFEST_PATH,
  importedFiles = [],
} = {}) {
  const manifest = await loadThirdPartyManifest(manifestPath);
  return verifyThirdPartyManifest(manifest, { importedFiles });
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  verifyThirdPartyManifestFile()
    .then(() => {
      console.log(`Third-party manifest verification passed: ${DEFAULT_MANIFEST_PATH}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
