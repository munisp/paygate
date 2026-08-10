import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, Button, RefreshControl, SafeAreaView, StatusBar } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Type definitions for Cashback Reward
interface CashbackReward {
  id: string;
  name: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'Active' | 'Inactive' | 'Pending';
  createdAt: string;
  updatedAt: string;
}

// Utility for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'NGN' ? 'NGN' : 'USD',
    minimumFractionDigits: 2,
  });
  return formatter.format(amount);
};

// Utility for date formatting
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

const CashbackRewardsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentReward, setCurrentReward] = useState<CashbackReward | null>(null);
  const [newRewardName, setNewRewardName] = useState('');
  const [newRewardAmount, setNewRewardAmount] = useState('');
  const [newRewardCurrency, setNewRewardCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [newRewardStatus, setNewRewardStatus] = useState<'Active' | 'Inactive' | 'Pending'>('Active');

  const { data, isLoading, isError, error, refetch, isRefetching } = trpc.cashbackRewards.list.useQuery();
  const createMutation = trpc.cashbackRewards.create.useMutation();
  const updateMutation = trpc.cashbackRewards.update.useMutation();
  const deleteMutation = trpc.cashbackRewards.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredData = data?.filter(reward =>
    reward.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCreateReward = async () => {
    if (!newRewardName || !newRewardAmount) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: newRewardName,
        amount: parseFloat(newRewardAmount),
        currency: newRewardCurrency,
        status: newRewardStatus,
      });
      setCreateModalVisible(false);
      setNewRewardName('');
      setNewRewardAmount('');
      setNewRewardCurrency('NGN');
      setNewRewardStatus('Active');
      refetch();
    } catch (err: any) {
      Alert.alert('Error creating reward', err.message || 'An unexpected error occurred.');
    }
  };

  const handleEditReward = async () => {
    if (!currentReward || !newRewardName || !newRewardAmount) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: currentReward.id,
        name: newRewardName,
        amount: parseFloat(newRewardAmount),
        currency: newRewardCurrency,
        status: newRewardStatus,
      });
      setEditModalVisible(false);
      setCurrentReward(null);
      setNewRewardName('');
      setNewRewardAmount('');
      setNewRewardCurrency('NGN');
      setNewRewardStatus('Active');
      refetch();
    } catch (err: any) {
      Alert.alert('Error updating reward', err.message || 'An unexpected error occurred.');
    }
  };

  const handleDeleteReward = (id: string) => {
    Alert.alert(
      'Delete Reward',
      'Are you sure you want to delete this cashback reward?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (err: any) {
              Alert.alert('Error deleting reward', err.message || 'An unexpected error occurred.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (reward: CashbackReward) => {
    setCurrentReward(reward);
    setNewRewardName(reward.name);
    setNewRewardAmount(reward.amount.toString());
    setNewRewardCurrency(reward.currency);
    setNewRewardStatus(reward.status);
    setEditModalVisible(true);
  };

  const renderItem = ({ item }: { item: CashbackReward }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'Active' ? COLORS.success : item.status === 'Pending' ? COLORS.warning : COLORS.error }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => openEditModal(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDeleteReward(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading cashback rewards...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load rewards'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <Text style={styles.header}>Cashback Rewards</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search rewards..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
        <Text style={styles.createButtonText}>Create New Reward</Text>
      </TouchableOpacity>

      {filteredData && filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No cashback rewards found.</Text>
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
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      {/* Create Reward Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Cashback Reward</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reward Name"
              placeholderTextColor={COLORS.muted}
              value={newRewardName}
              onChangeText={setNewRewardName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newRewardAmount}
              onChangeText={setNewRewardAmount}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={newRewardCurrency}
                style={styles.picker}
                onValueChange={(itemValue) => setNewRewardCurrency(itemValue as 'NGN' | 'USD')}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="NGN" value="NGN" />
                <Picker.Item label="USD" value="USD" />
              </Picker>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <Picker
                selectedValue={newRewardStatus}
                style={styles.picker}
                onValueChange={(itemValue) => setNewRewardStatus(itemValue as 'Active' | 'Inactive' | 'Pending')}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="Active" value="Active" />
                <Picker.Item label="Inactive" value="Inactive" />
                <Picker.Item label="Pending" value="Pending" />
              </Picker>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.error} />
              <Button title="Create" onPress={handleCreateReward} color={COLORS.primary} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Reward Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Cashback Reward</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reward Name"
              placeholderTextColor={COLORS.muted}
              value={newRewardName}
              onChangeText={setNewRewardName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newRewardAmount}
              onChangeText={setNewRewardAmount}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <Picker
                selectedValue={newRewardCurrency}
                style={styles.picker}
                onValueChange={(itemValue) => setNewRewardCurrency(itemValue as 'NGN' | 'USD')}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="NGN" value="NGN" />
                <Picker.Item label="USD" value="USD" />
              </Picker>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <Picker
                selectedValue={newRewardStatus}
                style={styles.picker}
                onValueChange={(itemValue) => setNewRewardStatus(itemValue as 'Active' | 'Inactive' | 'Pending')}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="Active" value="Active" />
                <Picker.Item label="Inactive" value="Inactive" />
                <Picker.Item label="Pending" value="Pending" />
              </Picker>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.error} />
              <Button title="Save Changes" onPress={handleEditReward} color={COLORS.primary} />
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
    paddingTop: StatusBar.currentHeight,
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
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 18,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    padding: 20,
    paddingBottom: 10,
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginHorizontal: 20,
    marginBottom: 15,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    marginBottom: 5,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 5,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
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
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  modalInput: {
    width: '100%',
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 15,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderColor: COLORS.border,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pickerLabel: {
    color: COLORS.muted,
    paddingLeft: 15,
    fontSize: 16,
  },
  picker: {
    flex: 1,
    color: COLORS.text,
    height: 40,
  },
  pickerItem: {
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
});

export default CashbackRewardsScreen;