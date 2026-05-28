import { create } from 'zustand';
import type { UserTier, PlanDuration } from '../mocks/api.mock';

interface PasteStore {
  plaintext: string;
  expirySeconds: number;
  maxViews: number;
  customViewsInput: string;
  useCustomViews: boolean;
  hasPassword: boolean;
  passwordPlaintext: string;
  language: string | null;
  isCreating: boolean;
  createdId: string | null;
  createdKey: string | null;
  isPasswordPaste: boolean;

  tier: UserTier;
  planDuration: PlanDuration | null;
  pastesRemainingToday: number;
  maxExpiry: number;

  isPollingSubscription: boolean;

  setPlaintext: (v: string) => void;
  setExpiry: (seconds: number) => void;
  setMaxViews: (v: number) => void;
  setCustomViewsInput: (v: string) => void;
  setUseCustomViews: (v: boolean) => void;
  setHasPassword: (v: boolean) => void;
  setPasswordPlaintext: (v: string) => void;
  setLanguage: (v: string | null) => void;
  setCreating: (v: boolean) => void;
  setCreated: (id: string, key: string | null, isPasswordPaste: boolean) => void;
  resetCreate: () => void;
  setTier: (tier: UserTier, planDuration: PlanDuration | null) => void;
  setPastesRemainingToday: (v: number) => void;
  setMaxExpiry: (v: number) => void;
  setPollingSubscription: (v: boolean) => void;
}

export const usePasteStore = create<PasteStore>((set) => ({
  plaintext: '',
  expirySeconds: 3600,
  maxViews: 1,
  customViewsInput: '',
  useCustomViews: false,
  hasPassword: false,
  passwordPlaintext: '',
  language: null,
  isCreating: false,
  createdId: null,
  createdKey: null,
  isPasswordPaste: false,
  tier: 'anonymous',
  planDuration: null,
  pastesRemainingToday: 3,
  maxExpiry: 3600,
  isPollingSubscription: false,

  setPlaintext: (v) => set({ plaintext: v }),
  setExpiry: (seconds) => set({ expirySeconds: seconds }),
  setMaxViews: (v) => set({ maxViews: v }),
  setCustomViewsInput: (v) => set({ customViewsInput: v }),
  setUseCustomViews: (v) => set({ useCustomViews: v }),
  setHasPassword: (v) => set({ hasPassword: v }),
  setPasswordPlaintext: (v) => set({ passwordPlaintext: v }),
  setLanguage: (v) => set({ language: v }),
  setCreating: (v) => set({ isCreating: v }),
  setCreated: (id, key, isPasswordPaste) =>
    set({ createdId: id, createdKey: key, isPasswordPaste }),
  resetCreate: () =>
    set({
      plaintext: '',
      createdId: null,
      createdKey: null,
      isPasswordPaste: false,
      hasPassword: false,
      passwordPlaintext: '',
      customViewsInput: '',
      useCustomViews: false,
      language: null,
    }),
  setTier: (tier, planDuration) => set({ tier, planDuration }),
  setPastesRemainingToday: (v) => set({ pastesRemainingToday: v }),
  setMaxExpiry: (v) => set({ maxExpiry: v }),
  setPollingSubscription: (v) => set({ isPollingSubscription: v }),
}));
