import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, Modal, TextInput, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Design system colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Dummy types for payment settings (replace with actual tRPC types)
interface PaymentSetting {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  amountLimit: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
}

// Helper functions for formatting (replace with actual utility functions)
const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
  const symbol = currency === 'NGN' ? '₦' : '$';
  return `${symbol}${amount.toLocaleString()}`;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const SettingsPaymentsScreen: React.FC = () => {
  const navigation = useNavigation();
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentSetting, setCurrentSetting] = useState<PaymentSetting | null>(null);
  const [newSettingName, setNewSettingName] = useState('');
  const [newSettingAmountLimit, setNewSettingAmountLimit] = useState('');
  const [newSettingCurrency, setNewSettingCurrency] = useState<'NGN' | 'USD'>('NGN');

  // tRPC queries and mutations
  const { data: paymentSettings, isLoading, isError, refetch, error } = trpc.settings.payments.list.useQuery();
  const createMutation = trpc.settings.payments.create.useMutation();
  const updateMutation = trpc.settings.payments.update.useMutation();
  const deleteMutation = trpc.settings.payments.delete.useMutation();

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleCreate = async () => {
    if (!newSettingName || !newSettingAmountLimit) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: newSettingName,
        amountLimit: parseFloat(newSettingAmountLimit),
        currency: newSettingCurrency,
        status: 'active', // Default status
      });
      setCreateModalVisible(false);
      setNewSettingName('');
      setNewSettingAmountLimit('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error creating setting', err.message || 'An unknown error occurred.');
    }
  };

  const handleEdit = async () => {
    if (!currentSetting || !newSettingName || !newSettingAmountLimit) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: currentSetting.id,
        name: newSettingName,
        amountLimit: parseFloat(newSettingAmountLimit),
        currency: newSettingCurrency,
      });
      setEditModalVisible(false);
      setCurrentSetting(null);
      setNewSettingName('');
      setNewSettingAmountLimit('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error updating setting', err.message || 'An unknown error occurred.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this payment setting?',
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
              Alert.alert('Error deleting setting', err.message || 'An unknown error occurred.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (setting: PaymentSetting) => {
    setCurrentSetting(setting);
    setNewSettingName(setting.name);
    setNewSettingAmountLimit(setting.amountLimit.toString());
    setNewSettingCurrency(setting.currency);
    setEditModalVisible(true);
  };

  const renderItem = ({ item }: { item: PaymentSetting }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.badge, item.status === 'active' ? styles.badgeActive : styles.badgeInactive]}>
          <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Limit: {formatCurrency(item.amountLimit, item.currency)}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading payment settings...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to load payment settings.'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Payment Settings</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+ Add New</Text>
        </TouchableOpacity>
      </View>

      {paymentSettings && paymentSettings.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No payment settings found.</Text>
          <Button title="Add First Setting" onPress={() => setCreateModalVisible(true)} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={paymentSettings}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create New Payment Setting</Text>
            <TextInput
              style={styles.input}
              placeholder="Setting Name"
              placeholderTextColor={COLORS.muted}
              value={newSettingName}
              onChangeText={setNewSettingName}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount Limit"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newSettingAmountLimit}
              onChangeText={setNewSettingAmountLimit}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newSettingCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewSettingCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newSettingCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewSettingCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreate} color={COLORS.primary} disabled={createMutation.isLoading} />
            </View>
            {createMutation.isLoading && <ActivityIndicator size="small" color={COLORS.primary} style={styles.modalSpinner} />}
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Payment Setting</Text>
            <TextInput
              style={styles.input}
              placeholder="Setting Name"
              placeholderTextColor={COLORS.muted}
              value={newSettingName}
              onChangeText={setNewSettingName}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount Limit"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newSettingAmountLimit}
              onChangeText={setNewSettingAmountLimit}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newSettingCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewSettingCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newSettingCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewSettingCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save Changes" onPress={handleEdit} color={COLORS.primary} disabled={updateMutation.isLoading} />
            </View>
            {updateMutation.isLoading && <ActivityIndicator size="small" color={COLORS.primary} style={styles.modalSpinner} />}
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
  headerTitle: {
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
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
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
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 15,
  },
  badgeActive: {
    backgroundColor: COLORS.success,
  },
  badgeInactive: {
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
    width: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 20,
  },
  input: {
    width: '100%',
    backgroundColor: COLORS.card,
    color: COLORS.text,
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
  },
  currencyToggle: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    overflow: 'hidden',
  },
  currencyButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  modalSpinner: {
    marginTop: 10,
  },
});

export default SettingsPaymentsScreen;
