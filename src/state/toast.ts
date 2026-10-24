import { create } from 'zustand';
import type { ToastItem } from '../types';

let nextId = 1;

interface ToastState {
  items: ToastItem[];
  push: (message: string, options?: { actionLabel?: string; onAction?: () => void; tone?: 'default' | 'error' }) => void;
  dismiss: (id: number) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (message, options) => {
    const id = nextId++;
    const item: ToastItem = {
      id,
      message,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction,
      tone: options?.tone ?? 'default',
    };
    set((state) => ({ items: [...state.items, item] }));
    window.setTimeout(() => {
      set((state) => ({ items: state.items.filter((entry) => entry.id !== id) }));
    }, options?.actionLabel ? 5200 : 3200);
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((entry) => entry.id !== id) })),
}));
