import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity, Alert, RefreshControl, TextInput, Modal, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

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

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
  const symbol = currency === 'NGN' ? '₦' : '$';
  return `${symbol}${amount.toFixed(2)}`;
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

type Subscription = {
  id: string;
  customerName: string;
  planName: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'active' | 'canceled' | 'past_due' | 'trialing';
  startDate: string;
  endDate: string;
};

const StripeSubscriptionsScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null);

  // tRPC queries and mutations
  const { data: subscriptions, isLoading, isError, error, refetch } = trpc.stripeSubscriptions.list.useQuery();
  const createSubscriptionMutation = trpc.stripeSubscriptions.create.useMutation();
  const updateSubscriptionMutation = trpc.stripeSubscriptions.update.useMutation();
  const deleteSubscriptionMutation = trpc.stripeSubscriptions.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredSubscriptions = subscriptions?.filter(sub =>
    sub.customerName.toLowerCase().includes(searchText.toLowerCase()) ||
    sub.planName.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const handleCreate = async (newSubscriptionData: Omit<Subscription, 'id'>) => {
    try {
      await createSubscriptionMutation.mutateAsync(newSubscriptionData);
      setCreateModalVisible(false);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to create subscription.');
    }
  };

  const handleEdit = async (updatedSubscriptionData: Subscription) => {
    if (!currentSubscription) return;
    try {
      await updateSubscriptionMutation.mutateAsync(updatedSubscriptionData);
      setEditModalVisible(false);
      setCurrentSubscription(null);
      refetch();
    } catch (err) {
      Alert.alert('Error', 'Failed to update subscription.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this subscription?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSubscriptionMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete subscription.');
            }
          },
        },
      ]
    );
  };

  const renderStatusBadge = (status: Subscription['status']) => {
    let backgroundColor;
    let textColor = COLORS.text;
    switch (status) {
      case 'active':
        backgroundColor = COLORS.success;
        break;
      case 'canceled':
        backgroundColor = COLORS.error;
        break;
      case 'past_due':
        backgroundColor = COLORS.warning;
        break;
      case 'trialing':
        backgroundColor = COLORS.primary;
        break;
      default:
        backgroundColor = COLORS.muted;
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor }]}>
        <Text style={[styles.statusBadgeText, { color: textColor }]}>{status.replace('_', ' ').toUpperCase()}</Text>
      </View>
    );
  };

  const renderSubscriptionItem = ({ item }: { item: Subscription }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.customerName}</Text>
        {renderStatusBadge(item.status)}
      </View>
      <Text style={styles.cardText}>Plan: {item.planName}</Text>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Start Date: {formatDate(item.startDate)}</Text>
      <Text style={styles.cardText}>End Date: {formatDate(item.endDate)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]}
          onPress={() => {
            setCurrentSubscription(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error }]}
          onPress={() => handleDelete(item.id)}
        >
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading subscriptions...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch subscriptions'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetch}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Stripe Subscriptions</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.createButtonText}>+ Add Subscription</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by customer or plan name..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredSubscriptions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No subscriptions found.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredSubscriptions}
          keyExtractor={(item) => item.id}
          renderItem={renderSubscriptionItem}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Subscription Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Subscription</Text>
            {/* Form fields for new subscription */}
            <TextInput style={styles.modalInput} placeholder="Customer Name" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Plan Name" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Amount" keyboardType="numeric" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Status" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="Start Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} />
            <TextInput style={styles.modalInput} placeholder="End Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={() => handleCreate({
                customerName: 'New Customer',
                planName: 'Basic Plan',
                amount: 100,
                currency: 'USD',
                status: 'trialing',
                startDate: '2026-01-01',
                endDate: '2027-01-01',
              })} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Subscription Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Subscription</Text>
            {/* Form fields for editing subscription */}
            <TextInput style={styles.modalInput} placeholder="Customer Name" placeholderTextColor={COLORS.muted} value={currentSubscription?.customerName} />
            <TextInput style={styles.modalInput} placeholder="Plan Name" placeholderTextColor={COLORS.muted} value={currentSubscription?.planName} />
            <TextInput style={styles.modalInput} placeholder="Amount" keyboardType="numeric" placeholderTextColor={COLORS.muted} value={currentSubscription?.amount.toString()} />
            <TextInput style={styles.modalInput} placeholder="Currency (NGN/USD)" placeholderTextColor={COLORS.muted} value={currentSubscription?.currency} />
            <TextInput style={styles.modalInput} placeholder="Status" placeholderTextColor={COLORS.muted} value={currentSubscription?.status} />
            <TextInput style={styles.modalInput} placeholder="Start Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={currentSubscription?.startDate} />
            <TextInput style={styles.modalInput} placeholder="End Date (YYYY-MM-DD)" placeholderTextColor={COLORS.muted} value={currentSubscription?.endDate} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={() => handleEdit(currentSubscription!)} color={COLORS.primary} />
            </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.text,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    paddingHorizontal: 15,
    margin: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContentContainer: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 15,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 15,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    marginLeft: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.card,
    color: COLORS.text,
    paddingHorizontal: 10,
    marginBottom: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
});

export default StripeSubscriptionsScreen;
