/**
 * Zustand notification store for PayGate React Native app.
 *
 * Responsibilities:
 *  - Hold the in-memory notification list and unread badge count
 *  - Accept real-time pushes from the SSE hook (addNotification)
 *  - Expose optimistic mark-as-read / dismiss helpers
 *  - Persist unread count to AsyncStorage so the badge survives app restarts
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export type NotificationPriority = "low" | "medium" | "high" | "critical";

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  priority: NotificationPriority;
  actionUrl: string | null;
  metadata: string | null;
  entityId: string | null;
  entityType: string | null;
  createdAt: Date;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  isConnected: boolean;
  lastReceivedAt: Date | null;

  // Actions
  setNotifications: (items: AppNotification[], unreadCount: number) => void;
  addNotification: (item: AppNotification) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  dismiss: (id: number) => void;
  dismissAll: () => void;
  setConnected: (connected: boolean) => void;
  setUnreadCount: (count: number) => void;
  loadPersistedUnreadCount: () => Promise<void>;
}

const UNREAD_KEY = "paygate_notif_unread";

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isConnected: false,
  lastReceivedAt: null,

  setNotifications: (items, unreadCount) => {
    set({ notifications: items, unreadCount });
    AsyncStorage.setItem(UNREAD_KEY, String(unreadCount)).catch(() => {});
  },

  addNotification: (item) => {
    const existing = get().notifications;
    // Avoid duplicates
    if (existing.some((n) => n.id === item.id)) return;
    const updated = [item, ...existing];
    const newUnread = get().unreadCount + (item.isRead ? 0 : 1);
    set({ notifications: updated, unreadCount: newUnread, lastReceivedAt: new Date() });
    AsyncStorage.setItem(UNREAD_KEY, String(newUnread)).catch(() => {});
  },

  markRead: (id) => {
    const updated = get().notifications.map((n) =>
      n.id === id ? { ...n, isRead: true } : n
    );
    const newUnread = updated.filter((n) => !n.isRead).length;
    set({ notifications: updated, unreadCount: newUnread });
    AsyncStorage.setItem(UNREAD_KEY, String(newUnread)).catch(() => {});
  },

  markAllRead: () => {
    const updated = get().notifications.map((n) => ({ ...n, isRead: true }));
    set({ notifications: updated, unreadCount: 0 });
    AsyncStorage.setItem(UNREAD_KEY, "0").catch(() => {});
  },

  dismiss: (id) => {
    const updated = get().notifications.filter((n) => n.id !== id);
    const newUnread = updated.filter((n) => !n.isRead).length;
    set({ notifications: updated, unreadCount: newUnread });
    AsyncStorage.setItem(UNREAD_KEY, String(newUnread)).catch(() => {});
  },

  dismissAll: () => {
    set({ notifications: [], unreadCount: 0 });
    AsyncStorage.setItem(UNREAD_KEY, "0").catch(() => {});
  },

  setConnected: (connected) => set({ isConnected: connected }),

  setUnreadCount: (count) => {
    set({ unreadCount: count });
    AsyncStorage.setItem(UNREAD_KEY, String(count)).catch(() => {});
  },

  loadPersistedUnreadCount: async () => {
    try {
      const stored = await AsyncStorage.getItem(UNREAD_KEY);
      if (stored !== null) {
        set({ unreadCount: parseInt(stored, 10) || 0 });
      }
    } catch {
      // ignore
    }
  },
}));
