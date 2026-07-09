import { describe, expect, it, vi } from 'vitest';
import { createSocketSession } from './socketSession';

describe('createSocketSession', () => {
  it('keeps one socket alive until idempotent disposal', () => {
    const disconnect = vi.fn();
    const socket = { disconnect };
    const factory = vi.fn(() => socket);

    const session = createSocketSession(factory as never);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(session.socket).toBe(socket);
    expect(disconnect).not.toHaveBeenCalled();

    session.dispose();
    session.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
