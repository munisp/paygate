import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

/**
 * Design System Colors
 */
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

/**
 * Types
 */
type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'closed';

interface DisputeTimelineEvent {
  id: string;
  status: string;
  description: string;
  timestamp: string;
}

interface Dispute {
  id: string;
  transactionId: string;
  amount: number;
  currency: string;
  reason: string;
  status: DisputeStatus;
  daysOpen: number;
  createdAt: string;
  timeline: DisputeTimelineEvent[];
}

/**
 * Components
 */

const StatusBadge = ({ status }: { status: DisputeStatus }) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'open':
        return { bg: '#312E81', text: '#A5B4FC' };
      case 'under_review':
        return { bg: '#451A03', text: '#FCD34D' };
      case 'resolved':
        return { bg: '#064E3B', text: '#6EE7B7' };
      case 'closed':
        return { bg: '#1E293B', text: '#94A3B8' };
      default:
        return { bg: COLORS.card, text: COLORS.muted };
    }
  };

  const styles = getStatusStyles();
  const label = status.replace('_', ' ').toUpperCase();

  return (
    <View style={[badgeStyles.container, { backgroundColor: styles.bg }]}>
      <Text style={[badgeStyles.text, { color: styles.text }]}>{label}</Text>
    </View>
  );
};

const badgeStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
  },
});

const DisputeItem = ({ item, onPress }: { item: Dispute; onPress: (item: Dispute) => void }) => (
  <TouchableOpacity style={itemStyles.container} onPress={() => onPress(item)} activeOpacity={0.7}>
    <View style={itemStyles.header}>
      <Text style={itemStyles.amount}>
        {new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency }).format(item.amount)}
      </Text>
      <StatusBadge status={item.status} />
    </View>
    <Text style={itemStyles.reason} numberOfLines={1}>
      {item.reason}
    </Text>
    <View style={itemStyles.footer}>
      <Text style={itemStyles.daysOpen}>{item.daysOpen} days open</Text>
      <Text style={itemStyles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
    </View>
  </TouchableOpacity>
);

const itemStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  amount: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  reason: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  daysOpen: {
    color: COLORS.warning,
    fontSize: 12,
    fontWeight: '600',
  },
  date: {
    color: COLORS.muted,
    fontSize: 12,
  },
});

/**
 * Main Screen
 */
const DisputesScreen = () => {
  const navigation = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<DisputeStatus | 'all'>('all');
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);

  // tRPC Query
  const { data, isLoading, isError, refetch, isRefetching } = trpc.disputes.list.useQuery();

  const filteredDisputes = useMemo(() => {
    if (!data) return [];
    return data.filter((d: Dispute) => {
      const matchesSearch = 
        d.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.transactionId.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = activeFilter === 'all' || d.status === activeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [data, searchQuery, activeFilter]);

  const renderFilterButton = (filter: DisputeStatus | 'all', label: string) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        activeFilter === filter && styles.filterButtonActive,
      ]}
      onPress={() => setActiveFilter(filter)}
    >
      <Text
        style={[
          styles.filterButtonText,
          activeFilter === filter && styles.filterButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (isLoading && !isRefetching) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load disputes</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header & Search */}
      <View style={styles.header}>
        <Text style={styles.title}>Disputes</Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by reason or ID..."
            placeholderTextColor={COLORS.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContainer}>
          {renderFilterButton('all', 'All')}
          {renderFilterButton('open', 'Open')}
          {renderFilterButton('under_review', 'Review')}
          {renderFilterButton('resolved', 'Resolved')}
          {renderFilterButton('closed', 'Closed')}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        data={filteredDisputes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DisputeItem item={item} onPress={setSelectedDispute} />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No disputes found</Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <Modal
        visible={!!selectedDispute}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedDispute(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dispute Details</Text>
              <TouchableOpacity onPress={() => setSelectedDispute(null)}>
                <Text style={styles.closeButton}>Close</Text>
              </TouchableOpacity>
            </View>

            {selectedDispute && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Transaction ID</Text>
                  <Text style={styles.detailValue}>{selectedDispute.transactionId}</Text>
                </View>

                <View style={styles.detailRow}>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Amount</Text>
                    <Text style={styles.detailValue}>
                      {new Intl.NumberFormat('en-US', { 
                        style: 'currency', 
                        currency: selectedDispute.currency 
                      }).format(selectedDispute.amount)}
                    </Text>
                  </View>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <StatusBadge status={selectedDispute.status} />
                  </View>
                </View>

                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Reason</Text>
                  <Text style={styles.detailValue}>{selectedDispute.reason}</Text>
                </View>

                <Text style={styles.timelineTitle}>Timeline</Text>
                {selectedDispute.timeline.map((event, index) => (
                  <View key={event.id} style={styles.timelineItem}>
                    <View style={styles.timelineDotContainer}>
                      <View style={[styles.timelineDot, index === 0 && styles.timelineDotActive]} />
                      {index !== selectedDispute.timeline.length - 1 && <View style={styles.timelineLine} />}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineStatus}>{event.status}</Text>
                      <Text style={styles.timelineDesc}>{event.description}</Text>
                      <Text style={styles.timelineDate}>
                        {new Date(event.timestamp).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 16,
  },
  searchContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    height: 44,
    color: COLORS.text,
    fontSize: 16,
  },
  filterWrapper: {
    marginBottom: 8,
  },
  filterContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterButtonText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 20,
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 40,
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
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeButton: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalBody: {
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailSection: {
    marginBottom: 20,
    flex: 1,
  },
  detailLabel: {
    color: COLORS.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  detailValue: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '500',
  },
  timelineTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
    marginBottom: 20,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 70,
  },
  timelineDotContainer: {
    alignItems: 'center',
    marginRight: 16,
    width: 20,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.border,
    zIndex: 1,
  },
  timelineDotActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.border,
    marginVertical: -4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 24,
  },
  timelineStatus: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  timelineDesc: {
    color: COLORS.muted,
    fontSize: 13,
    marginBottom: 4,
  },
  timelineDate: {
    color: COLORS.muted,
    fontSize: 11,
  },
});

export default DisputesScreen;
