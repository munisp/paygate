import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface ReferralProgram {
  id: string;
  name: string;
  description: string;
  rewardAmount: number;
  currency: 'NGN' | 'USD';
  status: 'active' | 'inactive' | 'pending';
  createdAt: string;
  updatedAt: string;
}

const ReferralProgramScreen: React.FC = () => {
  const navigation = useNavigation();
  const { data, isLoading, isError, refetch } = trpc.referralProgram.list.useQuery();
  const createMutation = trpc.referralProgram.create.useMutation();
  const updateMutation = trpc.referralProgram.update.useMutation();
  const deleteMutation = trpc.referralProgram.delete.useMutation();

  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentProgram, setCurrentProgram] = useState<ReferralProgram | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [newProgramName, setNewProgramName] = useState('');
  const [newProgramDescription, setNewProgramDescription] = useState('');
  const [newProgramRewardAmount, setNewProgramRewardAmount] = useState('');
  const [newProgramCurrency, setNewProgramCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [newProgramStatus, setNewProgramStatus] = useState<'active' | 'inactive' | 'pending'>('pending');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, []);

  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter(program =>
      program.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      program.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

  const handleCreateProgram = async () => {
    if (!newProgramName || !newProgramDescription || !newProgramRewardAmount) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: newProgramName,
        description: newProgramDescription,
        rewardAmount: parseFloat(newProgramRewardAmount),
        currency: newProgramCurrency,
        status: newProgramStatus,
      });
      Alert.alert('Success', 'Referral program created successfully.');
      setCreateModalVisible(false);
      setNewProgramName('');
      setNewProgramDescription('');
      setNewProgramRewardAmount('');
      setNewProgramCurrency('NGN');
      setNewProgramStatus('pending');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create referral program.');
    }
  };

  const handleEditProgram = async () => {
    if (!currentProgram || !newProgramName || !newProgramDescription || !newProgramRewardAmount) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: currentProgram.id,
        name: newProgramName,
        description: newProgramDescription,
        rewardAmount: parseFloat(newProgramRewardAmount),
        currency: newProgramCurrency,
        status: newProgramStatus,
      });
      Alert.alert('Success', 'Referral program updated successfully.');
      setEditModalVisible(false);
      setCurrentProgram(null);
      setNewProgramName('');
      setNewProgramDescription('');
      setNewProgramRewardAmount('');
      setNewProgramCurrency('NGN');
      setNewProgramStatus('pending');
      refetch();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update referral program.');
    }
  };

  const handleDeleteProgram = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this referral program?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              Alert.alert('Success', 'Referral program deleted successfully.');
              refetch();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete referral program.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (program: ReferralProgram) => {
    setCurrentProgram(program);
    setNewProgramName(program.name);
    setNewProgramDescription(program.description);
    setNewProgramRewardAmount(program.rewardAmount.toString());
    setNewProgramCurrency(program.currency);
    setNewProgramStatus(program.status);
    setEditModalVisible(true);
  };

  const renderItem = ({ item }: { item: ReferralProgram }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardDescription}>{item.description}</Text>
      <Text style={styles.cardText}>Reward: {item.currency === 'NGN' ? '₦' : '$'}{item.rewardAmount.toFixed(2)}</Text>
      <Text style={styles.cardText}>Status: <Text style={[styles.badge, item.status === 'active' ? styles.badgeActive : item.status === 'inactive' ? styles.badgeInactive : styles.badgePending]}>{item.status}</Text></Text>
      <Text style={styles.cardText}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.button, styles.editButton]} onPress={() => openEditModal(item)}>
          <Text style={styles.buttonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={() => handleDeleteProgram(item.id)}>
          <Text style={styles.buttonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Referral Programs</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search programs..."
          placeholderTextColor={COLORS.muted}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {isLoading && <ActivityIndicator size="large" color={COLORS.primary} />}
        {isError && <Text style={styles.errorText}>Failed to load referral programs.</Text>}
        {!isLoading && !isError && filteredData.length === 0 && (
          <Text style={styles.emptyText}>No referral programs found.</Text>
        )}
        {!isLoading && !isError && filteredData.length > 0 && (
          <FlatList
            data={filteredData}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.primary}
              />
            }
          />
        )}
      </View>

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Create New Referral Program</Text>
            <TextInput
              style={styles.input}
              placeholder="Program Name"
              placeholderTextColor={COLORS.muted}
              value={newProgramName}
              onChangeText={setNewProgramName}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={newProgramDescription}
              onChangeText={setNewProgramDescription}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder="Reward Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newProgramRewardAmount}
              onChangeText={setNewProgramRewardAmount}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <TouchableOpacity
                style={[styles.pickerOption, newProgramCurrency === 'NGN' && styles.pickerOptionSelected]}
                onPress={() => setNewProgramCurrency('NGN')}
              >
                <Text style={styles.pickerOptionText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerOption, newProgramCurrency === 'USD' && styles.pickerOptionSelected]}
                onPress={() => setNewProgramCurrency('USD')}
              >
                <Text style={styles.pickerOptionText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <TouchableOpacity
                style={[styles.pickerOption, newProgramStatus === 'active' && styles.pickerOptionSelected]}
                onPress={() => setNewProgramStatus('active')}
              >
                <Text style={styles.pickerOptionText}>Active</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerOption, newProgramStatus === 'inactive' && styles.pickerOptionSelected]}
                onPress={() => setNewProgramStatus('inactive')}
              >
                <Text style={styles.pickerOptionText}>Inactive</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerOption, newProgramStatus === 'pending' && styles.pickerOptionSelected]}
                onPress={() => setNewProgramStatus('pending')}
              >
                <Text style={styles.pickerOptionText}>Pending</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleCreateProgram}>
                <Text style={styles.buttonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Edit Referral Program</Text>
            <TextInput
              style={styles.input}
              placeholder="Program Name"
              placeholderTextColor={COLORS.muted}
              value={newProgramName}
              onChangeText={setNewProgramName}
            />
            <TextInput
              style={styles.input}
              placeholder="Description"
              placeholderTextColor={COLORS.muted}
              value={newProgramDescription}
              onChangeText={setNewProgramDescription}
              multiline
            />
            <TextInput
              style={styles.input}
              placeholder="Reward Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newProgramRewardAmount}
              onChangeText={setNewProgramRewardAmount}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <TouchableOpacity
                style={[styles.pickerOption, newProgramCurrency === 'NGN' && styles.pickerOptionSelected]}
                onPress={() => setNewProgramCurrency('NGN')}
              >
                <Text style={styles.pickerOptionText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerOption, newProgramCurrency === 'USD' && styles.pickerOptionSelected]}
                onPress={() => setNewProgramCurrency('USD')}
              >
                <Text style={styles.pickerOptionText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              <TouchableOpacity
                style={[styles.pickerOption, newProgramStatus === 'active' && styles.pickerOptionSelected]}
                onPress={() => setNewProgramStatus('active')}
              >
                <Text style={styles.pickerOptionText}>Active</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerOption, newProgramStatus === 'inactive' && styles.pickerOptionSelected]}
                onPress={() => setNewProgramStatus('inactive')}
              >
                <Text style={styles.pickerOptionText}>Inactive</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerOption, newProgramStatus === 'pending' && styles.pickerOptionSelected]}
                onPress={() => setNewProgramStatus('pending')}
              >
                <Text style={styles.pickerOptionText}>Pending</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleEditProgram}>
                <Text style={styles.buttonText}>Save</Text>
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
  header: {
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  addButtonText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  searchInput: {
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadingText: {
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 20,
  },
  emptyText: {
    color: COLORS.muted,
    textAlign: 'center',
    marginTop: 20,
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  editButton: {
    backgroundColor: COLORS.primary,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  buttonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: 'bold',
    fontSize: 12,
  },
  badgeActive: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  badgeInactive: {
    backgroundColor: COLORS.muted,
    color: COLORS.background,
  },
  badgePending: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '90%',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 5,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  cancelButton: {
    backgroundColor: COLORS.muted,
  },
  saveButton: {
    backgroundColor: COLORS.primary,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: COLORS.background,
    borderRadius: 5,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerLabel: {
    color: COLORS.text,
    fontSize: 16,
    marginRight: 10,
  },
  pickerOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    backgroundColor: COLORS.muted,
    marginLeft: 5,
  },
  pickerOptionSelected: {
    backgroundColor: COLORS.primary,
  },
  pickerOptionText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default ReferralProgramScreen;