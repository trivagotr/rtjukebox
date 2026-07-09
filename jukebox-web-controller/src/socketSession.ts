import type { Socket } from 'socket.io-client';

export function createSocketSession(factory: () => Socket) {
  const socket = factory();
  let disposed = false;

  return {
    socket,
    dispose() {
      if (disposed) return;
      disposed = true;
      socket.disconnect();
    },
  };
}
