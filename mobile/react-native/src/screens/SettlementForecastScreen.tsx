import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, SafeAreaView, StatusBar, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Define design system colors
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

interface SettlementForecast {
  id: string;
  date: string;
  expectedAmount: number;
  currency: 'NGN' | 'USD';
  status: 'pending' | 'settled' | 'adjusted' | 'failed';
  details?: string;
}

const SettlementForecastScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SettlementForecast | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [newStatus, setNewStatus] = useState<'pending' | 'settled' | 'adjusted' | 'failed'>('pending');

  const { data, isLoading, isError, error, refetch } = trpc.settlementForecast.list.useQuery();
  const createMutation = trpc.settlementForecast.create.useMutation({
    onSuccess: () => {
      refetch();
      setModalVisible(false);
      resetForm();
    },
  });
  const updateMutation = trpc.settlementForecast.update.useMutation({
    onSuccess: () => {
      refetch();
      setModalVisible(false);
      resetForm();
    },
  });
  const deleteMutation = trpc.settlementForecast.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  useEffect(() => {
    if (selectedItem) {
      setNewDate(selectedItem.date);
      setNewAmount(selectedItem.expectedAmount.toString());
      setNewCurrency(selectedItem.currency);
      setNewStatus(selectedItem.status);
    } else {
      resetForm();
    }
  }, [selectedItem]);

  const resetForm = () => {
    setNewDate('');
    setNewAmount('');
    setNewCurrency('NGN');
    setNewStatus('pending');
    setSelectedItem(null);
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleCreatePress = () => {
    setSelectedItem(null);
    setModalVisible(true);
  };

  const handleEditPress = (item: SettlementForecast) => {
    setSelectedItem(item);
    setModalVisible(true);
  };

  const handleDeletePress = (id: string) => {
    Alert.alert(
      'Delete Settlement',
      'Are you sure you want to delete this settlement forecast?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', onPress: () => deleteMutation.mutate({ id }) },
      ],
      { cancelable: true }
    );
  };

  const handleSubmit = () => {
    if (!newDate || !newAmount) {
      Alert.alert('Error', 'Date and Amount are required.');
      return;
    }

    const amount = parseFloat(newAmount);
    if (isNaN(amount)) {
      Alert.alert('Error', 'Invalid amount.');
      return;
    }

    if (selectedItem) {
      updateMutation.mutate({
        id: selectedItem.id,
        date: newDate,
        expectedAmount: amount,
        currency: newCurrency,
        status: newStatus,
      });
    } else {
      createMutation.mutate({
        date: newDate,
        expectedAmount: amount,
        currency: newCurrency,
        status: newStatus,
      });
    }
  };

  const getStatusBadgeStyle = (status: SettlementForecast['status']) => {
    switch (status) {
      case 'settled':
        return styles.statusSettled;
      case 'pending':
        return styles.statusPending;
      case 'adjusted':
        return styles.statusAdjusted;
      case 'failed':
        return styles.statusFailed;
      default:
        return {};
    }
  };

  const formatCurrency = (amount: number, currency: 'NGN' | 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
    }).format(amount);
  };

  const renderItem = ({ item }: { item: SettlementForecast }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Settlement ID: {item.id}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusBadgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Date: {new Date(item.date).toLocaleDateString()}</Text>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.expectedAmount, item.currency)}</Text>
      {item.details && <Text style={styles.cardText}>Details: {item.details}</Text>}
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => handleEditPress(item)} style={styles.actionButton}>
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeletePress(item.id)} style={styles.actionButton}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading settlement forecasts...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Error: {error?.message}</Text>
        <TouchableOpacity onPress={refetch} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const filteredData = data?.filter(item =>
    item.id.toLowerCase().includes(searchText.toLowerCase()) ||
    item.status.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settlement Forecasts</Text>
        <TouchableOpacity onPress={handleCreatePress} style={styles.createButton}>
          <Text style={styles.createButtonText}>Add New</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search by ID or Status..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      {filteredData && filteredData.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No settlement forecasts found.</Text>
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
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
              progressBackgroundColor={COLORS.card}
            />
          }
        />
      )}

      {/* Modal for Create/Edit */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedItem ? 'Edit Settlement' : 'Create Settlement'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor={COLORS.muted}
              value={newDate}
              onChangeText={setNewDate}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={newAmount}
              onChangeText={setNewAmount}
            />
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Currency:</Text>
              <TouchableOpacity
                style={[styles.pickerOption, newCurrency === 'NGN' && styles.pickerOptionSelected]}
                onPress={() => setNewCurrency('NGN')}
              >
                <Text style={styles.pickerOptionText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pickerOption, newCurrency === 'USD' && styles.pickerOptionSelected]}
                onPress={() => setNewCurrency('USD')}
              >
                <Text style={styles.pickerOptionText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Status:</Text>
              {['pending', 'settled', 'adjusted', 'failed'].map((statusOption) => (
                <TouchableOpacity
                  key={statusOption}
                  style={[
                    styles.pickerOption,
                    newStatus === statusOption && styles.pickerOptionSelected,
                  ]}
                  onPress={() => setNewStatus(statusOption as SettlementForecast['status'])}
                >
                  <Text style={styles.pickerOptionText}>{statusOption.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={handleSubmit} style={styles.modalSubmitButton}>
              <Text style={styles.modalSubmitButtonText}>{selectedItem ? 'Update' : 'Create'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseButtonText}>Cancel</Text>
            </TouchableOpacity>
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  retryButton: {
    marginTop: 20,
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
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
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
    backgroundColor: COLORS.success,
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
    padding: 10,
    margin: 10,
    borderRadius: 5,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 3,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    marginLeft: 15,
  },
  editText: {
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  deleteText: {
    color: COLORS.error,
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
    padding: 20,
    borderRadius: 10,
    width: '90%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.card,
    color: COLORS.text,
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    width: '100%',
    justifyContent: 'center',
  },
  pickerLabel: {
    color: COLORS.text,
    marginRight: 10,
    fontSize: 16,
  },
  pickerOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 5,
  },
  pickerOptionSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pickerOptionText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalSubmitButton: {
    marginTop: 10,
    backgroundColor: COLORS.success,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    width: '100%',
    alignItems: 'center',
  },
  modalSubmitButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalCloseButton: {
    marginTop: 10,
    backgroundColor: COLORS.error,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    width: '100%',
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  statusBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusSettled: {
    backgroundColor: COLORS.success,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
  },
  statusAdjusted: {
    backgroundColor: COLORS.primary,
  },
  statusFailed: {
    backgroundColor: COLORS.error,
  },
});

export default SettlementForecastScreen;
