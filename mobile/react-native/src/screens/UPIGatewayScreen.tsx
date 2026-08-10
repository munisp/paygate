import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity, Alert, Modal, TextInput, Button, SafeAreaView, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming trpc client is set up here

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

// Helper for currency formatting (example, can be more robust)
const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  if (currency === 'USD') {
    return `$${amount.toFixed(2)}`;
  } else {
    return `₦${amount.toFixed(2)}`;
  }
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

interface UPIGatewayItem {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  dailyLimit: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
}

const UPIGatewayScreen = () => {
  const navigation = useNavigation();

  const { data, isLoading, isError, error, refetch } = trpc.upi.list.useQuery();
  const createMutation = trpc.upi.create.useMutation();
  const updateMutation = trpc.upi.update.useMutation();
  const deleteMutation = trpc.upi.delete.useMutation();

  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentEditItem, setCurrentEditItem] = useState<UPIGatewayItem | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDailyLimit, setNewItemDailyLimit] = useState('');
  const [newItemCurrency, setNewItemCurrency] = useState<'NGN' | 'USD'>('NGN');

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleCreate = async () => {
    if (!newItemName || !newItemDailyLimit) return;
    try {
      await createMutation.mutateAsync({
        name: newItemName,
        dailyLimit: parseFloat(newItemDailyLimit),
        currency: newItemCurrency,
      });
      setCreateModalVisible(false);
      setNewItemName('');
      setNewItemDailyLimit('');
      refetch();
    } catch (e) {
      Alert.alert('Error', 'Failed to create UPI Gateway.');
    }
  };

  const handleEdit = async () => {
    if (!currentEditItem || !currentEditItem.id || !currentEditItem.name || !currentEditItem.dailyLimit) return;
    try {
      await updateMutation.mutateAsync({
        id: currentEditItem.id,
        name: currentEditItem.name,
        dailyLimit: currentEditItem.dailyLimit,
        currency: currentEditItem.currency,
      });
      setEditModalVisible(false);
      setCurrentEditItem(null);
      refetch();
    } catch (e) {
      Alert.alert('Error', 'Failed to update UPI Gateway.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this UPI Gateway?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              refetch();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete UPI Gateway.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: UPIGatewayItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <View style={[styles.statusBadge, item.status === 'active' ? styles.statusActive : item.status === 'pending' ? styles.statusPending : styles.statusInactive]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Daily Limit: {formatCurrency(item.dailyLimit, item.currency)}</Text>
      <Text style={styles.cardText}>Created At: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => {
          setCurrentEditItem(item);
          setEditModalVisible(true);
        }} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
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
        <Text style={styles.loadingText}>Loading UPI Gateways...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Error: {error?.message || 'Failed to fetch UPI Gateways'}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!data || data.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No UPI Gateways found.</Text>
        <Button title="Create New UPI Gateway" onPress={() => setCreateModalVisible(true)} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>UPI Gateways</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.createButton}>
          <Text style={styles.createButtonText}>+ Create</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      />

      {/* Create Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Create UPI Gateway</Text>
            <TextInput
              style={styles.input}
              placeholder="Gateway Name"
              placeholderTextColor={COLORS.muted}
              value={newItemName}
              onChangeText={setNewItemName}
            />
            <TextInput
              style={styles.input}
              placeholder="Daily Limit"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newItemDailyLimit}
              onChangeText={setNewItemDailyLimit}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newItemCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewItemCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newItemCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewItemCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreate} color={COLORS.primary} />
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
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit UPI Gateway</Text>
            <TextInput
              style={styles.input}
              placeholder="Gateway Name"
              placeholderTextColor={COLORS.muted}
              value={currentEditItem?.name || ''}
              onChangeText={(text) => setCurrentEditItem(prev => prev ? { ...prev, name: text } : null)}
            />
            <TextInput
              style={styles.input}
              placeholder="Daily Limit"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={currentEditItem?.dailyLimit.toString() || ''}
              onChangeText={(text) => setCurrentEditItem(prev => prev ? { ...prev, dailyLimit: parseFloat(text) || 0 } : null)}
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, currentEditItem?.currency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setCurrentEditItem(prev => prev ? { ...prev, currency: 'NGN' } : null)}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, currentEditItem?.currency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setCurrentEditItem(prev => prev ? { ...prev, currency: 'USD' } : null)}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save" onPress={handleEdit} color={COLORS.primary} />
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
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusActive: {
    backgroundColor: COLORS.success,
  },
  statusInactive: {
    backgroundColor: COLORS.error,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusText: {
    color: COLORS.background,
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
    borderRadius: 5,
    marginLeft: 10,
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
    width: '80%',
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  input: {
    height: 40,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    width: '100%',
    backgroundColor: COLORS.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 15,
  },
  currencyToggle: {
    flexDirection: 'row',
    marginBottom: 15,
    borderRadius: 5,
    overflow: 'hidden',
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: COLORS.background,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
});

export default UPIGatewayScreen;
