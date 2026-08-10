import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { trpc } from '../lib/trpc';

// Define the design system colors
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

// Type definition for an International Remittance item (adjust based on actual tRPC schema)
interface RemittanceItem {
  id: string;
  senderName: string;
  recipientName: string;
  amount: number;
  currency: 'NGN' | 'USD';
  status: 'Pending' | 'Completed' | 'Failed' | 'Cancelled';
  createdAt: string;
  updatedAt: string;
}

const InternationalRemittanceScreen: React.FC = () => {
  const navigation = useNavigation();
  const [isModalVisible, setModalVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentItem, setCurrentItem] = useState<RemittanceItem | null>(null);
  const [senderName, setSenderName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'NGN' | 'USD'>('USD');

  // tRPC queries and mutations
  const { data, isLoading, isError, error, refetch } = trpc.internationalRemittance.list.useQuery();
  const { mutate: createRemittance, isLoading: isCreating } = trpc.internationalRemittance.create.useMutation({
    onSuccess: () => {
      setModalVisible(false);
      refetch();
    },
    onError: (err) => {
      Alert.alert('Error', err.message);
    },
  });
  const { mutate: updateRemittance, isLoading: isUpdating } = trpc.internationalRemittance.update.useMutation({
    onSuccess: () => {
      setModalVisible(false);
      refetch();
    },
    onError: (err) => {
      Alert.alert('Error', err.message);
    },
  });
  const { mutate: deleteRemittance, isLoading: isDeleting } = trpc.internationalRemittance.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (err) => {
      Alert.alert('Error', err.message);
    },
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleCreatePress = () => {
    setIsEditMode(false);
    setCurrentItem(null);
    setSenderName('');
    setRecipientName('');
    setAmount('');
    setCurrency('USD');
    setModalVisible(true);
  };

  const handleEditPress = (item: RemittanceItem) => {
    setIsEditMode(true);
    setCurrentItem(item);
    setSenderName(item.senderName);
    setRecipientName(item.recipientName);
    setAmount(item.amount.toString());
    setCurrency(item.currency);
    setModalVisible(true);
  };

  const handleDeletePress = (id: string) => {
    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete this remittance?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteRemittance({ id }) },
      ],
      { cancelable: true }
    );
  };

  const handleSubmit = () => {
    if (!senderName || !recipientName || !amount) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }

    if (isEditMode && currentItem) {
      updateRemittance({
        id: currentItem.id,
        senderName,
        recipientName,
        amount: parsedAmount,
        currency,
      });
    } else {
      createRemittance({
        senderName,
        recipientName,
        amount: parsedAmount,
        currency,
      });
    }
  };

  const formatCurrency = (value: number, currency: 'NGN' | 'USD') => {
    if (currency === 'NGN') {
      return `₦${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else if (currency === 'USD') {
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return value.toString();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadgeStyle = (status: RemittanceItem['status']) => {
    switch (status) {
      case 'Completed':
        return { backgroundColor: COLORS.success };
      case 'Pending':
        return { backgroundColor: COLORS.warning };
      case 'Failed':
      case 'Cancelled':
        return { backgroundColor: COLORS.error };
      default:
        return { backgroundColor: COLORS.muted };
    }
  };

  const renderItem = ({ item }: { item: RemittanceItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.senderName} to {item.recipientName}</Text>
        <View style={[styles.statusBadge, getStatusBadgeStyle(item.status)]}>
          <Text style={styles.statusBadgeText}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.cardText}>Amount: {formatCurrency(item.amount, item.currency)}</Text>
      <Text style={styles.cardText}>Created: {formatDate(item.createdAt)}</Text>
      <Text style={styles.cardText}>Last Updated: {formatDate(item.updatedAt)}</Text>
      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => handleEditPress(item)} style={[styles.actionButton, { backgroundColor: COLORS.primary }]}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeletePress(item.id)} style={[styles.actionButton, { backgroundColor: COLORS.error }]}>
          <Text style={styles.actionButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading remittances...</Text>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load remittances.</Text>
        <Text style={styles.errorText}>{error?.message}</Text>
        <TouchableOpacity onPress={refetch} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!data || data.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <Text style={styles.emptyText}>No international remittances found.</Text>
        <TouchableOpacity onPress={handleCreatePress} style={styles.createButton}>
          <Text style={styles.createButtonText}>Create New Remittance</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>International Remittances</Text>
        <TouchableOpacity onPress={handleCreatePress} style={styles.addButton}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            progressBackgroundColor={COLORS.card}
          />
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={isModalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>{isEditMode ? 'Edit Remittance' : 'Create New Remittance'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Sender Name"
              placeholderTextColor={COLORS.muted}
              value={senderName}
              onChangeText={setSenderName}
            />
            <TextInput
              style={styles.input}
              placeholder="Recipient Name"
              placeholderTextColor={COLORS.muted}
              value={recipientName}
              onChangeText={setRecipientName}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount"
              placeholderTextColor={COLORS.muted}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
            <View style={styles.currencyToggleContainer}>
              <TouchableOpacity
                style={[styles.currencyButton, currency === 'USD' && styles.currencyButtonActive]}
                onPress={() => setCurrency('USD')}
              >
                <Text style={styles.currencyButtonText}>USD</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.currencyButton, currency === 'NGN' && styles.currencyButtonActive]}
                onPress={() => setCurrency('NGN')}
              >
                <Text style={styles.currencyButtonText}>NGN</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.buttonClose]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.textStyle}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonSubmit]}
                onPress={handleSubmit}
                disabled={isCreating || isUpdating}
              >
                <Text style={styles.textStyle}>{isEditMode ? 'Update' : 'Create'}</Text>
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
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
  },
  retryButtonText: {
    color: COLORS.text,
    fontSize: 16,
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
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  createButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: 'bold',
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
  addButton: {
    backgroundColor: COLORS.primary,
    width: 35,
    height: 35,
    borderRadius: 17.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: COLORS.text,
    fontSize: 24,
    lineHeight: 24,
  },
  listContentContainer: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 15,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: 'bold',
    flexShrink: 1,
    marginRight: 10,
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
  cardText: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: 5,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
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
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  modalTitle: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  input: {
    height: 50,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 8,
    width: '100%',
    marginBottom: 15,
    paddingHorizontal: 15,
    color: COLORS.text,
    backgroundColor: COLORS.card,
  },
  currencyToggleContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    borderColor: COLORS.border,
    borderWidth: 1,
  },
  currencyButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.card,
  },
  currencyButtonActive: {
    backgroundColor: COLORS.primary,
  },
  currencyButtonText: {
    color: COLORS.text,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    borderRadius: 8,
    padding: 12,
    elevation: 2,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
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

export default InternationalRemittanceScreen;
