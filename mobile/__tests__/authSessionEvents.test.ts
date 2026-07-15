import {describe, expect, it, jest} from '@jest/globals';

import {
  notifyAuthSessionChanged,
  subscribeAuthSessionChanges,
} from '../src/services/authSessionEvents';

describe('auth session change notifications', () => {
  it('notifies active listeners without carrying token data', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAuthSessionChanges(listener);

    notifyAuthSessionChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith();

    unsubscribe();
    notifyAuthSessionChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
