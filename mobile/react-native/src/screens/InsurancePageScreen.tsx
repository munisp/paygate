import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  RefreshControl,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path is correct

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
const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  if (currency === 'NGN') {
    return `₦${amount.toLocaleString('en-NG')}`;
  }
  return `$${amount.toLocaleString('en-US')}`;
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Mock types for tRPC data - replace with actual types from your tRPC setup
interface InsuranceItem {
  id: string;
  policyNumber: string;
  provider: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'Active' | 'Expired' | 'Pending' | 'Cancelled';
  startDate: string;
  endDate: string;
}

interface CreateInsuranceInput {
  policyNumber: string;
  provider: string;
  amount: number;
  currency: 'NGN' | 'USD';
  startDate: string;
  endDate: string;
}

interface UpdateInsuranceInput extends CreateInsuranceInput {
  id: string;
}

const InsurancePageScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentItem, setCurrentItem] = useState<InsuranceItem | null>(null);
  const [form, setForm] = useState<CreateInsuranceInput>({
    policyNumber: '',
    provider: '',
    amount: 0,
    currency: 'NGN',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const { data, isLoading, isError, refetch, isRefetching } = trpc.insurance.list.useQuery();
  const createMutation = trpc.insurance.create.useMutation();
  const updateMutation = trpc.insurance.update.useMutation();
  const deleteMutation = trpc.insurance.delete.useMutation();

  const filteredData = data?.filter(
    (item) =>
      item.policyNumber.toLowerCase().includes(searchText.toLowerCase()) ||
      item.provider.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleCreatePress = () => {
    setIsEditing(false);
    setCurrentItem(null);
    setForm({
      policyNumber: '',
      provider: '',
      amount: 0,
      currency: 'NGN',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    });
    setModalVisible(true);
  };

  const handleEditPress = (item: InsuranceItem) => {
    setIsEditing(true);
    setCurrentItem(item);
    setForm({
      policyNumber: item.policyNumber,
      provider: item.provider,
      amount: item.amount,
      currency: item.currency,
      startDate: item.startDate,
      endDate: item.endDate,
    });
    setModalVisible(true);
  };

  const handleDeletePress = (id: string) => {
    Alert.alert(
      'Delete Insurance',
      'Are you sure you want to delete this insurance policy?',
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
              Alert.alert('Error', 'Failed to delete insurance.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleSubmit = async () => {
    try {
      if (isEditing && currentItem) {
        await updateMutation.mutateAsync({ ...form, id: currentItem.id });
      } else {
        await createMutation.mutateAsync(form);
      }
      setModalVisible(false);
      refetch();
    } catch (error) {
      Alert.alert('Error', `Failed to ${isEditing ? 'update' : 'create'} insurance.`);
    }
  };

  const getStatusBadgeStyle = (status: InsuranceItem['status']) => {
    switch (status) {
      case 'Active':
        return styles.statusActive;
      case 'Expired':
        return styles.statusExpired;
      case 'Pending':
        return styles.statusPending;
      case 'Cancelled':
        return styles.statusCancelled;
      default:
        return styles.statusPending;
    }
  };

  const renderItem = ({ item }: { item: InsuranceItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.policyNumber}>{item.policyNumber}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Provider: {item.provider}</Text>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Start Date: {formatDate(item.startDate)}</Text>
      <Text style={styles.cardText}>End Date: {formatDate(item.endDate)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => handleEditPress(item)} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeletePress(item.id)} style={[styles.actionButton, styles.deleteButton]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading insurance policies...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load insurance policies.</Text>
        <TouchableOpacity onPress={refetch} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Insurance Policies</Text>
        <TouchableOpacity onPress={handleCreatePress} style={styles.createButton}>
          <Text style={styles.createButtonText}>Add New</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search by policy number or provider..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredData && filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No insurance policies found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{isEditing ? 'Edit Insurance' : 'Add New Insurance'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Policy Number"
              placeholderTextColor={COLORS.muted}
              value={form.policyNumber}
              onChangeText={(text) => setForm({ ...form, policyNumber: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Provider"
              placeholderTextColor={COLORS.muted}
              value={form.provider}
              onChangeText={(text) => setForm({ ...form, provider: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={form.amount.toString()}
              onChangeText={(text) => setForm({ ...form, amount: parseFloat(text) || 0 })}
            />
            <TextInput
              style={styles.input}
              placeholder="Currency (NGN or USD)"
              placeholderTextColor={COLORS.muted}
              value={form.currency}
              onChangeText={(text) => setForm({ ...form, currency: text as 'NGN' | 'USD' })}
            />
            <TextInput
              style={styles.input}
              placeholder="Start Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={form.startDate}
              onChangeText={(text) => setForm({ ...form, startDate: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="End Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={form.endDate}
              onChangeText={(text) => setForm({ ...form, endDate: text })}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={[styles.modalButton, styles.cancelButton]}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSubmit} style={[styles.modalButton, styles.submitButton]}>
                <Text style={styles.modalButtonText}>{isEditing ? 'Update' : 'Create'}</Text>
              </TouchableOpacity>
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
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
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
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: 'center',
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
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 12,
    margin: 16,
    borderRadius: 8,
    fontSize: 16,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
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
  policyNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  statusActive: {
    backgroundColor: COLORS.success,
  },
  statusExpired: {
    backgroundColor: COLORS.error,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusCancelled: {
    backgroundColor: COLORS.muted,
  },
  statusText: {
    color: COLORS.background,
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
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
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
    width: '90%',
    borderColor: COLORS.border,
    borderWidth: 1,
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
    color: COLORS.text,
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.muted,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
  },
  modalButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default InsurancePageScreen;
