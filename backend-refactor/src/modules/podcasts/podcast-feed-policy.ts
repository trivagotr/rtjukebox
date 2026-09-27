import { ValidationError } from '../../core/errors/app-error.js';

export function normalizeFeedUrl(input: string) {
  try {
    const url = new URL(input.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid');
    const defaultPort = url.protocol === 'https:' ? '443' : '80';
    if (url.port && url.port !== defaultPort) throw new Error('invalid');
    return url.toString();
  } catch { throw new ValidationError('Feed URL must use HTTP or HTTPS and a standard port'); }
}
