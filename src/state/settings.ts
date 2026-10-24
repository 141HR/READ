import { create } from 'zustand';
import { getSettings, saveSettings } from '../storage/repository';
import { DEFAULT_SETTINGS, type ReaderSettings } from '../types';
import { applyTheme } from '../lib/theme';

interface SettingsState {
  settings: ReaderSettings;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<ReaderSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false,
  hydrate: async () => {
    try {
      const settings = await getSettings();
      applyTheme(settings.theme);
      set({ settings, hydrated: true });
    } catch {
      // IndexedDB 不可用（隐私模式、配额或浏览器限制）时先让界面能打开，
      // 具体数据操作再各自提示，避免永远停在启动占位。
      applyTheme(DEFAULT_SETTINGS.theme);
      set({ settings: DEFAULT_SETTINGS, hydrated: true });
    }
  },
  update: (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    if (patch.theme) applyTheme(patch.theme);
    void saveSettings(next);
  },
}));
