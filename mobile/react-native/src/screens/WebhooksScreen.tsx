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
  Switch,
  TextInput,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

/**
 * Design System Colors
 */
const colors = {
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

/**
 * TypeScript Interfaces
 */
interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastDeliveryStatus: 'success' | 'failed' | 'pending' | 'none';
  recentDeliveriesCount: number;
  createdAt: string;
}

/**
 * Webhook Card Component
 */
const WebhookCard = ({
  item,
  onToggle,
  onPress,
}: {
  item: WebhookEndpoint;
  onToggle: (id: string, value: boolean) => void;
  onPress: (item: WebhookEndpoint) => void;
}) => {
  const getStatusColor = (status: WebhookEndpoint['lastDeliveryStatus']) => {
    switch (status) {
      case 'success':
        return colors.success;
      case 'failed':
        return colors.error;
      case 'pending':
        return colors.warning;
      default:
        return colors.muted;
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.urlContainer}>
          <Text style={styles.urlText} numberOfLines={1} ellipsizeMode="middle">
            {item.url}
          </Text>
        </View>
        <Switch
          value={item.isActive}
          onValueChange={(value) => onToggle(item.id, value)}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View style={styles.eventContainer}>
        {item.events.slice(0, 3).map((event, index) => (
          <View key={index} style={styles.eventBadge}>
            <Text style={styles.eventBadgeText}>{event}</Text>
          </View>
        ))}
        {item.events.length > 3 && (
          <Text style={styles.moreEventsText}>+{item.events.length - 3} more</Text>
        )}
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.footerItem}>
          <Text style={styles.footerLabel}>Last Delivery:</Text>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(item.lastDeliveryStatus) },
            ]}
          />
          <Text style={[styles.footerValue, { color: getStatusColor(item.lastDeliveryStatus) }]}>
            {item.lastDeliveryStatus.charAt(0).toUpperCase() + item.lastDeliveryStatus.slice(1)}
          </Text>
        </View>
        <View style={styles.footerItem}>
          <Text style={styles.footerLabel}>Recent:</Text>
          <Text style={styles.footerValue}>{item.recentDeliveriesCount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

/**
 * Main WebhooksScreen Component
 */
const WebhooksScreen = () => {
  const navigation = useNavigation<any>();
  const [searchQuery, setSearchQuery] = useState('');

  // tRPC Queries & Mutations
  const { data: webhooks, isLoading, isError, refetch } = trpc.webhook.list.useQuery();
  const toggleMutation = trpc.webhook.toggleStatus.useMutation({
    onSuccess: () => refetch(),
    onError: (error) => Alert.alert('Error', error.message || 'Failed to update status'),
  });

  const handleToggle = (id: string, isActive: boolean) => {
    toggleMutation.mutate({ id, isActive });
  };

  const handleAddWebhook = () => {
    navigation.navigate('AddWebhook');
  };

  const handleWebhookPress = (item: WebhookEndpoint) => {
    navigation.navigate('WebhookDetails', { id: item.id });
  };

  const filteredWebhooks = useMemo(() => {
    if (!webhooks) return [];
    return webhooks.filter((w: WebhookEndpoint) =>
      w.url.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [webhooks, searchQuery]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load webhooks</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Webhooks</Text>
        <Text style={styles.subtitle}>Manage your endpoint notifications</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search endpoints..."
          placeholderTextColor={colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredWebhooks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <WebhookCard
            item={item}
            onToggle={handleToggle}
            onPress={handleWebhookPress}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No webhooks match your search' : 'No webhooks configured yet'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={handleAddWebhook}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 4,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginVertical: 15,
  },
  searchInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  urlContainer: {
    flex: 1,
    marginRight: 10,
  },
  urlText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  eventContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  eventBadge: {
    backgroundColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  eventBadgeText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  moreEventsText: {
    fontSize: 12,
    color: colors.muted,
    alignSelf: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 12,
    color: colors.muted,
    marginRight: 6,
  },
  footerValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  emptyContainer: {
    marginTop: 100,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabIcon: {
    fontSize: 32,
    color: '#FFFFFF',
    marginTop: -2,
  },
});

export default WebhooksScreen;
