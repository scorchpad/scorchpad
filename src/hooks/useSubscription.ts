import { useEffect, useCallback } from 'react';
import { usePasteStore } from '../store/pasteStore';
import { getCurrentUser, pollSubscriptionStatus } from '../mocks/api.mock';

export function useSubscription() {
  const store = usePasteStore();

  // Destructure stable Zustand action references — actions are stable across renders,
  // so these are safe useCallback / useEffect deps without causing re-renders.
  const setTier = store.setTier;
  const setPastesRemainingToday = store.setPastesRemainingToday;
  const setMaxExpiry = store.setMaxExpiry;
  const isPollingSubscription = store.isPollingSubscription;
  const setPollingSubscription = store.setPollingSubscription;

  // loadUser is stable as long as the action references are stable (always true for Zustand).
  // useCallback here satisfies react-hooks/exhaustive-deps without any eslint-disable.
  const loadUser = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      setTier(user.tier, user.planDuration);
      setPastesRemainingToday(user.pastesRemainingToday);
      setMaxExpiry(user.maxExpiry);
    } catch (err) {
      console.error(err);
    }
  }, [setTier, setPastesRemainingToday, setMaxExpiry]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (!isPollingSubscription) return;

    const interval = setInterval(async () => {
      try {
        const user = await pollSubscriptionStatus();
        if (user.tier !== 'anonymous') {
          setTier(user.tier, user.planDuration);
          setPollingSubscription(false);
        }
      } catch {
        // Polling error — silent, will retry on next interval
      }
    }, 3000);

    const timeout = setTimeout(() => {
      setPollingSubscription(false);
    }, 120_000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isPollingSubscription, setTier, setPollingSubscription]);
}
