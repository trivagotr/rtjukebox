const STORAGE_KEY = 'radiotedu.study.client-session-id'
const CLIENT_SESSION_PATTERN = /^[a-zA-Z0-9:_-]{6,128}$/

export interface StudySessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function normalizeStudyClientSessionId(value: unknown): string | null {
  return typeof value === 'string' && CLIENT_SESSION_PATTERN.test(value) ? value : null
}

export function getOrCreateStudyClientSessionId(
  storage: StudySessionStorage | null,
  now: () => number = Date.now,
  randomId: () => string = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 14),
): string {
  try {
    const existing = normalizeStudyClientSessionId(storage?.getItem(STORAGE_KEY))
    if (existing) return existing
  } catch {
    // Storage can be disabled by a webview privacy policy; a memory-only id still works.
  }

  const created = `study-room-${now()}-${randomId()}`.slice(0, 128)
  try {
    storage?.setItem(STORAGE_KEY, created)
  } catch {
    // Keep the generated id for this adapter lifetime when persistence is unavailable.
  }
  return created
}
