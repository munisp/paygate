import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, SafeAreaView, StatusBar, RefreshControl, Alert, TextInput, TouchableOpacity, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

interface Vendor {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'pending';
  balance: number;
  currency: 'NGN' | 'USD';
  createdAt: string;
}

const VendorsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { data: vendorsData, isLoading, isError, refetch } = trpc.vendors.list.useQuery();
  const createVendorMutation = trpc.vendors.create.useMutation();
  const updateVendorMutation = trpc.vendors.update.useMutation();
  const deleteVendorMutation = trpc.vendors.delete.useMutation();

  const [searchText, setSearchText] = useState('');
  const [filteredVendors, setFilteredVendors] = useState<Vendor[]>([]);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentVendor, setCurrentVendor] = useState<Vendor | null>(null);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorBalance, setNewVendorBalance] = useState('');
  const [newVendorCurrency, setNewVendorCurrency] = useState<'NGN' | 'USD'>('NGN');

  useEffect(() => {
    if (vendorsData) {
      const filtered = vendorsData.filter(vendor =>
        vendor.name.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredVendors(filtered);
    }
  }, [vendorsData, searchText]);

  const handleCreateVendor = async () => {
    try {
      await createVendorMutation.mutateAsync({
        name: newVendorName,
        balance: parseFloat(newVendorBalance),
        currency: newVendorCurrency,
      });
      setCreateModalVisible(false);
      setNewVendorName('');
      setNewVendorBalance('');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to create vendor.');
    }
  };

  const handleEditVendor = async () => {
    if (!currentVendor) return;
    try {
      await updateVendorMutation.mutateAsync({
        id: currentVendor.id,
        name: newVendorName,
        balance: parseFloat(newVendorBalance),
        currency: newVendorCurrency,
      });
      setEditModalVisible(false);
      setCurrentVendor(null);
      setNewVendorName('');
      setNewVendorBalance('');
      refetch();
    } catch (error) {
      Alert.alert('Error', 'Failed to update vendor.');
    }
  };

  const handleDeleteVendor = (id: string) => {
    Alert.alert(
      'Delete Vendor',
      'Are you sure you want to delete this vendor?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVendorMutation.mutateAsync({ id });
              refetch();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete vendor.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (vendor: Vendor) => {
    setCurrentVendor(vendor);
    setNewVendorName(vendor.name);
    setNewVendorBalance(vendor.balance.toString());
    setNewVendorCurrency(vendor.currency);
    setEditModalVisible(true);
  };

  const getStatusBadgeStyle = (status: Vendor['status']) => {
    switch (status) {
      case 'active':
        return { backgroundColor: COLORS.success };
      case 'inactive':
        return { backgroundColor: COLORS.error };
      case 'pending':
        return { backgroundColor: COLORS.warning };
      default:
        return { backgroundColor: COLORS.muted };
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading vendors...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load vendors. Please try again.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!vendorsData || vendorsData.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No vendors found.</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>Create New Vendor</Text>
        </TouchableOpacity>
        <CreateEditVendorModal
          isVisible={isCreateModalVisible}
          onClose={() => setCreateModalVisible(false)}
          title="Create Vendor"
          vendorName={newVendorName}
          setVendorName={setNewVendorName}
          vendorBalance={newVendorBalance}
          setVendorBalance={setNewVendorBalance}
          vendorCurrency={newVendorCurrency}
          setVendorCurrency={setNewVendorCurrency}
          onSubmit={handleCreateVendor}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Vendors</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder="Search vendors..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />
      <FlatList
        data={filteredVendors}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.vendorCard}>
            <Text style={styles.vendorName}>{item.name}</Text>
            <Text style={styles.vendorBalance}>
              {item.currency === 'NGN' ? '₦' : '$'}{item.balance.toFixed(2)}
            </Text>
            <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
              <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.vendorDate}>Created: {new Date(item.createdAt).toLocaleDateString()}</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => openEditModal(item)}>
                <Text style={styles.actionButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDeleteVendor(item.id)}>
                <Text style={styles.actionButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={COLORS.primary}
          />
        }
      />
      <CreateEditVendorModal
        isVisible={isCreateModalVisible}
        onClose={() => setCreateModalVisible(false)}
        title="Create Vendor"
        vendorName={newVendorName}
        setVendorName={setNewVendorName}
        vendorBalance={newVendorBalance}
        setVendorBalance={setNewVendorBalance}
        vendorCurrency={newVendorCurrency}
        setVendorCurrency={setNewVendorCurrency}
        onSubmit={handleCreateVendor}
      />
      <CreateEditVendorModal
        isVisible={isEditModalVisible}
        onClose={() => setEditModalVisible(false)}
        title="Edit Vendor"
        vendorName={newVendorName}
        setVendorName={setNewVendorName}
        vendorBalance={newVendorBalance}
        setVendorBalance={setNewVendorBalance}
        vendorCurrency={newVendorCurrency}
        setVendorCurrency={setNewVendorCurrency}
        onSubmit={handleEditVendor}
      />
    </SafeAreaView>
  );
};

