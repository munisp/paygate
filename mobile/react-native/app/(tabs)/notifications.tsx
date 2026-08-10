/**
 * Real-time Notification Feed Screen
 *
 * Features:
 *  - SSE-powered live updates via useRealtimeNotifications hook
 *  - Zustand store for instant optimistic UI (no re-fetch needed)
 *  - Filter tabs: All | Unread | Payments | Fraud | Disputes | System
 *  - Swipe-to-dismiss individual notifications
 *  - Mark single / all as read
 *  - Pull-to-refresh
 *  - Priority badge colours (critical=red, high=orange, medium=blue, low=grey)
 *  - Deep-link navigation via actionUrl
 *  - Live / Polling connection status indicator
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { trpc } from '../../src/lib/trpc';
import { useNotificationStore, AppNotification } from '../../src/stores/notificationStore';
import { useRealtimeNotifications } from '../../src/hooks/useRealtimeNotifications';
import { NotificationDetailSheet } from '../../src/components/NotificationDetailSheet';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'unread' | 'payment' | 'fraud' | 'dispute' | 'system';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getTypeConfig(type: string): { icon: string; color: string; bg: string } {
  switch (type) {
    case 'payment':
    case 'payout':
      return { icon: 'cash', color: '#22c55e', bg: '#052e16' };
    case 'fraud':
      return { icon: 'warning', color: '#ef4444', bg: '#2d0707' };
    case 'dispute':
      return { icon: 'alert-circle', color: '#f59e0b', bg: '#2d1a00' };
    case 'kyc':
      return { icon: 'person-circle', color: '#8b5cf6', bg: '#1e0a3c' };
    case 'system':
    default:
      return { icon: 'information-circle', color: '#6366f1', bg: '#1e1b4b' };
  }
}

function getPriorityStyle(priority: string): { border: string; dot: string } {
  switch (priority) {
    case 'critical': return { border: '#ef4444', dot: '#ef4444' };
    case 'high':     return { border: '#f59e0b', dot: '#f59e0b' };
    case 'medium':   return { border: '#6366f1', dot: '#6366f1' };
    default:         return { border: '#334155', dot: '#475569' };
  }
}

// ─── Notification Item ────────────────────────────────────────────────────────

interface NotificationItemProps {
  item: AppNotification;
  onPress: (id: number, actionUrl: string | null) => void;
  onMarkRead: (id: number) => void;
  onDismiss: (id: number) => void;
}

function NotificationItem({ item, onPress, onMarkRead, onDismiss }: NotificationItemProps) {
  const cfg = getTypeConfig(item.type);
  const pri = getPriorityStyle(item.priority);
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = useCallback(
    (progress: Animated.AnimatedInterpolation<number>) => {
      const translateX = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [120, 0],
      });
      return (
        <Animated.View style={[styles.swipeActions, { transform: [{ translateX }] }]}>
          {!item.isRead && (
            <TouchableOpacity
              style={[styles.swipeBtn, styles.swipeBtnRead]}
              onPress={() => {
                swipeableRef.current?.close();
                onMarkRead(item.id);
              }}
            >
              <Ionicons name="checkmark-done" size={20} color="#fff" />
              <Text style={styles.swipeBtnText}>Read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.swipeBtn, styles.swipeBtnDismiss]}
            onPress={() => {
              swipeableRef.current?.close();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onDismiss(item.id);
            }}
          >
            <Ionicons name="trash" size={20} color="#fff" />
            <Text style={styles.swipeBtnText}>Dismiss</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [item.id, item.isRead, onMarkRead, onDismiss]
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      <TouchableOpacity
        style={[
          styles.item,
          !item.isRead && styles.itemUnread,
          { borderLeftColor: pri.border },
        ]}
        onPress={() => {
          if (!item.isRead) onMarkRead(item.id);
          onPress(item.id, item.actionUrl);
        }}
        activeOpacity={0.7}
      >
        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, !item.isRead && styles.titleBold]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            {item.priority === 'critical' && (
              <View style={styles.criticalBadge}>
                <Text style={styles.criticalText}>CRITICAL</Text>
              </View>
            )}
            {item.priority === 'high' && (
              <View style={styles.highBadge}>
                <Text style={styles.highText}>HIGH</Text>
              </View>
            )}
          </View>
          <Text style={styles.body} numberOfLines={2}>
            {item.body}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
            {item.actionUrl && (
              <View style={styles.actionChip}>
                <Ionicons name="arrow-forward" size={10} color="#6366f1" />
                <Text style={styles.actionChipText}>View</Text>
              </View>
            )}
          </View>
        </View>

        {/* Unread dot */}
        {!item.isRead && (
          <View style={[styles.unreadDot, { backgroundColor: pri.dot }]} />
        )}
      </TouchableOpacity>
    </Swipeable>
  );
}

