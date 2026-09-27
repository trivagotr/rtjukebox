import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageService, StoredObject } from '../ports/storage.port.js';

export class LocalStorageAdapter implements StorageService {
  private readonly root: string;

  constructor(rootDirectory: string) {
    this.root = path.resolve(rootDirectory);
  }

  private resolveKey(key: string) {
    if (!/^[A-Za-z0-9/_-]+$/.test(key) || key.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
      throw new Error('Invalid storage key');
    }
    const target = path.resolve(this.root, ...key.split('/'));
    if (!target.startsWith(`${this.root}${path.sep}`)) throw new Error('Storage key escapes configured root');
    return target;
  }

  async put(input: { key: string; content: Uint8Array; contentType: string }): Promise<StoredObject> {
    const target = this.resolveKey(input.key);
    await mkdir(path.dirname(target), { recursive: true });
    try { await writeFile(target, input.content, { flag: 'wx', mode: 0o640 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    return { key: input.key, contentType: input.contentType, size: input.content.byteLength };
  }

  async get(key: string) {
    try { return await readFile(this.resolveKey(key)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }

  async list(prefix: string) {
    const start = this.resolveKey(prefix);
    const rootStats = await stat(start).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    if (!rootStats?.isDirectory()) return [];
    const keys: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(absolute);
        else if (entry.isFile()) keys.push(path.relative(this.root, absolute).split(path.sep).join('/'));
      }
    };
    await visit(start);
    return keys;
  }

  async delete(key: string) {
    const target = this.resolveKey(key);
    try { await unlink(target); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
