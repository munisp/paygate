import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Button,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Helper functions for formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  const locale = currency === 'NGN' ? 'en-NG' : 'en-US';
  const symbol = currency === 'NGN' ? '₦' : '$';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace(currency, symbol);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Dummy types for loyalty program (replace with actual tRPC types)
interface LoyaltyProgram {
  id: string;
  name: string;
  description: string;
  pointsRequired: number;
  rewardAmount: number;
  currency: 'NGN' | 'USD';
  status: 'Active' | 'Inactive' | 'Archived';
  createdAt: string;
  updatedAt: string;
}

const RestaurantLoyaltyScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingProgram, setEditingProgram] = useState<LoyaltyProgram | null>(null);
  const [programName, setProgramName] = useState('');
  const [programDescription, setProgramDescription] = useState('');
  const [pointsRequired, setPointsRequired] = useState('');
  const [rewardAmount, setRewardAmount] = useState('');
  const [programCurrency, setProgramCurrency] = useState<'NGN' | 'USD'>('NGN');

  // tRPC queries and mutations
  const { data: loyaltyPrograms, isLoading, isError, refetch, isRefetching } = trpc.restaurantLoyalty.list.useQuery();
  const createMutation = trpc.restaurantLoyalty.create.useMutation({
    onSuccess: () => {
      refetch();
      setIsModalVisible(false);
      resetForm();
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to create program: ${error.message}`);
    },
  });
  const updateMutation = trpc.restaurantLoyalty.update.useMutation({
    onSuccess: () => {
      refetch();
      setIsModalVisible(false);
      resetForm();
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to update program: ${error.message}`);
    },
  });
  const deleteMutation = trpc.restaurantLoyalty.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to delete program: ${error.message}`);
    },
  });

  const resetForm = () => {
    setEditingProgram(null);
    setProgramName('');
    setProgramDescription('');
    setPointsRequired('');
    setRewardAmount('');
    setProgramCurrency('NGN');
  };

  const handleCreateOrUpdate = () => {
    if (!programName || !pointsRequired || !rewardAmount) {
      Alert.alert('Validation Error', 'Please fill in all required fields.');
      return;
    }

    const payload = {
      name: programName,
      description: programDescription,
      pointsRequired: parseInt(pointsRequired, 10),
      rewardAmount: parseFloat(rewardAmount),
      currency: programCurrency,
    };

    if (editingProgram) {
      updateMutation.mutate({ id: editingProgram.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this loyalty program?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id }) },
      ],
      { cancelable: true }
    );
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalVisible(true);
  };

  const openEditModal = (program: LoyaltyProgram) => {
    setEditingProgram(program);
    setProgramName(program.name);
    setProgramDescription(program.description);
    setPointsRequired(program.pointsRequired.toString());
    setRewardAmount(program.rewardAmount.toString());
    setProgramCurrency(program.currency);
    setIsModalVisible(true);
  };

  const filteredPrograms = useMemo(() => {
    if (!loyaltyPrograms) return [];
    return loyaltyPrograms.filter(program =>
      program.name.toLowerCase().includes(searchText.toLowerCase()) ||
      program.description.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [loyaltyPrograms, searchText]);

  const renderItem = useCallback(({ item }: { item: LoyaltyProgram }) => {
    const getStatusColor = (status: LoyaltyProgram['status']) => {
      switch (status) {
        case 'Active': return COLORS.success;
        case 'Inactive': return COLORS.warning;
        case 'Archived': return COLORS.muted;
        default: return COLORS.muted;
      }
    };

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
        </View>
        <Text style={styles.cardDescription}>{item.description}</Text>
        <Text style={styles.cardDetail}>Points Required: {item.pointsRequired}</Text>
        <Text style={styles.cardDetail}>Reward: {formatCurrency(item.rewardAmount, item.currency)}</Text>
        <Text style={styles.cardDetail}>Created: {formatDate(item.createdAt)}</Text>
        <View style={styles.cardActions}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => openEditModal(item)}>
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDelete(item.id)}>
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading loyalty programs...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load loyalty programs.</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Restaurant Loyalty</Text>
        <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
          <Text style={styles.createButtonText}>+ Add Program</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search loyalty programs..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredPrograms.length === 0 && !isLoading && !isError ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No loyalty programs found.</Text>
          <Button title="Create New Program" onPress={openCreateModal} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredPrograms}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
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
        visible={isModalVisible}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingProgram ? 'Edit Loyalty Program' : 'Create New Loyalty Program'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Program Name"
              placeholderTextColor={COLORS.muted}
              value={programName}
              onChangeText={setProgramName}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={programDescription}
              onChangeText={setProgramDescription}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder="Points Required"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={pointsRequired}
              onChangeText={setPointsRequired}
            />
            <TextInput
              style={styles.input}
              placeholder="Reward Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={rewardAmount}
              onChangeText={setRewardAmount}
            />
            <View style={styles.currencyToggleContainer}>
              <TouchableOpacity
                style={[styles.currencyButton, programCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setProgramCurrency('NGN')}
              >
                <Text style={[styles.currencyButtonText, programCurrency === 'NGN' && styles.currencyButtonTextActive]}>₦ NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, programCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setProgramCurrency('USD')}
              >
                <Text style={[styles.currencyButtonText, programCurrency === 'USD' && styles.currencyButtonTextActive]}>$ USD</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setIsModalVisible(false)} color={COLORS.muted} />
              <Button
                title={editingProgram ? 'Update' : 'Create'}
                onPress={handleCreateOrUpdate}
                color={COLORS.primary}
                disabled={createMutation.isLoading || updateMutation.isLoading}
              />
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
    padding: 20,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
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
  screenTitle: {
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
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
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
    flexShrink: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 15,
  },
  statusText: {
    color: COLORS.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardDescription: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 8,
  },
  cardDetail: {
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 4,
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
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    height: 45,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    color: COLORS.text,
    fontSize: 16,
  },
  currencyToggleContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 8,
    marginBottom: 20,
    overflow: 'hidden',
  },
  currencyButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  currencyButtonTextActive: {
    color: COLORS.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
});

export default RestaurantLoyaltyScreen;
