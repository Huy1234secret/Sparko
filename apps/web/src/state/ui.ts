import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
interface UiState {
  theme: Theme;
  motion: 'system' | 'reduced' | 'full';
  sidebarOpen: boolean;
  selectedGuildId: string | null;
  setTheme: (theme: Theme) => void;
  setMotion: (motion: UiState['motion']) => void;
  setSidebarOpen: (open: boolean) => void;
  selectGuild: (id: string) => void;
}
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      motion: 'system',
      sidebarOpen: false,
      selectedGuildId: null,
      setTheme: (theme) => set({ theme }),
      setMotion: (motion) => set({ motion }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      selectGuild: (selectedGuildId) => set({ selectedGuildId }),
    }),
    {
      name: 'sparko-ui',
      partialize: ({ theme, motion, selectedGuildId }) => ({
        theme,
        motion,
        selectedGuildId,
      }),
    },
  ),
);
