import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {rotateInstallId} from './installId';

// Bump when the privacy policy / consent terms materially change → re-prompts.
export const CONSENT_VERSION = 1;
const STORAGE_KEY = '@radiotedu/consent';

export type AgeRange =
  | 'under18'
  | '18-24'
  | '25-34'
  | '35-44'
  | '45-54'
  | '55plus';
export type Gender = 'female' | 'male' | 'other' | 'na';

export interface ConsentState {
  decided: boolean; // has the user answered the first-launch prompt?
  version: number;
  analytics: boolean; // anonymized usage analytics
  demographics: boolean; // age / gender (special-category → separate consent)
  ageRange: AgeRange | null;
  gender: Gender | null;
}

const DEFAULT_STATE: ConsentState = {
  decided: false,
  version: CONSENT_VERSION,
  analytics: false,
  demographics: false,
  ageRange: null,
  gender: null,
};

interface ConsentContextType {
  consent: ConsentState;
  ready: boolean;
  /** Persist the user's first-launch (or updated) choice. */
  saveConsent: (next: Partial<ConsentState>) => Promise<void>;
  /** Withdraw all consent, clear demographics, rotate the pseudonymous id. */
  withdrawAll: () => Promise<void>;
}

const ConsentContext = createContext<ConsentContextType | undefined>(undefined);

export const ConsentProvider: React.FC<{children: ReactNode}> = ({children}) => {
  const [consent, setConsent] = useState<ConsentState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ConsentState;
          // Re-prompt if the consent version changed.
          if (parsed.version === CONSENT_VERSION) {
            setConsent({...DEFAULT_STATE, ...parsed});
          }
        }
      } catch {
        // ignore — defaults (nothing consented) are the safe state
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = useCallback(async (state: ConsentState) => {
    setConsent(state);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, []);

  const saveConsent = useCallback(
    async (next: Partial<ConsentState>) => {
      const merged: ConsentState = {
        ...consent,
        ...next,
        decided: true,
        version: CONSENT_VERSION,
      };
      // If demographics consent is off, never keep demographic values.
      if (!merged.demographics) {
        merged.ageRange = null;
        merged.gender = null;
      }
      await persist(merged);
    },
    [consent, persist],
  );

  const withdrawAll = useCallback(async () => {
    await rotateInstallId();
    await persist({
      ...DEFAULT_STATE,
      decided: true, // they've decided: opt out of everything
    });
  }, [persist]);

  return (
    <ConsentContext.Provider value={{consent, ready, saveConsent, withdrawAll}}>
      {children}
    </ConsentContext.Provider>
  );
};

export function useConsent(): ConsentContextType {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error('useConsent must be used within ConsentProvider');
  }
  return ctx;
}
