import {describe, expect, it, jest} from '@jest/globals';

import {createRunOnceWhenActive} from '../src/services/playerForegroundBootstrap';

describe('player foreground bootstrap', () => {
  it('waits for foreground and runs a successful task only once', async () => {
    const task = jest.fn(async () => undefined);
    const onError = jest.fn();
    const runner = createRunOnceWhenActive(task, onError);

    runner.handleAppStateChange('background');
    expect(task).not.toHaveBeenCalled();

    await runner.handleAppStateChange('active');
    runner.handleAppStateChange('active');

    expect(task).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('retries on a later foreground transition after a failed attempt', async () => {
    const task = jest
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('not foreground yet'))
      .mockResolvedValueOnce(undefined);
    const onError = jest.fn();
    const runner = createRunOnceWhenActive(task, onError);

    await runner.handleAppStateChange('active');
    expect(onError).toHaveBeenCalledTimes(1);

    runner.handleAppStateChange('background');
    await runner.handleAppStateChange('active');

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('does not start after cancellation', () => {
    const task = jest.fn(async () => undefined);
    const runner = createRunOnceWhenActive(task, jest.fn());

    runner.cancel();
    runner.handleAppStateChange('active');

    expect(task).not.toHaveBeenCalled();
  });
});