// ─── Filter Tab Bar ───────────────────────────────────────────────────────────

interface FilterBarProps {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
  counts: Record<FilterTab, number>;
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'payment', label: 'Payments' },
  { key: 'fraud', label: 'Fraud' },
  { key: 'dispute', label: 'Disputes' },
  { key: 'system', label: 'System' },
];

function FilterBar({ active, onChange, counts }: FilterBarProps) {
  return (
    <View style={styles.filterBar}>
      <FlatList
        horizontal
        data={TABS}
        keyExtractor={(t) => t.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}
        renderItem={({ item: tab }) => {
          const isActive = tab.key === active;
          const cnt = counts[tab.key];
          return (
            <TouchableOpacity
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => onChange(tab.key)}
            >
              <Text
                style={[styles.filterTabText, isActive && styles.filterTabTextActive]}
              >
                {tab.label}
              </Text>
              {cnt > 0 && (
                <View
                  style={[
                    styles.filterBadge,
                    isActive && styles.filterBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterBadgeText,
                      isActive && styles.filterBadgeTextActive,
                    ]}
                  >
                    {cnt > 99 ? '99+' : cnt}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  // Real-time SSE connection
  const { isConnected } = useRealtimeNotifications();

  // Zustand store
  const {
    notifications,
    unreadCount,
    setNotifications,
    markRead: storeMarkRead,
    markAllRead: storeMarkAllRead,
    dismiss: storeDismiss,
    dismissAll: storeDismissAll,
  } = useNotificationStore();

  // tRPC queries and mutations
  const utils = trpc.useUtils();
  const { data: listData, isLoading, refetch } = trpc.notifications.list.useQuery(
    { limit: 100, unreadOnly: false },
    { refetchInterval: isConnected ? false : 30_000 } // poll only when SSE is down
  );

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onMutate: ({ id }) => storeMarkRead(id),
    onSettled: () => utils.notifications.list.invalidate(),
  });
  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onMutate: () => storeMarkAllRead(),
    onSettled: () => utils.notifications.list.invalidate(),
  });
  const dismissMutation = trpc.notifications.dismiss.useMutation({
    onMutate: ({ id }) => storeDismiss(id),
    onSettled: () => utils.notifications.list.invalidate(),
  });
  const dismissAllMutation = trpc.notifications.dismissAll.useMutation({
    onMutate: () => storeDismissAll(),
    onSettled: () => utils.notifications.list.invalidate(),
  });

  // Sync server data into Zustand store
  useEffect(() => {
    if (listData) {
      const mapped = ((listData as any).notifications ?? []).map((n: any) => ({
        ...n,
        createdAt: n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt),
        priority: n.priority ?? 'medium',
        actionUrl: n.actionUrl ?? null,
        metadata: n.metadata ?? null,
      }));
      setNotifications(mapped, (listData as any).unreadCount ?? 0);
    }
  }, [listData, setNotifications]);

  // Filter logic
  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (activeTab === 'unread') return !n.isRead;
      if (activeTab === 'all') return true;
      return n.type === activeTab || (activeTab === 'payment' && n.type === 'payout');
    });
  }, [notifications, activeTab]);

  // Tab counts
  const counts = useMemo<Record<FilterTab, number>>(() => ({
    all: notifications.length,
    unread: notifications.filter((n) => !n.isRead).length,
    payment: notifications.filter((n) => n.type === 'payment' || n.type === 'payout').length,
    fraud: notifications.filter((n) => n.type === 'fraud').length,
    dispute: notifications.filter((n) => n.type === 'dispute').length,
    system: notifications.filter((n) => n.type === 'system' || n.type === 'kyc').length,
  }), [notifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handlePress = useCallback(
    (id: number, _actionUrl: string | null) => {
      // Open detail sheet on tap — user can navigate from there
      const notif = notifications.find((n) => n.id === id);
      if (notif) {
        setSelectedNotification(notif);
        setSheetVisible(true);
      }
    },
    [notifications]
  );

  const handleMarkRead = useCallback(
    (id: number) => {
      markReadMutation.mutate({ id });
    },
    [markReadMutation]
  );

  const handleDismiss = useCallback(
    (id: number) => {
      dismissMutation.mutate({ id });
    },
    [dismissMutation]
  );

  const handleMarkAllRead = useCallback(() => {
    if (unreadCount === 0) return;
    Alert.alert('Mark All Read', `Mark all ${unreadCount} unread notifications as read?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark All Read',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          markAllReadMutation.mutate({});
        },
      },
    ]);
  }, [unreadCount, markAllReadMutation]);

  const handleDismissAll = useCallback(() => {
    Alert.alert('Clear All', 'Remove all notifications from your feed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          dismissAllMutation.mutate({});
        },
      },
    ]);
  }, [dismissAllMutation]);

  if (isLoading && notifications.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading notifications…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.headerMeta}>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount} unread
                </Text>
              </View>
            )}
            <View style={styles.connRow}>
              <View
                style={[
                  styles.connDot,
                  { backgroundColor: isConnected ? '#22c55e' : '#64748b' },
                ]}
              />
              <Text style={styles.connText}>
                {isConnected ? 'Live' : 'Polling'}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.headerBtn} onPress={handleMarkAllRead}>
              <Ionicons name="checkmark-done" size={18} color="#6366f1" />
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity style={styles.headerBtn} onPress={handleDismissAll}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/(tabs)/notification-preferences' as any)}
          >
            <Ionicons name="settings-outline" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter tabs */}
      <FilterBar active={activeTab} onChange={setActiveTab} counts={counts} />

      {/* Swipe hint */}
      {filtered.length > 0 && (
        <View style={styles.swipeHint}>
          <Ionicons name="arrow-back" size={12} color="#475569" />
          <Text style={styles.swipeHintText}>Swipe left to dismiss or mark read</Text>
        </View>
      )}

      {/* Notification list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <NotificationItem
            item={item}
            onPress={handlePress}
            onMarkRead={handleMarkRead}
            onDismiss={handleDismiss}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366f1"
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={56} color="#334155" />
            <Text style={styles.emptyTitle}>
              {activeTab === 'unread' ? 'All caught up!' : 'No notifications'}
            </Text>
            <Text style={styles.emptyBody}>
              {activeTab === 'unread'
                ? 'You have no unread notifications.'
                : 'Payment updates, fraud alerts, and dispute notices will appear here.'}
            </Text>
          </View>
        }
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : undefined}
      />
      {/* Notification detail bottom sheet */}
      <NotificationDetailSheet
        notification={selectedNotification}
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
      />
    </GestureHandlerRootView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    gap: 12,
  },
  loadingText: { color: '#94a3b8', fontSize: 14 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#f8fafc' },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  unreadBadge: {
    backgroundColor: '#312e81',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadBadgeText: { color: '#a5b4fc', fontSize: 11, fontWeight: '600' },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  connDot: { width: 6, height: 6, borderRadius: 3 },
  connText: { color: '#64748b', fontSize: 11 },
  headerActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Filter bar
  filterBar: {
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  filterList: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    gap: 4,
  },
  filterTabActive: { backgroundColor: '#312e81' },
  filterTabText: { color: '#64748b', fontSize: 13, fontWeight: '500' },
  filterTabTextActive: { color: '#a5b4fc', fontWeight: '700' },
  filterBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 18,
    alignItems: 'center',
  },
  filterBadgeActive: { backgroundColor: '#4338ca' },
  filterBadgeText: { color: '#94a3b8', fontSize: 10, fontWeight: '700' },
  filterBadgeTextActive: { color: '#e0e7ff' },

  // Swipe hint
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    backgroundColor: '#0f172a',
  },
  swipeHintText: { color: '#334155', fontSize: 11 },

  // Notification item
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    borderLeftWidth: 3,
    backgroundColor: '#0f172a',
  },
  itemUnread: { backgroundColor: '#0d1829' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  content: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  title: { flex: 1, fontSize: 14, color: '#cbd5e1' },
  titleBold: { fontWeight: '700', color: '#f1f5f9' },
  criticalBadge: {
    backgroundColor: '#7f1d1d',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  criticalText: { color: '#fca5a5', fontSize: 9, fontWeight: '700' },
  highBadge: {
    backgroundColor: '#451a03',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  highText: { color: '#fcd34d', fontSize: 9, fontWeight: '700' },
  body: { fontSize: 13, color: '#64748b', lineHeight: 18, marginBottom: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 11, color: '#475569' },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#1e1b4b',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  actionChipText: { color: '#818cf8', fontSize: 10, fontWeight: '600' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginLeft: 8,
    flexShrink: 0,
  },

  // Swipe actions
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  swipeBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
    gap: 3,
  },
  swipeBtnRead: { backgroundColor: '#1d4ed8' },
  swipeBtnDismiss: { backgroundColor: '#dc2626' },
  swipeBtnText: { color: '#fff', fontSize: 10, fontWeight: '600' },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyContainer: { flexGrow: 1 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2e8f0',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
});
