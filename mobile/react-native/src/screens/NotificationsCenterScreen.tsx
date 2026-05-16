import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
  TextInput,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Real tRPC client

// Design system colors
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

// Dummy type for notification, replace with actual tRPC type
interface Notification {
  id: string;
  title: string;
  message: string;
  status: 'read' | 'unread';
  createdAt: string;
  amount?: number;
  currency?: 'NGN' | 'USD';
}

const NotificationsCenterScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');

  // tRPC query for fetching notifications
  const { data, isLoading, isError, refetch } = trpc.notifications.list.useQuery();

  // tRPC mutation for marking a notification as read
  const markAsReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      refetch(); // Refresh list after successful mutation
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to mark as read: ${error.message}`);
    },
  });

  // tRPC mutation for deleting a notification
  const deleteNotificationMutation = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      refetch(); // Refresh list after successful mutation
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete: ${error.message}`);
    },
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredNotifications = data?.filter((notification) =>
    notification.title.toLowerCase().includes(searchText.toLowerCase()) ||
    notification.message.toLowerCase().includes(searchText.toLowerCase())
  );

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    if (currency === 'NGN') {
      return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (currency === 'USD') {
      return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return amount.toString();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString(); // Or use a more specific format like 'MM/DD/YYYY HH:mm'
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteNotificationMutation.mutate({ id }) },
      ],
      { cancelable: true }
    );
  };

  const renderNotificationItem = ({ item }: { item: Notification }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <View style={[styles.statusBadge, item.status === 'read' ? styles.statusRead : styles.statusUnread]}>
          <Text style={styles.statusText}>{item.status === 'read' ? 'Read' : 'Unread'}</Text>
        </View>
      </View>
      <Text style={styles.cardMessage}>{item.message}</Text>
      {item.amount !== undefined && item.currency && (
        <Text style={styles.cardAmount}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      )}
      <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        {item.status === 'unread' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.markAsReadButton]}
            onPress={() => markAsReadMutation.mutate({ id: item.id })}
            disabled={markAsReadMutation.isLoading}
          >
            {markAsReadMutation.isLoading ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <Text style={styles.actionButtonText}>Mark as Read</Text>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDelete(item.id)}
          disabled={deleteNotificationMutation.isLoading}
        >
          {deleteNotificationMutation.isLoading ? (
            <ActivityIndicator color={COLORS.text} size="small" />
          ) : (
            <Text style={styles.actionButtonText}>Delete</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load notifications.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!filteredNotifications || filteredNotifications.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No notifications found.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.headerTitle}>Notifications Center</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Search notifications..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredNotifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotificationItem}
        contentContainerStyle={styles.listContentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressBackgroundColor={COLORS.card}
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    marginBottom: 10,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    padding: 15,
    textAlign: 'center',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    marginHorizontal: 15,
    marginBottom: 10,
    borderRadius: 8,
    fontSize: 16,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  listContentContainer: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flexShrink: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  statusRead: {
    backgroundColor: COLORS.muted,
  },
  statusUnread: {
    backgroundColor: COLORS.primary,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardMessage: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  cardAmount: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardDate: {
    color: COLORS.muted,
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 10,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markAsReadButton: {
    backgroundColor: COLORS.success,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default NotificationsCenterScreen;
