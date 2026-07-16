export type ForegroundAppState =
  | 'active'
  | 'background'
  | 'inactive'
  | 'unknown'
  | 'extension';

export interface ForegroundTaskRunner {
  handleAppStateChange: (state: ForegroundAppState) => Promise<void> | void;
  cancel: () => void;
}

export function createRunOnceWhenActive(
  task: () => Promise<void>,
  onError: (error: unknown) => void,
): ForegroundTaskRunner {
  let cancelled = false;
  let completed = false;
  let inFlight = false;

  const handleAppStateChange = (state: ForegroundAppState) => {
    if (state !== 'active' || cancelled || completed || inFlight) {
      return;
    }

    inFlight = true;
    return task()
      .then(() => {
        completed = true;
      })
      .catch(error => {
        onError(error);
      })
      .finally(() => {
        inFlight = false;
      });
  };

  return {
    handleAppStateChange,
    cancel: () => {
      cancelled = true;
    },
  };
}