interface CreateEditVendorModalProps {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  vendorName: string;
  setVendorName: (name: string) => void;
  vendorBalance: string;
  setVendorBalance: (balance: string) => void;
  vendorCurrency: 'NGN' | 'USD';
  setVendorCurrency: (currency: 'NGN' | 'USD') => void;
  onSubmit: () => void;
}

const CreateEditVendorModal: React.FC<CreateEditVendorModalProps> = ({
  isVisible, onClose, title, vendorName, setVendorName, vendorBalance, setVendorBalance, vendorCurrency, setVendorCurrency, onSubmit
}) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isVisible}
      onRequestClose={onClose}
    >
      <View style={modalStyles.centeredView}>
        <View style={modalStyles.modalView}>
          <Text style={modalStyles.modalTitle}>{title}</Text>
          <TextInput
            style={modalStyles.input}
            placeholder="Vendor Name"
            placeholderTextColor={COLORS.muted}
            value={vendorName}
            onChangeText={setVendorName}
          />
          <TextInput
            style={modalStyles.input}
            placeholder="Balance"
            placeholderTextColor={COLORS.muted}
            keyboardType="numeric"
            value={vendorBalance}
            onChangeText={setVendorBalance}
          />
          <View style={modalStyles.currencyToggle}>
            <TouchableOpacity
              style={[modalStyles.currencyButton, vendorCurrency === 'NGN' && modalStyles.currencyButtonActive]}
              onPress={() => setVendorCurrency('NGN')}
            >
              <Text style={modalStyles.currencyButtonText}>NGN</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.currencyButton, vendorCurrency === 'USD' && modalStyles.currencyButtonActive]}
              onPress={() => setVendorCurrency('USD')}
            >
              <Text style={modalStyles.currencyButtonText}>USD</Text>
            </TouchableOpacity>
          </View>
          <View style={modalStyles.buttonContainer}>
            <TouchableOpacity style={[modalStyles.button, modalStyles.buttonClose]} onPress={onClose}>
              <Text style={modalStyles.textStyle}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[modalStyles.button, modalStyles.buttonSubmit]} onPress={onSubmit}>
              <Text style={modalStyles.textStyle}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: COLORS.card,
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
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingLeft: 16,
    margin: 16,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  vendorCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  vendorName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  vendorBalance: {
    fontSize: 16,
    color: COLORS.muted,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  statusText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  vendorDate: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
    marginRight: 10, // Changed from marginLeft to marginRight for better spacing
  },
  actionButtonText: {
    color: COLORS.text,
    fontSize: 14,
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 10,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    marginBottom: 10,
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
  emptyText: {
    color: COLORS.muted,
    fontSize: 16,
    marginBottom: 10,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
  },
});

const modalStyles = StyleSheet.create({
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
    borderRadius: 8,
    paddingLeft: 10,
    marginBottom: 15,
    width: '100%',
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  currencyToggle: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  currencyButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginHorizontal: 5,
    backgroundColor: COLORS.background,
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
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    borderRadius: 5,
    padding: 10,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
  },
  buttonClose: {
    backgroundColor: COLORS.muted,
  },
  buttonSubmit: {
    backgroundColor: COLORS.primary,
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default VendorsScreen;