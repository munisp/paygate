import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, SafeAreaView, StatusBar, RefreshControl, Alert, TouchableOpacity, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Helper for currency formatting (assuming Naira or USD)
const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
};

interface Subscription {
  id: string;
  planName: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'active' | 'inactive' | 'pending' | 'cancelled';
  startDate: string;
  endDate: string;
  customerName: string;
}

const SubscriptionsPageScreen = () => {
  const navigation = useNavigation();
  const [isModalVisible, setModalVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<Partial<Subscription> | null>(null);
  const [searchText, setSearchText] = useState('');

  const { data: subscriptions, isLoading, isError, error, refetch } = trpc.subscriptions.list.useQuery();
  const createSubscriptionMutation = trpc.subscriptions.create.useMutation();
  const updateSubscriptionMutation = trpc.subscriptions.update.useMutation();
  const deleteSubscriptionMutation = trpc.subscriptions.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredSubscriptions = subscriptions?.filter(sub =>
    sub.planName.toLowerCase().includes(searchText.toLowerCase()) ||
    sub.customerName.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreatePress = () => {
    setIsEditMode(false);
    setCurrentSubscription({});
    setModalVisible(true);
  };

  const handleEditPress = (subscription: Subscription) => {
    setIsEditMode(true);
    setCurrentSubscription(subscription);
    setModalVisible(true);
  };

  const handleDeletePress = (id: string) => {
    Alert.alert(
      'Delete Subscription',
      'Are you sure you want to delete this subscription?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await deleteSubscriptionMutation.mutateAsync({ id });
              refetch();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete subscription.');
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  };

  const handleSaveSubscription = async () => {
    if (!currentSubscription?.planName || !currentSubscription?.amount || !currentSubscription?.currency || !currentSubscription?.startDate || !currentSubscription?.endDate || !currentSubscription?.customerName) {
      Alert.alert('Error', 'Please fill all required fields.');
      return;
    }

    try {
      if (isEditMode && currentSubscription.id) {
        await updateSubscriptionMutation.mutateAsync(currentSubscription as Subscription);
      } else {
        await createSubscriptionMutation.mutateAsync(currentSubscription as Omit<Subscription, 'id' | 'status'>);
      }
      refetch();
      setModalVisible(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to save subscription.');
    }
  };

  const getStatusBadgeStyle = (status: Subscription['status']) => {
    switch (status) {
      case 'active': return { backgroundColor: COLORS.success };
      case 'inactive': return { backgroundColor: COLORS.error };
      case 'pending': return { backgroundColor: COLORS.warning };
      case 'cancelled': return { backgroundColor: COLORS.muted };
      default: return { backgroundColor: COLORS.muted };
    }
  };

  const renderSubscriptionItem = ({ item }: { item: Subscription }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.planName}>{item.planName}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Customer: {item.customerName}</Text>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Period: {formatDate(item.startDate)} - {formatDate(item.endDate)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => handleEditPress(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeletePress(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading subscriptions...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch subscriptions.'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!filteredSubscriptions || filteredSubscriptions.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No subscriptions found.</Text>
        <Button title="Create New Subscription" onPress={handleCreatePress} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Subscriptions</Text>
        <TouchableOpacity onPress={handleCreatePress} style={styles.createButton}>
          <Text style={styles.createButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search subscriptions..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredSubscriptions}
        keyExtractor={(item) => item.id}
        renderItem={renderSubscriptionItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{isEditMode ? 'Edit Subscription' : 'Create Subscription'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Plan Name"
              placeholderTextColor={COLORS.muted}
              value={currentSubscription?.planName || ''}
              onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev, planName: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentSubscription?.amount?.toString() || ''}
              onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev, amount: parseFloat(text) || 0 }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={currentSubscription?.currency || ''}
              onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev, currency: text as 'NGN' | 'USD' }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Start Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={currentSubscription?.startDate || ''}
              onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev, startDate: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="End Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={currentSubscription?.endDate || ''}
              onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev, endDate: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Customer Name"
              placeholderTextColor={COLORS.muted}
              value={currentSubscription?.customerName || ''}
              onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev, customerName: text }))}
            />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={handleSaveSubscription} color={COLORS.primary} />
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
    color: COLORS.text,
    marginTop: 10,
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
    marginBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: 'bold',
  },
  searchInput: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    margin: 16,
    color: COLORS.text,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 4,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 20,
    width: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 15,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
});

export default SubscriptionsPageScreen;