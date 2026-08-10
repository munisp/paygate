import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// --- Types ---

type NotificationType = 'TRANSACTION' | 'SYSTEM' | 'SECURITY' | 'PAYOUT';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string; // ISO string
  isRead: boolean;
}

interface GroupedNotifications {
  title: string;
  data: Notification[];
}

// --- Constants ---

const COLORS = {
  primary: '#6366F1',
  background: '#0F172A',
  card: '#1E293B',
  text: '#F1F5F9',
  muted: '#94A3B8',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  border: '#334155',
};

// --- Components ---

const NotificationIcon = ({ type }: { type: NotificationType }) => {
  let color = COLORS.primary;
  let label = '•';

  switch (type) {
    case 'TRANSACTION':
      color = COLORS.success;
      label = '$';
      break;
    case 'SECURITY':
      color = COLORS.error;
      label = '!';
      break;
    case 'SYSTEM':
      color = COLORS.primary;
      label = 'i';
      break;
    case 'PAYOUT':
      color = COLORS.warning;
      label = '→';
      break;
  }

  return (
    <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
      <Text style={[styles.iconText, { color }]}>{label}</Text>
    </View>
  );
};

const NotificationItem = ({
  item,
  onPress,
}: {
  item: Notification;
  onPress: (id: string) => void;
}) => {
  const formatRelativeTime = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  return (
    <TouchableOpacity
      style={[styles.notificationItem, !item.isRead && styles.unreadItem]}
      onPress={() => onPress(item.id)}
      activeOpacity={0.7}
    >
      <NotificationIcon type={item.type} />
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <Text style={styles.notificationTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.notificationTime}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
        <Text style={styles.notificationBody} numberOfLines={2}>
          {item.body}
        </Text>
      </View>
      {!item.isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
};

const NotificationsScreen = () => {
  const navigation = useNavigation();
  
  // tRPC Hooks
  const utils = trpc.useContext();
  const { data: notifications, isLoading, isRefetching, refetch, error } = trpc.notifications.getAll.useQuery();
  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.getAll.invalidate();
    },
  });
  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.getAll.invalidate();
    },
  });

  // Grouping logic
  const groupedData = useMemo(() => {
    if (!notifications) return [];

    const groups: { [key: string]: Notification[] } = {};
    
    notifications.forEach((notif) => {
      const date = new Date(notif.createdAt);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      let dateLabel = '';
      if (date.toDateString() === today.toDateString()) {
        dateLabel = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateLabel = 'Yesterday';
      } else {
        dateLabel = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }

      if (!groups[dateLabel]) {
        groups[dateLabel] = [];
      }
      groups[dateLabel].push(notif);
    });

    return Object.keys(groups).map((label) => ({
      title: label,
      data: groups[label],
    }));
  }, [notifications]);

  const unreadCount = useMemo(() => {
    return notifications?.filter((n) => !n.isRead).length || 0;
  }, [notifications]);

  const handleMarkAllRead = () => {
    if (unreadCount === 0) return;
    Alert.alert(
      'Mark all as read',
      'Are you sure you want to mark all notifications as read?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Confirm', 
          onPress: () => markAllAsReadMutation.mutate(),
          style: 'default' 
        },
      ]
    );
  };

  const handleNotificationPress = (id: string) => {
    markAsReadMutation.mutate({ id });
    // Navigation logic could go here, e.g., navigation.navigate('TransactionDetails', { id });
  };

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load notifications</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity 
          onPress={handleMarkAllRead}
          disabled={unreadCount === 0 || markAllAsReadMutation.isLoading}
        >
          <Text style={[
            styles.markAllText, 
            (unreadCount === 0 || markAllAsReadMutation.isLoading) && { opacity: 0.5 }
          ]}>
            Mark all read
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={groupedData}
        keyExtractor={(item) => item.title}
        renderItem={({ item }) => (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{item.title}</Text>
            </View>
            {item.data.map((notification) => (
              <NotificationItem
                key={notification.id}
                item={notification}
                onPress={handleNotificationPress}
              />
            ))}
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No notifications yet</Text>
          </View>
        }
        contentContainerStyle={groupedData.length === 0 && { flex: 1 }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  badge: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  markAllText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionHeaderText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  unreadItem: {
    borderColor: COLORS.primary + '40',
    backgroundColor: COLORS.card,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  iconText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  notificationTime: {
    fontSize: 12,
    color: COLORS.muted,
  },
  notificationBody: {
    fontSize: 14,
    color: COLORS.muted,
    lineHeight: 20,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginLeft: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default NotificationsScreen;
