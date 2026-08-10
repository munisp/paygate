import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Button,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc'; // Assuming this path

// Define Design System Colors
const COLORS = {
  primary: '#6366F1', background: '#0F172A', card: '#1E293B',
  text: '#F1F5F9', muted: '#94A3B8', success: '#10B981',
  error: '#EF4444', warning: '#F59E0B', border: '#334155',
};

// Helper for currency formatting
const formatCurrency = (amount: number, currency: 'NGN' | 'USD' = 'NGN') => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  });
  return formatter.format(amount);
};

// Helper for date formatting
const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-US', options);
};

// Dummy type for Beneficiary (replace with actual tRPC type)
interface Beneficiary {
  id: string;
  name: string;
  accountNumber: string;
  bankName: string;
  amountLimit: number;
  currency: 'NGN' | 'USD';
  status: 'Active' | 'Inactive' | 'Pending';
  createdAt: string;
}

const SavedBeneficiariesScreen = () => {
  const navigation = useNavigation();
  const [searchText, setSearchText] = useState('');
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [currentBeneficiary, setCurrentBeneficiary] = useState<Beneficiary | null>(null);

  // tRPC queries and mutations
  const { data: beneficiaries, isLoading, isError, error, refetch } = trpc.beneficiaries.list.useQuery();
  const createMutation = trpc.beneficiaries.create.useMutation();
  const updateMutation = trpc.beneficiaries.update.useMutation();
  const deleteMutation = trpc.beneficiaries.delete.useMutation();

  const [newBeneficiaryName, setNewBeneficiaryName] = useState('');
  const [newBeneficiaryAccount, setNewBeneficiaryAccount] = useState('');
  const [newBeneficiaryBank, setNewBeneficiaryBank] = useState('');
  const [newBeneficiaryAmountLimit, setNewBeneficiaryAmountLimit] = useState('');
  const [newBeneficiaryCurrency, setNewBeneficiaryCurrency] = useState<'NGN' | 'USD'>('NGN');

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const filteredBeneficiaries = beneficiaries?.filter(beneficiary =>
    beneficiary.name.toLowerCase().includes(searchText.toLowerCase()) ||
    beneficiary.accountNumber.includes(searchText)
  );

  const handleCreateBeneficiary = async () => {
    if (!newBeneficiaryName || !newBeneficiaryAccount || !newBeneficiaryBank || !newBeneficiaryAmountLimit) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: newBeneficiaryName,
        accountNumber: newBeneficiaryAccount,
        bankName: newBeneficiaryBank,
        amountLimit: parseFloat(newBeneficiaryAmountLimit),
        currency: newBeneficiaryCurrency,
      });
      Alert.alert('Success', 'Beneficiary created successfully!');
      setCreateModalVisible(false);
      setNewBeneficiaryName('');
      setNewBeneficiaryAccount('');
      setNewBeneficiaryBank('');
      setNewBeneficiaryAmountLimit('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', `Failed to create beneficiary: ${err.message}`);
    }
  };

  const handleEditBeneficiary = async () => {
    if (!currentBeneficiary) return;
    if (!newBeneficiaryName || !newBeneficiaryAccount || !newBeneficiaryBank || !newBeneficiaryAmountLimit) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: currentBeneficiary.id,
        name: newBeneficiaryName,
        accountNumber: newBeneficiaryAccount,
        bankName: newBeneficiaryBank,
        amountLimit: parseFloat(newBeneficiaryAmountLimit),
        currency: newBeneficiaryCurrency,
      });
      Alert.alert('Success', 'Beneficiary updated successfully!');
      setEditModalVisible(false);
      setCurrentBeneficiary(null);
      setNewBeneficiaryName('');
      setNewBeneficiaryAccount('');
      setNewBeneficiaryBank('');
      setNewBeneficiaryAmountLimit('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', `Failed to update beneficiary: ${err.message}`);
    }
  };

  const handleDeleteBeneficiary = (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this beneficiary?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id });
              Alert.alert('Success', 'Beneficiary deleted successfully!');
              refetch();
            } catch (err: any) {
              Alert.alert('Error', `Failed to delete beneficiary: ${err.message}`);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openEditModal = (beneficiary: Beneficiary) => {
    setCurrentBeneficiary(beneficiary);
    setNewBeneficiaryName(beneficiary.name);
    setNewBeneficiaryAccount(beneficiary.accountNumber);
    setNewBeneficiaryBank(beneficiary.bankName);
    setNewBeneficiaryAmountLimit(beneficiary.amountLimit.toString());
    setNewBeneficiaryCurrency(beneficiary.currency);
    setEditModalVisible(true);
  };

  const renderBeneficiaryItem = ({ item }: { item: Beneficiary }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.beneficiaryName}>{item.name}</Text>
        <Text style={[styles.statusBadge, item.status === 'Active' ? styles.statusActive : item.status === 'Pending' ? styles.statusPending : styles.statusInactive]}>
          {item.status}
        </Text>
      </View>
      <Text style={styles.cardText}>Account: {item.accountNumber}</Text>
      <Text style={styles.cardText}>Bank: {item.bankName}</Text>
      <Text style={styles.cardText}>Limit: {formatCurrency(item.amountLimit, item.currency)}</Text>
      <Text style={styles.cardText}>Added: {formatDate(item.createdAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.primary }]} onPress={() => openEditModal(item)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, { backgroundColor: COLORS.error }]} onPress={() => handleDeleteBeneficiary(item.id)}>
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
        <Text style={styles.loadingText}>Loading beneficiaries...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.errorText}>Failed to load beneficiaries: {error?.message}</Text>
        <Button title="Retry" onPress={() => refetch()} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.title}>Saved Beneficiaries</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.addButtonText}>+ Add Beneficiary</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search beneficiaries..."
        placeholderTextColor={COLORS.muted}
        value={searchText}
        onChangeText={setSearchText}
      />

      {filteredBeneficiaries?.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No beneficiaries found.</Text>
          <Button title="Add New Beneficiary" onPress={() => setCreateModalVisible(true)} color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredBeneficiaries}
          keyExtractor={(item) => item.id}
          renderItem={renderBeneficiaryItem}
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

      {/* Create Beneficiary Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isCreateModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Add New Beneficiary</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Beneficiary Name"
              placeholderTextColor={COLORS.muted}
              value={newBeneficiaryName}
              onChangeText={setNewBeneficiaryName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Account Number"
              placeholderTextColor={COLORS.muted}
              value={newBeneficiaryAccount}
              onChangeText={setNewBeneficiaryAccount}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Bank Name"
              placeholderTextColor={COLORS.muted}
              value={newBeneficiaryBank}
              onChangeText={setNewBeneficiaryBank}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount Limit"
              placeholderTextColor={COLORS.muted}
              value={newBeneficiaryAmountLimit}
              onChangeText={setNewBeneficiaryAmountLimit}
              keyboardType="numeric"
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newBeneficiaryCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewBeneficiaryCurrency('NGN')}
              >
                <Text style={[styles.currencyButtonText, newBeneficiaryCurrency === 'NGN' && styles.currencyButtonTextActive]}>₦ NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newBeneficiaryCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewBeneficiaryCurrency('USD')}
              >
                <Text style={[styles.currencyButtonText, newBeneficiaryCurrency === 'USD' && styles.currencyButtonTextActive]}>$ USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setCreateModalVisible(false)} color={COLORS.muted} />
              <Button title="Create" onPress={handleCreateBeneficiary} color={COLORS.primary} disabled={createMutation.isLoading} />
            </View>
            {createMutation.isLoading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 10 }} />}
          </View>
        </View>
      </Modal>

      {/* Edit Beneficiary Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isEditModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Edit Beneficiary</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Beneficiary Name"
              placeholderTextColor={COLORS.muted}
              value={newBeneficiaryName}
              onChangeText={setNewBeneficiaryName}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Account Number"
              placeholderTextColor={COLORS.muted}
              value={newBeneficiaryAccount}
              onChangeText={setNewBeneficiaryAccount}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Bank Name"
              placeholderTextColor={COLORS.muted}
              value={newBeneficiaryBank}
              onChangeText={setNewBeneficiaryBank}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Amount Limit"
              placeholderTextColor={COLORS.muted}
              value={newBeneficiaryAmountLimit}
              onChangeText={setNewBeneficiaryAmountLimit}
              keyboardType="numeric"
            />
            <View style={styles.currencyToggle}>
              <TouchableOpacity
                style={[styles.currencyButton, newBeneficiaryCurrency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setNewBeneficiaryCurrency('NGN')}
              >
                <Text style={[styles.currencyButtonText, newBeneficiaryCurrency === 'NGN' && styles.currencyButtonTextActive]}>₦ NGN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, newBeneficiaryCurrency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setNewBeneficiaryCurrency('USD')}
              >
                <Text style={[styles.currencyButtonText, newBeneficiaryCurrency === 'USD' && styles.currencyButtonTextActive]}>$ USD</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <Button title="Cancel" onPress={() => setEditModalVisible(false)} color={COLORS.muted} />
              <Button title="Save Changes" onPress={handleEditBeneficiary} color={COLORS.primary} disabled={updateMutation.isLoading} />
            </View>
            {updateMutation.isLoading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 10 }} />}
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
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
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
  addButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  searchInput: {
    height: 40,
    backgroundColor: COLORS.card,
    borderRadius: 8,
    paddingHorizontal: 16,
    margin: 16,
    color: COLORS.text,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
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
  beneficiaryName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    fontWeight: 'bold',
    fontSize: 12,
  },
  statusActive: {
    backgroundColor: COLORS.success,
    color: COLORS.background,
  },
  statusInactive: {
    backgroundColor: COLORS.muted,
    color: COLORS.background,
  },
  statusPending: {
    backgroundColor: COLORS.warning,
    color: COLORS.background,
  },
  cardText: {
    color: COLORS.muted,
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
    borderRadius: 8,
    marginLeft: 10,
  },
  actionButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
    fontSize: 14,
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
    marginBottom: 20,
    textAlign: 'center',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
    width: '90%',
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  modalInput: {
    height: 40,
    width: '100%',
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 10,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  currencyToggle: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 15,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  currencyButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.muted,
    fontWeight: 'bold',
  },
  currencyButtonTextActive: {
    color: COLORS.text,
  },
});

export default SavedBeneficiariesScreen;
