import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, ActivityIndicator, FlatList, RefreshControl, Alert, TouchableOpacity, TextInput, Modal } from 'react-native';
import { trpc } from '../lib/trpc';
import { useNavigation } from '@react-navigation/native';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface QRItem {
  id: string;
  name: string;
  amount: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
  status: 'active' | 'inactive'; // Added status for business logic
}

const QRGeneratorScreen: React.FC = () => {
  const navigation = useNavigation();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentQR, setCurrentQR] = useState<QRItem | null>(null);
  const [qrName, setQrName] = useState('');
  const [qrAmount, setQrAmount] = useState('');
  const [qrCurrency, setQrCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [qrStatus, setQrStatus] = useState<'active' | 'inactive'>('active');

  const { data: qrCodes, isLoading, isError, error, refetch } = trpc.qrCode.list.useQuery();
  const createQRMutaion = trpc.qrCode.create.useMutation({
    onSuccess: () => {
      refetch();
      setIsModalVisible(false);
      resetForm();
    },
    onError: (err) => {
      Alert.alert('Error creating QR Code', err.message);
    }
  });
  const updateQRMutaion = trpc.qrCode.update.useMutation({
    onSuccess: () => {
      refetch();
      setIsModalVisible(false);
      resetForm();
    },
    onError: (err) => {
      Alert.alert('Error updating QR Code', err.message);
    }
  });
  const deleteQRMutaion = trpc.qrCode.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (err) => {
      Alert.alert('Error deleting QR Code', err.message);
    }
  });

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, []);

  const resetForm = () => {
    setCurrentQR(null);
    setQrName('');
    setQrAmount('');
    setQrCurrency('NGN');
    setQrStatus('active');
  };

  const handleCreateQR = () => {
    if (!qrName || !qrAmount) {
      Alert.alert('Validation Error', 'Name and Amount are required.');
      return;
    }
    createQRMutaion.mutate({
      name: qrName,
      amount: parseFloat(qrAmount),
      currency: qrCurrency,
      status: qrStatus,
    });
  };

  const handleUpdateQR = () => {
    if (!currentQR || !qrName || !qrAmount) {
      Alert.alert('Validation Error', 'Name and Amount are required.');
      return;
    }
    updateQRMutaion.mutate({
      id: currentQR.id,
      name: qrName,
      amount: parseFloat(qrAmount),
      currency: qrCurrency,
      status: qrStatus,
    });
  };

  const handleDeleteQR = (id: string) => {
    Alert.alert(
      'Delete QR Code',
      'Are you sure you want to delete this QR code?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteQRMutaion.mutate({ id }) },
      ]
    );
  };

  const openEditModal = (qr: QRItem) => {
    setCurrentQR(qr);
    setQrName(qr.name);
    setQrAmount(qr.amount.toString());
    setQrCurrency(qr.currency);
    setQrStatus(qr.status);
    setIsModalVisible(true);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalVisible(true);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading QR Codes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error?.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const filteredQrCodes = qrCodes?.filter(qr =>
    qr.name.toLowerCase().includes(searchText.toLowerCase())
  ) || [];

  const formatAmount = (amount: number, currency: 'NGN' | 'USD') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'NGN' ? 'NGN' : 'USD',
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  };

  const renderQRItem = ({ item }: { item: QRItem }) => (
    <View style={styles.qrItem}>
      <View>
        <Text style={styles.qrItemName}>{item.name}</Text>
        <Text style={styles.qrItemDetails}>
          Amount: {formatAmount(item.amount, item.currency)}
        </Text>
        <Text style={styles.qrItemDetails}>
          Created: {new Date(item.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </Text>
        <View style={[styles.statusBadge, item.status === 'active' ? styles.statusActive : styles.statusInactive]}>
          <Text style={styles.statusBadgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.qrItemActions}>
        <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => openEditModal(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDeleteQR(item.id)}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>QR Code Generator</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search QR codes..."
          placeholderTextColor={COLORS.muted}
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
          <Text style={styles.createButtonText}>Create New</Text>
        </TouchableOpacity>
      </View>

      {filteredQrCodes.length === 0 && !isLoading && !isError ? (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>No QR codes found.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refetch}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredQrCodes}
          keyExtractor={(item) => item.id}
          renderItem={renderQRItem}
          contentContainerStyle={styles.flatListContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
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
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{currentQR ? 'Edit QR Code' : 'Create New QR Code'}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="QR Name"
              placeholderTextColor={COLORS.muted}
              value={qrName}
              onChangeText={setQrName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={qrAmount}
              onChangeText={setQrAmount}
            />
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, qrCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setQrCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, qrCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setQrCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.currencySelector}>
              <TouchableOpacity
                style={[styles.currencyButton, qrStatus === 'active' && styles.currencyButtonActive]}
                onPress={() => setQrStatus('active')}
              >
                <Text style={styles.currencyButtonText}>Active</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, qrStatus === 'inactive' && styles.currencyButtonActive]}
                onPress={() => setQrStatus('inactive')}
              >
                <Text style={styles.currencyButtonText}>Inactive</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setIsModalVisible(false)}>
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={currentQR ? handleUpdateQR : handleCreateQR}
              >
                <Text style={styles.modalButtonText}>{currentQR ? 'Update' : 'Create'}</Text>
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
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: 20,
  },
  emptyStateText: {
    color: COLORS.muted,
    fontSize: 16,
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
  },
  header: {
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  flatListContent: {
    paddingBottom: 20,
  },
  qrItem: {
    backgroundColor: COLORS.card,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qrItemName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  qrItemDetails: {
    color: COLORS.muted,
    fontSize: 14,
  },
  qrItemActions: {
    flexDirection: 'row',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginLeft: 10,
  },
  editButton: {
    backgroundColor: COLORS.warning,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 20,
    width: '80%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  modalInput: {
    width: '100%',
    backgroundColor: COLORS.background,
    color: COLORS.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencySelector: {
    flexDirection: 'row',
    marginBottom: 15,
    width: '100%',
    justifyContent: 'center',
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginHorizontal: 5,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.muted,
  },
  modalButtonText: {
    color: COLORS.text,
    fontSize: 16,
  },
  modalButtonPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    marginTop: 5,
    alignSelf: 'flex-start',
  },
  statusActive: {
    backgroundColor: COLORS.success,
  },
  statusInactive: {
    backgroundColor: COLORS.error,
  },
  statusBadgeText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default QRGeneratorScreen;