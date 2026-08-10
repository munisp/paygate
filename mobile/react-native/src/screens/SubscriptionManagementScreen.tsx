import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, TextInput, Modal, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path is correct

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Mock Subscription Type (replace with actual tRPC type if available)
interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'active' | 'inactive' | 'pending' | 'cancelled';
  startDate: string;
  endDate: string;
  description?: string;
}

const SubscriptionManagementScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null);

  // Mock tRPC queries and mutations
  const { data: subscriptions, isLoading, isError, refetch } = trpc.subscriptions.list.useQuery();
  const createMutation = trpc.subscriptions.create.useMutation();
  const updateMutation = trpc.subscriptions.update.useMutation();
  const deleteMutation = trpc.subscriptions.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredSubscriptions = subscriptions?.filter(sub =>
    sub.name.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const handleCreateSubscription = async (newSub: Omit<Subscription, 'id'>) => {
    try {
      await createMutation.mutateAsync(newSub);
      setCreateModalVisible(false);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create subscription.');
    }
  };

  const handleEditSubscription = async (updatedSub: Subscription) => {
    try {
      await updateMutation.mutateAsync(updatedSub);
      setEditModalVisible(false);
      setCurrentSubscription(null);
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update subscription.');
    }
  };

  const handleDeleteSubscription = (id: string) => {
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
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
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
      case 'inactive':
        backgroundColor = COLORS.muted;
        break;
      case 'pending':
        backgroundColor = COLORS.warning;
        break;
      case 'cancelled':
        backgroundColor = COLORS.error;
        break;
      default:
        backgroundColor = COLORS.muted;
    }
    return (
      <View style={[styles.statusBadge, { backgroundColor }]}>
        <Text style={[styles.statusBadgeText, { color: textColor }]}>{status.toUpperCase()}</Text>
      </View>
    );
  };

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const renderSubscriptionItem = ({ item }: { item: Subscription }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        {renderStatusBadge(item.status)}
      </View>
      <Text style={styles.cardText}>Amount: {formatAmount(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Starts: {formatDate(item.startDate)}</Text>
      <Text style={styles.cardText}>Ends: {formatDate(item.endDate)}</Text>
      {item.description && <Text style={styles.cardText}>Description: {item.description}</Text>}
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
          style={[styles.actionButton, { backgroundColor: COLORS.error, marginLeft: 10 }]} 
          onPress={() => handleDeleteSubscription(item.id)}
        >
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading subscriptions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load subscriptions.</Text>
          <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Subscription Management</Text>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} 
          onPress={() => setCreateModalVisible(true)}
        >
          <Text style={styles.actionButtonText}>Add Subscription</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search subscriptions..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      {filteredSubscriptions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No subscriptions found.</Text>
          <Button title="Refresh" onPress={() => refetch()} color={COLORS.primary} />
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
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Name" onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, name: text }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Amount" keyboardType="numeric" onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, amount: parseFloat(text) }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Currency (NGN/USD)" onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, currency: text as 'NGN' | 'USD' }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Status (active/inactive/pending/cancelled)" onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, status: text as 'active' | 'inactive' | 'pending' | 'cancelled' }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Start Date (YYYY-MM-DD)" onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, startDate: text }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="End Date (YYYY-MM-DD)" onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, endDate: text }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Description (Optional)" onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, description: text }))} />
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={() => handleCreateSubscription(currentSubscription as Omit<Subscription, 'id'>)} color={COLORS.primary} />
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
            {currentSubscription && (
              <>
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Name" value={currentSubscription.name} onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, name: text }))} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Amount" keyboardType="numeric" value={currentSubscription.amount.toString()} onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, amount: parseFloat(text) }))} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Currency (NGN/USD)" value={currentSubscription.currency} onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, currency: text as 'NGN' | 'USD' }))} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Status (active/inactive/pending/cancelled)" value={currentSubscription.status} onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, status: text as 'active' | 'inactive' | 'pending' | 'cancelled' }))} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Start Date (YYYY-MM-DD)" value={currentSubscription.startDate} onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, startDate: text }))} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="End Date (YYYY-MM-DD)" value={currentSubscription.endDate} onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, endDate: text }))} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Description (Optional)" value={currentSubscription.description} onChangeText={(text) => setCurrentSubscription(prev => ({ ...prev!, description: text }))} />
              </>
            )}
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={() => handleEditSubscription(currentSubscription as Subscription)} color={COLORS.primary} />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  loadingContainer: {
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
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    height: 40,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 15,
  },
});

export default SubscriptionManagementScreen;
