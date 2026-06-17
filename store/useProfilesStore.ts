// store/useProfilesStore.ts — Zustand state for Financial Profiles
//
// Mirrors the pattern in useAppStore.ts.
// SQLite is source of truth; this is the in-memory UI cache.

import { create } from 'zustand';
import { FinancialProfile } from '@/types/profiles';

interface ProfilesState {
  profiles: FinancialProfile[];
  setProfiles: (p: FinancialProfile[]) => void;
  updateProfileInStore: (id: string, data: Partial<FinancialProfile>) => void;
  removeProfileFromStore: (id: string) => void;
  addProfileToStore: (p: FinancialProfile) => void;
}

export const useProfilesStore = create<ProfilesState>((set) => ({
  profiles: [],
  setProfiles: (profiles) => set({ profiles }),

  updateProfileInStore: (id, data) =>
    set((s) => ({
      profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...data } : p)),
    })),

  removeProfileFromStore: (id) =>
    set((s) => ({ profiles: s.profiles.filter((p) => p.id !== id) })),

  addProfileToStore: (profile) =>
    set((s) => ({ profiles: [profile, ...s.profiles] })),
}));
