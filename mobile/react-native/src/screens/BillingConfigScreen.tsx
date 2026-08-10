import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Button,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  if (currency === 'NGN') {
    return `₦${amount.toFixed(2)}`;
  }
  return `$${amount.toFixed(2)}`;
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-US', options);
};

interface BillingConfigItem {
  id: string;
  name: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'active' | 'inactive' | 'pending';
  lastUpdated: string;
}

const BillingConfigScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentEditItem, setCurrentEditItem] = useState<BillingConfigItem | null>(null);

  // Mock tRPC queries and mutations
  const { data, isLoading, isError, refetch } = trpc.billing.getBillingConfig.useQuery();
  const createMutation = trpc.billing.createBillingConfig.useMutation();
  const updateMutation = trpc.billing.updateBillingConfig.useMutation();
  const deleteMutation = trpc.billing.deleteBillingConfig.useMutation();

  const filteredData = data?.filter(item =>
    item.name.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleCreate = (newItem: Omit<BillingConfigItem, 'id' | 'lastUpdated'>) => {
    createMutation.mutate({
      ...newItem,
      id: String(Math.random()), // Mock ID generation
      lastUpdated: new Date().toISOString(),
    }, {
      onSuccess: () => {
        refetch();
        setCreateModalVisible(false);
      },
      onError: (error) => {
        Alert.alert('Error', `Failed to create: ${error.message}`);
      }
    });
  };

  const handleEdit = (updatedItem: BillingConfigItem) => {
    updateMutation.mutate(updatedItem, {
      onSuccess: () => {
        refetch();
        setEditModalVisible(false);
        setCurrentEditItem(null);
      },
      onError: (error) => {
        Alert.alert('Error', `Failed to update: ${error.message}`);
      }
    });
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this billing configuration?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMutation.mutate({ id }, {
              onSuccess: () => {
                refetch();
              },
              onError: (error) => {
                Alert.alert('Error', `Failed to delete: ${error.message}`);
              }
            });
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderItem = ({ item }: { item: BillingConfigItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.badge, item.status === 'active' ? styles.badgeActive : item.status === 'inactive' ? styles.badgeInactive : styles.badgePending]}>
          <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Last Updated: {formatDate(item.lastUpdated)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.primary }]} // Primary for Edit
          onPress={() => {
            setCurrentEditItem(item);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: COLORS.error }]} // Error for Delete
          onPress={() => handleDelete(item.id)}
        >
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading billing configurations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load billing configurations.</Text>
          <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>Billing Configuration</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Add New</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search configurations..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredData.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No billing configurations found.</Text>
          <Button title="Create New" onPress={() => setCreateModalVisible(true)} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Configuration</Text>
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Name" onChangeText={(text) => setCurrentEditItem(prev => ({ ...prev!, name: text }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Amount" keyboardType="numeric" onChangeText={(text) => setCurrentEditItem(prev => ({ ...prev!, amount: parseFloat(text) }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Currency (NGN/USD)" onChangeText={(text) => setCurrentEditItem(prev => ({ ...prev!, currency: text as 'NGN' | 'USD' }))} />
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Status (active/inactive/pending)" onChangeText={(text) => setCurrentEditItem(prev => ({ ...prev!, status: text as 'active' | 'inactive' | 'pending' }))} />
            <View style={styles.modalButtons}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={() => handleCreate(currentEditItem as Omit<BillingConfigItem, 'id' | 'lastUpdated'>)} color={COLORS.primary} disabled={createMutation.isLoading} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Configuration</Text>
            {currentEditItem && (
              <>
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Name" value={currentEditItem.name} onChangeText={(text) => setCurrentEditItem(prev => ({ ...prev!, name: text }))} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Amount" keyboardType="numeric" value={String(currentEditItem.amount)} onChangeText={(text) => setCurrentEditItem(prev => ({ ...prev!, amount: parseFloat(text) }))} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Currency (NGN/USD)" value={currentEditItem.currency} onChangeText={(text) => setCurrentEditItem(prev => ({ ...prev!, currency: text as 'NGN' | 'USD' }))} />
                <TextInput style={styles.modalInput} placeholderTextColor={COLORS.muted} placeholder="Status (active/inactive/pending)" value={currentEditItem.status} onChangeText={(text) => setCurrentEditItem(prev => ({ ...prev!, status: text as 'active' | 'inactive' | 'pending' }))} />
              </>
            )}
            <View style={styles.modalButtons}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={() => handleEdit(currentEditItem!)} color={COLORS.primary} disabled={updateMutation.isLoading} />
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    color: COLORS.muted,
    fontSize: 18,
    textAlign: 'center',
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    margin: 16,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 5,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  badgeActive: {
    backgroundColor: COLORS.success,
  },
  badgeInactive: {
    backgroundColor: COLORS.muted,
  },
  badgePending: {
    backgroundColor: COLORS.warning,
  },
  badgeText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
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
    borderRadius: 10,
    padding: 20,
    width: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
});

export default BillingConfigScreen;
