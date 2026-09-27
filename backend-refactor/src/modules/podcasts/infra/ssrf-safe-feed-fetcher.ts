import * as http from 'node:http';
import * as https from 'node:https';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { XMLParser } from 'fast-xml-parser';
import type { FeedFetcher, ParsedFeedEpisode } from '../ports/feed-fetcher.port.js';

const maxBytes = 5 * 1024 * 1024;
const timeoutMs = 10_000;
const contentTypes = new Set(['application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml', 'text/plain']);

export function isPublicFeedAddress(address: string) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

export function validateFeedUrl(input: string) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Feed URL must use HTTP(S) without embedded credentials');
  const standardPort = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== standardPort) throw new Error('Feed URL must use a standard HTTP(S) port');
  return url;
}

async function resolvePublicAddress(hostname: string): Promise<LookupAddress> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  if (!results.length || results.some(({ address }) => !isPublicFeedAddress(address))) throw new Error('Feed host resolves to a non-public IP');
  return results[0]!;
}

function requestPinned(url: URL, pin: LookupAddress): Promise<{ body: Buffer; location: string | null }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const pinnedLookup = ((_hostname: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => callback(null, pin.address, pin.family)) as never;
    const agent = url.protocol === 'https:' ? new https.Agent({ keepAlive: false, lookup: pinnedLookup }) : new http.Agent({ keepAlive: false, lookup: pinnedLookup });
    let settled = false;
    const fail = (error: Error) => { if (settled) return; settled = true; agent.destroy(); reject(error); };
    const req = client.request(url, { method: 'GET', agent, headers: { Accept: [...contentTypes].join(', ') } }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location ?? null;
      res.on('error', fail);
      if ([301, 302, 303, 307, 308].includes(status)) {
        res.resume(); settled = true; agent.destroy();
        if (!location) return reject(new Error('Feed redirect has no location'));
        return resolve({ body: Buffer.alloc(0), location });
      }
      if (status !== 200) { res.resume(); return fail(new Error(`Feed returned HTTP ${status}`)); }
      const contentType = (res.headers['content-type'] ?? '').split(';', 1)[0]!.trim().toLowerCase();
      if (!contentTypes.has(contentType)) { res.resume(); return fail(new Error('Feed returned an unsupported content type')); }
      if (Number(res.headers['content-length'] ?? 0) > maxBytes) { res.resume(); return fail(new Error('Feed response exceeds 5 MB')); }
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) return res.destroy(new Error('Feed response exceeds 5 MB')); chunks.push(chunk); });
      res.on('end', () => { if (settled) return; settled = true; agent.destroy(); resolve({ body: Buffer.concat(chunks), location: null }); });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Feed request timed out')));
    req.on('error', fail); req.end();
  });
}

export class SsrfSafeFeedFetcher implements FeedFetcher {
  async fetchEpisodes(input: string) {
    let url = validateFeedUrl(input);
    for (let hop = 0; hop <= 3; hop += 1) {
      const pin = await resolvePublicAddress(url.hostname);
      const response = await requestPinned(url, pin);
      if (!response.location) return parseFeedEpisodes(response.body.toString('utf8'));
      if (hop === 3) throw new Error('Feed exceeded redirect limit');
      const currentWasHttps = url.protocol === 'https:';
      const redirected = validateFeedUrl(new URL(response.location, url).toString());
      if (currentWasHttps && redirected.protocol !== 'https:') throw new Error('HTTPS feed redirects cannot downgrade to HTTP');
      url = redirected;
    }
    throw new Error('Feed redirect handling failed');
  }
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', trimValues: true, processEntities: false });
const asArray = <T>(value: T | T[] | null | undefined): T[] => !value ? [] : Array.isArray(value) ? value : [value];
function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) { for (const item of value) { const result = text(item); if (result) return result; } }
  if (value && typeof value === 'object') { const row = value as Record<string, unknown>; return text(row['#text'] ?? row.text); }
  return null;
}
function image(value: unknown) {
  const first = Array.isArray(value) ? value[0] : value;
  if (first && typeof first === 'object') { const row = first as Record<string, unknown>; return text(row.href ?? row.url ?? row['#text']); }
  return text(first);
}
function duration(value: unknown): number | null {
  const raw = text(value); if (!raw) return null;
  if (/^\d{1,3}:\d{1,2}:\d{1,2}$/.test(raw)) { const [h, m, s] = raw.split(':').map(Number); return h! * 3600 + m! * 60 + s!; }
  if (/^\d{1,4}:\d{1,2}$/.test(raw)) { const [m, s] = raw.split(':').map(Number); return m! * 60 + s!; }
  const parsed = Number.parseInt(raw, 10); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
export function parseFeedEpisodes(xml: string): ParsedFeedEpisode[] {
  const root = parser.parse(xml) as { rss?: { channel?: { item?: Record<string, unknown> | Record<string, unknown>[] } }; feed?: { entry?: Record<string, unknown> | Record<string, unknown>[] } };
  const rows = asArray(root.rss?.channel?.item ?? root.feed?.entry);
  return rows.map((row) => {
    const enclosure = Array.isArray(row.enclosure) ? row.enclosure[0] : row.enclosure;
    const links = asArray(row.link);
    const link = links.find((item) => item && typeof item === 'object' && ((item as Record<string, unknown>).rel === 'alternate' || !(item as Record<string, unknown>).rel)) ?? links.find((item) => typeof item === 'string');
    const enclosureLink = links.find((item) => item && typeof item === 'object' && (item as Record<string, unknown>).rel === 'enclosure');
    const linkObj = link && typeof link === 'object' ? link as Record<string, unknown> : null;
    const enclosureObj = enclosure && typeof enclosure === 'object' ? enclosure as Record<string, unknown> : null;
    const published = text(row.pubDate ?? row.published ?? row.updated);
    const parsedDate = published ? new Date(published) : null;
    return {
      guid: text(row.guid ?? row.id), episodeUrl: text(linkObj?.href ?? link), audioUrl: text(enclosureObj?.url ?? (enclosureLink && (enclosureLink as Record<string, unknown>).href) ?? (row['media:content'] && (row['media:content'] as Record<string, unknown>).url)),
      title: text(row.title) ?? 'Untitled episode', description: text(row.description ?? row.summary ?? row.content),
      imageUrl: image(row['itunes:image'] ?? row.image), publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
      author: text(row.author ?? row['itunes:author']), durationSeconds: duration(row['itunes:duration']),
    };
  }).filter((episode) => Boolean(episode.audioUrl));
}
