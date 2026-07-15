type AuthSessionListener = () => void;

const listeners = new Set<AuthSessionListener>();

export function subscribeAuthSessionChanges(listener: AuthSessionListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAuthSessionChanged() {
  for (const listener of listeners) {
    listener();
  }
}
