import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { trpc } from '../../src/trpc';
import { formatDistanceToNow } from 'date-fns';

type Notification = {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string | Date;
};

const TYPE_ICON: Record<string, string> = {
  payment: '💳',
  payout: '💸',
  dispute: '⚠️',
  fraud: '🚨',
  kyc: '🪪',
  system: '🔔',
};

function NotificationItem({
  item,
  onPress,
}: {
  item: Notification;
  onPress: (id: number) => void;
}) {
  const icon = TYPE_ICON[item.type] ?? '🔔';
  const timeAgo = formatDistanceToNow(new Date(item.createdAt), { addSuffix: true });

  return (
    <TouchableOpacity
      style={[styles.item, !item.isRead && styles.unread]}
      onPress={() => onPress(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, !item.isRead && styles.titleBold]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.time}>{timeAgo}</Text>
      </View>
      {!item.isRead && <View style={styles.dot} />}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = trpc.notifications.list.useQuery(
    { limit: 50 },
    { refetchInterval: 30_000 }
  );

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => refetch(),
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => refetch(),
  });

  const handleMarkRead = useCallback(
    (id: number) => {
      markReadMutation.mutate({ id });
    },
    [markReadMutation]
  );

  const handleMarkAllRead = useCallback(() => {
    Alert.alert('Mark All Read', 'Mark all notifications as read?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark All Read', onPress: () => markAllReadMutation.mutate({}) },
    ]);
  }, [markAllReadMutation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const notifications: Notification[] = (data as any)?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (isLoading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSub}>{unreadCount} unread</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <NotificationItem item={item} onPress={handleMarkRead} />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>No notifications yet</Text>
            <Text style={styles.emptySubText}>
              Payment updates, dispute alerts, and system messages will appear here.
            </Text>
          </View>
        }
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#f8fafc' },
  headerSub: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  markAllBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  markAllText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  unread: { backgroundColor: '#1e293b' },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  icon: { fontSize: 18 },
  content: { flex: 1 },
  title: { fontSize: 15, color: '#e2e8f0', marginBottom: 3 },
  titleBold: { fontWeight: '700', color: '#f8fafc' },
  body: { fontSize: 13, color: '#94a3b8', lineHeight: 18, marginBottom: 4 },
  time: { fontSize: 11, color: '#64748b' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366f1',
    marginTop: 4,
    marginLeft: 8,
  },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyContainer: { flexGrow: 1 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#e2e8f0', marginBottom: 8 },
  emptySubText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 32 },
});
